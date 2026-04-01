import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  const allowedOrigins = [
    supabaseUrl,
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter(Boolean);

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('webcontainer')) {
    return true;
  }

  if (origin.includes('.vercel.app')) {
    return true;
  }

  return false;
};

const getCorsHeaders = (origin: string | null) => {
  const isAllowed = isOriginAllowed(origin);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : (supabaseUrl || "*"),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Allow-Credentials": "true",
  };
};

interface ComicRow {
  title: string;
  issue_number?: string;
  publisher?: string;
  year?: string | number;
  condition?: string;
  notes?: string;
}

interface ProcessRequest {
  job_id: string;
  rows: ComicRow[];
}

const BATCH_SIZE = 50;
const VALID_CONDITIONS = ['Mint', 'Near Mint', 'Very Fine', 'Fine', 'Good', 'Fair', 'Poor'];
const PLACEHOLDER_IMAGE_URL = '/placeholder-comic.svg';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    console.log("Request headers:", {
      hasAuth: !!authHeader,
      origin: req.headers.get("origin"),
    });

    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Extract token and create auth client
    const token = authHeader.replace("Bearer ", "");
    console.log("Verifying token, length:", token.length);

    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    console.log("Auth verification result:", {
      hasUser: !!user,
      userId: user?.id,
      error: authError?.message,
    });

    if (authError || !user) {
      console.error("Auth verification failed:", authError);
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: authError?.message || "Invalid or expired token",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log("User authenticated:", userId);

    const { job_id, rows }: ProcessRequest = await req.json();

    if (!job_id || !rows || !Array.isArray(rows)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: job_id and rows are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has bulk upload permission
    const { data: hasPermission, error: permError } = await serviceClient
      .rpc('has_bulk_upload_permission', { user_uuid: userId });

    if (permError || !hasPermission) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to perform bulk uploads" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job status to processing
    await serviceClient
      .from('bulk_upload_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job_id);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;

    // Process rows in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const [index, row] of batch.entries()) {
        const rowNumber = i + index + 1;

        try {
          // Validate required field
          if (!row.title || row.title.trim() === '') {
            await serviceClient.from('bulk_upload_errors').insert({
              job_id,
              row_number: rowNumber,
              error_type: 'validation',
              error_message: 'Title is required and cannot be empty',
              row_data: row,
            });
            failedCount++;
            processedCount++;
            continue;
          }

          // Validate year if provided
          let yearValue: number | null = null;
          if (row.year) {
            const yearNum = typeof row.year === 'string' ? parseInt(row.year, 10) : row.year;
            if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
              await serviceClient.from('bulk_upload_errors').insert({
                job_id,
                row_number: rowNumber,
                error_type: 'validation',
                error_message: `Year must be a number between 1900-2100 (found: ${row.year})`,
                row_data: row,
              });
              failedCount++;
              processedCount++;
              continue;
            }
            yearValue = yearNum;
          }

          // Validate condition if provided
          if (row.condition && !VALID_CONDITIONS.includes(row.condition.trim())) {
            await serviceClient.from('bulk_upload_errors').insert({
              job_id,
              row_number: rowNumber,
              error_type: 'validation',
              error_message: `Condition must be one of: ${VALID_CONDITIONS.join(', ')} (found: ${row.condition})`,
              row_data: row,
            });
            failedCount++;
            processedCount++;
            continue;
          }

          // Check for duplicates
          const issueNumber = row.issue_number?.trim() || '';
          let duplicateId: string | null = null;

          if (issueNumber) {
            const { data: duplicateResult } = await serviceClient
              .rpc('check_comic_duplicate', {
                p_user_id: userId,
                p_title: row.title.trim(),
                p_issue_number: issueNumber,
              });
            duplicateId = duplicateResult;
          }

          if (duplicateId) {
            // Increment copy count for duplicate
            const { error: updateError } = await serviceClient
              .from('comics')
              .update({ copy_count: serviceClient.sql`copy_count + 1` })
              .eq('id', duplicateId);

            if (updateError) {
              await serviceClient.from('bulk_upload_errors').insert({
                job_id,
                row_number: rowNumber,
                error_type: 'database',
                error_message: `Failed to update copy count: ${updateError.message}`,
                row_data: row,
              });
              failedCount++;
            } else {
              duplicateCount++;
              successCount++;
            }
          } else {
            // Insert new comic with placeholder image
            const { error: insertError } = await serviceClient.from('comics').insert({
              user_id: userId,
              title: row.title.trim(),
              issue_number: issueNumber,
              publisher: row.publisher?.trim() || '',
              year: yearValue,
              condition: row.condition?.trim() || '',
              notes: row.notes?.trim() || '',
              color_image_url: PLACEHOLDER_IMAGE_URL,
              bw_image_url: PLACEHOLDER_IMAGE_URL,
              copy_count: 1,
            });

            if (insertError) {
              await serviceClient.from('bulk_upload_errors').insert({
                job_id,
                row_number: rowNumber,
                error_type: 'database',
                error_message: `Failed to insert comic: ${insertError.message}`,
                row_data: row,
              });
              failedCount++;
            } else {
              successCount++;
            }
          }

          processedCount++;
        } catch (error) {
          await serviceClient.from('bulk_upload_errors').insert({
            job_id,
            row_number: rowNumber,
            error_type: 'processing',
            error_message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            row_data: row,
          });
          failedCount++;
          processedCount++;
        }
      }

      // Update job progress after each batch
      await serviceClient
        .from('bulk_upload_jobs')
        .update({
          processed_rows: processedCount,
          successful_rows: successCount,
          failed_rows: failedCount,
          duplicate_count: duplicateCount,
        })
        .eq('id', job_id);
    }

    // Mark job as completed
    await supabaseClient
      .from('bulk_upload_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_rows: processedCount,
        successful_rows: successCount,
        failed_rows: failedCount,
        duplicate_count: duplicateCount,
      })
      .eq('id', job_id);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        successful: successCount,
        failed: failedCount,
        duplicates: duplicateCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Error processing bulk upload:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to process bulk upload",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

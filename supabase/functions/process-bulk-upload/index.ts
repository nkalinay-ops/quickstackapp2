import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ComicRow {
  series: string;
  story?: string;
  issue_number?: string;
  publisher?: string;
  year?: string | number;
  condition?: string;
  notes?: string;
  copy_count?: string | number;
  cover_variant?: string | number;
  total_issues?: string | number;
  purchase_price?: string | number;
  purchase_date?: string;
}

interface ProcessRequest {
  job_id: string;
  rows: ComicRow[];
}

interface ValidatedRow {
  rowNumber: number;
  series: string;
  story: string;
  issueNumber: string;
  publisher: string;
  yearValue: number | null;
  condition: string;
  notes: string;
  copyCountValue: number;
  coverVariantValue: number | null;
  totalIssuesValue: number | null;
  purchasePriceValue: number | null;
  purchaseDateValue: string | null;
}

interface ErrorEntry {
  job_id: string;
  row_number: number;
  error_type: string;
  error_message: string;
  row_data: ComicRow;
}

const BATCH_SIZE = 50;
const VALID_CONDITIONS = [
  "Mint",
  "Near Mint",
  "Very Fine",
  "Very Good",
  "Fine",
  "Good",
  "Fair",
  "Poor",
];
const PLACEHOLDER_IMAGE_URL = "/placeholder-comic.svg";

function validateRow(
  row: ComicRow,
  rowNumber: number,
  jobId: string
): { valid: ValidatedRow } | { error: ErrorEntry } {
  if (!row.series || row.series.trim() === "") {
    return {
      error: {
        job_id: jobId,
        row_number: rowNumber,
        error_type: "validation",
        error_message: "Series is required and cannot be empty",
        row_data: row,
      },
    };
  }

  let yearValue: number | null = null;
  if (row.year) {
    const yearNum =
      typeof row.year === "string" ? parseInt(row.year, 10) : row.year;
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return {
        error: {
          job_id: jobId,
          row_number: rowNumber,
          error_type: "validation",
          error_message: `Year must be a number between 1900-2100 (found: ${row.year})`,
          row_data: row,
        },
      };
    }
    yearValue = yearNum;
  }

  if (row.condition && !VALID_CONDITIONS.includes(row.condition.trim())) {
    return {
      error: {
        job_id: jobId,
        row_number: rowNumber,
        error_type: "validation",
        error_message: `Condition must be one of: ${VALID_CONDITIONS.join(", ")} (found: ${row.condition})`,
        row_data: row,
      },
    };
  }

  let copyCountValue = 1;
  if (row.copy_count !== undefined && row.copy_count !== "") {
    const parsed =
      typeof row.copy_count === "string"
        ? parseInt(row.copy_count, 10)
        : row.copy_count;
    if (isNaN(parsed) || parsed < 1) {
      return {
        error: {
          job_id: jobId,
          row_number: rowNumber,
          error_type: "validation",
          error_message: `Copy Count must be a positive integer (found: ${row.copy_count})`,
          row_data: row,
        },
      };
    }
    copyCountValue = parsed;
  }

  let coverVariantValue: number | null = null;
  if (row.cover_variant !== undefined && row.cover_variant !== "") {
    const raw = String(row.cover_variant).trim().toUpperCase();
    if (/^[A-Z]$/.test(raw)) {
      coverVariantValue = raw.charCodeAt(0) - 64;
    } else {
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed < 1) {
        return {
          error: {
            job_id: jobId,
            row_number: rowNumber,
            error_type: "validation",
            error_message: `Cover Variant must be a positive integer or letter (A, B, C...) (found: ${row.cover_variant})`,
            row_data: row,
          },
        };
      }
      coverVariantValue = parsed;
    }
  }

  let totalIssuesValue: number | null = null;
  if (row.total_issues !== undefined && row.total_issues !== "") {
    const parsed =
      typeof row.total_issues === "string"
        ? parseInt(row.total_issues, 10)
        : row.total_issues;
    if (isNaN(parsed) || parsed < 1) {
      return {
        error: {
          job_id: jobId,
          row_number: rowNumber,
          error_type: "validation",
          error_message: `Total Issues in Arc must be a positive integer (found: ${row.total_issues})`,
          row_data: row,
        },
      };
    }
    totalIssuesValue = parsed;
  }

  let purchasePriceValue: number | null = null;
  if (row.purchase_price !== undefined && row.purchase_price !== "") {
    const parsed =
      typeof row.purchase_price === "string"
        ? parseFloat(row.purchase_price)
        : row.purchase_price;
    if (isNaN(parsed) || parsed < 0) {
      return {
        error: {
          job_id: jobId,
          row_number: rowNumber,
          error_type: "validation",
          error_message: `Purchase Price must be a non-negative number (found: ${row.purchase_price})`,
          row_data: row,
        },
      };
    }
    purchasePriceValue = Math.round(parsed * 100) / 100;
  }

  let purchaseDateValue: string | null = null;
  if (row.purchase_date && String(row.purchase_date).trim() !== "") {
    const dateStr = String(row.purchase_date).trim();
    // Accept YYYY-MM-DD or MM/DD/YYYY
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (isoMatch) {
      purchaseDateValue = dateStr;
    } else if (usMatch) {
      purchaseDateValue = `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
    } else {
      return {
        error: {
          job_id: jobId,
          row_number: rowNumber,
          error_type: "validation",
          error_message: `Purchase Date must be YYYY-MM-DD or MM/DD/YYYY (found: ${row.purchase_date})`,
          row_data: row,
        },
      };
    }
  }

  return {
    valid: {
      rowNumber,
      series: row.series.trim(),
      story: row.story?.trim() || "",
      issueNumber: String(row.issue_number ?? "").trim(),
      publisher: row.publisher?.trim() || "",
      yearValue,
      condition: row.condition?.trim() || "",
      notes: row.notes?.trim() || "",
      copyCountValue,
      coverVariantValue,
      totalIssuesValue,
      purchasePriceValue,
      purchaseDateValue,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    const { data: profile, error: permError } = await userClient
      .from("user_profiles")
      .select("user_tier, can_bulk_upload")
      .eq("id", userId)
      .maybeSingle();

    const tier = profile?.user_tier ?? "free";
    const hasAccess =
      tier === "paid" ||
      tier === "admin" ||
      profile?.can_bulk_upload === true;

    if (permError || !hasAccess) {
      return new Response(
        JSON.stringify({
          error:
            "You do not have permission to perform bulk uploads. Upgrade to a paid plan to access this feature.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { job_id, rows }: ProcessRequest = await req.json();

    if (!job_id || !rows || !Array.isArray(rows)) {
      return new Response(
        JSON.stringify({
          error: "Invalid request: job_id and rows are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await serviceClient
      .from("bulk_upload_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", job_id);

    // --- Phase 1: validate all rows in memory (zero DB calls) ---
    const validRows: ValidatedRow[] = [];
    const errorEntries: ErrorEntry[] = [];

    for (let i = 0; i < rows.length; i++) {
      const result = validateRow(rows[i], i + 1, job_id);
      if ("error" in result) {
        errorEntries.push(result.error);
      } else {
        validRows.push(result.valid);
      }
    }

    // --- Phase 2: batch duplicate detection (~rows/50 queries total) ---
    // For each chunk of valid rows that have an issue number, issue one SELECT
    // with an OR filter covering all combos, then match in memory.
    const rowsWithIssue = validRows.filter((r) => r.issueNumber !== "");
    const duplicateMap = new Map<string, string>(); // "series|||issue|||story" -> comic id

    for (let i = 0; i < rowsWithIssue.length; i += BATCH_SIZE) {
      const chunk = rowsWithIssue.slice(i, i + BATCH_SIZE);

      const orParts = chunk
        .map(
          (r) =>
            `and(series.eq.${JSON.stringify(r.series)},issue_number.eq.${JSON.stringify(r.issueNumber)},story.eq.${JSON.stringify(r.story)})`
        )
        .join(",");

      const { data: existingComics } = await serviceClient
        .from("comics")
        .select("id, series, issue_number, story")
        .eq("user_id", userId)
        .or(orParts);

      if (existingComics) {
        for (const comic of existingComics) {
          const key = `${comic.series}|||${comic.issue_number}|||${comic.story ?? ""}`;
          duplicateMap.set(key, comic.id);
        }
      }
    }

    // --- Phase 3: split into new inserts vs. duplicate updates ---
    const toInsert: ValidatedRow[] = [];
    const toUpdate: string[] = []; // IDs to increment

    for (const r of validRows) {
      if (r.issueNumber !== "") {
        const key = `${r.series}|||${r.issueNumber}|||${r.story}`;
        const existingId = duplicateMap.get(key);
        if (existingId) {
          toUpdate.push(existingId);
          continue;
        }
      }
      toInsert.push(r);
    }

    // --- Phase 4: batch inserts (~toInsert/50 queries) ---
    const dbErrorEntries: ErrorEntry[] = [];

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);
      const payload = chunk.map((r) => ({
        user_id: userId,
        series: r.series,
        story: r.story,
        issue_number: r.issueNumber,
        publisher: r.publisher,
        year: r.yearValue,
        condition: r.condition,
        notes: r.notes,
        color_image_url: PLACEHOLDER_IMAGE_URL,
        bw_image_url: PLACEHOLDER_IMAGE_URL,
        copy_count: r.copyCountValue,
        cover_variant: r.coverVariantValue,
        total_issues: r.totalIssuesValue,
        purchase_price: r.purchasePriceValue,
        purchase_date: r.purchaseDateValue,
      }));

      const { error: insertError } = await serviceClient
        .from("comics")
        .insert(payload);

      if (insertError) {
        // Retry row-by-row so one bad row doesn't drop the whole batch
        for (const r of chunk) {
          const { error: singleErr } = await serviceClient
            .from("comics")
            .insert({
              user_id: userId,
              series: r.series,
              story: r.story,
              issue_number: r.issueNumber,
              publisher: r.publisher,
              year: r.yearValue,
              condition: r.condition,
              notes: r.notes,
              color_image_url: PLACEHOLDER_IMAGE_URL,
              bw_image_url: PLACEHOLDER_IMAGE_URL,
              copy_count: r.copyCountValue,
              cover_variant: r.coverVariantValue,
              total_issues: r.totalIssuesValue,
              purchase_price: r.purchasePriceValue,
              purchase_date: r.purchaseDateValue,
            });

          if (singleErr) {
            dbErrorEntries.push({
              job_id,
              row_number: r.rowNumber,
              error_type: "database",
              error_message: `Failed to insert comic: ${singleErr.message}`,
              row_data: rows[r.rowNumber - 1],
            });
          }
        }
      }
    }

    // --- Phase 5: batch duplicate copy count increments (1-2 queries total) ---
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      const { error: updateError } = await serviceClient.rpc(
        "increment_copy_count_batch",
        { comic_ids: chunk }
      );

      if (updateError) {
        // Fallback: individual select + update per ID
        for (const id of chunk) {
          const { data: current } = await serviceClient
            .from("comics")
            .select("copy_count")
            .eq("id", id)
            .maybeSingle();

          await serviceClient
            .from("comics")
            .update({ copy_count: (current?.copy_count ?? 1) + 1 })
            .eq("id", id);
        }
      }
    }

    // --- Phase 6: write all errors in batches ---
    const allErrors = [...errorEntries, ...dbErrorEntries];
    for (let i = 0; i < allErrors.length; i += BATCH_SIZE) {
      await serviceClient
        .from("bulk_upload_errors")
        .insert(allErrors.slice(i, i + BATCH_SIZE));
    }

    const failedCount = allErrors.length;
    const duplicateCount = toUpdate.length;
    const successCount = rows.length - failedCount;

    // --- Phase 7: mark job complete ---
    await serviceClient
      .from("bulk_upload_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        processed_rows: rows.length,
        successful_rows: successCount,
        failed_rows: failedCount,
        duplicate_count: duplicateCount,
      })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({
        success: true,
        processed: rows.length,
        successful: successCount,
        failed: failedCount,
        duplicates: duplicateCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Error processing bulk upload:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process bulk upload",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

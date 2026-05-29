import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ComicData {
  series: string;
  story: string;
  issue_number: string;
  publisher: string;
  year: number | null;
  total_issues: number | null;
  cover_variant: number | null;
}

const FREE_TIER_SCAN_LIMIT = 20;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tier and scan limit check
    const { data: scanInfo, error: scanInfoError } = await userClient
      .rpc("get_user_scan_info", { p_user_id: user.id });

    if (scanInfoError || !scanInfo) {
      return new Response(
        JSON.stringify({ error: "Could not verify user access" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tier: string = scanInfo.tier ?? "free";
    const monthlyCount: number = scanInfo.monthly_scan_count ?? 0;

    if (tier === "free" && monthlyCount >= FREE_TIER_SCAN_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "Monthly scan limit reached. Upgrade to continue scanning.",
          limitReached: true,
          tier,
          monthly_scan_count: monthlyCount,
          scan_limit: FREE_TIER_SCAN_LIMIT,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageData } = await req.json();

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: "No image data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert at reading comic book covers. Respond with valid JSON only — no text before or after.

Response format:
{
  "series": "string",
  "story": "string",
  "issue_number": "string",
  "publisher": "string",
  "year": number or null,
  "total_issues": number or null,
  "cover_variant": number or null,
  "confidence": "high" | "medium" | "low"
}

Field definitions:
- "series": The ongoing franchise/series name — usually the largest text (e.g., "The Amazing Spider-Man", "Batman").
- "story": The individual story arc subtitle for this issue (e.g., "Kraven's Last Hunt"). Empty string if none.
- "issue_number": Issue number as digits only, no # symbol. Convert written-out numbers ("One" → "1", "Two of Six" → "2"). Empty string if not visible.
- "publisher": Publisher name (Marvel, DC, Image, Dark Horse, etc.).
- "year": Publication year as a number, or null.
- "total_issues": Total issues in arc from patterns like "of 4", "#2 of 6", "Part 3 of 5". Convert written-out totals ("of Six" → 6). Null if not a limited series or not shown.
- "cover_variant": Variant number if explicitly labeled ("Cover B" → 2, "Cover C" → 3, "Variant 2" → 2). Ratio variants like "1:25" → null. Null if standard Cover A or unlabeled.

Rules:
1. "series" is the brand that spans many issues; "story" is only a subtitle for this specific issue.
2. Issue numbers and totals: always output digits. Convert all written-out cardinals/ordinals.
3. Cover variant letters map to numbers: A=1, B=2, C=3, D=4, etc.
4. If the image is unclear, return JSON with empty strings/nulls and "low" confidence.
5. NEVER respond with explanatory text — ONLY valid JSON.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all readable text from this comic book cover: series name, story/arc subtitle, issue number (digits only), publisher, year, total issues in arc if shown, and any cover variant label.`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageData,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to analyze image",
          detail: `OpenAI API returned ${response.status}`,
          openaiError: errorText.substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("OpenAI response data:", JSON.stringify(data));

    const message = data.choices?.[0]?.message;
    const content = message?.content;
    const refusal = message?.refusal;

    if (refusal) {
      console.error("OpenAI refused request:", refusal);
      return new Response(
        JSON.stringify({
          error: "Unable to process image",
          detail: "The image could not be analyzed. Please ensure it's a clear photo of a comic book cover."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!content) {
      console.error("No content in OpenAI response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({
          error: "No content in response",
          detail: "OpenAI returned an empty response",
          debugInfo: JSON.stringify(data).substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let comicData: ComicData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        comicData = JSON.parse(jsonMatch[0]);
      } else {
        comicData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse JSON:", content);

      if (content.toLowerCase().includes('unable') ||
          content.toLowerCase().includes('cannot') ||
          content.toLowerCase().includes('no text') ||
          content.toLowerCase().includes('not visible')) {
        return new Response(
          JSON.stringify({
            error: "Unable to read comic cover. Please ensure the image is clear, well-lit, and the text is visible.",
            detail: "The AI could not extract text from this image. Try taking another photo with better lighting or angle."
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: "Could not understand the response from the AI. Please try again.",
          detail: content.substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fire-and-forget: increment scan count without blocking the response
    EdgeRuntime.waitUntil(userClient.rpc("increment_scan_count", { p_user_id: user.id }));

    const newCount = monthlyCount + 1;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          series: comicData.series || "",
          story: comicData.story || "",
          issue_number: comicData.issue_number || "",
          publisher: comicData.publisher || "",
          year: comicData.year || null,
          total_issues: comicData.total_issues || null,
          cover_variant: comicData.cover_variant || null,
        },
        scan_info: {
          tier,
          monthly_scan_count: newCount,
          scan_limit: tier === "free" ? FREE_TIER_SCAN_LIMIT : null,
          scans_remaining: tier === "free" ? FREE_TIER_SCAN_LIMIT - newCount : null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

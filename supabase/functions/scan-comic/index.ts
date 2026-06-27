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
  cover_price: number | null;
  confidence?: "high" | "medium" | "low";
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

    // Parse body and validate JWT in parallel — body parsing is independent of auth
    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json(),
    ]);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageData } = body;

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

    // Tier check and correction rules fetch run in parallel — both need user.id, neither blocks the other
    const [
      { data: scanInfo, error: scanInfoError },
      { data: correctionRules },
    ] = await Promise.all([
      userClient.rpc("get_user_scan_info", { p_user_id: user.id }),
      userClient
        .from("ocr_correction_rules")
        .select("ocr_series, ocr_story, ocr_publisher, corrected_series, corrected_story, corrected_publisher")
        .eq("is_confirmed", true)
        .limit(20),
    ]);

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

    const correctionRulesBlock = correctionRules && correctionRules.length > 0
      ? `\n\nKnown correction patterns for this user (apply these automatically if you see the OCR text on the left):\n` +
        correctionRules.map(r => {
          const from = [r.ocr_series, r.ocr_story, r.ocr_publisher].filter(Boolean).join(" / ");
          const to = [r.corrected_series, r.corrected_story, r.corrected_publisher].filter(Boolean).join(" / ");
          return `- "${from}" → "${to}"`;
        }).join("\n")
      : "";

    const ocrMessages = [
      {
        role: "system",
        content: `You are an expert at reading comic book covers and comic book publishing history. Respond with valid JSON only — no text before or after.

Response format:
{
  "series": "string",
  "story": "string",
  "issue_number": "string",
  "publisher": "string",
  "year": number or null,
  "total_issues": number or null,
  "cover_variant": number or null,
  "cover_price": number or null,
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
- "cover_price": The printed cover price as a decimal number (e.g., "$3.99" → 3.99, "£2.50" → 2.50). Null if not visible.

Rules:
1. "series" is the brand that spans many issues; "story" is only a subtitle for this specific issue.
2. Issue numbers and totals: always output digits. Convert all written-out cardinals/ordinals.
3. Cover variant letters map to numbers: A=1, B=2, C=3, D=4, etc.
4. cover_price: strip the currency symbol and return only the numeric value.
5. cover_price location: look carefully at the LOWER-LEFT and LOWER-RIGHT corners of the cover. The price is printed in a small box near the UPC barcode, typically in 6-8pt font (very small). Common formats: "$3.99", "£2.50", "€4.00". Do not confuse the price with the issue number.
6. issue_number location: often printed near the title banner at the top, or in a small badge/circle on the cover. Also check for patterns like "#300", "No. 300", "Issue 300".
7. If the image is unclear, return JSON with empty strings/nulls and "low" confidence.
8. NEVER respond with explanatory text — ONLY valid JSON.` + correctionRulesBlock,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all readable text from this comic book cover: series name, story/arc subtitle, issue number (digits only), publisher, year, total issues in arc if shown, any cover variant label, and the printed cover price if visible. Pay special attention to the corners — the cover price is almost always in the lower-left or lower-right corner near the barcode in very small print.`
          },
          {
            type: "image_url",
            image_url: {
              url: imageData,
              detail: "high"
            }
          }
        ],
      },
    ];

    // First pass: gpt-4o-mini (fast path ~1-2s)
    const miniResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: ocrMessages,
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!miniResponse.ok) {
      const errorText = await miniResponse.text();
      console.error("OpenAI API error:", miniResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to analyze image",
          detail: `OpenAI API returned ${miniResponse.status}`,
          openaiError: errorText.substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const miniData = await miniResponse.json();
    console.log("OpenAI mini response:", JSON.stringify(miniData));

    const miniMessage = miniData.choices?.[0]?.message;
    const miniContent = miniMessage?.content;
    const miniRefusal = miniMessage?.refusal;

    if (miniRefusal) {
      console.error("OpenAI refused request:", miniRefusal);
      return new Response(
        JSON.stringify({
          error: "Unable to process image",
          detail: "The image could not be analyzed. Please ensure it's a clear photo of a comic book cover."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!miniContent) {
      console.error("No content in OpenAI mini response:", JSON.stringify(miniData));
      return new Response(
        JSON.stringify({
          error: "No content in response",
          detail: "OpenAI returned an empty response",
          debugInfo: JSON.stringify(miniData).substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let comicData: ComicData;
    try {
      const miniMatch = miniContent.match(/\{[\s\S]*\}/);
      comicData = JSON.parse(miniMatch ? miniMatch[0] : miniContent);
    } catch {
      // Mini parse failed — treat as low confidence so gpt-4o fallback runs
      comicData = { series: "", story: "", issue_number: "", publisher: "", year: null, total_issues: null, cover_variant: null, cover_price: null, confidence: "low" };
    }

    // Gate: fall back to gpt-4o if mini wasn't confident or missed the core identifying fields
    const needsFallback =
      comicData.confidence !== "high" ||
      !comicData.series ||
      !comicData.issue_number;

    if (needsFallback) {
      console.log("gpt-4o-mini gate failed — falling back to gpt-4o");

      const fullResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: ocrMessages,
          max_tokens: 300,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!fullResponse.ok) {
        const errorText = await fullResponse.text();
        console.error("OpenAI gpt-4o API error:", fullResponse.status, errorText);
        return new Response(
          JSON.stringify({
            error: "Failed to analyze image",
            detail: `OpenAI API returned ${fullResponse.status}`,
            openaiError: errorText.substring(0, 200)
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fullData = await fullResponse.json();
      console.log("OpenAI gpt-4o response:", JSON.stringify(fullData));

      const fullMessage = fullData.choices?.[0]?.message;
      const fullContent = fullMessage?.content;
      const fullRefusal = fullMessage?.refusal;

      if (fullRefusal) {
        console.error("OpenAI gpt-4o refused request:", fullRefusal);
        return new Response(
          JSON.stringify({
            error: "Unable to process image",
            detail: "The image could not be analyzed. Please ensure it's a clear photo of a comic book cover."
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!fullContent) {
        console.error("No content in OpenAI gpt-4o response:", JSON.stringify(fullData));
        return new Response(
          JSON.stringify({
            error: "No content in response",
            detail: "OpenAI returned an empty response",
            debugInfo: JSON.stringify(fullData).substring(0, 200)
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const fullMatch = fullContent.match(/\{[\s\S]*\}/);
        if (fullMatch) {
          comicData = JSON.parse(fullMatch[0]);
        } else {
          comicData = JSON.parse(fullContent);
        }
      } catch (parseError) {
        console.error("Failed to parse gpt-4o JSON:", fullContent);
        // Note: fallback increment is NOT fired here — gpt-4o failed so we return an error below

        if (fullContent.toLowerCase().includes('unable') ||
            fullContent.toLowerCase().includes('cannot') ||
            fullContent.toLowerCase().includes('no text') ||
            fullContent.toLowerCase().includes('not visible')) {
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
            detail: fullContent.substring(0, 200)
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // gpt-4o was used and parsed successfully — track the fallback
      EdgeRuntime.waitUntil(userClient.rpc("increment_gpt4o_fallback_count", { p_user_id: user.id }));
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
          cover_price: comicData.cover_price ?? null,
        },
        scan_info: {
          tier,
          monthly_scan_count: newCount,
          scan_limit: tier === "free" ? FREE_TIER_SCAN_LIMIT : null,
          scans_remaining: tier === "free" ? FREE_TIER_SCAN_LIMIT - newCount : null,
          model_used: needsFallback ? "gpt-4o" : "gpt-4o-mini",
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

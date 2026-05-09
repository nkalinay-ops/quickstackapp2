import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { imageData } = await req.json();

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: "No image data provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
            content: `You are an expert at extracting text from comic book covers.

CRITICAL: You MUST respond with valid JSON only. No explanatory text before or after.

Your response format MUST be:
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
- "series": The ongoing series name — the primary, recurring title of the comic (e.g., "The Amazing Spider-Man", "Batman", "X-Men"). This is usually the largest text on the cover.
- "story": The individual story arc title or issue subtitle printed on the cover (e.g., "Kraven's Last Hunt", "Year One", "The Dark Phoenix Saga"). Leave empty string "" if no story subtitle is visible.
- "issue_number": The issue number as a string, digits only — no # symbol. Convert written-out numbers to digits (e.g., "One" → "1", "Two of Six" → "2", "Issue Three" → "3"). For standard numeric issues this is straightforward (e.g., "#300" → "300"). Return empty string "" if no issue number is visible.
- "publisher": Publisher name (Marvel, DC, Image, Dark Horse, etc.)
- "year": Publication year as a number if visible, otherwise null
- "total_issues": The total number of issues in the story arc or limited series. Look for patterns like "of 4", "#2 of 6", "Part 3 of 5", "Book 1 of 3", "Two of Six", "one of four", etc. Also convert written-out totals to digits ("of Six" → 6, "of Four" → 4). Extract only the total (e.g., "#2 of 6" → 6, "Two of Six" → 6). Return null if not visible or not a limited/arc series.
- "cover_variant": The cover variant number if explicitly indicated on the cover. Look for labels like "Variant Cover", "Cover B", "Cover 2", "Variant 2", "1:25 Variant", "Incentive Variant", artist name variants, etc. Extract the variant number only as an integer (e.g., "Cover B" → 2, "Cover C" → 3, "Variant 2" → 2, "1:25 Variant" → null since it's a ratio not a sequential number). Return null if the cover shows no variant labeling or is a standard Cover A / first print.

Rules:
1. "series" is the brand/franchise name that continues across many issues
2. "story" is only the subtitle for this specific issue or arc — most issues have no story title
3. For "issue_number": always output digits only. Written-out ordinals and cardinals must be converted ("First" → "1", "One" → "1", "Twenty-Two" → "22")
4. For "total_issues": written-out numbers must be converted ("Six" → 6, "Twelve" → 12)
5. For "cover_variant": letter suffixes map to numbers (A=1, B=2, C=3, D=4, etc.). Only set this when variant labeling is explicit on the cover.
6. Extract publisher name
7. Extract year if visible
8. If you cannot see any text clearly, still return JSON with empty strings/nulls and "low" confidence
9. NEVER respond with explanatory text - ONLY valid JSON

Example responses:
Good: {"series":"The Amazing Spider-Man","story":"Kraven's Last Hunt","issue_number":"294","publisher":"Marvel","year":1988,"total_issues":null,"cover_variant":null,"confidence":"high"}
Good: {"series":"Batman","story":"Year One","issue_number":"1","publisher":"DC Comics","year":1987,"total_issues":4,"cover_variant":null,"confidence":"high"}
Good: {"series":"Watchmen","story":"","issue_number":"3","publisher":"DC Comics","year":1986,"total_issues":12,"cover_variant":2,"confidence":"high"}
Good: {"series":"X-Men","story":"The Dark Phoenix Saga","issue_number":"1","publisher":"Marvel","year":2023,"total_issues":6,"cover_variant":3,"confidence":"high"}
Good: {"series":"Saga","story":"","issue_number":"1","publisher":"Image","year":2012,"total_issues":null,"cover_variant":null,"confidence":"high"}
Good: {"series":"","story":"","issue_number":"","publisher":"","year":null,"total_issues":null,"cover_variant":null,"confidence":"low"}
Bad: "I cannot see the text clearly in this image"
Bad: "Here is what I found: {..."

ALWAYS return valid JSON, even if the image is unclear.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all readable text from this comic book cover. Identify: the series name (ongoing franchise title), any story/arc subtitle, the issue number (convert written-out numbers like "One" or "Two of Six" to digits), the publisher, publication year, the total issues in the arc if shown (e.g. "of 6", "of Six"), and any cover variant label (e.g. "Cover B", "Variant 2"). Ignore artwork and decorative elements. Be accurate and structured.`
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
        max_tokens: 500,
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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: "Could not understand the response from the AI. Please try again.",
          detail: content.substring(0, 200)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

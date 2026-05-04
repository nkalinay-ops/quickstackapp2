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
  "confidence": "high" | "medium" | "low"
}

Field definitions:
- "series": The ongoing series name — the primary, recurring title of the comic (e.g., "The Amazing Spider-Man", "Batman", "X-Men"). This is usually the largest text on the cover.
- "story": The individual story arc title or issue subtitle printed on the cover (e.g., "Kraven's Last Hunt", "Year One", "The Dark Phoenix Saga"). Leave empty string "" if no story subtitle is visible.
- "issue_number": The issue number only, no # symbol (e.g., "300", "1", "12")
- "publisher": Publisher name (Marvel, DC, Image, Dark Horse, etc.)
- "year": Publication year as a number if visible, otherwise null
- "total_issues": The total number of issues in the story arc or limited series, as printed on the cover. Look for patterns like "of 4", "#2 of 6", "Part 3 of 5", "Book 1 of 3", "Limited Series" (cannot extract number from this), "1 of 4", etc. Extract only the total number (e.g., if cover says "#2 of 6", return 6). Return null if not visible or not a limited series.

Rules:
1. "series" is the brand/franchise name that continues across many issues
2. "story" is only the subtitle for this specific issue or arc — most issues have no story title
3. Extract issue number (number only, no # symbol)
4. Extract publisher name
5. Extract year if visible
6. Extract total_issues from "of N" patterns on the cover — this is common on limited series and story arcs
7. If you cannot see any text clearly, still return JSON with empty strings and "low" confidence
8. NEVER respond with explanatory text - ONLY valid JSON

Example responses:
Good: {"series":"The Amazing Spider-Man","story":"Kraven's Last Hunt","issue_number":"294","publisher":"Marvel","year":1988,"total_issues":null,"confidence":"high"}
Good: {"series":"Batman","story":"Year One","issue_number":"1","publisher":"DC Comics","year":1987,"total_issues":4,"confidence":"high"}
Good: {"series":"Watchmen","story":"","issue_number":"3","publisher":"DC Comics","year":1986,"total_issues":12,"confidence":"high"}
Good: {"series":"","story":"","issue_number":"","publisher":"","year":null,"total_issues":null,"confidence":"low"}
Bad: "I cannot see the text clearly in this image"
Bad: "Here is what I found: {..."

ALWAYS return valid JSON, even if the image is unclear.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all readable text from this comic book cover. Identify the series name (the ongoing franchise title), any story/arc subtitle for this specific issue, the issue number, publisher, and publication year. Ignore artwork and decorative elements. Be accurate and structured in your extraction.`
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

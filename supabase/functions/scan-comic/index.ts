import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ComicData {
  title: string;
  issue_number: string;
  publisher: string;
  year: number | null;
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
            content: `You are an expert at extracting text from comic book covers. Your primary goal is text accuracy. Follow these rules:

1. PRIORITIZE TEXT ACCURACY over speed
2. IGNORE background art, illustrations, and decorative elements
3. FOCUS on readable text only (title, issue number, publisher, dates, prices)
4. Handle stylized comic book fonts carefully - they often use custom lettering
5. Be resilient to glare, skew, shadows, and imperfect lighting
6. If text is partially obscured or unclear, make your best guess but indicate uncertainty

EXTRACTION PRIORITY:
1. Large prominent text first (main title, issue number)
2. Smaller metadata (publisher name, date, pricing, barcodes)
3. Ignore decorative, artistic, or illegible text

OUTPUT FORMAT:
Return ONLY valid JSON with these fields:
{
  "title": "string (main comic title)",
  "issue_number": "string (number only, no # symbol)",
  "publisher": "string (Marvel, DC, Image, etc.)",
  "year": number or null,
  "confidence": "high" | "medium" | "low"
}

If uncertain about any field, use empty string for strings, null for year, and set confidence to "medium" or "low".`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all readable text from this comic book cover. Focus on the title, issue number, publisher, and publication year. Ignore artwork and decorative elements. Be accurate and structured in your extraction.`
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze image" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content in response" }),
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
      return new Response(
        JSON.stringify({ error: "Failed to parse comic data", raw: content }),
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
          title: comicData.title || "",
          issue_number: comicData.issue_number || "",
          publisher: comicData.publisher || "",
          year: comicData.year || null,
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

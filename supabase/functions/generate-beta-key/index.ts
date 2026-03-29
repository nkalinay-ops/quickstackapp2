import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const getAllowedOrigins = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  return [
    supabaseUrl,
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter(Boolean);
};

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = getAllowedOrigins();
  const isAllowed = origin && allowedOrigins.includes(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0] || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Allow-Credentials": "true",
  };
};

interface GenerateBetaKeyRequest {
  count?: number;
  createdBy?: string;
  notes?: string;
}

interface BetaKey {
  id: string;
  key_code: string;
  expires_at: string;
  created_at: string;
}

function generateKeyCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = 4;
  const segmentLength = 4;

  const generateSegment = () => {
    let segment = "";
    for (let i = 0; i < segmentLength; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return segment;
  };

  const keySegments = [];
  for (let i = 0; i < segments; i++) {
    keySegments.push(generateSegment());
  }

  return `BETA-${keySegments.join("-")}`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { count = 1, createdBy, notes }: GenerateBetaKeyRequest = await req.json();

    if (count < 1 || count > 100) {
      return new Response(
        JSON.stringify({ error: "Count must be between 1 and 100" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const keys: BetaKey[] = [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    for (let i = 0; i < count; i++) {
      let keyCode = generateKeyCode();
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 10) {
        const { data: existingKey } = await supabase
          .from("beta_keys")
          .select("id")
          .eq("key_code", keyCode)
          .maybeSingle();

        if (!existingKey) {
          isUnique = true;
        } else {
          keyCode = generateKeyCode();
          attempts++;
        }
      }

      if (!isUnique) {
        return new Response(
          JSON.stringify({ error: "Failed to generate unique key" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: newKey, error: insertError } = await supabase
        .from("beta_keys")
        .insert({
          key_code: keyCode,
          expires_at: expiresAt.toISOString(),
          created_by: createdBy || user.email,
          notes: notes || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting beta key:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create beta key" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      keys.push(newKey);
    }

    return new Response(
      JSON.stringify({
        success: true,
        keys: keys.map((k) => ({
          id: k.id,
          key_code: k.key_code,
          expires_at: k.expires_at,
          created_at: k.created_at,
        })),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-beta-key function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

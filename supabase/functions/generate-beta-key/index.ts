import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await userClient
      .from("user_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { count = 1, createdBy, notes }: GenerateBetaKeyRequest =
      await req.json();

    if (count < 1 || count > 100) {
      return new Response(
        JSON.stringify({ error: "Count must be between 1 and 100" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        const { data: existingKey } = await serviceClient
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
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newKey, error: insertError } = await serviceClient
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
        return new Response(
          JSON.stringify({ error: "Failed to create beta key" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Error in generate-beta-key function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

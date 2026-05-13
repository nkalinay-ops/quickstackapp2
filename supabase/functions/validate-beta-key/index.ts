import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ValidateBetaKeyRequest {
  keyCode: string;
  email: string;
  password: string;
}

Deno.serve(async (req: Request) => {
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { keyCode, email, password }: ValidateBetaKeyRequest = await req.json();

    if (!keyCode || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const normalizedKeyCode = keyCode.trim().toUpperCase();

    // --- Step 1: Validate the beta key ---
    const { data: betaKey, error: keyError } = await supabase
      .from("beta_keys")
      .select("*")
      .eq("key_code", normalizedKeyCode)
      .maybeSingle();

    if (keyError) {
      console.error("Error fetching beta key:", keyError);
      return new Response(
        JSON.stringify({ error: "Failed to validate beta key" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!betaKey) {
      return new Response(
        JSON.stringify({ error: "Invalid beta key" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!betaKey.is_active) {
      return new Response(
        JSON.stringify({ error: "This beta key has been deactivated" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (betaKey.redeemed_at) {
      return new Response(
        JSON.stringify({ error: "This beta key has already been used" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (new Date() > new Date(betaKey.expires_at)) {
      return new Response(
        JSON.stringify({ error: "This beta key has expired" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- Step 2: Create the user account ---
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      console.error("Error signing up user:", signUpError);
      return new Response(
        JSON.stringify({ error: signUpError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user account" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = authData.user.id;

    // --- Step 3: Get session ---
    let session = authData.session;
    if (!session) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!signInError && signInData.session) {
        session = signInData.session;
      }
    }

    // --- Step 4: Activate beta access on the user profile ---
    // The handle_new_user trigger fires synchronously on auth.users INSERT,
    // so the profile row already exists by the time signUp returns.
    const { data: updatedProfile, error: profileError } = await supabase
      .from("user_profiles")
      .update({
        is_beta_user: true,
        beta_key_redeemed: normalizedKeyCode,
      })
      .eq("id", userId)
      .select("id");

    if (profileError) {
      console.error("Error updating user profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to activate beta access on user profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!updatedProfile || updatedProfile.length === 0) {
      console.error("Profile update matched 0 rows for userId:", userId);
      return new Response(
        JSON.stringify({ error: "User profile not found after account creation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- Step 5: Mark the beta key as redeemed ---
    // No .select() appended — PostgREST returns 204 No Content on success.
    // Chaining .select() caused a silent failure because supabase-js requires
    // a SELECT RLS policy to return RETURNING rows, even when the UPDATE itself
    // succeeds. We only check redeemError; absence of error means success.
    const { error: redeemError } = await supabase
      .from("beta_keys")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by: userId,
      })
      .eq("key_code", normalizedKeyCode);

    if (redeemError) {
      console.error(
        "Error marking beta key as redeemed:",
        JSON.stringify({ keyCode: normalizedKeyCode, userId, redeemError })
      );
      return new Response(
        JSON.stringify({ error: "Failed to redeem beta key" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account created successfully with beta access",
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
        session,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in validate-beta-key function:", error);
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

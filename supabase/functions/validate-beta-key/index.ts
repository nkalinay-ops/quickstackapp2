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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // Admin client for all DB operations. persistSession:false is not enough —
    // auth.signUp() still overwrites the internal session, causing subsequent
    // DB calls to run as the new user (not service_role). We use admin.createUser()
    // instead of signUp() so this client's identity is never mutated.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
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
    const { data: betaKey, error: keyError } = await adminClient
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

    // --- Step 2: Create the user account via admin API ---
    // admin.createUser() never touches adminClient's session state, so all
    // subsequent adminClient DB operations continue to run as service_role.
    const { data: adminUserData, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createUserError) {
      console.error("Error creating user:", createUserError);
      return new Response(
        JSON.stringify({ error: createUserError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!adminUserData.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user account" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = adminUserData.user.id;

    // --- Step 3: Get session via a separate anon client ---
    // admin.createUser() returns no session; sign in separately using a
    // dedicated anon client so the admin client remains unaffected.
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData } = await anonClient.auth.signInWithPassword({ email, password });
    const session = signInData?.session ?? null;

    // --- Step 4: Activate beta access on the user profile ---
    const { data: updatedProfile, error: profileError } = await adminClient
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
    // No .select() — PostgREST returns 204 No Content on success.
    const { error: redeemError } = await adminClient
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
          id: adminUserData.user.id,
          email: adminUserData.user.email,
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

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  const allowedOrigins = [
    supabaseUrl,
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter(Boolean);

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('webcontainer')) {
    return true;
  }

  if (origin.includes('.vercel.app')) {
    return true;
  }

  return false;
};

const getCorsHeaders = (origin: string | null) => {
  const isAllowed = isOriginAllowed(origin);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : (supabaseUrl || "*"),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Allow-Credentials": "true",
  };
};

interface AdminActionRequest {
  action: "list_users" | "promote_admin" | "revoke_admin" | "terminate_user";
  userId?: string;
  reason?: string;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    console.log("Request headers:", {
      hasAuth: !!authHeader,
      origin: req.headers.get("origin"),
    });

    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const token = authHeader.replace("Bearer ", "");
    console.log("Verifying token, length:", token.length);

    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    console.log("Auth verification result:", {
      hasUser: !!user,
      userId: user?.id,
      error: authError?.message,
    });

    if (authError || !user) {
      console.error("Auth verification failed:", authError);
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: authError?.message || "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = user.id;
    console.log("User authenticated:", userId);

    const { data: profile, error: profileError } = await serviceClient
      .from("user_profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return new Response(
        JSON.stringify({ error: `Profile error: ${profileError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile.is_admin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: AdminActionRequest = await req.json();

    if (body.action === "list_users") {
      const { data: users, error: usersError } = await serviceClient
        .from("user_profiles")
        .select(`
          id,
          is_beta_user,
          beta_key_redeemed,
          is_admin,
          admin_granted_at,
          admin_granted_by,
          created_at,
          updated_at
        `)
        .order("created_at", { ascending: false });

      if (usersError) {
        throw usersError;
      }

      const userIds = users.map((u) => u.id);
      const { data: authUsers, error: authError } = await serviceClient.auth.admin.listUsers();

      if (authError) {
        throw authError;
      }

      const { data: terminations, error: terminationsError } = await serviceClient
        .from("user_terminations")
        .select("*");

      if (terminationsError) {
        throw terminationsError;
      }

      const authUsersMap = new Map(
        authUsers.users.map((u) => [u.id, { email: u.email, last_sign_in_at: u.last_sign_in_at }])
      );

      const terminationsMap = new Map(
        terminations.map((t) => [t.user_id, t])
      );

      const enrichedUsers = users.map((user) => ({
        ...user,
        email: authUsersMap.get(user.id)?.email || null,
        last_sign_in_at: authUsersMap.get(user.id)?.last_sign_in_at || null,
        termination: terminationsMap.get(user.id) || null,
      }));

      return new Response(
        JSON.stringify({ users: enrichedUsers }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.action === "promote_admin" && body.userId) {
      const { error: updateError } = await serviceClient
        .from("user_profiles")
        .update({
          is_admin: true,
          admin_granted_at: new Date().toISOString(),
          admin_granted_by: userId,
        })
        .eq("id", body.userId);

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({ success: true, message: "User promoted to admin" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.action === "revoke_admin" && body.userId) {
      if (body.userId === userId) {
        return new Response(
          JSON.stringify({ error: "Cannot revoke your own admin status" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: updateError } = await serviceClient
        .from("user_profiles")
        .update({
          is_admin: false,
          admin_granted_at: null,
          admin_granted_by: null,
        })
        .eq("id", body.userId);

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({ success: true, message: "Admin privileges revoked" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.action === "terminate_user" && body.userId) {
      if (body.userId === userId) {
        return new Response(
          JSON.stringify({ error: "Cannot terminate your own account" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log("Attempting to terminate user:", body.userId, "by:", userId);

      const { data: existingTermination } = await serviceClient
        .from("user_terminations")
        .select("*")
        .eq("user_id", body.userId)
        .maybeSingle();

      if (existingTermination) {
        return new Response(
          JSON.stringify({ error: "User is already terminated" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: terminationError } = await serviceClient
        .from("user_terminations")
        .insert({
          user_id: body.userId,
          terminated_by: userId,
          reason: body.reason || null,
        });

      if (terminationError) {
        console.error("Termination error:", terminationError);
        throw terminationError;
      }

      console.log("User terminated successfully:", body.userId);

      return new Response(
        JSON.stringify({ success: true, message: "User access terminated" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

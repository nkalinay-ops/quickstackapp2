import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AdminActionRequest {
  action: "list_users" | "promote_admin" | "revoke_admin" | "terminate_user";
  userId?: string;
  reason?: string;
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
          can_bulk_upload,
          bulk_upload_granted_at,
          bulk_upload_granted_by,
          created_at,
          updated_at
        `)
        .order("created_at", { ascending: false });

      if (usersError) throw usersError;

      const { data: authUsers, error: authUsersError } =
        await serviceClient.auth.admin.listUsers();

      if (authUsersError) throw authUsersError;

      const { data: terminations, error: terminationsError } =
        await serviceClient.from("user_terminations").select("*");

      if (terminationsError) throw terminationsError;

      const authUsersMap = new Map(
        authUsers.users.map((u: { id: string; email?: string; last_sign_in_at?: string }) => [
          u.id,
          { email: u.email, last_sign_in_at: u.last_sign_in_at },
        ])
      );

      const terminationsMap = new Map(
        terminations.map((t: { user_id: string }) => [t.user_id, t])
      );

      const enrichedUsers = users.map((u: { id: string }) => ({
        ...u,
        email: authUsersMap.get(u.id)?.email || null,
        last_sign_in_at: authUsersMap.get(u.id)?.last_sign_in_at || null,
        termination: terminationsMap.get(u.id) || null,
      }));

      return new Response(JSON.stringify({ users: enrichedUsers }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "promote_admin" && body.userId) {
      const { error: updateError } = await serviceClient
        .from("user_profiles")
        .update({
          is_admin: true,
          admin_granted_at: new Date().toISOString(),
          admin_granted_by: user.id,
        })
        .eq("id", body.userId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, message: "User promoted to admin" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "revoke_admin" && body.userId) {
      if (body.userId === user.id) {
        return new Response(
          JSON.stringify({ error: "Cannot revoke your own admin status" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, message: "Admin privileges revoked" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "terminate_user" && body.userId) {
      if (body.userId === user.id) {
        return new Response(
          JSON.stringify({ error: "Cannot terminate your own account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existingTermination } = await serviceClient
        .from("user_terminations")
        .select("*")
        .eq("user_id", body.userId)
        .maybeSingle();

      if (existingTermination) {
        return new Response(
          JSON.stringify({ error: "User is already terminated" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: terminationError } = await serviceClient
        .from("user_terminations")
        .insert({
          user_id: body.userId,
          terminated_by: user.id,
          reason: body.reason || null,
        });

      if (terminationError) throw terminationError;

      return new Response(
        JSON.stringify({ success: true, message: "User access terminated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Unexpected error in manage-admin-users:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

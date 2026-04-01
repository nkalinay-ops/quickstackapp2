import { requireAdmin, getCorsHeaders } from "../_shared/auth.ts";

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
    // Use the strict two-client auth pattern
    const { user, serviceClient } = await requireAdmin(req);

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

      if (usersError) {
        throw usersError;
      }

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
          admin_granted_by: user.id,
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
      if (body.userId === user.id) {
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
      if (body.userId === user.id) {
        return new Response(
          JSON.stringify({ error: "Cannot terminate your own account" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log("Attempting to terminate user:", body.userId, "by:", user.id);

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
          terminated_by: user.id,
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
    if (error instanceof Response) {
      return error;
    }

    console.error("Unexpected error in manage-admin-users:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

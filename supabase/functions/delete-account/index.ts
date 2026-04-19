import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuth, getCorsHeaders } from "../_shared/auth.ts";

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
    const { user, serviceClient } = await requireAuth(req);

    const { data: storageFiles } = await serviceClient.storage
      .from("comic-covers")
      .list(user.id);

    if (storageFiles && storageFiles.length > 0) {
      const filePaths = storageFiles.map((f) => `${user.id}/${f.name}`);
      await serviceClient.storage.from("comic-covers").remove(filePaths);
    }

    await serviceClient
      .from("comics")
      .delete()
      .eq("user_id", user.id);

    await serviceClient
      .from("wishlist")
      .delete()
      .eq("user_id", user.id);

    await serviceClient
      .from("beta_keys")
      .update({ is_active: false })
      .eq("redeemed_by", user.id);

    await serviceClient
      .from("user_terminations")
      .delete()
      .eq("user_id", user.id);

    await serviceClient
      .from("user_profiles")
      .delete()
      .eq("id", user.id);

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("Unexpected error in delete-account:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
      }
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAdmin, corsHeaders } from "../_shared/auth.ts";

interface PermissionRequest {
  target_user_id: string;
  grant: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Use the strict two-client auth pattern
    const { user, serviceClient } = await requireAdmin(req);

    const { target_user_id, grant }: PermissionRequest = await req.json();

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updateData = grant
      ? {
          can_bulk_upload: true,
          bulk_upload_granted_at: new Date().toISOString(),
          bulk_upload_granted_by: user.id,
        }
      : {
          can_bulk_upload: false,
          bulk_upload_granted_at: null,
          bulk_upload_granted_by: null,
        };

    const { error: updateError } = await serviceClient
      .from('user_profiles')
      .update(updateData)
      .eq('id', target_user_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update permission", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: grant ? "Bulk upload permission granted" : "Bulk upload permission revoked",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Error managing bulk upload permission:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to manage permission",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

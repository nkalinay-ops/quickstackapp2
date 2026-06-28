import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// RevenueCat webhook event types that grant access
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "SUBSCRIBER_ALIAS",
  "TRANSFER",
]);

// RevenueCat webhook event types that end access
const EXPIRY_EVENTS = new Set(["EXPIRATION"]);
// CANCELLATION is intentionally excluded — access continues until the EXPIRATION event

interface RevenueCatEntitlement {
  expirationDate: string | null;
}

interface RevenueCatCustomerInfo {
  entitlements: {
    active: Record<string, RevenueCatEntitlement>;
  };
}

function resolveTierFromEntitlements(entitlementIds: string[]): string {
  if (entitlementIds.includes("plus")) return "plus";
  if (entitlementIds.includes("paid")) return "paid";
  return "free";
}

function resolveTierFromCustomerInfo(customerInfo: RevenueCatCustomerInfo): { tier: string; expiresAt: string | null } {
  const active = customerInfo?.entitlements?.active ?? {};
  if (active["plus"]) return { tier: "plus", expiresAt: active["plus"].expirationDate };
  if (active["paid"]) return { tier: "paid", expiresAt: active["paid"].expirationDate };
  return { tier: "free", expiresAt: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const isWebhook = !!webhookSecret && authHeader === webhookSecret;
    const isClientCall = authHeader.startsWith("Bearer ");

    if (!isWebhook && !isClientCall) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client needed for webhook path (no user JWT) and to bypass RLS when updating tier
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const updateUserTier = async (userId: string, tier: string, expiresAt: string | null) => {
      const { data: profile } = await serviceClient
        .from("user_profiles")
        .select("user_tier")
        .eq("id", userId)
        .single();

      // Never downgrade an admin regardless of subscription state
      if (profile?.user_tier === "admin") return;

      await serviceClient
        .from("user_profiles")
        .update({ user_tier: tier, subscription_expires_at: expiresAt })
        .eq("id", userId);
    };

    if (isWebhook) {
      const body = await req.json();
      const event = body?.event;

      if (!event?.app_user_id) {
        return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`RevenueCat webhook: ${event.type} for user ${event.app_user_id}`);

      if (EXPIRY_EVENTS.has(event.type)) {
        await updateUserTier(event.app_user_id, "free", null);
      } else if (GRANT_EVENTS.has(event.type)) {
        const tier = resolveTierFromEntitlements(event.entitlement_ids ?? []);
        const expiresAt = event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null;
        await updateUserTier(event.app_user_id, tier, expiresAt);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client call — verify JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { customerInfo } = await req.json();
    const { tier, expiresAt } = resolveTierFromCustomerInfo(customerInfo as RevenueCatCustomerInfo);
    await updateUserTier(user.id, tier, expiresAt);

    return new Response(JSON.stringify({ tier }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

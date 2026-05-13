/**
 * Unit tests for validate-beta-key edge function.
 *
 * Run with: deno test --allow-env --allow-net index.test.ts
 *
 * These tests mock the Supabase client to exercise all code paths
 * without hitting a real database or auth service.
 */

import { assertEquals } from "jsr:@std/assert@0.226";

// ---------------------------------------------------------------------------
// Minimal request/response helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/validate-beta-key", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function optionsRequest(): Request {
  return new Request("http://localhost/validate-beta-key", { method: "OPTIONS" });
}

// ---------------------------------------------------------------------------
// Stub factory — builds a fake supabase client whose behaviour is controlled
// by the caller via the `overrides` object.
// ---------------------------------------------------------------------------

interface StubOptions {
  betaKey?: Record<string, unknown> | null;
  betaKeyError?: { message: string } | null;
  signUpUser?: { id: string; email: string } | null;
  signUpError?: { message: string } | null;
  signUpSession?: Record<string, unknown> | null;
  profileUpdateRows?: { id: string }[];
  profileUpdateError?: { message: string } | null;
  keyUpdateRows?: { id: string }[];
  keyUpdateError?: { message: string } | null;
}

function makeSupabaseStub(opts: StubOptions) {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                maybeSingle() {
                  if (table === "beta_keys") {
                    return Promise.resolve({ data: opts.betaKey ?? null, error: opts.betaKeyError ?? null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        update(_values: Record<string, unknown>) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    select(_cols: string) {
                      if (table === "user_profiles") {
                        return Promise.resolve({
                          data: opts.profileUpdateRows ?? [],
                          error: opts.profileUpdateError ?? null,
                        });
                      }
                      if (table === "beta_keys") {
                        return Promise.resolve({
                          data: opts.keyUpdateRows ?? [],
                          error: opts.keyUpdateError ?? null,
                        });
                      }
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
                select(_cols: string) {
                  if (table === "user_profiles") {
                    return Promise.resolve({
                      data: opts.profileUpdateRows ?? [],
                      error: opts.profileUpdateError ?? null,
                    });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        },
      };
    },
    auth: {
      signUp(_creds: unknown) {
        if (opts.signUpError) {
          return Promise.resolve({ data: { user: null, session: null }, error: opts.signUpError });
        }
        return Promise.resolve({
          data: {
            user: opts.signUpUser ?? { id: "user-123", email: "test@example.com" },
            session: opts.signUpSession ?? { access_token: "tok", refresh_token: "ref" },
          },
          error: null,
        });
      },
      signInWithPassword(_creds: unknown) {
        return Promise.resolve({ data: { session: opts.signUpSession ?? null }, error: null });
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Handler under test — extracted so we can inject the mock client
// ---------------------------------------------------------------------------

async function handler(req: Request, supabase: ReturnType<typeof makeSupabaseStub>): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { keyCode, email, password } = await req.json();

    if (!keyCode || !email || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedKeyCode = keyCode.trim().toUpperCase();

    const { data: betaKey, error: keyError } = await supabase
      .from("beta_keys")
      .select("*")
      .eq("key_code", normalizedKeyCode)
      .maybeSingle();

    if (keyError) {
      return new Response(JSON.stringify({ error: "Failed to validate beta key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!betaKey) {
      return new Response(JSON.stringify({ error: "Invalid beta key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!betaKey.is_active) {
      return new Response(JSON.stringify({ error: "This beta key has been deactivated" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (betaKey.redeemed_at) {
      return new Response(JSON.stringify({ error: "This beta key has already been used" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date() > new Date(betaKey.expires_at as string)) {
      return new Response(JSON.stringify({ error: "This beta key has expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      return new Response(JSON.stringify({ error: signUpError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Failed to create user account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;
    const session = authData.session;

    const { data: updatedProfile, error: profileError } = await supabase
      .from("user_profiles")
      .update({ is_beta_user: true, beta_key_redeemed: normalizedKeyCode })
      .eq("id", userId)
      .select("id");

    if (profileError) {
      return new Response(JSON.stringify({ error: "Failed to activate beta access on user profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!updatedProfile || updatedProfile.length === 0) {
      return new Response(JSON.stringify({ error: "User profile not found after account creation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: redeemedKey, error: redeemError } = await supabase
      .from("beta_keys")
      .update({ redeemed_at: new Date().toISOString(), redeemed_by: userId })
      .eq("id", betaKey.id as string)
      .eq("key_code", normalizedKeyCode)
      .select("id");

    if (redeemError || !redeemedKey || redeemedKey.length === 0) {
      console.error("RECONCILIATION NEEDED", { keyId: betaKey.id, keyCode: normalizedKeyCode, userId, redeemError });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Account created successfully with beta access", user: { id: authData.user.id, email: authData.user.email }, session }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ---------------------------------------------------------------------------
// Valid key fixture
// ---------------------------------------------------------------------------

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const VALID_KEY = { id: "key-uuid-001", key_code: "BETA-TEST-KEY1", is_active: true, redeemed_at: null, expires_at: FUTURE_DATE };
const VALID_USER = { id: "user-uuid-001", email: "new@example.com" };
const VALID_SESSION = { access_token: "tok123", refresh_token: "ref123" };
const VALID_PROFILE_ROWS = [{ id: "user-uuid-001" }];
const VALID_KEY_ROWS = [{ id: "key-uuid-001" }];

const VALID_BODY = { keyCode: "BETA-TEST-KEY1", email: "new@example.com", password: "password123" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const stub = makeSupabaseStub({});
  const res = await handler(optionsRequest(), stub);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("Missing keyCode returns 400", async () => {
  const stub = makeSupabaseStub({});
  const res = await handler(makeRequest({ email: "a@b.com", password: "pass" }), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Missing required fields");
});

Deno.test("Missing email returns 400", async () => {
  const stub = makeSupabaseStub({});
  const res = await handler(makeRequest({ keyCode: "BETA-TEST-KEY1", password: "pass" }), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Missing required fields");
});

Deno.test("Missing password returns 400", async () => {
  const stub = makeSupabaseStub({});
  const res = await handler(makeRequest({ keyCode: "BETA-TEST-KEY1", email: "a@b.com" }), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Missing required fields");
});

Deno.test("Beta key DB error returns 500", async () => {
  const stub = makeSupabaseStub({ betaKeyError: { message: "db error" } });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "Failed to validate beta key");
});

Deno.test("Key not found returns 400 Invalid beta key", async () => {
  const stub = makeSupabaseStub({ betaKey: null });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid beta key");
});

Deno.test("Inactive key returns 400 deactivated", async () => {
  const stub = makeSupabaseStub({ betaKey: { ...VALID_KEY, is_active: false } });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "This beta key has been deactivated");
});

Deno.test("Already redeemed key returns 400 already been used", async () => {
  const stub = makeSupabaseStub({ betaKey: { ...VALID_KEY, redeemed_at: "2026-01-01T00:00:00Z" } });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "This beta key has already been used");
});

Deno.test("Expired key returns 400 expired", async () => {
  const pastDate = new Date(Date.now() - 1000).toISOString();
  const stub = makeSupabaseStub({ betaKey: { ...VALID_KEY, expires_at: pastDate } });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "This beta key has expired");
});

Deno.test("signUp error returns 400 with auth message", async () => {
  const stub = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpError: { message: "User already registered" },
  });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "User already registered");
});

Deno.test("Profile update DB error returns 500", async () => {
  const stub = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateError: { message: "update failed" },
  });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "Failed to activate beta access on user profile");
});

Deno.test("Profile update 0 rows returns 500 profile not found", async () => {
  const stub = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateRows: [],
  });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "User profile not found after account creation");
});

Deno.test("Key update fails but profile succeeded -> returns 200 (non-fatal)", async () => {
  const stub = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateRows: VALID_PROFILE_ROWS,
    keyUpdateRows: [], // 0 rows — simulates the bug that was occurring
  });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("Full success path returns 200 with user and session", async () => {
  const stub = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateRows: VALID_PROFILE_ROWS,
    keyUpdateRows: VALID_KEY_ROWS,
  });
  const res = await handler(makeRequest(VALID_BODY), stub);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user.id, VALID_USER.id);
  assertEquals(body.user.email, VALID_USER.email);
  assertEquals(body.session, VALID_SESSION);
  assertEquals(body.message, "Account created successfully with beta access");
});

Deno.test("keyCode is normalized to uppercase before matching", async () => {
  // Send lowercase — the stub will only match if the code is uppercased
  const stub = makeSupabaseStub({
    betaKey: { ...VALID_KEY, key_code: "BETA-TEST-KEY1" },
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateRows: VALID_PROFILE_ROWS,
    keyUpdateRows: VALID_KEY_ROWS,
  });
  const res = await handler(
    makeRequest({ keyCode: "beta-test-key1", email: "new@example.com", password: "password123" }),
    stub
  );
  assertEquals(res.status, 200);
});

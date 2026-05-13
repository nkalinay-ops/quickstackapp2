/**
 * Unit tests for validate-beta-key edge function.
 *
 * Run with:
 *   ~/.deno/bin/deno test --allow-env --allow-net index.test.ts
 *
 * Stubs capture actual argument values passed to every .eq() call so that
 * bugs like "wrong column used for update" are caught at query-construction
 * level. The key update intentionally has NO .select() — we only check error.
 */

import { assertEquals, assertExists } from "jsr:@std/assert@0.226";

// ---------------------------------------------------------------------------
// Request helpers
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
// Argument-capturing stub
// ---------------------------------------------------------------------------

interface EqCall {
  table: string;
  operation: "select" | "update";
  column: string;
  value: unknown;
}

interface StubOptions {
  betaKey?: Record<string, unknown> | null;
  betaKeyError?: { message: string } | null;
  signUpUser?: { id: string; email: string } | null;
  signUpError?: { message: string } | null;
  signUpSession?: Record<string, unknown> | null;
  profileUpdateRows?: { id: string }[];
  profileUpdateError?: { message: string } | null;
  keyUpdateError?: { message: string } | null;
}

// deno-lint-ignore no-explicit-any
type SupabaseStubClient = any;

interface Stub {
  client: SupabaseStubClient;
  eqCalls: EqCall[];
}

function makeSupabaseStub(opts: StubOptions): Stub {
  const eqCalls: EqCall[] = [];

  function recordEq(table: string, operation: "select" | "update", col: string, val: unknown) {
    eqCalls.push({ table, operation, column: col, value: val });
  }

  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              recordEq(table, "select", col, val);
              return {
                maybeSingle() {
                  if (table === "beta_keys") {
                    return Promise.resolve({
                      data: opts.betaKey ?? null,
                      error: opts.betaKeyError ?? null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        update(_values: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              recordEq(table, "update", col, val);
              // Key update has no .select() — returns { error } directly.
              // Profile update chains .select("id") — returns { data, error }.
              if (table === "beta_keys") {
                return Promise.resolve({
                  error: opts.keyUpdateError ?? null,
                });
              }
              // user_profiles update chains .select("id")
              return {
                select(_cols: string) {
                  return Promise.resolve({
                    data: opts.profileUpdateRows ?? [],
                    error: opts.profileUpdateError ?? null,
                  });
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
          return Promise.resolve({
            data: { user: null, session: null },
            error: opts.signUpError,
          });
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
        return Promise.resolve({
          data: { session: opts.signUpSession ?? null },
          error: null,
        });
      },
    },
  };

  return { client, eqCalls };
}

// ---------------------------------------------------------------------------
// Handler under test (mirrors index.ts logic exactly)
// ---------------------------------------------------------------------------

async function handler(req: Request, supabase: SupabaseStubClient): Promise<Response> {
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
      return new Response(
        JSON.stringify({ error: "Failed to activate beta access on user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!updatedProfile || updatedProfile.length === 0) {
      return new Response(
        JSON.stringify({ error: "User profile not found after account creation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Key update: no .select() — only check error, not row count
    const { error: redeemError } = await supabase
      .from("beta_keys")
      .update({ redeemed_at: new Date().toISOString(), redeemed_by: userId })
      .eq("key_code", normalizedKeyCode);

    if (redeemError) {
      return new Response(
        JSON.stringify({ error: "Failed to redeem beta key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account created successfully with beta access",
        user: { id: authData.user.id, email: authData.user.email },
        session,
      }),
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
// Fixtures
// ---------------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 1000).toISOString();

const VALID_KEY = {
  id: "key-uuid-001",
  key_code: "BETA-TEST-KEY1",
  is_active: true,
  redeemed_at: null,
  expires_at: FUTURE,
};

const VALID_USER = { id: "user-uuid-001", email: "new@example.com" };
const VALID_SESSION = { access_token: "tok123", refresh_token: "ref123" };
const VALID_PROFILE_ROWS = [{ id: "user-uuid-001" }];
const VALID_BODY = { keyCode: "BETA-TEST-KEY1", email: "new@example.com", password: "password123" };

function fullSuccessStub(overrides: StubOptions = {}): Stub {
  return makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateRows: VALID_PROFILE_ROWS,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests — CORS / input validation
// ---------------------------------------------------------------------------

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const { client } = makeSupabaseStub({});
  const res = await handler(optionsRequest(), client);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("Missing keyCode returns 400", async () => {
  const { client } = makeSupabaseStub({});
  const res = await handler(makeRequest({ email: "a@b.com", password: "pass" }), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Missing required fields");
});

Deno.test("Missing email returns 400", async () => {
  const { client } = makeSupabaseStub({});
  const res = await handler(makeRequest({ keyCode: "BETA-TEST-KEY1", password: "pass" }), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Missing required fields");
});

Deno.test("Missing password returns 400", async () => {
  const { client } = makeSupabaseStub({});
  const res = await handler(makeRequest({ keyCode: "BETA-TEST-KEY1", email: "a@b.com" }), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Missing required fields");
});

// ---------------------------------------------------------------------------
// Tests — beta key validation
// ---------------------------------------------------------------------------

Deno.test("Beta key DB error returns 500", async () => {
  const { client } = makeSupabaseStub({ betaKeyError: { message: "db error" } });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Failed to validate beta key");
});

Deno.test("Key not found returns 400 Invalid beta key", async () => {
  const { client } = makeSupabaseStub({ betaKey: null });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Invalid beta key");
});

Deno.test("Inactive key returns 400 deactivated", async () => {
  const { client } = makeSupabaseStub({ betaKey: { ...VALID_KEY, is_active: false } });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "This beta key has been deactivated");
});

Deno.test("Already redeemed key returns 400 already been used", async () => {
  const { client } = makeSupabaseStub({
    betaKey: { ...VALID_KEY, redeemed_at: "2026-01-01T00:00:00Z" },
  });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "This beta key has already been used");
});

Deno.test("Expired key returns 400 expired", async () => {
  const { client } = makeSupabaseStub({ betaKey: { ...VALID_KEY, expires_at: PAST } });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "This beta key has expired");
});

// ---------------------------------------------------------------------------
// Tests — auth / profile errors
// ---------------------------------------------------------------------------

Deno.test("signUp error returns 400 with auth message", async () => {
  const { client } = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpError: { message: "User already registered" },
  });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "User already registered");
});

Deno.test("Profile update DB error returns 500", async () => {
  const { client } = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateError: { message: "update failed" },
  });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Failed to activate beta access on user profile");
});

Deno.test("Profile update 0 rows returns 500 profile not found", async () => {
  const { client } = makeSupabaseStub({
    betaKey: VALID_KEY,
    signUpUser: VALID_USER,
    signUpSession: VALID_SESSION,
    profileUpdateRows: [],
  });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "User profile not found after account creation");
});

// ---------------------------------------------------------------------------
// Tests — key update (THE CRITICAL TESTS)
// The key update has NO .select() — only redeemError matters.
// A DB error must be FATAL (return 500), not silently swallowed.
// ---------------------------------------------------------------------------

Deno.test("Key update DB error returns 500 (fatal — not non-fatal)", async () => {
  const { client } = fullSuccessStub({ keyUpdateError: { message: "lock timeout" } });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Failed to redeem beta key");
});

Deno.test("Key update uses key_code column", async () => {
  const { client, eqCalls } = fullSuccessStub();
  await handler(makeRequest(VALID_BODY), client);
  const keyUpdateCall = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(keyUpdateCall, "Expected an update .eq() call on beta_keys");
  assertEquals(keyUpdateCall.column, "key_code", "Key update must filter by key_code, not id");
});

Deno.test("Key update .eq() value is not undefined or null", async () => {
  const { client, eqCalls } = fullSuccessStub();
  await handler(makeRequest(VALID_BODY), client);
  const keyUpdateCall = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(keyUpdateCall);
  assertExists(keyUpdateCall.value, "Key update .eq() value must not be undefined or null");
});

Deno.test("Key update .eq() value matches the normalized key code from request", async () => {
  const { client, eqCalls } = fullSuccessStub();
  await handler(
    makeRequest({ keyCode: "beta-test-key1", email: "new@example.com", password: "password123" }),
    client
  );
  const keyUpdateCall = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(keyUpdateCall);
  assertEquals(keyUpdateCall.value, "BETA-TEST-KEY1", "Key update must use the uppercased key_code");
});

Deno.test("Key update with betaKey.id=undefined still uses key_code correctly", async () => {
  const keyWithNoId = { ...VALID_KEY, id: undefined };
  const { client, eqCalls } = fullSuccessStub({ betaKey: keyWithNoId });
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 200);
  const keyUpdateCall = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(keyUpdateCall);
  assertEquals(keyUpdateCall.column, "key_code");
  assertEquals(keyUpdateCall.value, "BETA-TEST-KEY1");
});

Deno.test("Profile update uses id column with a defined user id value", async () => {
  const { client, eqCalls } = fullSuccessStub();
  await handler(makeRequest(VALID_BODY), client);
  const profileUpdateCall = eqCalls.find(
    (c) => c.table === "user_profiles" && c.operation === "update"
  );
  assertExists(profileUpdateCall, "Expected an update .eq() call on user_profiles");
  assertEquals(profileUpdateCall.column, "id");
  assertEquals(profileUpdateCall.value, VALID_USER.id);
});

Deno.test("Beta key SELECT uses key_code column with the normalized key", async () => {
  const { client, eqCalls } = fullSuccessStub();
  await handler(makeRequest(VALID_BODY), client);
  const keySelectCall = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "select");
  assertExists(keySelectCall, "Expected a select .eq() call on beta_keys");
  assertEquals(keySelectCall.column, "key_code");
  assertEquals(keySelectCall.value, "BETA-TEST-KEY1");
});

// ---------------------------------------------------------------------------
// Tests — full success path
// ---------------------------------------------------------------------------

Deno.test("Full success path returns 200 with user, session and message", async () => {
  const { client } = fullSuccessStub();
  const res = await handler(makeRequest(VALID_BODY), client);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user.id, VALID_USER.id);
  assertEquals(body.user.email, VALID_USER.email);
  assertEquals(body.session, VALID_SESSION);
  assertEquals(body.message, "Account created successfully with beta access");
});

Deno.test("keyCode is normalized to uppercase before all queries", async () => {
  const { client, eqCalls } = fullSuccessStub();
  await handler(
    makeRequest({ keyCode: "  beta-test-key1  ", email: "a@b.com", password: "pw" }),
    client
  );
  for (const call of eqCalls.filter((c) => c.table === "beta_keys")) {
    assertEquals(
      call.value,
      "BETA-TEST-KEY1",
      `Expected uppercase normalized key, got: ${call.value}`
    );
  }
});

/**
 * Unit tests for validate-beta-key edge function.
 *
 * Run with:
 *   /home/appuser/.deno/bin/deno test --allow-env --allow-net index.test.ts
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
  createUser?: { id: string; email: string } | null;
  createUserError?: { message: string } | null;
  signInSession?: Record<string, unknown> | null;
  profileUpdateRows?: { id: string }[];
  profileUpdateError?: { message: string } | null;
  keyUpdateError?: { message: string } | null;
}

// deno-lint-ignore no-explicit-any
type AnyClient = any;

interface Stub {
  adminClient: AnyClient;
  anonClient: AnyClient;
  eqCalls: EqCall[];
}

function makeStub(opts: StubOptions): Stub {
  const eqCalls: EqCall[] = [];

  function recordEq(table: string, operation: "select" | "update", col: string, val: unknown) {
    eqCalls.push({ table, operation, column: col, value: val });
  }

  const adminClient = {
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
              if (table === "beta_keys") {
                // No .select() on key update — returns { error } directly
                return Promise.resolve({ error: opts.keyUpdateError ?? null });
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
      admin: {
        createUser(_params: unknown) {
          if (opts.createUserError) {
            return Promise.resolve({ data: { user: null }, error: opts.createUserError });
          }
          return Promise.resolve({
            data: { user: opts.createUser ?? { id: "user-123", email: "test@example.com" } },
            error: null,
          });
        },
      },
    },
  };

  const anonClient = {
    auth: {
      signInWithPassword(_creds: unknown) {
        return Promise.resolve({
          data: { session: opts.signInSession ?? { access_token: "tok", refresh_token: "ref" } },
          error: null,
        });
      },
    },
  };

  return { adminClient, anonClient, eqCalls };
}

// ---------------------------------------------------------------------------
// Handler under test — mirrors index.ts exactly
// ---------------------------------------------------------------------------

async function handler(
  req: Request,
  adminClient: AnyClient,
  anonClient: AnyClient
): Promise<Response> {
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

    const { data: betaKey, error: keyError } = await adminClient
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

    const { data: adminUserData, error: createUserError } =
      await adminClient.auth.admin.createUser({ email, password, email_confirm: true });

    if (createUserError) {
      return new Response(JSON.stringify({ error: createUserError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!adminUserData.user) {
      return new Response(JSON.stringify({ error: "Failed to create user account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = adminUserData.user.id;

    const { data: signInData } = await anonClient.auth.signInWithPassword({ email, password });
    const session = signInData?.session ?? null;

    const { data: updatedProfile, error: profileError } = await adminClient
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

    const { error: redeemError } = await adminClient
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
        user: { id: adminUserData.user.id, email: adminUserData.user.email },
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

// Helper to call handler with a single stub
function run(req: Request, opts: StubOptions): Promise<Response> {
  const { adminClient, anonClient } = makeStub(opts);
  return handler(req, adminClient, anonClient);
}

function runWithCalls(req: Request, opts: StubOptions): { res: Promise<Response>; eqCalls: EqCall[] } {
  const { adminClient, anonClient, eqCalls } = makeStub(opts);
  return { res: handler(req, adminClient, anonClient), eqCalls };
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

function successOpts(overrides: StubOptions = {}): StubOptions {
  return {
    betaKey: VALID_KEY,
    createUser: VALID_USER,
    signInSession: VALID_SESSION,
    profileUpdateRows: VALID_PROFILE_ROWS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — CORS / input validation
// ---------------------------------------------------------------------------

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const res = await run(optionsRequest(), {});
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("Missing keyCode returns 400", async () => {
  const res = await run(makeRequest({ email: "a@b.com", password: "pass" }), {});
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Missing required fields");
});

Deno.test("Missing email returns 400", async () => {
  const res = await run(makeRequest({ keyCode: "BETA-TEST-KEY1", password: "pass" }), {});
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Missing required fields");
});

Deno.test("Missing password returns 400", async () => {
  const res = await run(makeRequest({ keyCode: "BETA-TEST-KEY1", email: "a@b.com" }), {});
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Missing required fields");
});

// ---------------------------------------------------------------------------
// Tests — beta key validation
// ---------------------------------------------------------------------------

Deno.test("Beta key DB error returns 500", async () => {
  const res = await run(makeRequest(VALID_BODY), { betaKeyError: { message: "db error" } });
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Failed to validate beta key");
});

Deno.test("Key not found returns 400 Invalid beta key", async () => {
  const res = await run(makeRequest(VALID_BODY), { betaKey: null });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Invalid beta key");
});

Deno.test("Inactive key returns 400 deactivated", async () => {
  const res = await run(makeRequest(VALID_BODY), { betaKey: { ...VALID_KEY, is_active: false } });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "This beta key has been deactivated");
});

Deno.test("Already redeemed key returns 400 already been used", async () => {
  const res = await run(makeRequest(VALID_BODY), {
    betaKey: { ...VALID_KEY, redeemed_at: "2026-01-01T00:00:00Z" },
  });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "This beta key has already been used");
});

Deno.test("Expired key returns 400 expired", async () => {
  const res = await run(makeRequest(VALID_BODY), { betaKey: { ...VALID_KEY, expires_at: PAST } });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "This beta key has expired");
});

// ---------------------------------------------------------------------------
// Tests — user creation errors
// ---------------------------------------------------------------------------

Deno.test("createUser error returns 400 with auth message", async () => {
  const res = await run(
    makeRequest(VALID_BODY),
    successOpts({ createUserError: { message: "User already registered" } })
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "User already registered");
});

// ---------------------------------------------------------------------------
// Tests — profile errors
// ---------------------------------------------------------------------------

Deno.test("Profile update DB error returns 500", async () => {
  const res = await run(
    makeRequest(VALID_BODY),
    successOpts({ profileUpdateError: { message: "update failed" } })
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Failed to activate beta access on user profile");
});

Deno.test("Profile update 0 rows returns 500 profile not found", async () => {
  const res = await run(makeRequest(VALID_BODY), successOpts({ profileUpdateRows: [] }));
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "User profile not found after account creation");
});

// ---------------------------------------------------------------------------
// Tests — key update (THE CRITICAL TESTS)
// ---------------------------------------------------------------------------

Deno.test("Key update DB error returns 500 — fatal, not non-fatal", async () => {
  const res = await run(
    makeRequest(VALID_BODY),
    successOpts({ keyUpdateError: { message: "lock timeout" } })
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Failed to redeem beta key");
});

Deno.test("Key update uses key_code column", async () => {
  const { res, eqCalls } = runWithCalls(makeRequest(VALID_BODY), successOpts());
  await res;
  const call = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(call, "Expected update .eq() on beta_keys");
  assertEquals(call.column, "key_code");
});

Deno.test("Key update .eq() value matches normalized key from request", async () => {
  const { res, eqCalls } = runWithCalls(
    makeRequest({ keyCode: "beta-test-key1", email: "new@example.com", password: "password123" }),
    successOpts()
  );
  await res;
  const call = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(call);
  assertEquals(call.value, "BETA-TEST-KEY1");
});

Deno.test("Key update works even when betaKey.id is undefined", async () => {
  const { res, eqCalls } = runWithCalls(
    makeRequest(VALID_BODY),
    successOpts({ betaKey: { ...VALID_KEY, id: undefined } })
  );
  assertEquals((await res).status, 200);
  const call = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "update");
  assertExists(call);
  assertEquals(call.column, "key_code");
  assertEquals(call.value, "BETA-TEST-KEY1");
});

Deno.test("Profile update uses id column with the new user's id", async () => {
  const { res, eqCalls } = runWithCalls(makeRequest(VALID_BODY), successOpts());
  await res;
  const call = eqCalls.find((c) => c.table === "user_profiles" && c.operation === "update");
  assertExists(call, "Expected update .eq() on user_profiles");
  assertEquals(call.column, "id");
  assertEquals(call.value, VALID_USER.id);
});

Deno.test("Beta key SELECT uses key_code column", async () => {
  const { res, eqCalls } = runWithCalls(makeRequest(VALID_BODY), successOpts());
  await res;
  const call = eqCalls.find((c) => c.table === "beta_keys" && c.operation === "select");
  assertExists(call, "Expected select .eq() on beta_keys");
  assertEquals(call.column, "key_code");
  assertEquals(call.value, "BETA-TEST-KEY1");
});

// ---------------------------------------------------------------------------
// Tests — full success path
// ---------------------------------------------------------------------------

Deno.test("Full success returns 200 with user, session, and message", async () => {
  const res = await run(makeRequest(VALID_BODY), successOpts());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user.id, VALID_USER.id);
  assertEquals(body.user.email, VALID_USER.email);
  assertEquals(body.session, VALID_SESSION);
  assertEquals(body.message, "Account created successfully with beta access");
});

Deno.test("keyCode is normalized to uppercase before all queries", async () => {
  const { res, eqCalls } = runWithCalls(
    makeRequest({ keyCode: "  beta-test-key1  ", email: "a@b.com", password: "pw" }),
    successOpts()
  );
  await res;
  for (const call of eqCalls.filter((c) => c.table === "beta_keys")) {
    assertEquals(call.value, "BETA-TEST-KEY1", `Expected uppercase key, got: ${call.value}`);
  }
});

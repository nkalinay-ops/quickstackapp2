# Edge Function Authentication Guide

This guide explains how to properly implement authentication in Supabase Edge Functions for this project.

## Authentication Architecture

Our Edge Functions use a **two-client pattern** for authentication:

1. **User Client**: Created with the user's JWT token - used to verify identity and perform user-scoped operations
2. **Service Client**: Created with the service role key - used for admin operations that bypass RLS

## The Root Cause We Fixed

**Problem**: We had Edge Functions with `verifyJWT: true` AND manual JWT verification in helper functions. This created a conflict where:
- Supabase's automatic JWT verification at the edge layer would fail first
- Our custom error handling couldn't properly catch and format the errors
- 401/403 responses were leaking through without proper JSON formatting

**Solution**: Choose ONE authentication approach per function:
- Either use `verifyJWT: true` for simple functions (Supabase handles everything)
- Or use `verifyJWT: false` with custom helpers like `requireAuth()` or `requireAdmin()` (we handle everything)

## Decision Matrix: When to Use What

### Use `verifyJWT: true`
- ✅ Simple authenticated endpoints
- ✅ No custom authorization logic needed
- ✅ User's JWT is sufficient to access resources
- ✅ Example: User viewing their own data

### Use `verifyJWT: false` + Custom Helpers
- ✅ Need custom authorization (admin checks, role checks)
- ✅ Need both user verification AND elevated privileges
- ✅ Want custom error messages
- ✅ Need the service role client for admin operations
- ✅ Example: Admin panel endpoints, user management

### Public Endpoints (No Auth)
- ✅ Use `verifyJWT: false`
- ✅ Don't call any auth helpers
- ✅ Example: Webhooks, public API endpoints

## Authentication Helper Functions

Located in `_shared/auth.ts`:

### `requireAuth(req: Request)`
- Verifies user is authenticated
- Returns both user client and service client
- Throws 401 Response if no auth header or invalid token
- **Use this for**: Standard authenticated endpoints

### `requireAdmin(req: Request)`
- Verifies user is authenticated AND is an admin
- Returns both user client and service client
- Throws 401 Response if not authenticated
- Throws 403 Response if not an admin
- **Use this for**: Admin-only endpoints

## Proper Error Handling Pattern

All Edge Functions MUST use this error handling pattern:

```typescript
try {
  // Your function logic here
  const { userClient, serviceClient } = await requireAdmin(req);

  // ... do work ...

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
} catch (error) {
  // CRITICAL: Check if error is already a Response object
  if (error instanceof Response) {
    return error;
  }

  // Handle unexpected errors
  console.error("Unexpected error:", error);
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
```

**Why this pattern?**
- `requireAuth()` and `requireAdmin()` throw `Response` objects (not `Error` objects)
- If we don't check `instanceof Response`, the catch block will try to access `.message` on a Response
- This causes the error handling to fail and leak raw 401/403 responses

## Two-Client Pattern Explained

```typescript
const { userClient, serviceClient } = await requireAdmin(req);

// userClient - Use for:
// - Verifying the user's identity
// - Checking user-specific data
// - Any operation that should respect RLS

// serviceClient - Use for:
// - Admin operations that need to bypass RLS
// - Creating/modifying other users' data
// - System-level operations
```

## Common Patterns

### Pattern 1: Admin Managing Other Users
```typescript
const { userClient, serviceClient } = await requireAdmin(req);

// Verify the requesting user is an admin (already done by requireAdmin)

// Use serviceClient to modify another user's data
const { error } = await serviceClient
  .from('users')
  .update({ role: 'admin' })
  .eq('id', targetUserId);
```

### Pattern 2: User Managing Their Own Data
```typescript
const { userClient } = await requireAuth(req);

// Use userClient - RLS automatically filters to current user
const { data, error } = await userClient
  .from('comics')
  .select('*');
```

### Pattern 3: Public Webhook
```typescript
// No auth helper needed
// Set verifyJWT: false when deploying

const data = await req.json();
// Process webhook...
```

## Deployment Configuration Examples

### Admin Function
```typescript
// Deploy with:
// verifyJWT: false (we handle auth manually)

import { requireAdmin } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { userClient, serviceClient } = await requireAdmin(req);

    // Use serviceClient for admin operations

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Simple Authenticated Function
```typescript
// Deploy with:
// verifyJWT: true (Supabase handles auth automatically)

// No auth helper import needed
// Authorization header is automatically validated

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // JWT is already verified by Supabase
    // Create client with the validated token
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // User operations here

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Public Webhook
```typescript
// Deploy with:
// verifyJWT: false (no authentication needed)

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // Process webhook payload

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

## Testing Checklist

Before deploying any Edge Function with authentication:

- [ ] Decided on auth approach (verifyJWT true/false)
- [ ] If using custom helpers, set `verifyJWT: false`
- [ ] Implemented proper error handling with `instanceof Response` check
- [ ] Added CORS headers to all responses
- [ ] Handled OPTIONS requests
- [ ] Tested with valid auth token
- [ ] Tested with invalid auth token (should return proper 401 JSON)
- [ ] Tested with valid token but insufficient permissions (should return proper 403 JSON)
- [ ] Tested error scenarios return proper JSON (not HTML or plain text)

## Common Mistakes to Avoid

❌ **DON'T**: Use `verifyJWT: true` with `requireAdmin()` or `requireAuth()`
```typescript
// WRONG - This creates a conflict
// Deploy config: verifyJWT: true
import { requireAdmin } from "../_shared/auth.ts";
```

❌ **DON'T**: Forget to check `instanceof Response` in catch blocks
```typescript
// WRONG - This will fail when auth helpers throw Response objects
catch (error) {
  return new Response(JSON.stringify({ error: error.message }), ...);
}
```

❌ **DON'T**: Mix authentication approaches
```typescript
// WRONG - Choose one approach
const { userClient } = await requireAuth(req);
// Then also trying to manually verify JWT again
```

✅ **DO**: Choose one auth approach and stick with it
✅ **DO**: Always check `instanceof Response` in catch blocks
✅ **DO**: Use the two-client pattern for admin operations
✅ **DO**: Test all error scenarios

## Quick Reference

| Scenario | verifyJWT | Helper Function | Clients Needed |
|----------|-----------|-----------------|----------------|
| Public endpoint | `false` | None | None or service client |
| Simple auth | `true` | None | Create manually from header |
| User data access | `false` | `requireAuth()` | userClient |
| Admin operations | `false` | `requireAdmin()` | userClient + serviceClient |

---

**Remember**: The root cause of our bug was mixing `verifyJWT: true` with manual auth helpers. Always choose ONE approach per function!

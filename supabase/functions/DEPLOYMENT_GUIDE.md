# Edge Function Deployment Standards

This guide provides a checklist and best practices for deploying Edge Functions to ensure consistency, security, and reliability.

## Pre-Deployment Checklist

Before deploying any Edge Function, ensure you complete the following:

### 1. Function Type & Authentication

- [ ] Determined which authentication pattern to use:
  - **Admin function** → Use `requireAdmin()` helper
  - **Authenticated function** → Use `requireAuth()` helper
  - **Public function** → No auth helper needed

- [ ] Set correct `verifyJWT` configuration:
  - **Using auth helpers** → `verifyJWT: false`
  - **No auth helpers** → `verifyJWT: false`
  - **NEVER use** → `verifyJWT: true` (we handle auth manually for better error control)

### 2. Error Handling

- [ ] Implemented proper error handling pattern:
  ```typescript
  try {
    // Function logic
  } catch (error) {
    if (error instanceof Response) {
      return error;  // Auth helpers throw Response objects
    }
    // Handle other errors
  }
  ```

- [ ] All error responses return JSON (not HTML or plain text)
- [ ] All error responses include proper status codes (401, 403, 404, 500, etc.)
- [ ] Used helper functions for consistency:
  - `createErrorResponse(message, status, details?)` for errors
  - `createSuccessResponse(data, status?)` for success
  - `wrapHandler(handler)` for automatic error handling

### 3. CORS Configuration

- [ ] Defined `corsHeaders` constant at top of file
- [ ] Handled OPTIONS preflight requests:
  ```typescript
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  ```
- [ ] Included CORS headers in ALL responses (success and error)
- [ ] Used correct header values:
  ```typescript
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
  ```

### 4. Client Usage

- [ ] Used correct client for each operation:
  - **userClient** → User-scoped operations that respect RLS
  - **serviceClient** → Admin operations that bypass RLS

- [ ] Never mixed client usage incorrectly
- [ ] Used `maybeSingle()` instead of `single()` for queries that may return 0 rows

### 5. Code Quality

- [ ] Removed any console.logs used for debugging (keep only error logs)
- [ ] Added meaningful variable names
- [ ] Included TypeScript types where appropriate
- [ ] No hardcoded values (use environment variables)
- [ ] Followed existing code patterns in the project

### 6. Security

- [ ] Never exposed sensitive data in responses
- [ ] Never logged sensitive data (tokens, passwords, etc.)
- [ ] Validated all user input
- [ ] Used parameterized queries (not string concatenation)
- [ ] Properly escaped user input where necessary

## Deployment Process

### Step 1: Review Your Function

1. Open the function file in `supabase/functions/[function-name]/index.ts`
2. Review against the checklist above
3. Verify auth pattern matches function requirements

### Step 2: Deploy Using the Tool

Use the `mcp__supabase__deploy_edge_function` tool with the correct parameters:

```typescript
// Example for admin function
{
  slug: "manage-admin-users",
  verify_jwt: false,
  entrypoint_path: "index.ts"
}

// Example for public webhook
{
  slug: "process-webhook",
  verify_jwt: false,
  entrypoint_path: "index.ts"
}
```

**IMPORTANT:** Always use `verify_jwt: false` in this project.

### Step 3: Post-Deployment Testing

After deployment, test these scenarios:

#### For Admin Functions:
- [ ] Test with valid admin token → Should succeed
- [ ] Test with valid non-admin token → Should return 403 JSON error
- [ ] Test with invalid token → Should return 401 JSON error
- [ ] Test with no token → Should return 401 JSON error
- [ ] Test with malformed request body → Should return appropriate error

#### For Authenticated Functions:
- [ ] Test with valid token → Should succeed
- [ ] Test with invalid token → Should return 401 JSON error
- [ ] Test with no token → Should return 401 JSON error
- [ ] Test with malformed request body → Should return appropriate error

#### For Public Functions:
- [ ] Test with valid payload → Should succeed
- [ ] Test with malformed payload → Should return appropriate error
- [ ] Verify no authentication is required

#### For All Functions:
- [ ] Test OPTIONS request → Should return 200 with CORS headers
- [ ] Verify all responses are JSON formatted
- [ ] Verify CORS headers are present in all responses
- [ ] Check logs for any unexpected errors

## Common Deployment Configurations

### Admin Function Configuration

```typescript
// File: supabase/functions/manage-users/index.ts
import { requireAdmin, corsHeaders, createSuccessResponse, createErrorResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { userClient, serviceClient } = await requireAdmin(req);

    // Use serviceClient for admin operations
    const { data, error } = await serviceClient
      .from('users')
      .select('*');

    if (error) throw error;

    return createSuccessResponse({ users: data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal error",
      500
    );
  }
});

// Deploy with: verify_jwt: false
```

### Authenticated Function Configuration

```typescript
// File: supabase/functions/get-my-data/index.ts
import { requireAuth, corsHeaders, createSuccessResponse, createErrorResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { user, userClient } = await requireAuth(req);

    // Use userClient - RLS automatically filters to current user
    const { data, error } = await userClient
      .from('comics')
      .select('*');

    if (error) throw error;

    return createSuccessResponse({ comics: data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal error",
      500
    );
  }
});

// Deploy with: verify_jwt: false
```

### Public Function Configuration

```typescript
// File: supabase/functions/webhook/index.ts
import { corsHeaders, createSuccessResponse, createErrorResponse } from "../_shared/auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // Process webhook...

    return createSuccessResponse({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal error",
      500
    );
  }
});

// Deploy with: verify_jwt: false
```

## Using the Error Handler Wrapper (Advanced)

For cleaner code, you can use the `wrapHandler` utility:

```typescript
import { requireAdmin, wrapHandler, createSuccessResponse } from "../_shared/auth.ts";

Deno.serve(
  wrapHandler(async (req: Request) => {
    const { userClient, serviceClient } = await requireAdmin(req);

    // Your logic here - errors are automatically handled

    return createSuccessResponse({ success: true });
  })
);
```

The `wrapHandler` utility:
- Automatically catches `Response` objects from auth helpers
- Converts `Error` objects to JSON responses
- Logs unexpected errors
- Ensures all responses have proper CORS headers

## Troubleshooting Common Issues

### Issue: Getting 401 errors in production but not locally

**Cause:** Likely using `verifyJWT: true` with auth helpers

**Solution:**
1. Redeploy with `verifyJWT: false`
2. Ensure auth helpers are being used correctly

### Issue: Error responses are HTML instead of JSON

**Cause:** Missing `instanceof Response` check in catch block

**Solution:**
```typescript
catch (error) {
  if (error instanceof Response) return error;  // Add this line
  // ... rest of error handling
}
```

### Issue: CORS errors in browser

**Cause:** Missing CORS headers or not handling OPTIONS

**Solution:**
1. Add OPTIONS handler at top of function
2. Include CORS headers in ALL responses
3. Ensure exact header values match requirements

### Issue: Users getting 500 errors instead of 401/403

**Cause:** Auth helper errors not being caught properly

**Solution:**
1. Verify `instanceof Response` check exists
2. Ensure auth helpers are imported correctly
3. Check that auth helpers are throwing Response objects (not Error objects)

## Quick Reference

| Function Type | Auth Helper | verifyJWT | Clients Returned |
|--------------|-------------|-----------|------------------|
| Admin | `requireAdmin()` | `false` | userClient, serviceClient |
| Authenticated | `requireAuth()` | `false` | userClient, serviceClient |
| User Only | `requireUser()` | `false` | userClient only |
| Public | None | `false` | Create manually if needed |

## Final Reminders

✅ **ALWAYS** use `verifyJWT: false` in this project
✅ **ALWAYS** check `instanceof Response` in catch blocks
✅ **ALWAYS** include CORS headers in all responses
✅ **ALWAYS** handle OPTIONS requests
✅ **ALWAYS** return JSON for errors (never HTML or plain text)
✅ **ALWAYS** test with invalid auth before considering deployment complete

❌ **NEVER** use `verifyJWT: true` with auth helpers
❌ **NEVER** skip the `instanceof Response` check
❌ **NEVER** forget CORS headers
❌ **NEVER** log sensitive data
❌ **NEVER** expose internal error details to users in production

---

For more detailed authentication patterns and examples, see `AUTH_GUIDE.md`.

For ready-to-use templates, see the `_templates/` directory.

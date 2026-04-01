# Edge Function Templates

This directory contains templates for creating new Edge Functions with proper authentication patterns.

## Available Templates

### 1. `admin-function-template.ts`
Use this template for **admin-only endpoints** that require elevated privileges.

**Features:**
- Uses `requireAdmin()` helper for authentication
- Provides both `userClient` and `serviceClient`
- Proper error handling with `instanceof Response` check
- CORS headers configured

**Deployment:**
```bash
# When deploying, ALWAYS use verifyJWT: false
verifyJWT: false
```

**Example use cases:**
- Managing users (grant/revoke admin, terminate users)
- Generating beta keys
- Bulk operations on system data
- Any operation that needs to bypass RLS

---

### 2. `authenticated-function-template.ts`
Use this template for **user-authenticated endpoints** where users manage their own data.

**Features:**
- Uses `requireAuth()` helper for authentication
- Provides both `userClient` and `serviceClient`
- Proper error handling with `instanceof Response` check
- CORS headers configured

**Deployment:**
```bash
# When deploying, ALWAYS use verifyJWT: false
verifyJWT: false
```

**Example use cases:**
- User viewing their own comics
- User updating their profile
- User managing their wishlist
- Any operation where RLS should apply

---

### 3. `public-function-template.ts`
Use this template for **public endpoints** that don't require authentication.

**Features:**
- No authentication helpers
- Proper error handling
- CORS headers configured

**Deployment:**
```bash
# When deploying, ALWAYS use verifyJWT: false
verifyJWT: false
```

**Example use cases:**
- Webhooks from external services (Stripe, etc.)
- Public API endpoints
- Health checks
- Any publicly accessible endpoint

---

## How to Use These Templates

1. **Choose the right template** based on your authentication needs (see decision matrix in `AUTH_GUIDE.md`)

2. **Copy the template** to your new function directory:
   ```bash
   cp supabase/functions/_templates/admin-function-template.ts supabase/functions/my-new-function/index.ts
   ```

3. **Modify the function logic** in the try block:
   - Add your specific business logic
   - Use the provided `userClient` and/or `serviceClient`
   - Keep the error handling pattern intact

4. **Deploy with correct configuration**:
   - Admin template → `verifyJWT: false`
   - Authenticated template → `verifyJWT: false`
   - Public template → `verifyJWT: false`

5. **Test thoroughly**:
   - Valid authentication
   - Invalid/missing authentication
   - Insufficient permissions
   - Error scenarios

---

## Important Notes

⚠️ **NEVER modify the error handling pattern** in these templates. The `instanceof Response` check is critical for proper error handling.

⚠️ **ALWAYS deploy with `verifyJWT: false`** when using `requireAuth()` or `requireAdmin()` helpers.

⚠️ **ALWAYS include CORS headers** in all responses, including errors.

⚠️ **ALWAYS handle OPTIONS requests** for CORS preflight.

---

## Quick Reference

| Template | Auth Helper | verifyJWT | Use When |
|----------|-------------|-----------|----------|
| `admin-function-template.ts` | `requireAdmin()` | `false` | Need admin privileges |
| `authenticated-function-template.ts` | `requireAuth()` | `false` | User manages own data |
| `public-function-template.ts` | None | `false` | No auth required |

For more detailed guidance, see `../AUTH_GUIDE.md`.

# Edge Functions Documentation

This directory contains all Supabase Edge Functions for the project, along with comprehensive documentation and templates to ensure consistent, secure implementation.

## 📚 Documentation

### Core Guides
- **[AUTH_GUIDE.md](./AUTH_GUIDE.md)** - Complete authentication architecture guide
  - Root cause analysis of the JWT verification issue we fixed
  - Authentication pattern decision matrix
  - Two-client pattern explained
  - Common patterns and examples
  - Testing checklist

- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Deployment standards and checklist
  - Pre-deployment checklist
  - Step-by-step deployment process
  - Post-deployment testing scenarios
  - Common deployment configurations
  - Troubleshooting guide

### Templates
The `_templates/` directory contains three ready-to-use templates:

1. **admin-function-template.ts** - For admin-only endpoints
2. **authenticated-function-template.ts** - For user-authenticated endpoints
3. **public-function-template.ts** - For public endpoints (webhooks, etc.)

Each template includes:
- Proper authentication pattern
- Correct error handling with `instanceof Response` check
- CORS configuration
- OPTIONS request handling

## 🔑 Key Learnings from Bug Fix

### The Problem We Solved
We had Edge Functions deployed with `verifyJWT: true` while also using custom auth helpers like `requireAdmin()`. This created a conflict:
- Supabase's automatic JWT verification failed first
- Our error handling couldn't catch the responses properly
- 401/403 errors leaked through without proper JSON formatting

### The Solution
1. **Always deploy with `verifyJWT: false`** when using custom auth helpers
2. **Always check `instanceof Response`** in catch blocks
3. Auth helpers throw Response objects, not Error objects

### Prevention Strategy
This documentation ensures future Edge Functions follow the correct patterns:
- Clear decision matrix for choosing auth approaches
- Templates with correct error handling built-in
- Deployment checklist to catch issues before production
- Helper utilities for consistent error responses

## 🛠️ Shared Utilities

Located in `_shared/auth.ts`:

### Authentication Helpers
- `requireUser(req)` - Basic user authentication
- `requireAuth(req)` - Returns user + service clients
- `requireAdmin(req)` - Admin authentication with privilege check
- `requireBulkUploadPermission(req)` - Bulk upload permission check

### Response Helpers
- `createErrorResponse(message, status, details?)` - Standardized error responses
- `createSuccessResponse(data, status?)` - Standardized success responses
- `wrapHandler(handler)` - Automatic error handling wrapper

### CORS
- `corsHeaders` - Standard CORS configuration
- `getCorsHeaders(origin)` - Enhanced CORS with credentials support

## 🚀 Quick Start

### Creating a New Admin Function

1. Copy the template:
```bash
cp supabase/functions/_templates/admin-function-template.ts supabase/functions/my-function/index.ts
```

2. Implement your logic:
```typescript
const { userClient, serviceClient } = await requireAdmin(req);

// Use serviceClient for admin operations
const result = await serviceClient.from('table').select('*');

return createSuccessResponse({ data: result });
```

3. Deploy:
```typescript
// ALWAYS use verify_jwt: false
{
  slug: "my-function",
  verify_jwt: false
}
```

4. Test thoroughly (see DEPLOYMENT_GUIDE.md for checklist)

## ✅ Deployment Checklist

Before deploying ANY Edge Function:

- [ ] Chosen correct auth pattern (admin/authenticated/public)
- [ ] Set `verifyJWT: false` in deployment config
- [ ] Implemented `instanceof Response` check in catch block
- [ ] Added CORS headers to all responses
- [ ] Handled OPTIONS requests
- [ ] Tested with valid auth
- [ ] Tested with invalid auth (should return proper JSON errors)
- [ ] Verified all responses are JSON formatted

## 🔍 Testing Your Functions

### Admin Function Testing
```bash
# Valid admin - should succeed
curl -X POST https://your-project.supabase.co/functions/v1/your-function \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"

# Valid user (non-admin) - should return 403 JSON
curl -X POST https://your-project.supabase.co/functions/v1/your-function \
  -H "Authorization: Bearer <user-token>" \
  -H "Content-Type: application/json"

# No auth - should return 401 JSON
curl -X POST https://your-project.supabase.co/functions/v1/your-function \
  -H "Content-Type: application/json"
```

### CORS Preflight Testing
```bash
# Should return 200 with CORS headers
curl -X OPTIONS https://your-project.supabase.co/functions/v1/your-function
```

## 📋 Current Functions

| Function | Type | Auth Required | Description |
|----------|------|---------------|-------------|
| `scan-comic` | Public | No | Scans comic images (webhook) |
| `validate-beta-key` | Public | No | Validates beta keys |
| `generate-beta-key` | Admin | Yes (Admin) | Generates new beta keys |
| `manage-admin-users` | Admin | Yes (Admin) | Manages admin users |
| `manage-bulk-upload-permission` | Admin | Yes (Admin) | Manages bulk upload permissions |
| `process-bulk-upload` | Authenticated | Yes (Permission) | Processes bulk uploads |

## 🐛 Troubleshooting

### Getting 401 errors in production
- Check that `verifyJWT: false` was used during deployment
- Verify auth helper is imported correctly
- Check Authorization header format: `Bearer <token>`

### Error responses are HTML instead of JSON
- Add `if (error instanceof Response) return error;` to catch block
- Ensure all error responses use `createErrorResponse()` helper

### CORS errors in browser
- Verify OPTIONS handler is present
- Check CORS headers are in ALL responses
- Ensure header values match exactly:
  - `"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"`

## 🔒 Security Best Practices

✅ **DO:**
- Use `requireAdmin()` for admin operations
- Use `requireAuth()` for user operations
- Validate all user input
- Use parameterized queries
- Log errors (but not sensitive data)

❌ **DON'T:**
- Expose sensitive data in responses
- Log tokens, passwords, or keys
- Use string concatenation for queries
- Skip input validation
- Mix authentication approaches

## 📖 Additional Resources

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Deno Deploy Documentation](https://deno.com/deploy/docs)
- [JWT Authentication Best Practices](https://supabase.com/docs/guides/auth)

---

**Remember:** The root cause of our bug was mixing `verifyJWT: true` with manual auth helpers. This documentation ensures it never happens again!

For detailed examples and patterns, see:
- `AUTH_GUIDE.md` - Authentication architecture
- `DEPLOYMENT_GUIDE.md` - Deployment standards
- `_templates/README.md` - Template usage guide

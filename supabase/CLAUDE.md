# Supabase — Backend & Database

## Target Environment

**ENFORCEMENT: All changes in this directory target QA only.**
- QA project: `https://fsqmyefqbjndilrwluep.supabase.co`
- Config flag: `--config .supabase-qa.toml` (one directory up)
- Never run `db push` or `functions deploy` against the production project without explicit user approval.

---

## Migrations

### Creating a migration
```bash
npm run db:migration:new "describe_the_change"
```
This runs `scripts/create-migration.sh` and places the file in `supabase/migrations/`.

### Naming convention
`YYYYMMDDHHMMSS_short_description.sql` — generated automatically; do not rename after creation.

### Every migration must
- Use `CREATE TABLE IF NOT EXISTS` / `DROP TABLE IF EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Enable RLS immediately after table creation: `ALTER TABLE foo ENABLE ROW LEVEL SECURITY;`
- Define RLS policies for SELECT, INSERT, UPDATE, DELETE — one policy per operation, scoped to `authenticated` role
- Add indexes on `user_id` columns

### RLS policy pattern
```sql
CREATE POLICY "Users can select own <table> rows"
  ON <table> FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own <table> rows"
  ON <table> FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own <table> rows"
  ON <table> FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own <table> rows"
  ON <table> FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### Never
- Edit or delete an already-applied migration file
- Write a migration without RLS policies on a new table
- Use `DROP TABLE` without `IF EXISTS`

### Applying to QA
```bash
npx supabase db push
```
The project is already linked to QA (`fsqmyefqbjndilrwluep`). No `--project-ref` needed.

---

## Edge Functions

### Location
`supabase/functions/<function-name>/index.ts`

### Auth helpers (always import from `_shared/auth.ts`)

| Helper | Use when |
|--------|----------|
| `requireUser(req)` | Need the user identity only; RLS handles data access |
| `requireAuth(req)` | Need both `userClient` (RLS) and `serviceClient` (elevated ops) |
| `requireAdmin(req)` | Caller must be an admin (`user_profiles.is_admin = true`) |
| `requireBulkUploadPermission(req)` | Caller must have `can_bulk_upload = true` |

All helpers throw a `Response` on failure — the `wrapHandler` wrapper in `_shared/auth.ts` catches it automatically.

### Response helpers (from `_shared/auth.ts`)
- `createSuccessResponse(data, status?)` — JSON + CORS headers
- `createErrorResponse(message, status?, details?)` — JSON error + CORS headers

### Function structure
```typescript
import { requireAuth, createSuccessResponse, createErrorResponse, wrapHandler } from "../_shared/auth.ts";

Deno.serve(wrapHandler(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const { user, userClient, serviceClient } = await requireAuth(req);
  const body = await req.json();

  // use userClient for RLS-respecting queries
  // use serviceClient only for ops that legitimately bypass RLS

  return createSuccessResponse({ result: "..." });
}));
```

Use the templates in `_shared/` as starting points:
- `_templates/authenticated-function-template.ts`
- `_templates/admin-function-template.ts`
- `_templates/public-function-template.ts`

### Two-client rule
- `userClient` — created with ANON_KEY + user JWT; respects RLS. Use for all user-data reads/writes.
- `serviceClient` — created with SERVICE_ROLE_KEY; bypasses RLS. Use only for operations that legitimately need elevated access (e.g., reading another user's data for admin actions).
- Never use `serviceClient` where `userClient` would work.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in function responses or logs.

### Deploying to QA
```bash
npx supabase functions deploy <function-name>
```
Already linked to QA. No extra flags needed.

---

## Key Tables

| Table | Purpose |
|-------|---------|
| `comics` | Core collection — series, issue, publisher, year, condition, cover image |
| `wishlist` | User's want list |
| `user_profiles` | Per-user settings; `is_admin`, `can_bulk_upload`, tier, scan counts |
| `app_settings` | Global config (e.g., free-tier scan cap) — read by edge functions |
| `beta_keys` | Invite codes for access control |
| `ocr_correction_rules` | Per-user OCR correction patterns learned over time |
| `user_scan_preferences` | Per-user scan rule engine config (e.g., `correction_threshold`) |

---

## Verification Commands

```bash
# Check which migrations are applied vs. local-only
npx supabase migration list

# Verify consistency across environments
npm run db:migration:verify

# Dry-run production deployment (read-only)
npm run db:deploy:dry-run
```

# QuickStack — CLAUDE.md

## App Overview

QuickStack is a comic book collection tracker. Users scan physical comics with their phone camera, OCR extracts the title/issue/metadata, and the comic is saved to their collection. The app runs as a React SPA in the browser and as a native Android app via Capacitor.

---

## Architecture

### Frontend
- **React 18 + TypeScript** built with **Vite**
- **Tailwind CSS** for styling, **Lucide React** for icons
- Custom event-based routing via `navigate` CustomEvent (no React Router)
- Pages: `dashboard`, `collection`, `add`, `wishlist`, `settings`, `admin`, `beta-keys`, `bulk-upload`, `forgot-password`, `reset-password`, `email-confirmed`

### Mobile
- **Capacitor 8** wraps the built `dist/` folder into a native Android app
- App ID: `com.quickstackapp.quickstack`
- Deep link scheme: `quickstack://reset-password`
- Camera access via Capacitor's native bridge

### Backend
- **Supabase** (PostgreSQL + Edge Functions + Auth)
- Edge functions handle: OCR scanning (`scan-comic`), beta keys, admin actions, bulk upload, account deletion, password recovery
- All tables use Row Level Security (RLS)
- Shared auth utility in `supabase/functions/_shared/auth.ts`

### Key Source Layout
```
src/
├── App.tsx              # Router + nav logic
├── components/          # Reusable UI (Auth, Layout, modals, CameraCapture, ImageCrop)
├── pages/               # Route views (Dashboard, Collection, AddComic, Wishlist, etc.)
├── contexts/            # AuthContext
├── lib/                 # supabase.ts client, capacitorSetup.ts deep-link config
└── utils/               # edgeDetection.ts, imageOptimizer.ts
```

---

## Environments

| Environment | Purpose | Supabase Config | Project URL |
|-------------|---------|-----------------|-------------|
| QA | Development & testing | `.supabase-qa.toml` | `https://fsqmyefqbjndilrwluep.supabase.co` |
| Production | Live app | `.supabase-prod.toml` | (do not apply changes directly) |

- Web production URL: `https://appquickstackapp.com`
- Vercel preview: `https://quickstackapp2.vercel.app`
- **ENFORCEMENT: All Supabase changes (migrations, edge function deploys, config) must target QA only (`--config .supabase-qa.toml`). Never push to production directly.**
- The `.env` file points to the production Supabase project by default; keep this in mind when testing locally.

---

## Git Workflow

```
dev → qa → main
```

- **`dev`** — active development branch. All feature work goes here.
- **`qa`** — staging branch. Merge `dev` → `qa` to test on the QA Supabase project.
- **`main`** — production. Only merge from `qa` after QA sign-off. Triggers Vercel deployment.
- Feature branches cut from `dev`, merged back to `dev` via PR.
- Never force-push `main` or `qa`.
- Use descriptive PR titles; include issue context in the PR body, not in code comments.

---

## OCR Goals

The core feature. `src/pages/AddComic.tsx` drives the flow:

1. User captures a photo via `CameraCapture.tsx`
2. `edgeDetection.ts` crops/straightens the comic cover
3. `imageOptimizer.ts` compresses the image
4. The image is sent to the `scan-comic` Supabase edge function
5. The function calls an AI model to extract: title, issue number, publisher, year, condition
6. Results are shown to the user for confirmation/correction before saving

**OCR correction rules** — when users fix OCR results, corrections are tracked in the database and fed back as patterns to improve future scans. See `AddComic.trackOcrCorrection.test.tsx` for the correction-tracking behavior.

**Tier limits** — free users have a monthly scan cap enforced in the `scan-comic` function. The cap is configurable via the `app_settings` table.

---

## OCR Priorities

Priority order:

1. OCR accuracy
2. OCR consistency
3. Scan speed
4. Cost optimization

Never sacrifice OCR accuracy solely to improve scan speed.

For OCR changes:
- Estimate impact on accuracy
- Estimate impact on scan speed
- Estimate impact on OpenAI cost
- Implement one change at a time

---

## Android Build Workflow

### Prerequisites
- Android Studio installed with SDK configured in `android/local.properties`
- `android/key.properties` and `android/quickstack-release.jks` present (not in git)

### Build Steps

```bash
# 1. Build web assets and sync to Android
npm run build:android   # = npm run build && npx cap sync android

# 2. Open in Android Studio to generate signed AAB
npm run cap:open

# 3. In Android Studio: Build → Generate Signed Bundle/APK → Android App Bundle
#    Use the release keystore from key.properties
```

### Release Output
- AAB goes to `android/app/release/`
- Upload AAB to Google Play Console

### Gradle Config
- `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`
- Signing credentials read from `android/key.properties` (excluded from git)

### After Code Changes
Always run `npm run build:android` before opening Android Studio — stale web assets in `android/app/src/main/assets/public/` will reflect old code.

---

## Android Release Rules

- Increment versionName and versionCode for every Play Store build.
- Internal Testing builds must be validated before promotion.
- Do not modify signing configuration.
- Do not commit generated build outputs.

---

## Database Workflow

```bash
# Create a new migration
npm run db:migration:new "description_of_change"

# Apply to QA first
npx supabase db push --config .supabase-qa.toml

# Verify status across environments
npm run db:migration:verify

# Dry-run production deployment
npm run db:deploy:dry-run

# Deploy to production (creates auto-backup first)
npm run db:deploy:prod
```

- Never edit or delete already-applied migration files
- Every new table must have RLS policies
- Use `IF EXISTS` / `IF NOT EXISTS` in all migrations for safety
- Backups land in `deployment-backups/` (not committed)

---

## Known Constraints

- `android/key.properties` is local-only.
- `android/quickstack-release.jks` is local-only.
- Never commit secrets.
- Android assets under `android/app/src/main/assets/public/` are generated from `npm run build:android`.

---

## Development Commands

```bash
npm run dev              # Local dev server (Vite)
npm run build            # Production build → dist/
npm run typecheck        # TypeScript check (no emit)
npm run lint             # ESLint
npm run test             # Vitest (single run)
npm run test:watch       # Vitest (watch mode)
npm run test:coverage    # Coverage report
npm run build:android    # Build + sync to Capacitor Android
```

---

## Change Management

- Show diffs before making significant changes.
- For changes affecting OCR, authentication, billing, or Android configuration, stop after producing the diff and wait for approval.
- Prefer the smallest possible change that solves the problem.
- Do not modify unrelated files.
- Do not update package versions unless explicitly requested.
- **Whenever a migration is created or an edge function is created/modified, immediately add it to the Pending Production Deployments section below. Remove it only when confirmed deployed to production.**

---

## Pending Production Deployments

Changes applied to QA that have **not** yet been deployed to production. Update this list whenever Supabase changes are made. Clear each item when production deployment is confirmed.

### Migrations

- `20260705141506_add_display_name_and_onboarding_to_user_profiles.sql` — adds `display_name` and `onboarding_completed_at` to `user_profiles` (new user onboarding flow)

### Edge Functions

- `update-subscription` — now sets `can_bulk_upload` based on tier (true for paid/plus, false for free)

---

## Rules for Code Changes

### General
- Do not add comments explaining *what* code does — only add a comment if the *why* is non-obvious (a workaround, a hidden constraint, a subtle invariant).
- Do not refactor, add abstractions, or clean up surrounding code unless the task specifically requires it.
- Do not add error handling for scenarios that cannot happen. Trust framework and Supabase guarantees at internal boundaries; validate only at user input or external API boundaries.
- Do not add feature flags or backwards-compat shims — just change the code.

### TypeScript
- Use strict types; avoid `any`. If something forces `any`, leave a one-line comment explaining why.
- Keep types co-located with the code that uses them unless shared across multiple files.

### Supabase / Backend
- Never expose service-role keys in frontend code. All privileged operations go through Edge Functions.
- RLS must be enabled on every new table — never bypass it.
- **ENFORCEMENT: Only apply Supabase changes (db push, function deploy) to the QA project (`https://fsqmyefqbjndilrwluep.supabase.co`) using `--config .supabase-qa.toml`. Stop and ask for explicit approval before touching production.**

### Android / Capacitor
- Run `npm run build:android` after any frontend change before testing on device.
- Do not modify files under `android/app/src/main/assets/public/` directly — they are generated by the build.
- Keep `key.properties` and `*.jks` out of git at all times.

### UI / Frontend
- Use Tailwind utility classes; do not add custom CSS unless Tailwind cannot cover the case.
- Use existing modal components (`AlertModal`, `ConfirmModal`, `PromptModal`) for user-facing dialogs — do not create new ones without a reason.
- Navigation is event-based: dispatch a `navigate` CustomEvent with `{ detail: { page: '...' } }` — do not introduce React Router.

### Testing
- Tests live next to the file they test (`Component.test.tsx` alongside `Component.tsx`).
- Mock Supabase and Capacitor via `src/test/mocks/` — do not make real network calls in tests.
- Add tests for OCR correction logic and any new scan-related behavior.

### Commits & PRs
- Commit to `dev` or a feature branch — never directly to `main` or `qa`.
- Keep PRs focused. One concern per PR.
- PR descriptions should explain *why* the change is being made, not just what it does.

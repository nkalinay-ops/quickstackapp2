# Frontend — React / TypeScript

## Stack
- React 18, TypeScript (strict), Vite
- Tailwind CSS for all styling
- Lucide React for icons
- No React Router — custom event-based navigation (see below)

---

## Navigation

Navigation is event-driven. Never introduce React Router.

### To navigate
```typescript
window.dispatchEvent(new CustomEvent('navigate', { detail: 'collection' }));
```

### Valid page values
`'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin' | 'bulk-upload'`

Plus unauthenticated pages: `'auth' | 'forgot-password' | 'reset-password' | 'email-confirmed'`

### How routing works (`App.tsx`)
- `AppContent` listens for `navigate` events on `window`
- Auth state is managed via `AuthContext` — pages gated on `user` being non-null
- Admin-only pages (`beta-keys`, `admin`) additionally check `isAdmin` from `useAuth()`
- `reset-password`, `forgot-password`, `email-confirmed` render outside the auth gate

---

## Component Rules

### Modals — use existing components, do not create new ones
| Component | When to use |
|-----------|-------------|
| `AlertModal` | Show a message the user must dismiss |
| `ConfirmModal` | Ask the user to confirm a destructive or important action |
| `PromptModal` | Ask the user to type a value |
| `DuplicateModal` | Warn about a duplicate comic during the add flow |

### Layout
- `Layout` wraps all authenticated pages and owns the bottom nav bar
- Pass `currentPage` and `onNavigate` as props — do not reach into Layout internals

### CameraCapture / ImageCrop
- Used exclusively by `AddComic.tsx` for the scan flow
- Do not import or reuse outside the add-comic flow without discussing first

---

## Styling

- Tailwind utility classes only — no custom CSS files unless Tailwind has no equivalent
- Dark-mode-first color palette: `bg-gray-950`, `bg-gray-900`, `bg-gray-800` for surfaces; `text-gray-400` for secondary text
- Primary accent: `indigo-*` (buttons, active states)

---

## State & Data

- Supabase client lives in `lib/supabase.ts` — import `supabase` from there
- Auth state comes from `useAuth()` hook (`contexts/AuthContext.tsx`) — never read `supabase.auth` directly in components
- No global state library — local `useState` / `useEffect` is the pattern

---

## TypeScript

- Strict mode is on — no `any` without a one-line comment explaining why
- Co-locate types with the code that uses them; only extract to a shared type if used across multiple files
- Prefer type inference where it's obvious; annotate return types on functions that return non-trivial shapes

---

## File Conventions

```
src/
├── components/     Reusable UI — each file exports one component
├── pages/          Route views — one file per page
├── contexts/       React contexts (AuthContext only, currently)
├── lib/            Singleton clients (supabase, capacitorSetup)
└── utils/          Pure utility functions (edgeDetection, imageOptimizer)
```

- Tests live next to the file: `Component.tsx` → `Component.test.tsx`
- No barrel `index.ts` files — import directly from the source file

---

## Testing

### Setup
- Vitest + React Testing Library
- Global setup in `src/test/setup.ts` (canvas stub, URL.createObjectURL stub)
- `@testing-library/jest-dom` matchers available globally

### Mocking
Always mock Supabase and Capacitor — never make real network calls in tests.

```typescript
// Supabase
vi.mock('../../lib/supabase', () => ({ supabase: createSupabaseMock() }));

// Capacitor
vi.mock('../../lib/capacitorSetup', () => ({ ... }));
```

Factories live in `src/test/mocks/`:
- `supabase.ts` — `createSupabaseMock()`, `createQueryBuilder(overrides?)`
- `capacitorSetup.ts` — Capacitor plugin stubs
- `authContext.ts` — `useAuth()` mock values

### What to test
- OCR correction logic always needs tests (`AddComic.trackOcrCorrection.test.tsx` is the reference)
- Any new scan-related behavior needs tests
- Pure util functions in `utils/` should have unit tests
- UI components: test user-visible behavior, not implementation details

### Running tests
```bash
npm run test          # single run
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

# Audit Report — SKSSF Portal Critical Authentication, Role Isolation & API Repair

Date: 2026-11-02
Issues addressed:

1. Supabase / backend API failures (`/auth/v1/user 403`, `/api/users 401`, `/api/inventory 401`, `POST /rest/v1/portal_configs`, blocked localStorage writes).
2. Admin interface rendered inside the member dashboard (`/member/dashboard` showing Admin Dashboard).
3. Repayment module crash: `ReferenceError: api is not defined`.

## 1. Root causes and fixes

### Issue A — Authentication / API failures

- **Session invalidation handling** (`src/contexts/AuthContext.tsx`): the session-invalid
  detector previously matched only a narrow set of PostgREST codes. Auth-layer failures
  (HTTP 401/403, GoTrue/PostgREST invalid-token codes, JWT/token/session-related messages)
  are now treated as an invalid session, which triggers local session discard and
  re-authentication instead of leaving the app in a stale authenticated state.
- **Portal configuration write fallback** (`src/lib/api.ts`): the optional bootstrap
  portal-config read no longer falls back to a client insert (members must not write
  configuration rows). Absent/failed reads now use local defaults silently. This removes
  the spurious `POST /rest/v1/portal_configs` request path.
- **Backend API 401s** (`/api/users`, `/api/inventory`): handlers already require a valid
  `Bearer` token via the Supabase service-role client. Failures were symptoms of an
  invalid/stale session state; the hardened session handling now refreshes and revalidates
  before protected calls.

### Issue B — Admin interface inside member dashboard

- **Route guard** (`src/App.tsx`): the `/member/dashboard` route previously allowed
  `['member', 'admin', 'super']`, so an authenticated admin landing on the member route
  rendered the shared layout with member children and the admin dashboard content.
- The guard is now restricted to `['member']`; privileged users are redirected away.

### Issue C — Repayment API crash

- **Missing API client import** (`src/pages/dashboard/Repayments.tsx`): the repayment
  module referenced the shared `api` client without importing it, causing
  `ReferenceError: api is not defined` and preventing the repayment overview/installments
  from loading.

## 2. Files modified

- `src/contexts/AuthContext.tsx`
- `src/lib/api.ts`
- `src/App.tsx`
- `src/pages/dashboard/Repayments.tsx`

## 3. Verification status

- `node --check`, `tsc --noEmit`, `npm run build` pass with all changes.
- Runtime verification pending authenticated member / admin / super-admin sessions.

## 4. Remaining verification checklist

1. Member login → `/member/dashboard` shows member UI only.
2. Admin login → `/admin/dashboard` shows Admin Dashboard; navigating to `/member/dashboard`
   redirects/denies.
3. Super-admin → `/super-admin/dashboard` works.
4. Repayment overview/installments load without `ReferenceError`.
5. No `POST /rest/v1/portal_configs` write attempts from member bootstrap.
6. Expired/invalid sessions are handled via refresh + discard.

# Auth Incident Resolution — `profiles` 406 and `/api/users` 401

**Date:** 2026-10-31
**Environment:** https://skssf-portal.vercel.app
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`
**Deployment commit:** `f65c19e` (follow-up hardening) on top of `09b9804` (primary fix)

---

## 1. Summary

Two production failures were reported:

| Symptom | Endpoint | Status |
| --- | --- | --- |
| Profile lookup failed | `GET /rest/v1/profiles?id=eq.<uuid>` | `406 Not Acceptable` (`PGRST116`) |
| Authenticated user list failed | `GET /api/users` | `401 Unauthorized` |

Both are now resolved and verified against production:

- `GET /api/users` returns **401** without a token, **401** with an invalid token, **403** for members and orphan auth users, **200** for admins and super admins.
- Profile reads return **200** for the owner's own row and **406** (`PGRST116`) for any other or anonymous read — RLS was preserved, not bypassed.
- The browser app restores the Supabase session, reads the member profile, refreshes an expired access token, ignores stale `sessionStorage` tokens, and clears the session on logout in every open tab.
- Invalid persisted tokens are now discarded instead of being retried.

---

## 2. Root causes

### 2.1 `406 PGRST116` on profile reads

1. Profile lookups used `.single()`. PostgREST returns `406` with code `PGRST116` whenever `.single()` expects exactly one row but gets zero (or more than one).
2. The `profiles` SELECT policy only allows a user to read their own row. For an anonymous or cross-user request the policy correctly returned **zero rows**, which `.single()` translated into `406`.
3. Earlier code also read a token from `sessionStorage.active_api_token`. After a page refresh the Supabase session existed in `localStorage`, but the copied `sessionStorage` token was gone, so profile reads ran unauthenticated and produced the same `406`.
4. `clearFrontendCache()` called `localStorage.clear()`, which deleted the Supabase persisted session (`skssf_auth_session`) and guaranteed an unauthenticated next load.

**Fix:** every profile lookup that can legitimately return zero rows uses `.maybeSingle()` and handles `null` explicitly (missing profile → `403` on backend routes, message + sign-out in the frontend). RLS policies were not changed or bypassed.

### 2.2 `401` on `/api/users`

1. The browser sent no `Authorization` header because the app depended on the stale `sessionStorage` copy of the token.
2. `/api/users` did not enforce role scoping on `GET`, so the correct security model was unclear at the endpoint.
3. Missing-profile and invalid-token cases were not distinguished.

**Fix:** `/api/users` now requires a valid bearer token, resolves the caller's profile, allows only `admin`/`super`, scopes admins to their own branch, and returns `403` for authenticated users without a portal profile.

---

## 3. Session model after the fix

Single source of truth: **Supabase persisted session** (`localStorage['skssf_auth_session']`).

- `src/lib/authSession.ts` exposes `getAccessToken()`, `getAuthHeaders()` and `tryGetAuthHeaders()`. They call `supabase.auth.getSession()` and refresh when the token is within the expiry skew.
- Refresh attempts are de-duplicated so parallel requests do not race.
- No access token is copied to `sessionStorage`; legacy `active_api_token` / `active_user_id` keys are removed on load.
- `clearFrontendCache()` removes only explicit application cache keys and never calls `localStorage.clear()`.
- `signOut()` clears app state and cache, then awaits `supabase.auth.signOut()`. If server revocation fails it falls back to `{ scope: 'local' }`, so a reusable token never survives logout.
- Invalid/expired bearer responses (`PGRST301`, `PGRST302`, `PGRST303`, `PGRST304`) trigger `discardInvalidSession()`, which removes the persisted session instead of retrying.
- Supabase `onAuthStateChange` propagates sign-out and token refresh to other tabs.

---

## 4. Code changes

| Area | File | Change |
| --- | --- | --- |
| Session helper | `src/lib/authSession.ts` | Fresh token/header helpers with expiry skew and refresh de-duplication |
| Auth context | `src/contexts/AuthContext.tsx` | One restore path; `.maybeSingle()`; explicit missing-profile state; awaited sign-out; invalid-session discard; cross-tab event handling |
| Local cache | `src/lib/localDb.ts` | Removed `localStorage.clear()`; explicit cache keys; removed module-load `initLocalDb()` race |
| API client | `src/lib/api.ts` | `/auth/me` and `/bootstrap` require auth; bootstrap only fetches `/api/users` for admin/super; login rejects orphan users; protected calls use fresh headers |
| Admin directory | `api/users.js` | GET requires admin/super, branch-scoped for admins; all profile lookups use `.maybeSingle()` with explicit errors |
| Inventory API | `api/inventory.js` | Profile/permission checks use `.maybeSingle()`; missing profile → `403` |
| Member APIs | `api/get-member-loans.js`, `api/get-member-inbox.js`, `api/get-member-repayments.js`, `api/log-member-notification.js`, `api/record-member-repayment.js` | `.maybeSingle()` with explicit `403`/`500` handling |
| UI token usage | `src/pages/dashboard/Inventory.tsx`, `MemberInventory.tsx`, `Settings.tsx`, `MemberInbox.tsx`, `src/pages/PublicCatalogDetail.tsx` | Await fresh auth headers/tokens instead of reading stale storage |
| Login UI | `src/pages/RoleLogin.tsx` | Displays explicit missing-profile/auth error |
| Logout callers | `src/layouts/DashboardLayout.tsx`, `src/pages/dashboard/Settings.tsx` | Await `signOut()` before redirecting |

No RLS policy was weakened. No profile is created automatically for an orphan auth user.

---

## 5. Security test results

Read-only suite against production (`skssf-verify.cjs`), using one-time magic-link sessions minted through the service role and exchanged at `POST /auth/v1/verify`. Tokens were never printed.

```
PASS  unauthenticated /api/users -> 401  401 Unauthorized - Missing token
PASS  invalid token /api/users -> 401  401 Unauthorized - Invalid token
PASS  member /api/users -> 403  403 Forbidden - Admins only
PASS  orphan auth user /api/users -> 403  403 Forbidden - No portal profile
PASS  admin /api/users -> 200  200 users=4 branches=["Poyanad Central"]
PASS  admin directory scoped to own branch  branches=["Poyanad Central"]
PASS  super /api/users -> 200 all profiles  200 users=5
PASS  member inventory items -> 200  200 items=3
PASS  orphan auth user inventory -> 403  403 Forbidden - No portal profile
PASS  member loans -> 200  200 loans=3
PASS  member inbox -> 200  200 success=true
PASS  member repayments -> 200  200 installments=12
PASS  member reads own profile -> 200  200 name=Rizwan
PASS  member cannot read another profile -> 406  406 PGRST116
PASS  anonymous profile read -> 406  406 PGRST116
PASS  member profile list only own row  200 rows=1

SUMMARY 16/16 passed
```

Expected authorization matrix:

| Caller | `/api/users` | Own profile | Other profile | Member APIs |
| --- | --- | --- | --- | --- |
| Anonymous | `401` | `406 PGRST116` | `406 PGRST116` | `401` |
| Invalid token | `401` | `401`/`406` | `406 PGRST116` | `401` |
| Member | `403` | `200` | `406 PGRST116` | `200` |
| Orphan auth user (no profile) | `403` | `406`/no row | `406` | `403` |
| Admin | `200`, own branch only | `200` | `406 PGRST116` | scoped |
| Super admin | `200`, all profiles | `200` | `200` | scoped |

### 5.1 Verified profile identity

`0bb52e0c-4a26-42de-af84-f48663a22016` exists in `public.profiles` and matches the auth user `hasanathfest2k24@gmail.com` (Rizwan, member, `Poyanad Central`). Its own-row read returns `200`.

---

## 6. Browser verification evidence

### 6.1 Member dashboard (production build)

Injected a valid member session plus a deliberately stale `sessionStorage.active_api_token`, then loaded `/member/dashboard`.

- `profiles?select=*&id=eq.0bb52e0c-…` → **200** (owner row)
- `/api/get-member-loans` → **200**
- `/api/inventory?resource=items` → **200**
- No `/api/users` call from the member session
- Dashboard rendered: `Welcome, Rizwan`, `Unit: Poyanad Central`
- Stale `sessionStorage.active_api_token` was cleared

### 6.2 Token refresh

Forced `expires_at` into the past and reloaded:

- `POST /auth/v1/token?grant_type=refresh_token` → **200**
- `expires_at` advanced into the future
- Profile read → **200**
- Dashboard loaded normally
- Stale `sessionStorage` token absent

### 6.3 Admin manage-users

Loaded `/admin/dashboard/members` with the admin session:

- `GET /api/users` in the browser → **200**
- Result: 4 users, all `Poyanad Central` (2 admins, 2 members)
- Page rendered `Member Directory (2/2)` with Rizwan and Navas
- `/api/users` without a token → **401** `Unauthorized - Missing token`

### 6.4 Logout and multi-tab sync

Clicked Logout with two admin tabs open:

- Both tabs redirected to `/`
- `localStorage` no longer contained `skssf_auth_session` in either tab
- App cache keys were removed
- `GET /api/users` from the signed-out tab → **401** `Unauthorized - Missing token`

### 6.5 Invalid persisted token

Injected an invalid access token and reloaded `/admin/dashboard`:

- No crash and no privileged content rendered
- Request returned **401**
- With the follow-up fix (`f65c19e`) the invalid session is discarded locally instead of being retried, then the user is returned to the public landing page.

---

## 7. Deployment

- Primary fix: `09b9804` — `fix(auth): use Supabase session as single source of truth and harden API RBAC`
- Hardening: `f65c19e` — `fix(auth): clear local session on logout and discard invalid tokens`
- Branch: `main` → GitHub → Vercel production project `skssf-portal`
- Build: `npm run build` succeeds (Vite production build)

Production verification was performed against the deployed bundle after the build containing the new auth strings was live. API and browser checks above were executed against `https://skssf-portal.vercel.app`.

---

## 8. Residual notes

- `npx tsc --noEmit -p tsconfig.app.json` still reports pre-existing unused-import (`TS6133`) errors in unrelated files. They do not affect the Vite build and were not introduced by this change.
- All current profiles have `code: null`, so `mapProfile` uses the Supabase UUID as the app-facing ID (`profile.code || profile.id`). This is expected for the current data set.
- The local `.vercel` project in this workspace is `skssf-main`; the production target `skssf-portal` deploys from GitHub `main`. Do not deploy the incident fix with `vercel --prod` from the local project.

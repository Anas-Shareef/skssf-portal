# SKSSF Portal — Final Stability, Security & Data-Integrity Audit

**Date:** 2026-11-10  
**Production:** https://skssf-portal.vercel.app  
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`  
**Branch / HEAD:** `main` @ `1bf9dac`  
**Status:** Ready with known limitations (authenticated E2E still outstanding)

---

## 1. Executive Summary

This audit closes the remediation series covering the five reported production defects:

| # | Reported symptom | Status |
|---|---|---|
| A | Frontend cache writes blocked (`Blocked frontend-only write …`) | **Fixed & deployed** |
| B | `GET /api/inventory?resource=items` → `401 Unauthenticated` | **Fixed & deployed** (runtime check needs a live session) |
| C | Repayment schedule dropped from 10 installments to 0 | **Hardened & deployed** (stale-response guard + diagnostics) |
| D | Session / role isolation on account switching | **Hardened & deployed** |
| E | Route / role isolation regression | **Verified statically & deployed** |

Key evidence:

- `npx tsc --noEmit` → exit 0; `npm run build` → success (`✓ built in 2.25s`).
- All 12 `api/*.js` serverless functions pass `node --check`; function count is exactly the Vercel Hobby cap (12/12).
- Production private endpoints return `401` without a bearer token; `?resource=public-catalog` returns `200`.
- The deployed bundle (`/assets/index-CT_aGh18.js`) contains the new retry/diagnostic code paths.
- Read-only production DB checks confirm the witness/filing migration is already applied and that anonymous clients see **zero rows** on every sensitive table.
- No production rows were created, updated, or deleted by this audit.

---

## 2. Scope, Environment & Method

**In scope**

- `src/lib/localDb.ts` — cache write guards.
- `src/lib/authSession.ts` — token acquisition and authenticated fetch.
- `src/contexts/AuthContext.tsx` — session lifecycle, role state, account switching.
- `src/pages/dashboard/Inventory.tsx` — inventory reads/writes.
- `src/pages/dashboard/Repayments.tsx` — repayment overview/installment refresh.
- `src/lib/api.ts` — repayment data source reporting.
- `api/*.js` — backend auth contract (read-only review).
- Supabase schema, RLS and data counts (read-only).

**Method**

1. Static analysis of every `backendCacheStorage.setItem` call site (brace-scoped guard scan).
2. `tsc --noEmit`, `vite build`, `node --check` on all serverless functions.
3. Unauthenticated and public HTTP probes against production.
4. Read-only PostgREST queries with the service role **run from a local shell only** (never shipped to the frontend) to verify schema, counts and canonical linkage.
5. Read-only PostgREST probes with the publishable (anon) key to confirm RLS row visibility.

**Out of scope / not executed**

- Authenticated browser sessions (member/admin/super) — no credentials were available.
- Any SQL write, migration, truncate, or data repair.

---

## 3. Issue A — Blocked Frontend Cache Writes

**Root cause**

Mutation helpers in `src/lib/localDb.ts` called `backendCacheStorage.setItem(...)` *before* (or outside) the `if (hasBackendSession())` guard. With no backend session the write was rejected by design, producing the `Blocked frontend-only write for <key>; Laravel API session is required.` warning and leaving the cache inconsistent with the mutation that had just been applied.

**Fix (commit `1f1a31d`)**

- Every cache write in a mutation helper now sits **inside** the existing `if (hasBackendSession())` block (new guards added where none existed: `healCorruptedLoanData`, `saveInventoryTransactions`).
- `syncFromBackend()` remains the only writer of the full bootstrap cache set and still early-returns without a session.
- The security guard itself is unchanged: no write is allowed without a backend session, and Supabase persistence was **not** replaced with localStorage.

**Verification**

- Guard scan: the only `setItem` calls outside a guard are the nine inside `syncFromBackend` (which is itself session-gated).
- `tsc --noEmit` and `npm run build` pass.

---

## 4. Issue B — Inventory API `401`

**Root cause**

`Inventory.tsx` attached `getAuthHeaders()` but treated any non-OK response as "no data" (`if (res.ok) { … }` with no `else`). A rejected bearer token (stale/rotated after a refresh elsewhere) therefore surfaced as an empty catalogue plus a `401` in the network log, with no retry and no user feedback.

**Fix (commit `696e4fc`)**

- New `authenticatedFetch()` in `src/lib/authSession.ts`:
  - reads the token from the persisted Supabase session (single source of truth);
  - **overrides** any caller-supplied `Authorization` header;
  - retries **once** with `forceRefresh: true` on `401` (safe for all methods, because `401` means the handler did no work);
  - if the retry is still `401`, dispatches `authSessionInvalid`.
- `AuthContext` now listens for `authSessionInvalid` and discards the unusable session (`signOut({ scope: 'local' })` + cache clear), so the app never loops on revoked credentials.
- All 25 admin inventory API calls (`Inventory.tsx`) **and** all 21 member inventory API calls (`MemberInventory.tsx`) now use `authenticatedFetch`; non-OK responses are surfaced to the user (`"<label>: session rejected (401). Please sign in again."` for auth failures) and logged as `[inventory] api_failure` with status only.
- The same retry applies to the remaining authenticated `fetch` calls: user create/update/delete and loan-decision notifications in `api.ts`, witness link/history actions in `LoanManagement.tsx`, and `org-settings` reads/writes in `Settings.tsx`.
- Corrected an over-broad session-invalid detector: schema errors (`PGRST204`, `PGRST205`, `PGRST200`, `PGRST202`, `PGRST203`, `PGRST116`) and generic "invalid"/"not found" messages are no longer treated as auth failures, so a missing column/table can no longer sign a user out.

**Verification**

| Probe | Result |
|---|---|
| `GET /api/inventory?resource=items` (no token) | `401 {"error":"Unauthenticated"}` (expected) |
| `GET /api/inventory?resource=public-catalog` | `200` with items |
| `GET /api/users` (no token) | `401 Unauthorized - Missing token` |
| `GET /api/get-member-loans` (no token) | `401` |
| Deployed bundle contains `http_401_after_refresh` | yes |

The authenticated retry path itself still requires a live member/admin session to exercise end-to-end.

---

## 5. Issue C — Repayment Schedule 10 → 0

**Root cause (evidence-based)**

1. The overview/installments effect depended on `[adminTab, loans, isAdmin]`, and `loans` is a **new array identity** on every `appDataUpdated` event. Several refreshes could be in flight at once.
2. Responses were applied unconditionally, so a slower, older request could overwrite a newer result.
3. A *successful* but empty response (e.g. an RLS-scoped read after a session/role change) silently replaced the last good schedule with `[]`.
4. Failures were swallowed by a single `console.warn`, leaving no way to distinguish "no rows" from "request failed".

**Fix (commit `696e4fc`)**

- Monotonic `requestId` per refresh; a response is applied only if it is still the newest (`stale_response_ignored` otherwise).
- Overview and installments load in parallel with `Promise.allSettled`; a failed call **keeps the last successfully loaded data** instead of wiping it.
- Structured, PII-free logging on every refresh: `requestId`, `userId`, verified `role`, `trigger`, `filters`, `endpoint`, `source`, `count`, `success`, `durationMs`.
- Genuine empty results are **logged, never suppressed** (`empty_installments_result` includes `cachedLoans`).
- `api.ts` now returns `source` (`repayment_installments` or `loans_fallback`) and `count` for `/admin/repayments`, `/admin/repayments/overview` and `/loans/:id/repayments`, so the origin of a count change is visible.
- Admin-only state is cleared when the current verified role is not admin/super (see Issue D).

**Production data snapshot (read-only)**

| Table | Rows |
|---|---|
| `loans` | 10 |
| `repayment_installments` | 21 (16 `OVERDUE`, 4 `PENDING`, 1 `PAID`) |
| `loan_requests` | 7 (6 `PUBLIC_REFERRAL`, 1 `MEMBER_DIRECT`) |

No repayment, loan, or installment row was modified by this work.

---

## 6. Issue D — Session / Role Isolation & Account Switching

**Verified route guards (`src/App.tsx` + `src/components/ProtectedRoute.tsx`)**

| Portal | Allowed roles | Redirect on mismatch |
|---|---|---|
| `/member/dashboard/*` | `member` only | `/` |
| `/admin/dashboard/*` | `admin` only | `/` |
| `/super-admin/dashboard/*` | `super` only | `/` |
| `/coordinator/dashboard/*` | `coordinator` only | `/` |

**Hardening added**

- `AuthContext` tracks the active Supabase user id. When the authenticated identity changes in the same browser profile, the frontend cache (`db_users`, `db_loans`, `db_campaigns`, `portal_config`, …) is cleared **before** the profile is applied and before `syncFromBackend()` repopulates it. A new user can therefore never render the previous user's loans, users or configuration.
- `Repayments` clears `overview`/`installments` whenever the verified role is not admin/super, so a member session cannot display a privileged schedule left in React state.
- `SIGNED_OUT` and explicit `signOut()` reset the tracked user id and clear the cache.
- Supabase persists one session per browser profile; simultaneous member/admin testing requires separate browser profiles (documented behaviour, not a defect).

---

## 7. Issue E — Regression & Verification Matrix

| Check | Command / probe | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS (exit 0) |
| Production build | `npm run build` | PASS (`✓ built in 1.23s` at final state) |
| Serverless syntax | `node --check api/*.js` | PASS (12/12) |
| Hobby function cap | `api/*.js` count | 12 / 12 - no new endpoints added |
| Deployed bundle freshness | `/assets/index-BFYSCovt.js` | contains `authSessionInvalid`, `stale_response_ignored`, `empty_installments_result`, `http_401_after_refresh`, `[inventory] api_failure`, `Loading welfare missions` (current HEAD) |
| Private API without token | `/api/inventory?resource=items`, `/api/users`, `/api/get-member-loans` | 401 (expected) |
| Public catalogue | `/api/inventory?resource=public-catalog` | 200 |
| Cache-write guard scan | brace-scoped scan of `localDb.ts` | 0 unguarded mutation writes |
| Member inventory auth | `MemberInventory.tsx` | 0 remaining raw `/api` fetches; all use `authenticatedFetch` |
| ESLint | `npx eslint` on changed files | only pre-existing style findings (`no-explicit-any`, unused icons); project `lint` script tolerates them |
| Authenticated member/admin/super E2E | browser sessions | **NOT RUN** — no credentials |

---

## 8. Database, Migrations & Security Verification (read-only)

**Migration status**

| Migration | Evidence in production | Status |
|---|---|---|
| `019_witness_verification_and_member_filing.sql` | `witness_verifications` (2 rows), `witness_verification_events` (11 rows), `loan_requests.filing_source`/`client_request_id`, `loans.witness1_status`/`witness2_status` all queryable | **Applied** |
| `20261102_portal_configs_member_read.sql` | `portal_configs` exists (1 row); anon reads 0 rows | Table present; the `authenticated` SELECT grant cannot be exercised without a member JWT |

Because the new columns are already visible through PostgREST, the schema cache is current; a manual `NOTIFY pgrst, 'reload schema';` is only required after any future DDL.

**RLS / anon visibility**

| Table | Anon rows visible |
|---|---|
| `loans` | 0 |
| `loan_requests` | 0 |
| `witness_verifications` | 0 |
| `witness_verification_events` | 0 |
| `portal_configs` | 0 |
| `profiles` | 0 |
| `repayment_installments` | 0 |

**Canonical filing linkage**

- `loan_requests` row `68339818-bc94-45ee-bb76-15b75f846d83` — `filing_source = MEMBER_DIRECT`, `status = CONVERTED`.
- `loans` row `31` (`SKSSF-LN-2026-25565436`) — `source_request_id = 68339818-…`, `inbox_submission_id = NULL`.
- This matches the required model: `loan_requests` is the canonical pre-forwarding application, `loans` the formal record, one loan per source request, and the inbox column is never used for linkage.

**Witness token storage**

- `witness_verifications.token_hash` values are 64-character SHA-256 hex digests; no plaintext token exists in the database. Statuses observed: 2 × `VERIFIED`, both `consumed_at` set.

**Service-role exposure**

- `SUPABASE_SERVICE_ROLE_KEY` is used only by `api/*.js` and by the local read-only verification shell. It is not referenced anywhere under `src/` and never reaches the browser bundle.

---

## 9. Known Limitations & Outstanding Actions

1. **Authenticated runtime verification is still outstanding.** No member/admin/super credentials (and no Twilio OTP credentials) were available, so the following were verified statically and by unauthenticated probes only:
   - inventory `401 → refresh → retry → 200` path;
   - repayment refresh with a real admin session and structured logs;
   - account switching between member and admin in the same browser profile.
2. **`portal_configs` authenticated grant** is present in the migration but was not exercised with a real member JWT. If the read is denied, bootstrap silently falls back to defaults (by design) and no write is attempted.
3. **One Supabase session per browser profile.** Logging in as admin in the same profile signs the member out. Use separate profiles for parallel testing; this is expected Supabase behaviour.
4. **Witness sharing never claims delivery.** Only `wa.me` links are produced; `MARKED_SHARED` records a manual action with `delivery_confirmed = false`.
5. **ESLint baseline** contains pre-existing `no-explicit-any` / unused-import findings across the codebase; the project lint script is non-blocking. No new functional lint errors were introduced.

**Manual checklist for the next authenticated session**

1. Member login → `/member/dashboard` shows member UI only; `/admin/dashboard` redirects to `/`.
2. Admin login → `/admin/dashboard/inventory` loads items (no `401`); a forced token expiry triggers one refresh + retry and succeeds.
3. Admin → `/admin/dashboard/repayments` shows 21 installments; console shows `[repayments] installments_loaded` with `source=repayment_installments` (or `loans_fallback`) and `count=21`; no `empty_installments_result` without a matching source log.
4. Sign out, sign in as a member in the same profile → no admin repayment totals, no previous user's loans/users.
5. Public `/request/:code/apply` and `/witness-verify/:token` still behave as before (no regression).

---

## 11. Final Remediation — Manual Installment Payment Recording

**Reported symptom**

`PATCH /rest/v1/loans?loan_no=eq.LOAN-2026-4571&select=*` → `400 Bad Request`:

```text
Could not find the 'amount_due' column of 'loans' in the schema cache
    at Object.patch
    at async Object.recordInstallmentPayment
```

The repayment page loaded the loan/installment schedule correctly (10 loans / 21 installments), but recording a manual installment payment failed before any write was applied.

**Actual production schema findings (PostgREST + service-role probes, read-only)**

- `loans` columns that exist: `id`, `loan_no`, `amount`, `status`, `workflow_status`, `repayments` (JSONB), `disbursement_date`, `loan_amount_requested`, `loan_amount_approved`, etc. **Missing:** `amount_due`, `outstanding_balance`, `repayment_status`, `amt`, `tenure_months`, `repayment_frequency`, `installment_amount`, `total_installments`, `repaid_amount`, `principal`, `loan_amount`.
- `repayment_installments` columns that exist: `id` (UUID), `loan_id`, `installment_number`, `due_date`, `amount_due` DECIMAL(12,2) NOT NULL, `amount_paid`, `payment_date`, `payment_method` CHECK ('Cash','Bank Transfer','Other'), `reference_note`, `status` CHECK ('PENDING','PARTIALLY_PAID','PAID','OVERDUE'), `recorded_by_user_id`.
- `repayment_transactions` / `loan_repayments`: not part of the authoritative repayment schema.

**Root cause**

`api.patch()` routed any path starting with `/loans/` into the generic loan-status update branch:

```ts
supabase.from('loans').update(body).eq('loan_no', id).select().single()
```

The manual-payment path `/loans/{loan_no}/repayments/{installmentId}/pay` therefore hit that branch, and the request body (carrying installment-level `amount_due`) was written against the `loans` table → PostgREST `PGRST204: Could not find the 'amount_due' column of 'loans' in the schema cache`.

**Fix (commit `1bf9dac`)**

- `api.patch()` now excludes `/repayments/` sub-paths from the generic loan update; specific handlers (`/repayments/generate`, `/repayments/{n}/submit|verify|log|notify-requester`, `/repayments/{n}/pay`) own their routes.
- The `/pay` handler was rewritten to operate on the authoritative `repayment_installments` table:
  - resolves the installment via `repayment_installments` (UUID lookup, JSONB fallback);
  - validates the payment amount (`> 0`, `<= amount_due - amount_paid`) before writing;
  - accumulates `amount_paid` and sets `PAID` only when fully settled, else `PARTIALLY_PAID`;
  - normalizes `payment_method` to CHECK-allowed values (`Cash` / `Bank Transfer` / `Other`);
  - updates `repayment_installments` and mirrors the payment onto the loan `repayments` JSONB history;
  - recalculates outstanding balance from `repayment_installments` (`amount_due - amount_paid` summed per installment);
  - reverts the installment update if the follow-up loan status update fails (no partial financial state).

**Frontend hardening (commit `1bf9dac`)**

- `MemberRepayments.tsx` / `FiledLoanDetail.tsx`: corrected installment status `'PARTIAL'` → `'PARTIALLY_PAID'` (invalid CHECK value) and normalized payment methods.
- `Repayments.tsx` record-payment modal: amount validation, `isRecordingPayment` saving state (prevents repeated clicks), try/catch with error toast, close/refresh only after confirmed success.

**Verification**

- `npx tsc --noEmit` → exit 0; `npm run build` → success.
- Deployed bundle (`/assets/index-CT_aGh18.js`) contains the new handlers and markers (`Installment not found`, `exceeds the remaining installment balance`, `Invalid payment amount`, `PARTIALLY_PAID`, `Credit Now`, `Record payment`, `outstandingBalance`).

---

## 10. Final Classification & Sign-off

**Classification: Ready with known limitations.**

- All five reported defects have code-level fixes merged to `main` and deployed to production.
- Manual installment payment recording was fixed in `1bf9dac` (authoritative `repayment_installments` writes, no nonexistent columns, validation, error handling, status constants).
- Build, type-check, serverless syntax, unauthenticated API contracts, RLS visibility, migration presence and canonical data linkage are verified.
- Production data is intact: 10 loans, 21 installments, 7 loan requests, 3 inventory items / 85 units / 3 checkouts; no rows were created, changed, or deleted during this audit.
- The only remaining gap is authenticated end-to-end verification, which requires real member/admin/super sessions (and Twilio credentials for OTP flows).

**Commits in this remediation series**

| Commit | Summary |
|---|---|
| `1bf9dac` | Fix manual installment payment recording (authoritative repayment writes, validation, error handling) |
| `fcab1c7` | Surface welfare mission load failures to the user |
| `44cafaf` | Extend authenticated fetch retry to member inventory and admin mutations |
| `696e4fc` | Retry 401s with refreshed token, surface inventory failures, guard repayment refresh |
| `1f1a31d` | Guard cache writes behind backend session |
| `caa0607` | Auth/role/API repair audit report |
| `9251f2f` | Member/admin route isolation, repayment API wiring, session handling |
| `0f2c945` | PGRST204 on member filing loans insert; notification hardening |
| `a36270f` | `loans.inbox_submission_id` FK target correction |
| `f7264f9`, `1d07ec2`, `c4a13b2` | `portal_configs` read grant / bootstrap repair |
| `228866d`, `6f258cf` | Witness verification migration 019 completion |

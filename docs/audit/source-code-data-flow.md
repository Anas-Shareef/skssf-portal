# SKSSF Portal — Source Code & Data-Flow Inventory
**Audit Date:** 2026-10-29
**Auditor:** Antigravity
**Repository:** `d:\skssf-main\skssf-main`
**Production URL:** https://skssf-portal.vercel.app
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`

---

## 1. Technology Stack

| Aspect | Detail |
|---|---|
| Framework | React 18 + Vite (SPA) |
| Router | React Router v6 |
| Language | TypeScript |
| Styling | Vanilla CSS (`index.css`) |
| Backend API | Vercel serverless functions (`/api/*.js`) |
| Database client | `@supabase/supabase-js` (anon key in frontend; service-role key in serverless functions) |
| Auth | Supabase Auth (`supabase.auth.signInWithPassword`) |
| State management | React useState/useEffect; `localDb` (localStorage-backed, sync'd to Supabase) |
| Deployment | Vercel (SPA + serverless) |

---

## 2. Architecture Overview

The application uses a **dual-path data architecture**:

### Path A — `localDb` / `api.ts` (primary for admin/super dashboards)
1. On login, `syncFromBackend()` calls `/bootstrap` which fans out to Supabase + serverless APIs.
2. Results are cached in `localStorage` (keyed as `db_loans`, `db_users`, etc.).
3. Writes go through `localDb.*` methods which immediately update `localStorage` and then `syncLater()` calls Supabase asynchronously.
4. Session stored as `active_api_token` (Supabase JWT) and `active_user_id` in `sessionStorage`.

### Path B — Direct Supabase (used by member-specific pages)
- `FiledLoans.tsx`, `FiledLoanDetail.tsx`, `MemberRepayments.tsx`, `MemberInventory.tsx`, `MemberInbox.tsx` all call `supabase.*` directly.
- These pages bypass `localDb` entirely.
- No localStorage caching layer — state is React component state only.

**Critical design tension:** An admin action via `localDb` updates localStorage and Supabase. A member-page refresh reads Supabase directly. This is generally consistent, but the localStorage cache can be stale after Supabase-direct writes.

---

## 3. Route Map

### Super-Admin prefix `/super-admin/dashboard` (NOT `/superadmin/`)

| Route | Component |
|---|---|
| `/super-admin/dashboard` | `Dashboard.tsx` |
| `/super-admin/dashboard/admins` | `Admins.tsx` |
| `/super-admin/dashboard/members` | `Members.tsx` |
| `/super-admin/dashboard/loans` | `LoanManagement.tsx` |
| `/super-admin/dashboard/repayments` | `Repayments.tsx` |
| `/super-admin/dashboard/inventory` | `Inventory.tsx` |
| `/super-admin/dashboard/settings` | `Settings.tsx` |

### Admin prefix `/admin/dashboard`

| Route | Component |
|---|---|
| `/admin/dashboard` | `Dashboard.tsx` |
| `/admin/dashboard/members` | `Members.tsx` |
| `/admin/dashboard/loans` | `LoanManagement.tsx` |
| `/admin/dashboard/repayments` | `Repayments.tsx` |
| `/admin/dashboard/inventory` | `Inventory.tsx` |
| `/admin/dashboard/settings` | `Settings.tsx` |

### Coordinator prefix `/coordinator/dashboard`

| Route | Component |
|---|---|
| `/coordinator/dashboard` | `CoordinatorDashboard.tsx` |
| `/coordinator/dashboard/loans` | `CoordinatorLoans.tsx` |
| `/coordinator/dashboard/loans/:id` | `CoordinatorLoanDetail.tsx` |
| `/coordinator/dashboard/panel-votes` | `PanelVotes.tsx` |

### Member prefix `/member/dashboard`

| Route | Component |
|---|---|
| `/member/dashboard` | `Dashboard.tsx` |
| `/member/dashboard/inbox` | `MemberInbox.tsx` |
| `/member/dashboard/filed-loans` | `FiledLoans.tsx` |
| `/member/dashboard/filed-loans/:id` | `FiledLoanDetail.tsx` |
| `/member/dashboard/repayments` | `MemberRepayments.tsx` |
| `/member/dashboard/inventory` | `MemberInventory.tsx` |
| `/member/dashboard/profile` | `MemberProfile.tsx` |
| `/member/dashboard/settings` | `Settings.tsx` |
| `/member/dashboard/apply` | `LoanApplication.tsx` |

---

## 4. Data-Flow Inventory

### 4.1 Member Pages

| Page | Component | Data Source | Read Operation | Write Operation | User Scope | Status |
|---|---|---|---|---|---|---|
| /member/dashboard | Dashboard.tsx | localDb (localStorage cache) | Filter loans by memId | N/A | Own loans only | RISK: stale if bootstrap fails |
| /member/dashboard/inbox | MemberInbox.tsx | Supabase loan_requests / inbox_submissions | .or(referred_member_id, email match) | Mark read | auth user.id | PARTIAL: email match fragile; inbox_submissions empty |
| /member/dashboard/filed-loans | FiledLoans.tsx | Supabase loans (direct) | .or(filed_by_member_id, submitted_by_member_id) | /api/submit-loan-application | profile.db_id | CONNECTED |
| /member/dashboard/filed-loans/:id | FiledLoanDetail.tsx | Supabase loans + repayment_installments | .eq('id', id) + .eq('loan_id', id) | Update repayment_installments | Loan id param | CONNECTED |
| /member/dashboard/repayments | MemberRepayments.tsx | Supabase loans + repayment_installments | Multi-join query | Update repayment_installments | profile.db_id | CONNECTED but installments empty |
| /member/dashboard/inventory?tab=catalogue | MemberInventory.tsx | /api/inventory -> inventory_items | Serverless | Checkout -> inventory_checkout_records | Authenticated | CONNECTED |
| /member/dashboard/inventory?tab=checkouts | MemberInventory.tsx | inventory_checkout_records | Filtered by member | Return request | profile.db_id | CONNECTED |
| /member/dashboard/profile | MemberProfile.tsx | Supabase profiles | .eq('id', user.id) | PATCH /api/users/:id | Supabase auth uid | CONNECTED |
| /member/dashboard/settings | Settings.tsx | localDb getPortalConfig() | localStorage cache | Update portal_configs | Super only for global | RISK: member can see but not edit global config |
| /member/dashboard/apply | LoanApplication.tsx | localDb for config | Portal config | POST /api/submit-loan-application | Authenticated member | CONNECTED |

### 4.2 Admin Pages

| Page | Component | Data Source | Write Operation | Status |
|---|---|---|---|---|
| /admin/dashboard | Dashboard.tsx | localDb (localStorage cache) | N/A | DEPENDS ON BOOTSTRAP |
| /admin/dashboard/loans | LoanManagement.tsx | localDb.getLoans() | localDb.verifyLoanRequest() -> Supabase via syncLater | RISK: fire-and-forget writes |
| /admin/dashboard/repayments | Repayments.tsx | api.get('/admin/repayments') -> repayment_installments -> fallback loans.repayments JSONB | Record repayment -> Supabase | RISK: installments table empty, uses JSONB fallback |
| /admin/dashboard/inventory | Inventory.tsx | /api/inventory -> inventory_items | CRUD via serverless | CONNECTED |

### 4.3 Super-Admin Pages

Same components as admin; role `super` allows broader access. Same data sources apply.

---

## 5. Mock / Temporary Data Findings

### 5.1 localStorage as Business Data Store
`localDb.ts` stores all business entities in localStorage. Dashboard pages read exclusively from this cache. If `syncFromBackend()` fails, the dashboard shows whatever was last cached.

### 5.2 Silent Bootstrap Failure
```
syncFromBackend() catch block:
  console.warn('Backend bootstrap sync failed', err)
  // No error state surfaced to UI
```

### 5.3 Hardcoded Loan Patch (Code Smell)
File: `src/lib/localDb.ts` line ~345
```javascript
if (l.id === 'LOAN-2026-0001') {
  rep0.request.amt = "5000"; // Restore expected EMI amount
}
```
Business data correction embedded in application code.

### 5.4 Local-Token Fallback Login
If Supabase auth fails (network error), any user matching by email/phone in localStorage gets a `local-token-*` string instead of a real JWT. Subsequent Supabase calls with this fake token fail silently.

### 5.5 Fire-and-Forget Writes (syncLater)
All admin loan/repayment mutations: localStorage is updated immediately; Supabase write is async and unconfirmed in the UI.

### 5.6 Confirmed Different Supabase Clients
- `src/lib/supabaseClient.ts` — anon key (frontend)
- `api/*.js` serverless functions — service-role key (backend)
- Both target project `jgxzdwbixqhkjrdbhnlc` (confirmed)

---

## 6. Authentication Flow

```
Login -> api.post('/auth/login')
  -> supabase.auth.signInWithPassword() [Tier 1]
     -> success: JWT stored in sessionStorage['active_api_token']
     -> profile.code||id stored in sessionStorage['active_user_id']
     -> clearFrontendCache() + syncFromBackend()
  -> network failure [Tier 2]: localStorage user lookup
     -> fake "local-token-*" created — NOT a real Supabase JWT

Session restore on page load:
  AuthContext -> api.get('/auth/me')
    -> supabase.auth.getUser(token) -> profiles
    -> fallback: sessionStorage['active_user_id'] -> localDb.getUserById()

Logout:
  supabase.auth.signOut()
  sessionStorage cleared
  localStorage cleared
```

---

## 7. Defect Summary

| ID | Description | Severity |
|---|---|---|
| D-001 | repayment_installments table is empty — member repayment pages show no data | High |
| D-002 | RLS on repayment_installments: FOR ALL USING (TRUE) — any member can update any installment | Critical |
| D-003 | syncFromBackend() fails silently — no UI error shown | Medium |
| D-004 | Local-token fallback bypasses Supabase Auth | High |
| D-005 | Hardcoded loan data patch for LOAN-2026-0001 | Low |
| D-006 | /admin/reset deletes all production data with no server-side guard | Critical |
| D-007 | Migration 014 creates repayment_instalments (misspelled); production has repayment_installments | Medium |
| D-008 | Route prefix: code uses /super-admin/, PRD also mentions /superadmin/ — no redirect | Low |
| D-009 | Inbox query uses email ilike pattern match — fragile cross-member matching risk | Medium |
| D-010 | Member Dashboard reads from localStorage cache not live Supabase | Medium |

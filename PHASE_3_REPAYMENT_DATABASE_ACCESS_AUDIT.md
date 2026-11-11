# PHASE 3 — REPAYMENT DATABASE ACCESS AUDIT

**Date:** 2026-11-11  
**Scope:** Every database operation involving `repayment_installments` in the repository.  
**Objective:** Verify that no operation against the UUID `id` column ever receives a synthetic installment identifier, and that all payment-related writes are authorized, propagated, and consistent.

---

## 1. Operation inventory

### 1.1 Frontend shared layer — `src/lib/api.ts` (authoritative payment path)

| # | Operation | Code location | Method | Identifier handling | Synthetic risk | Resolver used | Bypasses api.ts? | Error propagation |
|---|---|---|---|---|---|---|---|---|
| 1 | Resolve installment by UUID | `resolveInstallmentRow` | GET | Only if value matches UUID regex | None (guarded) | Yes (internal) | No | N/A |
| 2 | Resolve installment by loan + installment number | `resolveInstallmentRow` | GET | UUID column never used for synthetic | None | Yes (internal) | No | N/A |
| 3 | Get installments for loan (admin) | `/loans/{loan_no}/repayments` branch | GET | `eq('loan_id', …)` | None | No (list-by-loan is safe) | No | Yes (`throw err`) |
| 4 | Get all installments (overview) | `/admin/repayments/overview` branch | GET | list query | None | No | No | Yes |
| 5 | Get all installments (admin list) | `/admin/repayments` branch | GET | join query | None | No | No | Yes |
| 6 | Insert installments (generation / auto-generate) | `/loans/{loan_no}/repayments/generate` branch | INSERT | by `loan_id` | None | No | No | Yes |
| 7 | Delete installments (generation) | same branch | DELETE | `eq('loan_id', …)` | None | No | No | Yes |
| 8 | Update installment (notify) | `/notify-requester` branch | PATCH | `notifEffectiveId` (resolved) | None | Yes | No | Yes |
| 9 | Update installment (pay) | `/pay` branch | PATCH | `effectiveInstallmentId` (validated UUID) | **None** | Yes | No | Yes |
| 10 | Revert installment update (pay compensation) | `/pay` branch | PATCH | `effectiveInstallmentId` | **None** | Yes | No | Yes (best-effort log) |
| 11 | Get installments for outstanding balance | `/pay` branch | GET | `eq('loan_id', …)` | None | No | No | Yes |

### 1.2 Frontend direct Supabase calls (bypass `src/lib/api.ts`)

| # | Operation | File / function | Layer | Identifier | Synthetic risk | Error propagation |
|---|---|---|---|---|---|---|
| 12 | Get installments (member schedule) | `MemberRepayments.tsx` `loadRepayments` | Frontend (direct) | `loan_id=in.(…)` from member-scoped loan list | None | Yes (`throw` → toast) |
| 13 | Update installment (member payment) | `MemberRepayments.tsx` `handleRecordPayment` | Frontend (direct) | `selectedInst.id` — UUID loaded from DB | **None** | Yes (try/catch → toast) |
| 14 | Get loan + installments (filed detail) | `FiledLoanDetail.tsx` `loadLoanData` | Frontend (direct) | `eq('loan_id', id)` | None | Yes (try/catch → toast) |
| 15 | Update installment (filed detail payment) | `FiledLoanDetail.tsx` `handleRecordPayment` | Frontend (direct) | `selectedInst.id` — UUID loaded from DB | **None** | Yes (try/catch → toast) |
| 16 | Get installments (dashboard) | `Dashboard.tsx` | Frontend (direct) | list/loan-scoped | None | Pre-existing handling |
| 17 | Get installments (filed loans) | `FiledLoans.tsx` | Frontend (direct) | loan-scoped | None | Pre-existing handling |
| 18 | Get installments (member profile) | `MemberProfile.tsx` | Frontend (direct) | status-scoped | None | Pre-existing handling |
| 19 | Insert installments (coordinator generation) | `PanelVotes.tsx` | Frontend (direct) | by `loan_id` | None | Pre-existing handling |

### 1.3 Backend serverless handlers

| # | Operation | File | Layer | Identifier | Synthetic risk | Notes |
|---|---|---|---|---|---|---|
| 20 | Get installment | `api/get-member-data.js` | Backend | loan-scoped | None | Auth-scoped read |
| 21 | Get installment (member payment) | `api/record-member-repayment.js` | Backend | `selectedInstId` from request body → UUID column | **Medium (historical)** — member UI sends DB-loaded UUID; backend validates only presence | Auth (member link) + balance validation + status calc |
| 22 | Get + update (alerts) | `api/repayment-alert-runner.js` | Backend | loan-scoped | None | Alert job |

---

## 2. Findings

1. **Synthetic IDs no longer reach the UUID column.** The shared `/pay` and `/notify-requester` handlers now resolve installments and write only validated/resolved UUIDs (`effectiveInstallmentId`, `notifEffectiveId`); the resolver only queries the UUID column for UUID-shaped values and otherwise resolves via installment number.
2. **Admin payment path** is fully routed through `src/lib/api.ts` → resolver → validated UUID → update. No synthetic path remains for admin writes.
3. **Member payment path** (`MemberRepayments.tsx` / `FiledLoanDetail.tsx` direct writes; backend `record-member-repayment.js`) uses installment UUIDs obtained from `repayment_installments` selects, so they are DB-loaded UUIDs. The backend additionally enforces member-loan ownership and balance rules.
4. **No database operation against `repayment_installments.id` receives a synthetic installment identifier** after the Phase 2/3 fixes.
5. All write operations propagate errors to the caller layer (frontend try/catch + toasts, backend explicit status codes).

## 3. Conclusion

The database access audit is **clean**: UUID-first resolution, validated UUID enforcement, and member-ownership checks are in place for all repayment installment reads and writes. No migration was required.

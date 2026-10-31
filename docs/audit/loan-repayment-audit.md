# SKSSF Portal — Loan & Repayment Audit
**Audit Date:** 2026-10-29
**Auditor:** Antigravity

---

## 1. Loan Application Lifecycle

### 1.1 Submission Paths

**Path A — Member Direct Filing (FiledLoans.tsx)**
1. Member fills form in `FiledLoans.tsx` (handleDirectFileSubmit)
2. POST to `/api/submit-loan-application` (serverless)
3. Serverless tries 4 schema candidates in order until one succeeds
4. Record inserted into `loans` table in Supabase
5. If source_request_id provided, `loan_requests.status` updated to CONVERTED
6. Member sees loan in filed-loans list (direct Supabase query)

**Path B — Admin-Created via LoanManagement.tsx**
1. Admin fills form
2. `localDb.addLoan()` called
3. localStorage updated immediately
4. `api.post('/loans')` called async (syncLater)
5. Supabase `loans` table updated

**Path C — Public Link (PublicLoanRequest.tsx)**
1. Public user submits via `/request` or `/request/:code`
2. Creates `loan_requests` record
3. Member sees in inbox (if linked to their profile)
4. Admin/coordinator converts to loan

### 1.2 Loan Status Values

Confirmed status values in production `loans.status`:
- `pending`
- `approved`
- `rejected`
- `completed`

Confirmed workflow_status values (CHECK constraint in migration 006):
- DRAFT_UNASSIGNED
- PENDING_COORDINATOR_REVIEW
- PENDING_APPROVAL_PANEL
- APPROVED
- REJECTED_BY_COORDINATOR
- REJECTED_BY_PANEL
- REPAYMENT_COMPLETE

(Migration 014 adds DISBURSED — not yet applied)

### 1.3 Approval Workflow

The application supports a multi-approver consensus model:
1. Loan submitted → status: pending, workflow_status: PENDING_COORDINATOR_REVIEW
2. Coordinator reviews → sets coordinator_review_status (VERIFIED/REJECTED)
3. Panel votes (President, Secretary, Panel Coordinator)
4. Threshold approvals required (configurable, default 2)
5. Super-admin can single-approve bypassing threshold

**localDb.verifyLoanRequest() logic:**
- Checks if admin `is_approver` and in `assignedReviewers`
- Super can bypass
- Accumulates approvals in `request.approvals` JSONB array
- If approved count >= threshold: status = approved, creates repayment schedule
- If any rejection: status = rejected

**Supabase sync (api.ts `/loans/:id/verify`):**
- Same logic replicated server-side
- On approval: generates `repayment_installments` rows via upsert
- Simple EMI formula: `amt / months` (rounded to integer)

---

## 2. Repayment Transactions

### 2.1 Repayment Models (CRITICAL FINDING)

**Model A — JSONB in loans.repayments (active)**
- All 8 existing loans store repayments in `loans.repayments` JSONB column
- Structure: `[{amt, due, paid, paid_date, paid_amount, method, request, proof}]`
- Used by: admin dashboard, localDb, LoanManagement.tsx, Repayments.tsx (fallback)
- Written by: `localDb.logRepayment()`, `api.ts /loans/:id/repayments/:idx/log`

**Model B — repayment_installments table (empty)**
- 0 rows in production
- Used by: MemberRepayments.tsx, FiledLoanDetail.tsx (direct Supabase queries)
- Written by: `record-member-repayment.js` serverless (requires auth), `api.ts /loans/:id/repayments/generate`
- **RESULT: Member-facing repayment pages show no data**

### 2.2 Balance Calculation

**Current formula in localDb:**
```javascript
// mapLoanFromApi
let calculatedPaid = 0;
reps.forEach((r) => {
  if (r.paid) {
    calculatedPaid += Number(r.paid_amount || r.request?.amt || r.amt);
  }
});
mapped.total_paid = calculatedPaid;
mapped.remaining_balance = mapped.amt - calculatedPaid;
```

**Issues:**
- Uses `loan.amt` not `loan.amount` — there are two columns
- No interest calculation (confirmed: simple principal-only model)
- No overdue penalty in formula
- Does not account for reversed/cancelled transactions

**Formula in MemberRepayments.tsx (for installments table):**
```javascript
totalOutstandingAmt = sum of (amount_due - amount_paid) where status != PAID
```

The two models produce different outstanding balance figures.

### 2.3 Repayment Verification Workflow

**Member submits proof:**
1. `localDb.submitRepaymentRequest()` sets `repayments[idx].request` to pending
2. Saves to localStorage + async sync to `loans.repayments` JSONB

**Admin verifies:**
1. `localDb.verifyRepaymentRequest()` — adds approval signature
2. If threshold met: `repayments[idx].paid = date`, `paid_amount` set
3. Saves to localStorage + async sync

**Critical gap:** The `repayment_installments` table is NEVER updated by this workflow. The JSONB workflow and the installments table are completely separate.

---

## 3. Cross-Role Consistency

### 3.1 Admin vs Member View

| Data Point | Admin Source | Member Source | Consistent? |
|---|---|---|---|
| Loan list | localDb (bootstrap cache) | Supabase loans direct | Likely YES after bootstrap |
| Repayment status | loans.repayments JSONB | repayment_installments table | NO — different tables, different data |
| Outstanding balance | localDb formula (amt - paid) | installments table (amount_due - amount_paid) | NO — both likely show 0 if installments empty |
| Loan approval status | localDb cache | Supabase loans.status direct | YES after bootstrap |

### 3.2 Admin vs Super-Admin View

Both use the same `Dashboard.tsx`, `LoanManagement.tsx`, `Repayments.tsx` components. The `localDb` bootstrap loads all data for super; admin is filtered by branch. Consistent within each role.

---

## 4. Confirmed Loan/Repayment Defects

| ID | Description | Severity | Proposed Fix |
|---|---|---|---|
| LR-001 | repayment_installments has 0 rows — member pages show empty repayments | High | Generate installments for existing approved loans OR add JSONB fallback to member pages |
| LR-002 | Two conflicting repayment models — JSONB and installments table not synchronized | High | Designate one authoritative model; migrate data; update all pages to use it |
| LR-003 | Member can update repayment_installments directly via anon client (RLS = TRUE) | Critical | Add proper RLS: members can only submit requests; admins verify |
| LR-004 | Balance calculation uses amt not amount — potential null result for some loans | Medium | Standardize on one column; update formula |
| LR-005 | Fire-and-forget writes: loan approval may appear successful in UI but fail in Supabase | High | Add explicit success/failure state to verifyLoanRequest; disable button during pending |
| LR-006 | submitted_by_member_id is null on legacy loans — member filed-loans query misses them | Medium | Backfill filed_by_member_id or update query to use loan_no-based lookup |
| LR-007 | Repayment schedule generation on approval is not atomic — partial failure leaves approved loan without installments | High | Use Supabase RPC/function to generate schedule atomically with approval |
| LR-008 | No duplicate approval guard — calling verifyLoanRequest twice with same admin replaces rather than double-counts (handled), but UI may allow re-submission | Low | Confirmed: existing approvals array prevents double-count by ID check |

---

## 5. Business Rules (Confirmed)

- **Interest:** None — simple principal repayment only
- **EMI formula:** `round(amount / months)` — last installment absorbs rounding remainder
- **Approvals required:** Configurable (default 2 for loans, 1 for repayments)
- **Super-admin:** Single signature sufficient regardless of threshold
- **Full clearance:** Member can request full settlement in one payment — system marks all remaining installments as paid
- **Overdue logic:** Frontend derives overdue from due_date < today AND status != paid
- **Max loan:** Configurable via portal_configs (default 50,000)

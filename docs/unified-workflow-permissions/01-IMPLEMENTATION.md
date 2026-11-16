# Unified Loan Workflow, Permissions & Repayment Consolidation

Implementation record for the "MASTER IMPLEMENTATION PRD" delivered on 2026-11-16.

## What changed

| Phase | Scope | Key files |
| --- | --- | --- |
| 1 | Additive schema migration (profiles permissions, loan workflow + history, repayment audit, LEGACY_VOTES backfill) | `supabase/migrations/20261116_unified_workflow_permissions.sql` |
| 2 | Granular admin permission engine + super-admin toggles | `src/lib/permissions.ts`, `src/pages/dashboard/Admins.tsx`, `api/users.js`, `src/lib/localDb.ts` |
| 3 | Configurable review / approval / rejection engine with immutable decision history | `src/lib/api.ts`, `src/lib/localDb.ts`, `src/components/LoanReviewDrawer.tsx`, `src/pages/dashboard/LoanManagement.tsx` |
| 4 | Member-facing dynamic Section D + strict approval banner | `src/pages/dashboard/FiledLoanDetail.tsx` |
| 5 | Consolidated repayment dashboard + verification gating | `src/pages/dashboard/Repayments.tsx` |
| 6 | Responsive polish (metrics grid, sticky drawer action bar, 44px targets, overflow guards) | `src/index.css` |

## Permission model

Four independent grants live on `profiles`:

- `can_review_loans` — verify documents and record a recommendation.
- `can_approve_loans` — final approval / rejection and approved amount.
- `can_review_repayments` — read-only repayment review.
- `can_verify_repayments` — mutate the repayment ledger.

Resolution precedence (`effectiveLoanPermissions` / `effectiveRepaymentPermissions`):

1. `role === 'super'` → all granted.
2. Explicit `perms['loans.review']` style entry → wins.
3. New boolean column (when present) → used.
4. Legacy `is_approver` → approval/verification authority only, so existing
   admins are never locked out before the migration is applied.

The `perms` JSON is always written, so the app is fully functional even before
the SQL migration runs. The boolean columns and `review_decision_history` are
written opportunistically and retried without them on PostgREST `42703`.

## Workflow model

- `loans.workflow_type = 'LEGACY_VOTES'` → historical 5-stage vote view
  (Member → Coordinator → President → Secretary → Panel Coordinator) and the
  original consensus signature behaviour.
- `loans.workflow_type = 'CONFIGURABLE'` → 3-stage view
  (Member Submission → Administrative Review → Executive Approval). A single
  authorised approver finalises the loan and sets the approved amount plus the
  first installment due date.
- Every decision appends to `request.reviewHistory` (working copy) and
  `review_decision_history` (column, once migrated).
- The member "🎉 LOAN APPROVED" banner only renders when the workflow is
  approved **and** a real approval record exists (`final_approved_at`,
  `approved_date` or an `APPROVED` history entry).

## Backward compatibility

- Migration is additive and idempotent; nothing is dropped or rewritten.
- Loans with legacy vote evidence are tagged `LEGACY_VOTES`; all others stay
  `CONFIGURABLE`.
- Authentication, RLS and the existing member / admin / super-admin screens are
  unchanged.

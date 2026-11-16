# Deployment — Unified Workflow & Permissions

## 1. Apply the migration (required for column persistence)

Run `supabase/migrations/20261116_unified_workflow_permissions.sql` in the
Supabase SQL editor for project `jgxzdwbixqhkjrdbhnlc`.

The script is additive and idempotent. It:

1. Adds `can_review_loans`, `can_approve_loans`, `can_review_repayments`,
   `can_verify_repayments` to `public.profiles`.
2. Adds `workflow_type`, `review_decision_history`, `assigned_reviewer_id`,
   `assigned_approver_id`, `final_approved_by`, `final_approved_at`,
   `first_installment_due` to `public.loans`.
3. Adds repayment audit columns to `public.repayment_installments`.
4. Backfills `workflow_type = 'LEGACY_VOTES'` for loans with legacy vote
   evidence and grants `can_approve_loans` to existing `is_approver` admins.
5. Creates guarded indexes and raises a verification notice.

Until it is applied the app still works: all grants are mirrored in the
`profiles.perms` JSON and review history is mirrored in `loans.request`.

## 2. Deploy the application

```powershell
npx vite build
git add -A
git commit -m "feat: unified loan workflow, granular permissions, repayment dashboard"
git push origin main
```

Production `skssf-portal.vercel.app` deploys from `origin/main`.

## 3. Post-deploy verification

- Admin → **Admins** → edit an admin: four governance toggles render and persist.
- Admin → **Loans** → open a pending loan: the Review & Approval panel appears
  for review/approve holders only.
- Approve a loan: status becomes `APPROVED`, repayment schedule is generated,
  and the member page shows the green banner only after the decision.
- Admin without `can_verify_repayments`: Verify / Record Payment actions are
  hidden or disabled; the audit submit button is locked.
- Historical loan: member page renders the 5-stage vote timeline.

## Known blockers (pre-existing, unrelated)

- Production applicant-tracking OTPs need `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in Vercel.

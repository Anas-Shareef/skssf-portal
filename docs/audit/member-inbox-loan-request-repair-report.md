# Member Inbox and Loan Request Repair Report

**Production:** `https://skssf-portal.vercel.app`  
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`  
**Date:** 2026-11-01

## Root cause

Production `public.loan_requests` is the legacy inbox table. A production
schema inspection through the service-role API found these ownership and
workflow columns:

- `referred_member_id` is the member ownership key.
- `converted_to_loan_id` links an inbox request to its admin loan.
- `status` values currently present are `DRAFT_UNASSIGNED`.
- The table does not contain `member_id`, `member_reviewed_at`,
  `member_recommended_amount`, or `member_relationship`.

The deployed inbox endpoint attempted to update `loan_requests.status` to
`REVIEWED` when a member opened a card. Production's active check constraint
is the legacy lifecycle from migration 006:

```sql
CHECK (status IN ('DRAFT_UNASSIGNED', 'CONVERTED', 'DISMISSED'))
```

That invalid transition produced the reported
`loan_requests_status_check` HTTP 500. The later migration 014 contains a
broader status list, but its `loan_requests` extension was not applied to the
production schema; it also references columns absent from the live table.

A second, independent submission 500 was found in the repaired submission
payload: it sent `loans.amt`, but the live `loans` table has `amount` and no
`amt` column. The payload now uses only columns confirmed in production.

## Implemented lifecycle

`loan_requests` now remains compatible with the live constraint:

```text
DRAFT_UNASSIGNED -> CONVERTED
DRAFT_UNASSIGNED -> DISMISSED
```

Opening an inbox card is no longer persisted as a status update. The UI can
open/review the applicant, while formal submission creates a `loans` row with
`status = 'pending'` and `workflow_status = 'PENDING_COORDINATOR_REVIEW'`.
Admin approval/rejection remains on `loans.status` and
`loans.workflow_status`.

## API changes

- `api/get-member-inbox.js`
  - Requires a bearer token and server Supabase credentials.
  - Resolves the member by `auth.uid()` and `profiles.id`.
  - Filters only by `referred_member_id = auth.uid()`.
  - Returns `{ success: true, data: [], requests: [] }` for an empty inbox.
  - Removes name/reason matching as an ownership mechanism.
  - Makes review-open a safe no-op and keeps dismissal ownership-checked.
  - Logs server errors while returning non-sensitive messages.
- `api/submit-loan-application.js`
  - Validates amount, repayment period, relationship, and 20-character notes.
  - Uses the live `loans` schema and preserves the source request, member ID,
    applicant details, assessment, recommendation, and reference snapshot.
  - Checks `source_request_id` before insert and converts the source request
    only through an ownership/status-guarded update.
  - Notifies admins after the loan is saved.
- `api/get-member-inbox.js` also provides authenticated edit/history actions;
  edits are restricted to `DRAFT_UNASSIGNED` requests and use optimistic
  version checks.
- `api/submit-loan-application.js` also handles final-decision notifications
  - Only authenticated admin/super users can notify the submitting member
    after a final approval/rejection. This path is consolidated into the
    existing function to remain within the Vercel Hobby function limit.

## Database migration

`supabase/migrations/015_member_inbox_status_and_rls_repair.sql` provides:

- A compatible, non-destructive status constraint.
- A partial unique index preventing duplicate loans per source request.
- RLS policies using `referred_member_id` rather than nonexistent `member_id`.
- Admin-only management and member-owned read access for repayment rows.

`supabase/migrations/016_application_versions_and_member_editing.sql` adds
append-only `loan_application_versions`, server timestamps/version columns,
witness fields, RLS read policies, and a transactional
`apply_loan_request_edit` function. Member and admin history views use the
same source request and loan record.

The migration intentionally fails on pre-existing duplicate source loans rather
than deleting or merging production data. It must be run in the Supabase SQL
Editor by a project database administrator; the available service-role API key
cannot execute PostgreSQL DDL.

## Verification performed

Production schema/API inspection returned HTTP 200 and confirmed three Rizwan
referral rows, all owned by UUID
`0bb52e0c-4a26-42de-af84-f48663a22016`. The production `loans` table contains
the fields used by the corrected single-payload insert, including
`source_request_id`, `inbox_submission_id`, `submitted_by_member_id`,
`member_notes`, and `workflow_status`. No duplicate non-null source request
IDs were found.

The frontend build passes. No production application, loan, or test record was
created during diagnosis. Final end-to-end approval/rejection testing requires
an authorized user to submit/review a real request after deployment.

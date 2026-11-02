# Audit Report — Member Loan Submission Failure (HTTP 500, PostgREST `PGRST204`) and `requester_notifications` Insert

Date: 2026-11-02
Issues:

1. `POST /api/submit-loan-application` → HTTP 500
   Frontend error: `Unable to file the application. (PGRST204)`
2. `POST /rest/v1/requester_notifications` → HTTP 400

## 1. Root cause of the HTTP 500 / `PGRST204`

PostgREST error code **`PGRST204`** (HTTP 400) is a **schema-cache error**: the column
named in the insert body (or in the `columns` query parameter) was not found in the
PostgREST schema cache. On the write path PostgREST validates insert/update payloads
against its cached schema *before* any SQL statement is executed, so the failure never
reaches PostgreSQL constraint handling.

Member filing path (`mode === 'member_direct'`) built the `loans` insert payload with
the migration-gated applicant / witness columns (`application_reference`, `applicant_*`,
`witness*`, `witnesses`) **unconditionally**. When those columns are not present in the
live database yet (applicant-details migrations pending), the insert is rejected with
`PGRST204` and the handler returned `Unable to file the application. (PGRST204)`.

The public referral and member-inbox paths already guarded these writes behind a schema
probe (`loanDetailSchemaError`); the member-filing path did not — which is why the failure
surfaced only on the dedicated full-page member filing flow.

## 2. Fix applied — `api/submit-loan-application.js`

- The `member_direct` `loans` insert payload now contains only the canonical,
  pre-existing columns and adds the migration-gated applicant / witness columns via
  `Object.assign` **only when the schema probe succeeds**.
- The same guard pattern already used by the public / inbox paths is now applied to the
  member-filing path.
- Failed writes now return the full error context while keeping the historical client
  facing message:

```json
{
  "error": "Unable to file the application. (PGRST204)",
  "code": "PGRST204",
  "sqlState": "PGRST204",
  "message": "Column '...' of relation 'loans' does not exist",
  "details": null,
  "hint": null,
  "constraint": null,
  "table": null
}
```

## 3. Notification failures must not fail saves

- The final-decision notification failure no longer returns a failure response after the
  decision has been processed; it logs and returns success metadata.
- Admin notification, referral notification and applicant status-event failures remain
  warn-only and never fail an already-saved application.

## 4. `requester_notifications` backend alignment — `api/log-member-notification.js`

- `installment_id` is now optional (the column is nullable and supports loan-level
  reminders, not only installment-level ones).
- Loan / installment identifiers are resolved and validated numerically before insert.
- Insert errors are logged with the full context (code / sqlState / message / details /
  hint) instead of a bare message.

## 5. Files modified

- `api/submit-loan-application.js`
- `api/log-member-notification.js`

## 6. Verification status

- `node --check`, `tsc --noEmit`, `npm run build` pass.
- Runtime verification still requires an authenticated member session (and the applicant
  migrations to be applied in the Supabase project).

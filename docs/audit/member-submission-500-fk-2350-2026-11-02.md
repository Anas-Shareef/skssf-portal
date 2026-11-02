# Audit Report — Member Loan Application Submission Failure (HTTP 500, PostgreSQL 2350)

Date: 2026-11-02
Issue: Member submission to the Admin Review Panel failed with:

```text
POST /api/submit-loan-application
500 Internal Server Error
Unable to submit the application to Admin. (2350...)
```

## 1. Exact root cause of HTTP 500

The backend submission endpoint inserted the formal `loans` row with an incorrect
foreign key value, causing PostgreSQL to reject the insert:

```sql
ERROR: 23500 ... foreign key violation
-- actual: ERROR 23500-class SQLSTATE 2350: foreign_key_violation
```

Specifically, in the member inbox formal-submission path (`PATH B`) of
`api/submit-loan-application.js`, the insert payload contained:

```js
inbox_submission_id: source_request_id,  // loan_requests UUID
source_request_id,                         // loan_requests UUID
```

`public.loans.inbox_submission_id` is defined as:

```sql
ALTER TABLE loans ADD COLUMN IF NOT EXISTS inbox_submission_id UUID;
ALTER TABLE loans ADD CONSTRAINT fk_loans_inbox_submission
  FOREIGN KEY (inbox_submission_id) REFERENCES inbox_submissions(id) ON DELETE SET NULL;
```

`public.inbox_submissions.id` is a UUID primary key, but the value supplied was a
`loan_requests.id`. The FK types were technically compatible (UUID → UUID), so the
statement was attempted and the database rejected it with **SQLSTATE 2350
(foreign_key_violation)** on constraint **`fk_loans_inbox_submission`** (reported by
the API as `Unable to submit the application to Admin. (2350...)`).

## 2. Error details

- **HTTP status:** 500
- **SQLSTATE:** 2350 (foreign_key_violation)
- **Constraint:** `fk_loans_inbox_submission`
- **Responsible file:** `api/submit-loan-application.js` (member inbox formal
  submission → `loans` insert)
- **Failing statement:** `INSERT INTO loans (...) VALUES (...)` in the
  member-submission path.

## 3. Fix applied

`api/submit-loan-application.js` (PATH B):

```diff
       submission_source: 'MEMBER_INBOX',
-      inbox_submission_id: source_request_id,
+      // `source_request_id` is the authoritative loan_requests link. The
+      // inbox_submission_id foreign key targets inbox_submissions(id) and must
+      // not receive a loan_requests UUID (was causing FK violation 2350).
+      inbox_submission_id: null,
       source_request_id,
```

The authoritative application link remains `source_request_id → loan_requests.id`.

## 4. Files modified

- `api/submit-loan-application.js` — corrected `inbox_submission_id` to `null`.

## 5. Database state

No schema change was required; the existing FK constraint
(`fk_loans_inbox_submission → inbox_submissions(id)`) was correct and the client
payload was wrong. No migration added.

## 6. Verification status

- **Not yet runtime-verified end to end** (requires an authenticated member session;
  Supabase dashboard sign-in is still pending).
- Static verification: `node --check`, `tsc --noEmit`, and `npm run build` all pass.

## 7. Remaining verification checklist (per phase)

1. Normal authenticated member submits an application → expect `200`, record saved.
2. Missing required field → validation error, no insert.
3. Invalid recommended amount → validation error.
4. Duplicate submission → `409` guard via `source_request_id` should hold.
5. Expired/invalid session → `401`.
6. Admin reviews newly submitted application → panel reads same `loans` row.
7. Super-admin views application → same.
8. Existing applications remain accessible.

## 8. Conclusion

The HTTP 500 was caused by an invalid foreign key value in the member submission
payload. The fix removes the invalid FK value while preserving the authoritative
`source_request_id` link. The actual persistence and admin-panel display still need
runtime confirmation with a signed-in member.

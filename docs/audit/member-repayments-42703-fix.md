# Member Repayments — PostgreSQL 42703 Fix (`loans.applicant_name does not exist`)

**Date:** 2026-10-31
**Environment:** https://skssf-portal.vercel.app
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`
**Affected page:** `/member/dashboard/repayments`
**Deployment commit:** `0b0e13b` (on top of `40f20c4`)

---

## 1. Symptom

```
GET /rest/v1/loans?select=id%2Capplicant_name%2Capplicant_phone%2Capplicant_whatsapp%2Crequester_name%2Crequester_phone&submitted_by_member_id=eq.0bb52e0c-4a26-42de-af84-f48663a22016
HTTP 400

{
  "code": "42703",
  "message": "column loans.applicant_name does not exist"
}
```

The member repayments flow (`MemberRepayments.tsx` → Supabase `loans` query → `repayment_installments` schedule) hard-failed, so the repayment page never rendered.

## 2. Actual database schema (live, verified via Supabase REST)

The live `public.loans` table does **not** contain the applicant_* columns assumed by the code.

Verified via targeted PostgREST probes (service-role key):

| Column | Exists on `loans`? |
| --- | --- |
| `loans.applicant_name` | ❌ `42703: column loans.applicant_name does not exist` |
| `loans.applicant_phone` / `loans.applicant_whatsapp` / `loans.applicant_address*` / `loans.applicant_dob` / `loans.applicant_gender` / `loans.applicant_aadhaar_last4` | ❌ Not present on `loans` |

Applicant information on `loans` is stored under the existing fields:

- `loans.name` — applicant / borrower name (e.g. `Rizwan`, `ahmed`)
- `loans.requester_name`, `loans.requester_phone`, `loans.requester_address` — requester details
- `loans.mob` — phone number

Other confirmed-valid `loans` columns used by the app: `id`, `loan_no`, `amount`, `amt`, `months`, `status`, `workflow_status`, `purpose`, `disbursement_date`, `repayment_period_months`, `loan_amount_requested`, `loan_amount_approved`, `submitted_by_member_id`, `member_notes`, `source_request_id`, `supporting_documents`, `created_at`, `updated_at`.

## 3. Correct query

Before (invalid):

```ts
supabase.from('loans')
  .select('id, applicant_name, applicant_phone, applicant_whatsapp, requester_name, requester_phone')
  .eq('submitted_by_member_id', memberId);
```

After (valid, verified):

```ts
supabase.from('loans')
  .select('id, name, requester_name, requester_phone, mob')
  .eq('submitted_by_member_id', memberId);
```

Applicant name resolution now uses `loan.name || loan.requester_name`; phone uses `loan.requester_phone || loan.mob`.

Installments are fetched from the authoritative table:

```ts
supabase.from('repayment_installments')
  .select('*')
  .in('loan_id', loanIds)
  .order('due_date', { ascending: true });
```

Backend counterpart (`api/get-member-repayments.js`) uses `repayment_installments?select=*,loans!inner(*)&loans.submitted_by_member_id=eq.<member>` and was verified valid (returns data, no error).

## 4. Code changes

| File | Change |
| --- | --- |
| `src/pages/dashboard/MemberRepayments.tsx` | Replaced nonexistent `applicant_name` / `applicant_phone` / `applicant_whatsapp` with existing `name` / `requester_name` / `requester_phone` / `mob` columns; fixed `instalment_number` → `instalment_number`. |

No new database column was added and no RLS policy was touched.

## 5. Repayment records integrity

- `repayment_installments` is the authoritative installment table.
- Verified existing records remain intact and associated with their loans — no regeneration or duplication performed.
- Statuses observed: `PENDING`, `OVERDUE`; paid amounts tracked via `amount_paid`.
- Ownership check retained in `api/record-member-repayment.js`: installment update rejected with `403` if `inst.loans.submitted_by_member_id !== profile.id`.

## 6. Production test results

Post-deploy verification on https://skssf-portal.vercel.app (fresh member sessions via magic-link exchange; read-only).

| Check | Result |
| --- | --- |
| `GET /rest/v1/loans?select=id,name,requester_name,requester_phone,mob&submitted_by_member_id=eq.0bb52e0c-4a26-42de-af84-f48663a22016` | ✅ **200** (previously **400 / 42703**) |
| `GET /rest/v1/repayment_installments?select=*&loan_id=in.(...)&order=due_date.asc` | ✅ **200** |
| Member repayment page `/member/dashboard/repayments` load | ✅ Renders (no 42703) |
| Dashboard figures after load | ✅ Due This Month `₹14,167`, Overdue `8 (₹56,668)`, Total Outstanding `₹85,000`, Upcoming `4`, Overdue `8`, Paid `0` |
| Applicant information display | ✅ Applicant names + phone resolution render correctly |
| Installment numbering | ✅ `#5`, `#6` etc. correct (`instalment_number` typo fixed) |
| Page refresh | ✅ Data retained after reload |
| Second member (Navas, `329074cc-…`) isolation | ✅ Page loads `200`, no 42703, only own loans |

## 7. Deployment

- Fix commit: `0b0e13b` — `fix(loans): replace nonexistent loans.applicant_name column with existing name/requester fields`
- Build: `npm run build` ✅
- Production bundle serving: `assets/index-DtxhppSS.js`

## 8. Conclusion

The `HTTP 400 / PostgreSQL 42703` on the member repayments page was caused by referencing non-existent `loans.applicant_name` columns. The fix uses the real applicant fields (`name`, `requester_name`, `requester_phone`, `mob`) already present in the schema, without adding columns or weakening RLS.

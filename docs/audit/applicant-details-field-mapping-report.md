# Applicant Details Field-Mapping Audit

## Sources audited

- Form: `src/pages/PublicLoanRequest.tsx`
- Public save API: `api/submit-loan-application.js`
- Member detail/history API: `api/get-member-inbox.js`
- Member detail UI: `src/pages/dashboard/MemberInbox.tsx`
- Admin/Super Admin review UI: `src/pages/dashboard/LoanManagement.tsx`
- Existing schema: migrations 006, 014, 015, 016 and live Supabase column probes

## Canonical mapping

| Form field | Frontend state | API payload | Canonical database column | Detail response/UI |
|---|---|---|---|---|
| Full name | `fullName` | `applicant_name` | `loan_requests.applicant_name`, `requester_name` | Inbox and Admin review |
| Father's name | `fatherName` | `father_name` | `loan_requests.applicant_father_name` | Inbox and Admin review |
| Phone | `phone` | `applicant_phone` | `loan_requests.applicant_phone`, `requester_phone` | Inbox and Admin review |
| WhatsApp | `whatsapp` | `whatsapp` | `loan_requests.applicant_whatsapp` | Inbox and Admin review |
| Date of birth | `dob` | `dob` | `loan_requests.applicant_dob` | Formatted date in detail views |
| Gender | `gender` | `gender` | `loan_requests.applicant_gender` | Detail views |
| House | `addressHouse` | `address_house` | `loan_requests.applicant_address_house` | Detail/edit view |
| Place | `addressPlace` | `address_place` | `loan_requests.applicant_address_street` | Detail/edit view |
| Post/district/PIN | `addressPost`, `addressDistrict`, `addressPin` | corresponding address fields | `applicant_address_city`, `applicant_address_pin`; complete value in `requester_address` | Detail/edit view |
| Occupation | `occupation`, `otherOccupation` | `occupation` | `loan_requests.applicant_occupation` | Detail/edit view |
| Employer | `employerName` | `employer_name` | `loan_requests.applicant_employer_name` | Detail/edit view |
| Monthly income | `monthlyIncome` | `monthly_income` | `loan_requests.monthly_income` | Detail/edit view |
| Income source | `incomeSource` | `income_source` | `loan_requests.income_source` | Detail/edit view |
| Existing debts | `existingDebts`, `existingDebtsDetail` | corresponding fields | `loan_requests.existing_debts`, `existing_debts_detail` | Detail/edit view |
| Requested amount | `amountRequested` | `amount` | `loan_requests.loan_amount_requested`, `approximate_amount` | Detail/edit view |
| Purpose category/details | `purposeCategory`, `purposeDetail` | corresponding fields | `loan_purpose_category`, `loan_purpose_detail`; summary remains in `reason` | Detail/edit view |
| Repayment period | `repaymentMonths` | `months` | `loan_requests.repayment_period_months` | Detail/edit view |
| Witness name/phone/member no. | `witness1*`, `witness2*` | corresponding fields plus `witnesses[]` | Individual verification columns plus canonical `loan_requests.witnesses` JSONB | Dynamic Section C |
| Declaration confirmations | `confirmTruth`, `confirmSchedule` | corresponding fields | `declaration_agreed`, new confirmation columns | Stored; not editable after submission |
| Application reference | `generatedRef` | `application_reference` | `loan_requests.application_reference`; legacy `reason` remains unchanged | Detail and Admin review |

## Root cause

The public form held DOB, gender and witness values in React state, but the save API did not include those fields in `requestPayload`. Witness values were destructured but never persisted. Father, address components, occupation, employer, witness member numbers and declaration details were also omitted. The detail UI consequently received null/empty canonical fields and rendered only two nullable witness columns.

Migration `017_complete_applicant_details.sql` adds the missing canonical columns, a JSONB witness collection, safe backfill from already-saved reason text for DOB/gender/witness values, and copies the same data to formal loan rows without changing references or repayment records.

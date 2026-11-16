# Phase 7 — Applicant Tracking: Backend & Database Audit

**Scope:** existing public loan application tracking (`/request/:memberCode/track`, `/request/track`).

## 1. Current implementation (before this phase)

| Layer | Location | Notes |
|---|---|---|
| Page | `src/pages/ApplicantTracking.tsx` | Single form requiring **both** application reference **and** registered mobile number |
| API | `api/track-application.js` | Single `POST` handler with `action`-based routing |
| Route | `src/App.tsx` | `/request/track` and `/request/:code/track` → `ApplicantTracking` |

The API also serves witness verification (`witness_view`, `witness_respond`) for `src/pages/WitnessVerify.tsx` and applicant editing (`edit`). These paths are unchanged.

## 2. Database objects in use

| Table | Purpose | Relevant columns |
|---|---|---|
| `loan_requests` | One row per submitted application | `id`, `application_reference` (unique partial index), `applicant_phone`, `requester_phone`, `applicant_name`, `requester_name`, `created_at` |
| `loans` | Loan created after approval | `id`, `source_request_id`, `status`, `workflow_status`, `disbursement_date`, `updated_at` |
| `applicant_tracking_challenges` | OTP challenges | `loan_request_id`, `phone_hash`, `otp_hash`, `request_ip_hash`, `attempts`, `max_attempts` (default 5), `expires_at`, `consumed_at` |
| `applicant_tracking_sessions` | Verified tracking sessions | `token_hash` (PK), `loan_request_id`, `expires_at`, `last_used_at` |
| `application_status_events` | Applicant-visible workflow events | `loan_request_id`, `status_code`, `actor_type`, `applicant_visible_note`, `created_at` |
| `witness_verifications` | Witness consent state | `witness_index`, `status`, `issued_at`, `responded_at` |
| `repayment_installments` | Repayment schedule | `loan_id`, `installment_number`, `due_date`, `amount_due`, `amount_paid`, `status` |

All of the above are **service-role only** (RLS enabled, no anon/authenticated policies). No browser code touches them directly.

## 3. Application reference generation

`api/submit-loan-application.js` → `newReferenceCandidate()`:

```
SKSSF-LN-<UTC year>-<8 random digits>
```

Uniqueness is checked server-side (5 attempts) and enforced by
`loan_requests_application_reference_unique` (migration 018).

## 4. Applicant mobile number

- Canonical field: `loan_requests.applicant_phone` with fallback `loan_requests.requester_phone`.
- Public and member-filed submissions both validate `/^\d{10}$/` before insert.
- Historical rows may contain a country prefix; the API normalizes by stripping
  non-digits and keeping the last 10 digits.

## 5. Existing OTP infrastructure

| Channel | Implementation | Used by |
|---|---|---|
| SMS (Twilio) | `sendSms()` inside `api/track-application.js`, env `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_DEFAULT_COUNTRY_CODE` | Applicant tracking |
| Email (SMTP/nodemailer) | `api/otp.js`, `witness_otps` table | Witness email OTP |

**No new provider was introduced.** Applicant tracking continues to use the existing Twilio SMS path.

## 6. Gaps found and fixed

1. `send` required reference **and** phone, and rejected mismatches — applicants who knew only one value could not proceed.
2. No mobile-only lookup existed.
3. A single verification session unlocked exactly one application, so a phone number with multiple applications had no path.
4. OTP lifetime was 10 minutes (PRD requires 5).
5. No resend cooldown was enforced server-side.
6. Failure responses differed from success responses, allowing reference/phone enumeration.
7. `details` did not expose the repayment schedule for approved loans.

# SKSSF Portal — Member Direct Filing Parity & Witness Authentication Audit

Date: 2026-11-01
Scope: `/request/:code/apply` (public reference form), `/member/dashboard/filed-loans` (member
"File New Application"), witness verification, and the canonical application data model.
Status: audit only. No implementation started.

---

## 0. Verdict

The member "File New Application" popup is **not** a smaller copy of the public form — it is a
different, disconnected submission path:

- It collects 9 fields. The public form collects 34 fields across 6 steps.
- It has no witnesses at all, so no witness verification can exist for member-filed applications.
- It calls `/api/submit-loan-application` **without an auth token and without `source_request_id`**,
  which the API rejects (401/400). The code then silently falls back to a **client-side insert into
  `loans`** with a randomly generated `LN-######` number, bypassing the server, the canonical
  reference generator, the history table and every validation rule.
- Witness verification today is **not real**: `/witness-verify/:token` accepts a token derived from
  the loan id, updates the database from the browser, and shows "Witness Verified ✓" even when the
  update throws.

Field parity therefore requires a shared form component and a server-side member submission path,
not a wider modal.

---

## 1. Public reference form inventory (`src/pages/PublicLoanRequest.tsx`)

Six wizard steps. All state is local to the component; validation is a hand-written `validateStep()`
function; submission is a single POST to `/api/submit-loan-application` with
`is_public_referral: true`.

### Step 1 — Personal (`applicant_*`)

| # | Field | Control | Rule | Persisted as |
|---|---|---|---|---|
| 1 | Applicant full name | text | required, min 3 | `applicant_name`, `requester_name` |
| 2 | Father / guardian name | text | required, min 3 | `applicant_father_name` |
| 3 | Date of birth | date | required, age ≥ 18 | `applicant_dob` |
| 4 | Gender | select (Male/Female/Other) | required | `applicant_gender` |
| 5 | Mobile phone | tel, maxLength 10 | required, exactly 10 digits | `applicant_phone`, `requester_phone` |
| 6 | WhatsApp same as mobile | checkbox, default **checked** | — | drives #7 |
| 7 | WhatsApp number | tel, conditional on #6 | required + 10 digits when #6 unchecked | `applicant_whatsapp` |
| 8 | House name / number | text | required | `applicant_address_house` |
| 9 | Place / area | text | required | `applicant_address_street` |
| 10 | Post office | text | required | (folded into `requester_address`) |
| 11 | PIN code | text, maxLength 6 | required, 6 digits | `applicant_address_pin` |
| 12 | District | text, default `Kannur` | required | `applicant_address_city` |
| — | Composed address | derived | — | `requester_address` = "house, place, post P.O., district - pin" |

### Step 2 — Employment & financials

| # | Field | Control | Rule | Persisted as |
|---|---|---|---|---|
| 13 | Occupation | select, 8 options incl. `Other` | required | `applicant_occupation` |
| 14 | Other occupation | text, conditional | required when #13 = Other | `applicant_occupation` (prefixed `Other:`) |
| 15 | Employer / business | text | optional | `applicant_employer_name` |
| 16 | Monthly income | number | required, ≥ 1000 | `monthly_income` |
| 17 | Income source | text | required | `income_source` |
| 18 | Existing debts | checkbox | — | `existing_debts` |
| 19 | Debts detail | textarea, conditional | required when #18 checked | `existing_debts_detail` |

### Step 3 — Loan specifications

| # | Field | Control | Rule | Persisted as |
|---|---|---|---|---|
| 20 | Requested amount | number | required, 1000–50000 | `loan_amount_requested`, `approximate_amount`, `amount` |
| 21 | Purpose category | select, 8 options | required | `loan_purpose_category` |
| 22 | Other purpose | text, conditional | required when #21 = Other | `loan_purpose_category` (prefixed) |
| 23 | Detailed purpose | textarea | required, min 20 chars | `loan_purpose_detail` |
| 24 | Repayment period | 3 radio cards (1/2/3 months) | required, default 3 | `repayment_period_months`, `months` |
| — | EMI preview | derived display | amount / months | not persisted |

### Step 4 — Witnesses (exactly two, both mandatory)

| # | Field | Control | Rule | Persisted as |
|---|---|---|---|---|
| 25 | Witness 1 name | text | required, min 3 | `witness1_name`, `witnesses[0].name` |
| 26 | Witness 1 phone | tel, maxLength 10 | required, 10 digits | `witness1_phone`, `witnesses[0].phone` |
| 27 | Witness 1 membership no. | text | optional | `witness1_member_no`, `witnesses[0].member_no` |
| 28 | Witness 2 name | text | required, min 3 | `witness2_name`, `witnesses[1].name` |
| 29 | Witness 2 phone | tel, maxLength 10 | required, 10 digits | `witness2_phone`, `witnesses[1].phone` |
| 30 | Witness 2 membership no. | text | optional | `witness2_member_no`, `witnesses[1].member_no` |

No relationship-to-applicant field and no witness address field exist in the reference form.

### Step 5 — Declaration

| # | Field | Control | Rule | Persisted as |
|---|---|---|---|---|
| 31 | Truth confirmation | checkbox | must be true | `declaration_truth_confirmed` |
| 32 | Repayment schedule agreement | checkbox | must be true | `declaration_schedule_confirmed` |
| 33 | Malayalam declaration text | static block | — | — |
| 34 | Signature pad | **removed** from the form | — | — |

### Step 6 — Review

Read-only summary of steps 1–4 with "Edit" shortcuts, then "Submit Application to Poyanad Committee".

### Not present in the reference form

- No file or document uploads.
- No Aadhaar/ID capture in the UI (the API accepts an unused `aadhaar_last4`).
- No draft persistence; refreshing loses state.
- No relationship or witness-address fields.

These must **not** be invented for the member form; parity means matching what exists.

---

## 2. Member "File New Application" today

Location: `src/pages/dashboard/FiledLoans.tsx` — modal state lines 17–28, handler 75–207, markup
449–612.

| Field | Present | Notes |
|---|---|---|
| Applicant name | yes | min 3 |
| Applicant phone | yes | 10 digits |
| WhatsApp | yes | optional, free text |
| Full address | yes | single textarea |
| Loan amount | yes | min 1000, **no 50 000 maximum** |
| Repayment months | yes | free number 1–36, **not the 1/2/3 rule** |
| Purpose category | yes | 5 options, **different values** from the public 8 |
| Purpose detail | yes | min 20 |
| Member assessment notes | yes | min 15 (server Path B requires 20) |
| Father, DOB, gender, structured address, occupation, employer, income, income source, existing debts, witnesses, declarations | **no** | absent |

Submission behaviour:

1. POST `/api/submit-loan-application` with no `Authorization` header and no `source_request_id`.
2. API path B requires a bearer token → 401, so the call always fails.
3. Fallback inserts directly into `loans` from the browser with `loan_no = 'LN-' + random6`,
   `status: 'pending'`, and a second reduced retry if the first insert errors.
4. Result: a `loans` row with no `loan_requests` source, no application reference, no witnesses, no
   history, no status event, and a reference format that contradicts `SKSSF-LN-YYYY-XXXXXXXX` and
   `PYD-IL-2026-*`.

---

## 3. Field-by-field comparison

Legend: ✅ identical, ⚠️ partial/different rule, ❌ missing.

| Public form field | Member popup | Target member page |
|---|---|---|
| Full name | ✅ | ✅ shared component |
| Father name | ❌ | ✅ |
| DOB | ❌ | ✅ |
| Gender | ❌ | ✅ |
| Phone | ✅ | ✅ |
| WhatsApp same-as-phone toggle | ❌ | ✅ |
| WhatsApp number | ⚠️ always shown, optional | ✅ conditional |
| House / place / post / PIN / district | ⚠️ one textarea | ✅ five structured fields |
| Occupation (+ Other) | ❌ | ✅ |
| Employer | ❌ | ✅ |
| Monthly income | ❌ | ✅ |
| Income source | ❌ | ✅ |
| Existing debts (+ detail) | ❌ | ✅ |
| Amount (1000–50 000) | ⚠️ min only | ✅ |
| Purpose category (8 values) | ⚠️ 5 different values | ✅ |
| Other purpose | ❌ | ✅ |
| Purpose detail (min 20) | ✅ | ✅ |
| Repayment period (1/2/3 cards) | ⚠️ free 1–36 | ✅ |
| EMI preview | ❌ | ✅ |
| Witness 1 name/phone/member no. | ❌ | ✅ |
| Witness 2 name/phone/member no. | ❌ | ✅ |
| Truth + schedule declarations | ❌ | ✅ |
| Review step | ❌ | ✅ |
| Member assessment notes | ✅ (min 15) | ✅ (min 20, server-aligned) |
| Member relationship | ❌ | ✅ required by server Path B |

---

## 4. Canonical data model and current flows

```
Public applicant ──POST is_public_referral──▶ loan_requests  (status DRAFT_UNASSIGNED)
                                                   │           application_reference
                                                   │           witnesses JSONB + witness1/2_*
                                                   │           loan_application_versions v1
                                                   ▼
Member inbox ──review / edit / dismiss──▶ apply_loan_request_edit RPC (versioned)
                                                   │
Member forward ──POST source_request_id──▶ loans (workflow_status PENDING_COORDINATOR_REVIEW)
                                                   │   source_request_id, request JSONB snapshot
                                                   ▼
Coordinator → panel votes → admin decision → repayments
```

- `loan_requests` is the canonical **application** (pre-forwarding).
- `loans` is the authoritative **formal review record**.
- One `loan_requests` row can produce at most one `loans` row
  (`loans_source_request_unique`).
- References: new ones are server-generated `SKSSF-LN-YYYY-XXXXXXXX`; legacy
  `PYD-IL-2026-*` are preserved.

The member popup bypasses all of this by inserting into `loans` directly, which is why its rows have
`LN-######` numbers and no source request.

---

## 5. Witness machinery today

### 5.1 Data

- `loan_requests`: `witness1_name/phone/member_no/status/verified_at`,
  `witness2_*`, and `witnesses JSONB` (array of `{name, phone, member_no, status, verified_at}`).
- `loans`: the same columns, copied on forward.
- No token table, no event table, no expiry, no revocation.

### 5.2 `/witness-verify/:token` (`src/pages/WitnessVerify.tsx`)

- Token format `WV-<loanId>-<witnessIndex>` — derived from the loan id, **guessable and unsigned**.
- Loads the loan with the **anon browser client**, falling back to a hard-coded mock loan when the id
  is unknown (`Rizwan`, `9876543210`, …) so any token "works".
- Writes `witnessN_status` / `witnessN_verified_at` **from the browser** to `loans` and
  `loan_requests`.
- On any error it still renders "Witness Verified ✓" (catch block sets the success state).
- No expiry, no single use, no rate limit, no server authorization, no audit trail.

### 5.3 Admin side (`src/pages/dashboard/LoanManagement.tsx`)

- Builds the same `WV-` token inline (line ~693) for a WhatsApp link.
- Displays witness status from `witnesses` JSONB or `witnessN_status`.

This is the component the new requirement replaces: link-based consent must be server-issued,
hashed, single-use, expiring and audited, and must never be presented as proof of WhatsApp number
ownership.

---

## 6. Roles and access control

| Actor | Scope | Enforcement today |
|---|---|---|
| Applicant (public) | own application by reference + mobile + OTP | `api/track-application.js`, hashed challenges, sessions |
| Member | `loan_requests.referred_member_id = auth.uid()`, own `loans.submitted_by_member_id` | Bearer token → `profiles` lookup in API + RLS policies |
| Admin / Super | all rows | RLS `*_admin_select/all` policies + API role checks |
| Coordinator | assigned loans, panel votes | `workflow_status` checks in API |
| Witness (public) | one witness row only | **nothing secure today** |

RLS is enabled on `loan_requests`, `loans`, `loan_application_versions`,
`application_status_events`, `applicant_tracking_challenges`, `applicant_tracking_sessions`.
`api/*` uses the service role after verifying the caller, so RLS is not the only gate.

---

## 7. Gaps to close

| # | Gap | Impact |
|---|---|---|
| G1 | No shared form component; public form is a single 1 138-line page | parity impossible to maintain |
| G2 | Member popup is 9 fields, no witnesses | cannot satisfy sections A/B/C |
| G3 | Popup bypasses the API and writes `loans` directly | non-canonical rows, fake references |
| G4 | No member-authenticated "file on behalf of applicant" API path | server cannot trust the client |
| G5 | No witness token table / event table | no secure verification |
| G6 | `WitnessVerify` is client-trusted and shows false success | security defect |
| G7 | No member witness management panel (send / shared / regenerate) | requirement 6 unmet |
| G8 | No applicant-facing witness progress | requirement 8 unmet |
| G9 | Filed loan detail has no witness section | requirement 9 unmet |
| G10 | Editing witnesses does not revoke links | requirement 10 unmet |
| G11 | Vercel Hobby caps the deployment at 12 serverless functions (currently exactly 12) | any new `api/*.js` file breaks deployment |
| G12 | Public `resolve-member-code` leaks member UUID/phone/role | enumeration risk (pre-existing) |

G11 is a hard constraint: the new endpoints must live inside the existing
`submit-loan-application.js`, `track-application.js` and `get-member-inbox.js` files.

---

## 8. Proposed implementation

### 8.1 Shared form (fixes G1, G2, G3)

Extract the reference form into reusable units without changing its behaviour:

```
src/features/loan-application/
  types.ts                  LoanApplicationDraft, WitnessDraft
  validation.ts             validateStep(step, draft, { maxAmount })
  options.ts                occupation / purpose / gender / month option lists
  useLoanApplicationForm.ts state + step navigation + payload builder
  LoanApplicationWizard.tsx presentational 6-step wizard (sections, review, footer)
  MemberFilingContext.tsx   member identity banner + member-only fields
```

- `/request/:code/apply` renders `<LoanApplicationWizard mode="public" />`.
- `/member/dashboard/filed-loans/new` renders `<LoanApplicationWizard mode="member" />` inside
  `DashboardLayout`.
- Both call one `submitApplication()` service (`src/features/loan-application/submit.ts`) that posts
  to the same endpoint with a different mode and, for members, a bearer token.

The wizard keeps the exact field set, order, copy, validation and conditional logic of today's form.
No field is added that the reference form does not have, except the member-only assessment notes and
relationship, which already exist in the server's Path B contract.

### 8.2 Member submission (fixes G4, keeps one canonical record)

Extend `api/submit-loan-application.js` with `mode: 'member_direct'` (no new function, G11):

1. Require `Authorization: Bearer <jwt>`; resolve `profiles` row; allow `member`, `admin`, `super`.
2. Apply the same server-side validation as the public path, plus relationship (required) and
   assessment notes (min 20).
3. Insert the canonical `loan_requests` row: `referred_member_id = member.id`,
   `application_reference = createApplicationReference()`, full applicant + witness columns,
   `witnesses` JSONB with per-witness verification state, `status = 'CONVERTED'`.
4. Insert the `loans` row with `source_request_id`, `submitted_by_member_id = member.id`,
   `submission_source = 'MEMBER_DIRECT'`, `workflow_status = 'PENDING_COORDINATOR_REVIEW'`, and the
   full request snapshot.
5. Set `converted_to_loan_id`, write `loan_application_versions` v1, write status events
   (`SUBMITTED`, `UNDER_ADMIN_REVIEW`).
6. Issue two witness verification tokens (hashed) in the same transaction.
7. Return `{ success, reference, loanId, requestId }`.

Idempotency: a client-supplied `client_request_id` (UUID) stored on the request prevents duplicate
submissions on retry.

### 8.3 Witness verification schema (migration 019, fixes G5)

```
witness_verifications
  id uuid pk, loan_request_id uuid fk, loan_id uuid fk null,
  witness_index smallint (1|2), witness_name text, witness_phone_last4 text,
  token_hash text unique not null, status text (PENDING|VERIFIED|DECLINED|EXPIRED|REVOKED),
  issued_at, expires_at, first_viewed_at, responded_at, consumed_at,
  shared_at, share_channel, revoked_at, revoked_reason, replaced_by uuid,
  created_by uuid, last_activity_at

witness_verification_events   (append-only)
  id, verification_id, loan_request_id, event_type, actor_type, actor_id,
  metadata jsonb, created_at
```

RPCs (SECURITY DEFINER, `service_role` only):

- `issue_witness_verification(request_id, witness_index, ttl)` → returns raw token once.
- `respond_witness_verification(token_hash, decision, note)` → atomic single-use transition;
  rejects expired/consumed; writes the event; syncs `witnessN_status`/`verified_at` on
  `loan_requests` and `loans` and the `witnesses` JSONB.
- `revoke_witness_verification(verification_id, reason)` → REVOKED + event.
- `mark_witness_shared(verification_id, channel)` → event only, never claims delivery.

RLS enabled on both tables; no anon access; members read their own request's verifications; admins
read all.

### 8.4 Witness endpoints (G11-safe)

- `api/track-application.js` gains `action: 'witness_view' | 'witness_respond'`:
  - `witness_view` accepts a raw token, hashes it, returns only the minimum (applicant name,
    reference, witness name, masked number, expiry, current status). Constant-time miss for unknown
    tokens; rate limited per IP hash.
  - `witness_respond` records VERIFIED/DECLINED once, server timestamp, no client trust.
- `api/get-member-inbox.js` gains `action: 'witness_issue' | 'witness_shared' | 'witness_status'`
  with ownership checks (member must own the request or be admin/super).

### 8.5 Pages and panels

| Requirement | Change |
|---|---|
| Dedicated member page | new route `/member/dashboard/filed-loans/new`; popup and its fallback insert deleted |
| Member witness panel | new section in `FiledLoanDetail.tsx`: name, masked number, relationship, sharing state, consent state, last activity, per-witness "Send WhatsApp" (wa.me link with prefilled text incl. unique URL), "Mark as shared", "Regenerate link" |
| Applicant progress | `ApplicantTracking.tsx` details view gains a witness progress block + the "No action is required" notice |
| Admin/Coordinator | `LoanManagement.tsx` and `CoordinatorLoanDetail.tsx` read the same verification rows (status, events, manual-share audit) |
| Editing | `apply_loan_request_edit` call sites revoke + reissue when witness identity/number changes |

### 8.6 Renewed consent rule (requirement 10)

- Witness name or phone change → revoke old link, issue a new one, keep the old events.
- Applicant identity, amount, or purpose category change → existing consents stay recorded but are
  flagged `reconsent_required` in the event metadata for admin review; no silent re-verification.
- Post-forwarding edits remain blocked by the existing RPC (`55000`).

---

## 9. Security controls

- 32-byte `crypto.randomBytes` tokens, base64url; only SHA-256 `hash(secret + token)` stored.
- Single use, 7-day default expiry, revocation and regeneration.
- Server-side authorization on every witness call; no client-supplied status, timestamps or roles.
- Masked phone numbers in every list view; full number only to the owning member/admin.
- Rate limiting per IP hash and per token hash.
- Append-only event history for create / view / share / respond / revoke.
- Wording must state that link consent is not independent proof of WhatsApp number ownership.

---

## 10. Acceptance mapping

| # | Criterion | Verified by |
|---|---|---|
| 1 | Dedicated page, no modal | route + DOM check |
| 2 | All public fields present | field-inventory test comparing both modes |
| 3–5 | Sections A/B/C work | step validation tests |
| 6 | Two witnesses saved | DB assertion on `witnesses` + `witness_verifications` |
| 7–10 | Submission, identities, reference | DB assertion: `loan_requests` + `loans` rows, `submitted_by_member_id`, `SKSSF-LN-…` |
| 11–12 | Links + WhatsApp targets | token row + generated `wa.me` URL |
| 13–15 | Status visible to applicant/member/admin | API responses per role |
| 16 | Edit revokes link | before/after token status |
| 17 | Unauthorized access denied | 401/403 probes |
| 18 | Public form unchanged | regression run of `/request/:code/apply` |
| 19 | Editing/repayments intact | existing flows re-tested |

---

## 11. Open decisions

1. **Member-filed applications go straight to `PENDING_COORDINATOR_REVIEW`** (as the popup claims)
   rather than sitting in the member's own inbox. This matches "visible in Filed Loans" and the
   existing `loans` pipeline.
2. **Relationship field**: the server's Path B already requires it; the popup never collected it.
   The member page must add it (member-only field, not part of applicant parity).
3. **SMS/WhatsApp**: no WhatsApp Cloud API; links are `https://wa.me/<number>?text=…` and the member
   records manual sharing. Delivery is never claimed.

---

## 12. Sequencing

1. Migration 019 + RPCs (no UI change, safe to apply first).
2. Shared form extraction with the public form rendering unchanged.
3. Member page + route; delete the popup and its client-side insert.
4. Member submission mode in the existing API.
5. Witness endpoints + rewritten `/witness-verify/:token`.
6. Member panel, applicant progress, admin/coordinator views.
7. Edit revocation, then tests, deploy, production verification.

Each step keeps the 12-function limit and reuses the canonical tables.

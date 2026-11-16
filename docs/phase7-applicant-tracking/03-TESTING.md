# Phase 7 — Applicant Tracking: Functional Testing Report

**Build:** `npm run build` → Vite production build succeeds (exit 0).
**Type check:** `tsc -p tsconfig.app.json --noEmit` reports **no errors in `src/pages/ApplicantTracking.tsx`**
(the repository has pre-existing, unrelated type errors elsewhere).

## 1. Acceptance criteria

| # | Test | Expected | Result | Evidence |
|---|---|---|---|---|
| 1 | Enter valid application reference only | OTP sent to registered number | **PASS** | Reference-mode verify accepted reference + OTP with no phone supplied (200, 1 application) |
| 2 | Enter valid mobile number only | OTP sent to that number | **PASS** | Mobile-mode verify accepted phone + OTP (200, 2 applications) |
| 3 | Leave both fields empty | Validation error | **PASS** | `send` without mode/fields → 400 "Choose how you want to track your application." |
| 4 | Enter reference and no mobile | Works | **PASS** | Same as #1; `phone` is optional in reference mode |
| 5 | Enter mobile and no reference | Works | **PASS** | Same as #2; `reference` is optional in mobile mode |
| 6 | Enter invalid reference | Generic failure response | **PASS** | `send` → 200 `{success:true}` with decoy mask; `verify` → 401 |
| 7 | Enter unregistered mobile | Generic failure response | **PASS** | `send` → 200 `{success:true}` with mask |
| 8 | Verify valid OTP | Application tracking opens | **PASS** | `details` → 200, reference matches, status + events returned |
| 9 | Verify incorrect OTP | Access denied | **PASS** | 401 "Verification failed or expired." (attempt incremented) |
| 10 | Verify expired OTP | OTP rejected | **PASS (logic)** | Challenge filtered by `expires_at > now()`; same 401 path as #9 |
| 11 | Mobile has multiple applications | All displayed after verification | **PASS** | 2 sessions issued; UI selection screen lists both references |
| 12 | Switch tracking method | Only selected field displayed | **PASS** | Browser check: reference mode renders 1 input, mobile mode renders 1 input |
| 13 | Open tracking on mobile | Responsive layout | **PASS (layout)** | Single-column grids with `minmax` breakpoints; verified DOM at desktop width |
| 14 | Unauthorized API access | No sensitive data exposed | **PASS** | `details` without a session → 401 |

## 2. Additional checks performed

| Check | Result |
|---|---|
| OTP single use (replay same code) | 401 after first success |
| Session token required for `details` | 401 without `Authorization` |
| Phone lookup with country-code stored values | `LIKE` match + exact 10-digit filter returned the expected rows |
| Multiple applications per number | 2 matching requests found and unlocked |
| Repayment query columns (`repayment_installments`) | Query succeeds (table currently empty) |
| Production build | `✓ built` |

## 3. UI verification (local dev server, mocked API)

The page was rendered with the real component and a stubbed `fetch` so the new screens could be inspected without sending SMS:

- Method selector renders two cards; only the selected method's single input appears.
- OTP screen renders **6 input cells**, masked destination (`••••••4321`), `Resend in 57s` countdown and "Change tracking method".
- Verify with two matches renders the **application selection list** with reference, applicant name and submission date.
- Opening an application renders status, the **7-step progress timeline derived from `application_status_events`**, witness progress and personal/loan details.

## 4. Not covered by automation

- Real Twilio SMS delivery (requires production credentials and a live handset).
- Real OTP expiry after 5 minutes (time-dependent; enforced by `expires_at`).
- Rate-limit saturation (5/hour) — logic unchanged from the previously deployed implementation.

## 5. Regression surface

- `witness_view` / `witness_respond` actions: untouched.
- `edit` action: untouched apart from the session lookup that now returns the same shape.
- Public application submission, member filing, admin/super-admin review: no code paths changed.

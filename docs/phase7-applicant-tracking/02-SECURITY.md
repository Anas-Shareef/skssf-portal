# Phase 7 — Applicant Tracking: Security Verification

## 1. Lookup methods

| Method | Input | Server behaviour |
|---|---|---|
| `mode: "reference"` | Application reference only | Looks up `loan_requests` by `application_reference`; the destination number is read from `applicant_phone` / `requester_phone`. The browser never supplies or receives the full number before verification. |
| `mode: "mobile"` | 10-digit mobile only | Normalizes the number, matches `applicant_phone` / `requester_phone`, and sends the OTP to the number the applicant typed. |

Neither method requires the other field.

## 2. OTP handling

| Control | Implementation |
|---|---|
| Generation | `crypto.randomInt(100000, 1000000)` — cryptographically secure, 6 digits |
| Storage | SHA-256 HMAC-style hash with `APPLICANT_TRACKING_SECRET`; plaintext OTP is never stored |
| Expiry | **5 minutes** (`expires_at`) |
| Attempts | `max_attempts = 5`; each wrong code increments `attempts` with an optimistic `eq('attempts', n)` guard |
| Single use | `consumed_at` set on success; later verifies find no valid challenge |
| Resend cooldown | 60 seconds per destination number (server-side check on `created_at`) |
| Rate limits | 5 OTP requests per IP per hour and 5 per destination number per hour |
| Channel | Existing Twilio SMS configuration only |

## 3. Enumeration resistance

- Unknown reference and unregistered mobile both return **HTTP 200** with the same generic message.
- Unknown references receive a deterministic decoy mask (`••••••1234` derived from a hash) so the response shape matches a real send.
- `verify` failures always return the same `Verification failed or expired.` message (401) and never reveal which factor failed.
- No application reference, name, amount or status is returned until OTP verification succeeds.
- OTP delivery failures (Twilio outage) delete the challenge and return a configuration/availability error that does not depend on whether the application exists.

## 4. Session security

- Verification issues `trk_<64 hex chars>` tokens; only the SHA-256 hash is stored in `applicant_tracking_sessions`.
- Sessions expire after **15 minutes**, are bound to one `loan_request_id`, and update `last_used_at`.
- `details` and `edit` require `Authorization: Bearer <token>`; an unauthenticated call returns 401 (verified).
- Mobile verification issues one session per matching application (capped at 10), so selecting an application does not widen access to others.

## 5. Data exposure

- `safeApplication()` returns only applicant-visible fields; no internal IDs, reviewer notes or service credentials.
- Repayment schedules are returned only when the loan is approved/disbursed and come from `repayment_installments`.
- All database access is server-side with the service role; RLS on `applicant_tracking_challenges`, `applicant_tracking_sessions` and `application_status_events` remains "no policies" (service-role only).

## 6. Edge cases handled

1. Invalid reference → generic 200 on send, 401 on verify.
2. Mobile with no application → generic 200 on send.
3. Mobile with several applications → all unlocked after verification, list shown for selection.
4. Wrong OTP → 401, attempts incremented.
5. Expired OTP → challenge filtered out by `expires_at`, 401.
6. Repeated requests → 60 s cooldown, then 5/hour limits.
7. Application without a usable mobile → generic response plus an on-screen instruction to contact the branch office; identity verification is never bypassed.
8. Rejected / approved applications → status and timeline reflect stored records; repayment schedule shown when present.
9. Changing method → client resets the flow; the backend keys challenges by mode-specific factors.
10. Multiple applications with different statuses → each opened through its own session.
11. Country-code formats → normalized to the last 10 digits on both sides.

## 7. Residual risks / notes

- SMS delivery depends on Twilio credentials and DLT registration; a provider outage surfaces as `Applicant SMS verification is temporarily unavailable.`
- The tracking reference is the only secret in reference mode, so the 5/hour IP and phone limits remain important.
- `applicant_tracking_challenges` and `applicant_tracking_sessions` grow over time; periodic cleanup of expired rows is recommended (no retention job exists yet).

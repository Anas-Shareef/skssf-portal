# Phase 7 — Deployment Summary

## Commit

| Item | Value |
|---|---|
| Commit | `a726532` — `feat(tracking): single-field reference or mobile verification with multi-application selection` |
| Previous production commit | `a1dd398` |
| Branch | `main` |
| Remote | `https://github.com/Anas-Shareef/skssf-portal.git` |
| Push | `a1dd398..a726532  main -> main` |

## Files changed

| File | Change |
|---|---|
| `api/track-application.js` | Reference-only and mobile-only lookup, 5-minute OTPs, 60 s resend cooldown, enumeration-safe responses, multi-application sessions, repayment schedule in `details` |
| `src/pages/ApplicantTracking.tsx` | Method selector, conditional single-field forms, 6-cell OTP input with cooldown, application selection list, status timeline, repayment table |
| `docs/phase7-applicant-tracking/*` | Audit, security, testing and deployment reports |

## Deployment verification (production)

Probes against `https://skssf-portal.vercel.app`:

| Probe | Result |
|---|---|
| `POST /api/track-application` with `{"action":"send"}` | `400 {"error":"Choose how you want to track your application."}` — the **new** validation message, so the new function is live |
| `GET /request/track` bundle `/assets/index-C_KG4CQj.js` | Contains `Find applications using my registered mobile number`, `Choose how you would like to find your loan application`, `Verify & Track Application`, `Change tracking method`, `Resend in` — the **new** UI is live |
| Edge | `X-Vercel-Id: bom1::hnd1` (India) |

## ⚠️ Known blocker: SMS provider credentials

Both production probes that require sending a code return:

```
{"error":"Applicant SMS verification is not configured yet."}
```

`api/track-application.js` requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`.
The Vercel project that this workspace is linked to (`skssf-main`) only has Supabase variables, and the
`skssf-portal` project behaves the same way. This is a **pre-existing** configuration gap (it was already
recorded in `docs/production-implementation-audit-2026-11-01.md`), not a regression from this change.

`APPLICANT_TRACKING_SECRET` **is** configured in production (otherwise the handler would have returned
"Applicant tracking verification is not configured." before reaching the SMS check).

**To make tracking work end-to-end**, add these variables to the `skssf-portal` Vercel project
(Production environment) and redeploy:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+91...
TWILIO_DEFAULT_COUNTRY_CODE=91
```

No code change is needed after that.

## Rollback

```
git revert a726532
git push origin main
```

The API remains backwards compatible during rollout: requests without `mode` are treated as reference mode,
and the `phone` field is ignored there, so a cached old frontend keeps working.

## Post-deploy checklist

1. Add the Twilio variables above and redeploy.
2. Open `https://skssf-portal.vercel.app/request/track`.
3. Test reference-only: enter a real reference → OTP arrives → verify → details open.
4. Test mobile-only with a number that has 2+ applications → both listed → open each.
5. Test a wrong OTP 5 times → "Too many incorrect attempts".
6. Confirm the resend button is disabled for 60 seconds.

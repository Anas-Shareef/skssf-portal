# Member Apply, Referral Application and Copy Link Fix Report

**Production:** `https://skssf-portal.vercel.app`  
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`  
**Test reference supplied:** `PYD-IL-2026-35814`  
**Referring member:** Rizwan (`0bb52e0c-4a26-42de-af84-f48663a22016`)  
**Fix commit:** `619fe1a`  
**Date:** 2026-11-01

## 1. Executive result

The page was **dynamic but broken**, not static:

- Counters were intended to use live `loan_requests` data.
- The query referenced nonexistent `loan_requests.member_id`, causing PostgreSQL `42703`.
- The error was swallowed, leaving all cards at zero.
- The inbox used a separate privileged endpoint and broader name/free-text matching, so it could show records that the counters did not count.
- The public form generated the reference number only in React state. It did not send or persist that reference.
- The public form displayed success even when its fallback insert failed.
- Copy Link called `navigator.clipboard.writeText()` without awaiting or handling rejection.

The fix uses the live `referred_member_id` relationship, persists the application reference in the existing `loan_requests.reason` trace field, makes success conditional on a confirmed API insert, hardens member actions, and adds a clipboard fallback with visible failure handling.

No database schema or RLS policy was changed. No duplicate production application was created.

## 2. Phase 1 — supplied reference trace

### Search result

The exact value `PYD-IL-2026-35814` was searched in:

- `public.loans.loan_no`
- `public.loan_requests.reason`
- `public.loan_requests` records available through the live schema

Result: **no exact match**.

The live `loan_requests` schema has no structured application-reference column. The public page created `PYD-IL-2026-35814` at `PublicLoanRequest.tsx:246`, displayed it at the success screen, but the API payload did not contain it. Therefore the reference was not searchable after submission.

### Closest live referral record

The newest live referral record, created during the supplied test flow, is:

```text
loan_requests.id: 9264402f-2744-43f5-bd1f-463f831bf7d6
status: DRAFT_UNASSIGNED
referred_member_id: 0bb52e0c-4a26-42de-af84-f48663a22016
converted_to_loan_id: null
```

This record is correctly associated with Rizwan and is awaiting member action. Because the old reference was never persisted, the database cannot prove that `PYD-IL-2026-35814` belongs to this row by reference alone. The row is identified by the submission timing and referral association, not by the missing reference.

No matching `loans` row exists for `PYD-IL-2026-35814`. The referral was not duplicated by the investigation.

## 3. Counter implementation and fixes

### Total Applications Received

**Source:** `src/pages/dashboard/LoanApplication.tsx`, `loadLinkStats()`.

Before:

```ts
.select('id, status')
.or(`member_id.eq.${memberId},referred_member_id.eq.${memberId}`)
```

This failed because `member_id` does not exist in live `loan_requests`.

After:

```ts
.select('id, status, converted_to_loan_id')
.eq('referred_member_id', memberId)
```

Rows are deduplicated by request UUID before counting. Total includes all valid request rows associated with the member referral, including completed or dismissed history; status is not silently used to remove received applications.

### Pending in Inbox

Pending is calculated from the same live referral query and includes:

```text
NEW, REVIEWED, DRAFT_UNASSIGNED, DRAFT
```

The member inbox now also uses only `referred_member_id` as its ownership relationship. It no longer authorizes access through `referred_member_name` or free-text `reason` matches.

### Submitted to Admin

Submitted is counted when either:

- `loan_requests.converted_to_loan_id` is populated, or
- status is `SUBMITTED` / `CONVERTED`.

The formal member submission endpoint now requires an authenticated member and verifies that the source request’s `referred_member_id` equals the authenticated user. It ignores a spoofed member UUID in the request body and writes the authenticated user to `loans.submitted_by_member_id`.

`CONVERTED` means the member submission step created a loan. It does not mean an administrator approved the loan; approval remains represented by the loan workflow status.

## 4. Public referral workflow fixes

### Before

1. `PublicLoanRequest.tsx` generated a reference locally.
2. It sent only `referred_member_id` / `referred_member_name`.
3. The API inserted `loan_requests` without the reference.
4. If the API failed, the client attempted an anonymous fallback insert.
5. The client set `success=true` even when the fallback insert errored.

### After

1. The public form sends `referral_code` and `application_reference`.
2. `api/submit-loan-application.js` resolves the referral code server-side to the profile UUID and name. It does not trust a client-supplied member UUID for attribution.
3. The reference is persisted in the existing `loan_requests.reason` field as `Application Reference: PYD-IL-2026-xxxxx` and returned by the API.
4. The success screen is shown only after the API returns success.
5. The unsafe direct anonymous fallback insert was removed.
6. Formal member submission requires a bearer token and verifies ownership of `source_request_id`.
7. Member review/dismiss actions now use authenticated `api/update-member-request.js`, which verifies `referred_member_id` before updating.

## 5. Copy Link fix

### Root cause

`LoanApplication.tsx:67-71` called `navigator.clipboard.writeText(requestUrl)` without `await` or a `catch`. It immediately displayed “Link copied” even when the browser rejected the promise.

### Fix

`handleCopyLink()` now:

1. Awaits `navigator.clipboard.writeText()` in secure production contexts.
2. Falls back to a hidden textarea and `document.execCommand('copy')` when Clipboard API is unavailable.
3. Displays “Link copied to clipboard!” only after success.
4. Displays “Copy failed. Please select and copy the link manually.” on failure.
5. Keeps the URL derived from the authenticated member’s stable `member_unique_code` / code and does not change it on refresh.

For Rizwan, the expected URL remains:

```text
https://skssf-portal.vercel.app/request/MBR-0BB5
```

## 6. Security changes

- Member counters use only `referred_member_id`.
- Member inbox no longer trusts names or free-text application descriptions for authorization.
- Review and dismiss endpoints verify the bearer token and request ownership.
- Formal submission verifies the source request ownership server-side.
- Public referral attribution is resolved server-side from the referral code.
- No anonymous SELECT policy was added.
- No RLS policy was weakened.
- Existing applicant data was not deleted or duplicated.

## 7. Verification

### Live database evidence before deployment

Safe aggregate inspection showed:

```text
loan_requests total rows: 3
status totals: DRAFT_UNASSIGNED: 3
Rizwan referral-ID rows: 2
Rizwan referral-ID converted rows: 0
Rizwan submitted loans: 3
Rizwan submitted loans with source_request_id: 0
Exact PYD-IL-2026-35814 matches: 0
```

The two Rizwan referral-ID rows are member-owned and pending. One older legacy row without `referred_member_id` was not treated as authoritative after the fix.

### Build

```text
npm run build: PASS
```

The existing Vite warnings about unsupported Tailwind at-rules and bundle size remain non-blocking.

### Expected post-deploy behavior

For Rizwan, the Apply page will count the two authoritative referral rows:

```text
Total Applications Received: 2
Pending in Inbox: 2
Submitted to Admin: 0
```

After one request is reviewed:

```text
Total: 2
Pending: 2
Submitted: 0
```

After that request is submitted to admin and converted:

```text
Total: 2
Pending: 1
Submitted: 1
```

The page refetches on mount, profile restoration, window focus, and visible-tab changes. No polling or duplicate realtime subscriptions were added.

## 8. Files changed

- `src/pages/dashboard/LoanApplication.tsx`
- `src/pages/PublicLoanRequest.tsx`
- `src/pages/dashboard/MemberInbox.tsx`
- `api/submit-loan-application.js`
- `api/update-member-request.js`

## 9. Deployment

```text
Commit: 619fe1a
Message: fix(referrals): persist public references and repair member application counters
Branch: main
Build: PASS
```

Production deployment is triggered from GitHub `main`. Final production browser verification must confirm the deployed bundle contains the new counter query and clipboard handler. The old supplied reference cannot be retroactively recovered because it was never persisted; new submissions now persist the reference in the request trace and return it from the API.

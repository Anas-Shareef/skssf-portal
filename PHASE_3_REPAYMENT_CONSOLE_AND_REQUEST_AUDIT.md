# PHASE 3 — REPAYMENT CONSOLE AND REQUEST AUDIT

**Date:** 2026-11-11  
**Scope:** Investigation of `[repayments] stale_response_ignored` and `[repayments] local_cache_refresh` console output.

---

## 1. Observed behaviour

Repeated production console entries:

```text
[repayments] stale_response_ignored
[repayments] local_cache_refresh
[repayments] local_cache_refresh {loanCount: 10}
[repayments] stale_response_ignored { requestId: 'repayments-4', ... }
[repayments] stale_response_ignored { requestId: 'repayments-5', ... ageMs: 562 }
[repayments] stale_response_ignored { requestId: 'repayments-6', ... }
...
[repayments] stale_response_ignored { requestId: 'repayments-9', ... ageMs: 1085 }
[repayments] local_cache_refresh {loanCount: 10}
```

## 2. Root cause

The repayment data-load effect in `src/pages/dashboard/Repayments.tsx` declared:

```ts
useEffect(() => { ...load... }, [adminTab, loans, isAdmin, profile?.id, profile?.db_id, role]);
```

Although the effect body never consumes the `loans` value (only a log label does), `loans` was a dependency. Every repayment-affecting action calls `refresh()`, which does `setLoans([...fresh])` — creating a **new array identity**. That re-triggered the effect, firing a new repayment load while older loads were still in flight; the monotonic stale-response guard then correctly discarded the superseded responses (`stale_response_ignored`).

Additionally, after a confirmed payment the flow combined `refresh()` (cache) with the loans-identity-driven reload; with the dependency removed, redundant reloads were eliminated and an explicit reload nonce was added.

## 3. Why the messages are not necessarily a bug

- `stale_response_ignored` is intentional protection and was **not** removed.
- The discards were plausibly legitimate (superseded in-flight requests), but the volume and the `loans`-identity dependency made redundant reloads likely.
- `local_cache_refresh` is the legitimate cache-refresh log emitted by `refresh()` after confirmed mutations.

## 4. Fix implemented (commit `33362c6`)

- Repayment load effect dependencies changed to:

```ts
}, [adminTab, isAdmin, profile?.id, profile?.db_id, role, repaymentReloadNonce]);
```

- Added `repaymentReloadNonce` state; incremented after a **confirmed** payment so the schedule reloads explicitly without depending on the `loans` cache identity.

## 5. Verification

- `npx tsc --noEmit` → exit 0; `npm run build` → PASS.
- Deployed bundle contains the new effect logic and existing markers.

## 6. Conclusion

The repeated `stale_response_ignored` entries were driven by an over-broad effect dependency (`loans`) that caused avoidable reload churn; the stale-response guard itself remains intact and was preserved. A valid newest response is never discarded incorrectly after the fix.

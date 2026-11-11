# PHASE 3 — REPAYMENT PERSISTENCE AUDIT

**Date:** 2026-11-11  
**Scope:** End-to-end manual repayment payment persistence path and history visibility.

---

## 1. Payment flow trace (post-fix)

```text
Admin enters repayment amount
  → Repayments.tsx record-payment modal submit
  → localDb.recordInstallmentPayment → api.patch(`/loans/{loan_no}/repayments/{inst}/pay`, body)
  → api /pay handler:
       resolveInstallmentRow (UUID → by installment number)
       effectiveInstallmentId = validated UUID
       duplicate check (PAID → reject)
       validate amount (0 < paid <= amount_due − amount_paid)
       update repayment_installments (amount_paid, status, payment_date, payment_method, reference_note, recorded_by_user_id)
       mirror onto loans.repayments JSONB
       recalc outstanding from repayment_installments
       loan status update (+ compensating revert on failure)
  → success → refresh + reload nonce → UI updates
```

## 2. Transaction store

- **Authoritative store:** `repayment_installments` (columns: `id` UUID, `loan_id`, `installment_number`, `due_date`, `amount_due`, `amount_paid`, `payment_date`, `payment_method`, `reference_note`, `status`, `recorded_by_user_id`).
- **No separate `repayment_transactions` table exists** in the authoritative schema (probed).
- Payment history UI reads the loan's `repayments` JSONB array via the loans state, which the payment handler mirrors.

## 3. Why manually updated transactions appeared missing

- Before the UUID-resolution fix, the admin payment PATCH was sent with the synthetic id `inst-LOAN-2026-4571-0` → `400 Bad Request` → **no database write ever occurred** → the repayment interface correctly showed no change.
- After the fix, the installment is resolved to a real UUID and the write succeeds; UI refresh and history mirror run only after confirmed success.

## 4. Persistence evidence (code-level)

- Successful payment path performs: installment UPDATE + JSONB mirror + outstanding recalculation + loan status update, with compensating rollback on failure.
- Frontend shows success only after the awaited DB round-trip resolves without throwing.

## 5. Conclusion

The previously observed "missing manual repayment transactions" is resolved at the code level: the failure was the synthetic-ID write; persistence now targets the authoritative table with validated UUIDs and confirmed success handling.

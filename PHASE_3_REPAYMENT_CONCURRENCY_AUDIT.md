# PHASE 3 — REPAYMENT CONCURRENCY AUDIT

**Date:** 2026-11-11

## 1. Current payment implementation

- Handler reads installment state, validates balance, computes new total, updates installment, mirrors JSONB, recalculates outstanding, updates loan status, compensating revert on failure.

## 2. Concurrency analysis

- No explicit row-level lock (`SELECT … FOR UPDATE`) or server-side re-validation inside a single transaction is used in the current Supabase-JS implementation.
- Two simultaneous submissions could theoretically read the same prior balance before either writes.

## 3. Risk assessment

- **Real integrity risk:** theoretical (read-modify-write race).
- **Practical risk:** low for single-admin sequential usage; no duplicate submission path exists once status becomes `PAID`.

## 4. Decision

- A PostgreSQL transaction / RPC with row locking, atomic balance validation and idempotency key was **not** added during this phase (task constraint: avoid complex migration unless risk demonstrated).
- Current compensating-rollback design mitigates partial-state writes but does not eliminate the read/write race.

## 5. Conclusion

Concurrency hardening (RPC/transaction) remains recommended for strict multi-admin financial integrity; no action taken in this phase beyond documenting the design gap.

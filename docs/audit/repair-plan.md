# SKSSF Portal — Prioritized Repair Plan
**Audit Date:** 2026-10-29
**Auditor:** Antigravity
**Status:** READY FOR REVIEW — DO NOT IMPLEMENT without user approval

---

## Priority Guide

- P0 — Critical: Security or data loss risk, fix before any deployment
- P1 — High: Core functionality broken for real users
- P2 — Medium: Incorrect data shown; fallback exists
- P3 — Low: Code smell, UX polish, minor consistency

---

## P0: Critical Security / Data Integrity

### P0-A: Fix RLS on repayment_installments

**Problem (SI-002 / LR-003):**
```sql
CREATE POLICY "installments_member" ON repayment_installments
  FOR ALL USING (TRUE);
```
Any authenticated user can update ANY installment — including marking other members' debts as paid or modifying payment amounts.

**Proposed fix — Supabase SQL:**
```sql
-- Drop the permissive policy
DROP POLICY IF EXISTS "installments_member" ON repayment_installments;

-- Allow anyone authenticated to read their own loans' installments
-- (join via loans table)
CREATE POLICY "installments_member_read" ON repayment_installments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      WHERE l.id = repayment_installments.loan_id
        AND (l.submitted_by_member_id = auth.uid() OR l.filed_by_member_id = auth.uid())
    )
  );

-- Allow admins/super to do anything
CREATE POLICY "installments_admin_full" ON repayment_installments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super')
    )
  );
```

**Files affected:** Supabase dashboard only (SQL editor). No code changes required.

### P0-B: Fix RLS on loan_requests

**Problem (SI-003):**
```sql
CREATE POLICY "loan_requests_member_own" ON loan_requests
  FOR ALL USING (TRUE);
```

**Proposed fix:**
```sql
DROP POLICY IF EXISTS "loan_requests_member_own" ON loan_requests;

-- Members see only their own referred requests
CREATE POLICY "loan_requests_member_read" ON loan_requests
  FOR SELECT
  USING (
    referred_member_id = auth.uid()
    OR member_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super','coordinator'))
  );

-- Anyone can insert (public form submission)
CREATE POLICY "loan_requests_public_insert" ON loan_requests
  FOR INSERT WITH CHECK (TRUE);

-- Only admin/super/coordinator can update
CREATE POLICY "loan_requests_admin_update" ON loan_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super','coordinator'))
  );
```

### P0-C: Remove /admin/reset endpoint or add role guard

**Problem (D-006):**
`api.ts` has a `/admin/reset` path that deletes all loans, products, campaigns, donations. Any authenticated call triggers this.

**Proposed fix in `api.ts`:**
```typescript
if (path === '/admin/reset') {
  // Verify the requester is super
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) throw new Error('Unauthenticated');
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!prof || prof.role !== 'super') throw new Error('Forbidden');
  // ... rest of delete logic
}
```

Or better: remove the endpoint entirely from production.

### P0-D: Remove local-token fallback from auth login

**Problem (D-004):**
If Supabase auth fails, a fake `local-token-*` is created that bypasses authentication entirely.

**Proposed fix in `api.ts`:**
```typescript
// Remove Tier 2 local auth entirely, OR restrict to development:
if (path === '/auth/login') {
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) {
    // In production, fail clearly
    return { error: result.error.message };
    // Do NOT fall through to localStorage lookup
  }
  // ...
}
```

---

## P1: Core Functionality — Repayment Data Visible to Members

### P1-A: Add JSONB fallback to member repayment pages

**Problem (LR-001 / D-001):**
`MemberRepayments.tsx` and `FiledLoanDetail.tsx` query `repayment_installments` directly. This table has 0 rows. Members see empty repayment schedules even for approved loans.

**Option 1 (recommended): Add fallback in component**

`MemberRepayments.tsx` — update `loadRepayments()`:
```typescript
// After fetching installments:
if (instData && instData.length === 0 && loanIds.length > 0) {
  // Fall back to loans.repayments JSONB
  const { data: loansWithRep } = await supabase
    .from('loans')
    .select('id, repayments, applicant_name, applicant_phone, ...')
    .in('id', loanIds);

  const synthetic = [];
  for (const loan of (loansWithRep || [])) {
    (loan.repayments || []).forEach((r: any, idx: number) => {
      synthetic.push({
        id: `${loan.id}-${idx}`,  // synthetic id
        loan_id: loan.id,
        installment_number: idx + 1,
        due_date: r.due,
        amount_due: r.amt,
        amount_paid: r.paid_amount || (r.paid ? r.amt : 0),
        status: r.paid ? 'PAID' : (new Date(r.due) < new Date() ? 'OVERDUE' : 'PENDING'),
        payment_date: r.paid_date || null,
        payment_method: r.method || null,
        reference_note: r.notes || null,
        applicantName: loan.applicant_name || loan.requester_name,
        applicantPhone: loan.applicant_phone || loan.requester_phone,
        _source: 'jsonb'  // flag to disable payment recording for JSONB-sourced rows
      });
    });
  }
  setInstallments(synthetic);
}
```

**Option 2 (longer-term): Migrate existing repayments to installments table**

Run a one-time migration that reads each loan's `repayments` JSONB and inserts corresponding rows into `repayment_installments`. This permanently fixes the data model.

```sql
-- Migration: backfill repayment_installments from loans.repayments JSONB
INSERT INTO repayment_installments (
  loan_id,
  installment_number,
  due_date,
  amount_due,
  amount_paid,
  status,
  payment_date,
  payment_method,
  reference_note
)
SELECT
  l.id AS loan_id,
  (idx + 1) AS installment_number,
  (rep->>'due')::date AS due_date,
  (rep->>'amt')::numeric AS amount_due,
  COALESCE((rep->>'paid_amount')::numeric, 
    CASE WHEN rep->>'paid' IS NOT NULL AND rep->>'paid' != 'null' 
      THEN (rep->>'amt')::numeric 
      ELSE 0 
    END
  ) AS amount_paid,
  CASE 
    WHEN rep->>'paid' IS NOT NULL AND rep->>'paid' != 'null' THEN 'PAID'
    WHEN (rep->>'due')::date < CURRENT_DATE THEN 'OVERDUE'
    ELSE 'PENDING'
  END AS status,
  CASE WHEN rep->>'paid_date' IS NOT NULL AND rep->>'paid_date' != 'null'
    THEN (rep->>'paid_date')::date 
    ELSE NULL
  END AS payment_date,
  rep->>'method' AS payment_method,
  rep->>'notes' AS reference_note
FROM loans l,
  jsonb_array_elements(l.repayments) WITH ORDINALITY AS t(rep, idx)
WHERE l.repayments IS NOT NULL
  AND jsonb_array_length(l.repayments) > 0
ON CONFLICT (loan_id, installment_number) DO NOTHING;
```

> WARNING: Run this on a test database first. Verify row counts match before applying to production.

### P1-B: Fix member Dashboard to show live Supabase data

**Problem (D-010):**
Member dashboard reads from `localDb` cache. If bootstrap fails or user has no cached data, the dashboard is empty.

**Proposed fix in `src/pages/dashboard/member/Dashboard.tsx`:**
```typescript
// Replace localDb read with direct Supabase query
const memberId = profile?.db_id || profile?.id;

const { data: myLoans } = await supabase
  .from('loans')
  .select('id, loan_no, name, amount, status, workflow_status, created_at, repayments')
  .or(`filed_by_member_id.eq.${memberId},submitted_by_member_id.eq.${memberId}`)
  .order('created_at', { ascending: false });
```

---

## P2: Data Consistency

### P2-A: Surface bootstrap failure to users

**Problem (D-003):**
`syncFromBackend()` fails silently. Admin dashboards show no data with no error message.

**Proposed fix in `src/lib/localDb.ts`:**
```typescript
export async function syncFromBackend() {
  try {
    // ... existing logic
    setBootstrapError(null);
  } catch (err) {
    console.warn('Backend bootstrap sync failed', err);
    setBootstrapError('Data could not be loaded. Please refresh the page.'); // surface to UI
  }
}
```

And in Dashboard components:
```tsx
{bootstrapError && (
  <div className="alert-error">
    {bootstrapError} <button onClick={syncFromBackend}>Retry</button>
  </div>
)}
```

### P2-B: Fix inbox query to use member_id / referred_member_id instead of email

**Problem (D-009):**
The inbox query uses `ilike %email%` which can match unrelated records.

**Proposed fix in `MemberInbox.tsx`:**
```typescript
const memberId = profile?.db_id || profile?.id;

const { data } = await supabase
  .from('loan_requests')
  .select('*')
  .or(`referred_member_id.eq.${memberId},member_id.eq.${memberId}`)
  .order('created_at', { ascending: false });
```

### P2-C: Backfill submitted_by_member_id on legacy loans

**Problem (SI-006):**
Legacy loans have null `submitted_by_member_id` and `filed_by_member_id`. Member filed-loans query returns no results for these.

**Approach:**
- For each legacy loan, check if `user_id` (legacy field) maps to a profile.
- Backfill `submitted_by_member_id = user_id` where user_id is not null.

```sql
UPDATE loans
SET submitted_by_member_id = user_id::uuid
WHERE submitted_by_member_id IS NULL
  AND filed_by_member_id IS NULL
  AND user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = user_id::uuid);
```

---

## P3: Code Quality

### P3-A: Remove hardcoded loan patch
Remove the `LOAN-2026-0001` special-case from `localDb.ts`. If the underlying loan data in Supabase is wrong, fix it in the database, not in application code.

### P3-B: Consolidate amt / amount columns
Pick one authoritative column for loan principal. Recommend keeping `amount` (already used in most contexts), add a DB-level generated column or deprecate `amt`.

### P3-C: Add Supabase RLS for loans table
Verify and add explicit RLS policy:
```sql
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- Members see only their own loans
CREATE POLICY "loans_member_own" ON loans
  FOR SELECT
  USING (
    submitted_by_member_id = auth.uid()
    OR filed_by_member_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super','coordinator'))
  );

-- Only admin/super can insert/update
CREATE POLICY "loans_admin_write" ON loans
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super'))
  );
```

Note: this would break the admin bootstrap which reads all loans. Bootstrap should run via serverless function (service-role key bypasses RLS).

---

## Recommended Repair Order

1. **Apply P0-A, P0-B** (RLS fixes) — Supabase SQL editor, no code changes, zero deployment risk
2. **Apply P0-C** (reset guard) — small code change to `api.ts`
3. **Apply P0-D** (remove local-token) — targeted change to auth path in `api.ts`
4. **Apply P1-A** (repayment fallback) — add JSONB fallback to `MemberRepayments.tsx` and `FiledLoanDetail.tsx`
5. **Run P1-A Option 2 SQL** (optional — backfill installments) — only after verifying on staging
6. **Apply P1-B** (member dashboard direct Supabase)
7. **Apply P2-A/B/C** (data quality fixes)
8. **Apply P3-A/B/C** (code quality)

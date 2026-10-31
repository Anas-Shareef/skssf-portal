-- SKSSF Portal: Security Hardening & Strict RLS Policies Migration
-- Apply this script in the Supabase Dashboard SQL Editor (Project: jgxzdwbixqhkjrdbhnlc)

-- 1. Ensure RLS is enabled on critical tables
ALTER TABLE IF EXISTS public.repayment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_checkouts ENABLE ROW LEVEL SECURITY;

-- 2. Clean up any overly permissive or duplicate policies on repayment_installments
DROP POLICY IF EXISTS "Public full access repayment_installments" ON public.repayment_installments;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.repayment_installments;
DROP POLICY IF EXISTS "Allow anon read/write" ON public.repayment_installments;
DROP POLICY IF EXISTS "installments_member_read" ON public.repayment_installments;
DROP POLICY IF EXISTS "installments_admin_all" ON public.repayment_installments;
DROP POLICY IF EXISTS "repayment_installments_select_policy" ON public.repayment_installments;
DROP POLICY IF EXISTS "repayment_installments_admin_manage" ON public.repayment_installments;

-- 3. Policy: Admins and Super-Admins have full access to repayment_installments
CREATE POLICY "repayment_installments_admin_all"
ON public.repayment_installments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super')
  )
);

-- 4. Policy: Members can only read repayment_installments for loans they submitted
CREATE POLICY "repayment_installments_member_select"
ON public.repayment_installments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = repayment_installments.loan_id
      AND loans.submitted_by_member_id = auth.uid()
  )
);

-- 5. Policy: Members can only update installments for their own loans via approved workflows (or rely on serverless api)
CREATE POLICY "repayment_installments_member_update"
ON public.repayment_installments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = repayment_installments.loan_id
      AND loans.submitted_by_member_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = repayment_installments.loan_id
      AND loans.submitted_by_member_id = auth.uid()
  )
);

-- 6. Clean up policies on loan_requests
DROP POLICY IF EXISTS "Public full access loan_requests" ON public.loan_requests;
DROP POLICY IF EXISTS "loan_requests_admin_all" ON public.loan_requests;
DROP POLICY IF EXISTS "loan_requests_member_select" ON public.loan_requests;
DROP POLICY IF EXISTS "loan_requests_member_insert" ON public.loan_requests;

CREATE POLICY "loan_requests_admin_all"
ON public.loan_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super')
  )
);

CREATE POLICY "loan_requests_member_select"
ON public.loan_requests
FOR SELECT
TO authenticated
USING (
  member_id = auth.uid()
);

CREATE POLICY "loan_requests_member_insert"
ON public.loan_requests
FOR INSERT
TO authenticated
WITH CHECK (
  member_id = auth.uid()
);

-- 7. Add unique constraint on (loan_id, installment_number) if not present to ensure schedule generation idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_loan_installment_number'
  ) THEN
    ALTER TABLE public.repayment_installments
      ADD CONSTRAINT uq_loan_installment_number UNIQUE (loan_id, installment_number);
  END IF;
END $$;


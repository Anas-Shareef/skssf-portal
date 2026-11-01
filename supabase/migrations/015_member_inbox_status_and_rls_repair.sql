-- SKSSF Portal: member inbox status/RLS repair
--
-- Production currently uses loan_requests.referred_member_id as the
-- ownership key. Do not use member_id: that column is not present in the
-- production table. Public submissions are written by the server API with
-- the service role; browser clients are never granted public write access.

BEGIN;

-- Keep the existing request lifecycle and preserve every existing value while
-- allowing the lifecycle values used by the deployed inbox/admin workflow.
ALTER TABLE IF EXISTS public.loan_requests
  DROP CONSTRAINT IF EXISTS loan_requests_status_check;

ALTER TABLE IF EXISTS public.loan_requests
  ADD CONSTRAINT loan_requests_status_check
  CHECK (status IN (
    'DRAFT',
    'DRAFT_UNASSIGNED',
    'REVIEWED',
    'SUBMITTED',
    'CONVERTED',
    'DISMISSED'
  ));

-- A source request can produce at most one admin loan. Existing duplicate
-- rows, if any, must be reviewed before applying this index; this statement
-- intentionally fails rather than deleting or merging production data.
CREATE UNIQUE INDEX IF NOT EXISTS loans_source_request_unique
  ON public.loans(source_request_id)
  WHERE source_request_id IS NOT NULL;

-- loan_requests ownership is the referral UUID. The server API uses the
-- service role for public inserts and authenticated member mutations.
ALTER TABLE IF EXISTS public.loan_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loan_requests_member_own" ON public.loan_requests;
DROP POLICY IF EXISTS "loan_requests_admin_all" ON public.loan_requests;
DROP POLICY IF EXISTS "loan_requests_member_select" ON public.loan_requests;
DROP POLICY IF EXISTS "loan_requests_member_insert" ON public.loan_requests;

CREATE POLICY "loan_requests_admin_all"
ON public.loan_requests
FOR ALL TO authenticated
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

CREATE POLICY "loan_requests_member_select"
ON public.loan_requests
FOR SELECT TO authenticated
USING (referred_member_id = auth.uid());

-- Repayment data remains private to the member who filed the loan and to
-- administrators. Server-side repayment APIs use the service role.
ALTER TABLE IF EXISTS public.repayment_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "repayment_installments_admin_all" ON public.repayment_installments;
DROP POLICY IF EXISTS "repayment_installments_member_select" ON public.repayment_installments;
DROP POLICY IF EXISTS "repayment_installments_member_update" ON public.repayment_installments;

CREATE POLICY "repayment_installments_admin_all"
ON public.repayment_installments
FOR ALL TO authenticated
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

CREATE POLICY "repayment_installments_member_select"
ON public.repayment_installments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loans
    WHERE loans.id = repayment_installments.loan_id
      AND loans.submitted_by_member_id = auth.uid()
  )
);

COMMIT;

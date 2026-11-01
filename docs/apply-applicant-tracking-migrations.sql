-- SKSSF Portal applicant tracking/editing enablement

-- ============================================================
-- supabase/migrations/015_member_inbox_status_and_rls_repair.sql
-- ============================================================

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

-- ============================================================
-- supabase/migrations/016_application_versions_and_member_editing.sql
-- ============================================================

-- SKSSF Portal: application editing and append-only version history
-- Run after 015_member_inbox_status_and_rls_repair.sql.

BEGIN;

ALTER TABLE IF EXISTS public.loan_requests
  ADD COLUMN IF NOT EXISTS application_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS witness1_name TEXT,
  ADD COLUMN IF NOT EXISTS witness1_phone TEXT,
  ADD COLUMN IF NOT EXISTS witness1_status TEXT,
  ADD COLUMN IF NOT EXISTS witness2_name TEXT,
  ADD COLUMN IF NOT EXISTS witness2_phone TEXT,
  ADD COLUMN IF NOT EXISTS witness2_status TEXT;

CREATE TABLE IF NOT EXISTS public.loan_application_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  application_version INTEGER NOT NULL,
  edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  editor_role TEXT NOT NULL CHECK (editor_role IN ('applicant', 'member', 'admin', 'super')),
  previous_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  edit_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (loan_request_id, application_version)
);

CREATE INDEX IF NOT EXISTS loan_application_versions_request_idx
  ON public.loan_application_versions(loan_request_id, application_version);

-- Preserve an original snapshot for every existing request. This is
-- idempotent and does not alter the request or any loan/repayment record.
INSERT INTO public.loan_application_versions (
  loan_request_id, application_version, edited_by, editor_role,
  previous_data, updated_data, changed_fields, edit_reason
)
SELECT
  id,
  1,
  NULL,
  'applicant',
  jsonb_build_object(
    'applicant_name', applicant_name,
    'applicant_phone', applicant_phone,
    'applicant_whatsapp', applicant_whatsapp,
    'applicant_dob', applicant_dob,
    'applicant_gender', applicant_gender,
    'requester_address', requester_address,
    'loan_amount_requested', loan_amount_requested,
    'repayment_period_months', repayment_period_months,
    'monthly_income', monthly_income,
    'income_source', income_source,
    'existing_debts', existing_debts,
    'existing_debts_detail', existing_debts_detail,
    'loan_purpose_detail', loan_purpose_detail,
    'witness1_name', witness1_name,
    'witness1_phone', witness1_phone,
    'witness1_status', witness1_status,
    'witness2_name', witness2_name,
    'witness2_phone', witness2_phone,
    'witness2_status', witness2_status
  ),
  jsonb_build_object(
    'applicant_name', applicant_name,
    'applicant_phone', applicant_phone,
    'applicant_whatsapp', applicant_whatsapp,
    'applicant_dob', applicant_dob,
    'applicant_gender', applicant_gender,
    'requester_address', requester_address,
    'loan_amount_requested', loan_amount_requested,
    'repayment_period_months', repayment_period_months,
    'monthly_income', monthly_income,
    'income_source', income_source,
    'existing_debts', existing_debts,
    'existing_debts_detail', existing_debts_detail,
    'loan_purpose_detail', loan_purpose_detail,
    'witness1_name', witness1_name,
    'witness1_phone', witness1_phone,
    'witness1_status', witness1_status,
    'witness2_name', witness2_name,
    'witness2_phone', witness2_phone,
    'witness2_status', witness2_status
  ),
  '[]'::jsonb,
  'Original submission'
FROM public.loan_requests
ON CONFLICT (loan_request_id, application_version) DO NOTHING;

ALTER TABLE public.loan_application_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loan_application_versions_member_select" ON public.loan_application_versions;
DROP POLICY IF EXISTS "loan_application_versions_admin_select" ON public.loan_application_versions;

CREATE POLICY "loan_application_versions_member_select"
ON public.loan_application_versions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loan_requests
    WHERE loan_requests.id = loan_application_versions.loan_request_id
      AND loan_requests.referred_member_id = auth.uid()
  )
);

CREATE POLICY "loan_application_versions_admin_select"
ON public.loan_application_versions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super')
  )
);

-- Only the server-side service-role API can append versions. No authenticated
-- member policy grants INSERT/UPDATE/DELETE on this table.

CREATE OR REPLACE FUNCTION public.apply_loan_request_edit(
  p_request_id UUID,
  p_editor_id UUID,
  p_expected_version INTEGER,
  p_changes JSONB,
  p_edit_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_request public.loan_requests%ROWTYPE;
  previous_data JSONB;
  updated_data JSONB;
  changed_fields JSONB := '[]'::jsonb;
  field_name TEXT;
  old_value JSONB;
  new_value JSONB;
  current_version INTEGER;
  next_version INTEGER;
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid application changes' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_request
  FROM public.loan_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_request.referred_member_id IS DISTINCT FROM p_editor_id THEN
    RAISE EXCEPTION 'Application ownership denied' USING ERRCODE = '42501';
  END IF;
  IF current_request.status <> 'DRAFT_UNASSIGNED' THEN
    RAISE EXCEPTION 'Application editing is locked' USING ERRCODE = '55000';
  END IF;

  current_version := COALESCE(current_request.application_version, 1);
  IF p_expected_version IS DISTINCT FROM current_version THEN
    RAISE EXCEPTION 'Application version conflict' USING ERRCODE = '40001';
  END IF;

  FOR field_name IN SELECT jsonb_object_keys(p_changes) LOOP
    IF field_name NOT IN (
      'applicant_name', 'applicant_phone', 'applicant_whatsapp',
      'applicant_dob', 'applicant_gender', 'requester_address',
      'loan_amount_requested', 'repayment_period_months',
      'monthly_income', 'income_source', 'existing_debts',
      'existing_debts_detail', 'loan_purpose_detail',
      'witness1_name', 'witness1_phone',
      'witness2_name', 'witness2_phone'
    ) THEN
      RAISE EXCEPTION 'Field is not editable: %', field_name USING ERRCODE = '22023';
    END IF;
  END LOOP;

  previous_data := jsonb_build_object(
    'applicant_name', current_request.applicant_name,
    'applicant_phone', current_request.applicant_phone,
    'applicant_whatsapp', current_request.applicant_whatsapp,
    'applicant_dob', current_request.applicant_dob,
    'applicant_gender', current_request.applicant_gender,
    'requester_address', current_request.requester_address,
    'loan_amount_requested', current_request.loan_amount_requested,
    'repayment_period_months', current_request.repayment_period_months,
    'monthly_income', current_request.monthly_income,
    'income_source', current_request.income_source,
    'existing_debts', current_request.existing_debts,
    'existing_debts_detail', current_request.existing_debts_detail,
    'loan_purpose_detail', current_request.loan_purpose_detail,
    'witness1_name', current_request.witness1_name,
    'witness1_phone', current_request.witness1_phone,
    'witness1_status', current_request.witness1_status,
    'witness2_name', current_request.witness2_name,
    'witness2_phone', current_request.witness2_phone,
    'witness2_status', current_request.witness2_status
  );

  updated_data := previous_data || p_changes;
  FOR field_name IN SELECT jsonb_object_keys(p_changes) LOOP
    old_value := previous_data -> field_name;
    new_value := updated_data -> field_name;
    IF old_value IS DISTINCT FROM new_value THEN
      changed_fields := changed_fields || jsonb_build_array(jsonb_build_object(
        'field', field_name,
        'previous_value', old_value,
        'new_value', new_value
      ));
    END IF;
  END LOOP;

  IF changed_fields = '[]'::jsonb THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'application_version', current_version,
      'changed_fields', changed_fields,
      'last_edited_at', current_request.last_edited_at
    );
  END IF;

  -- Backfill the immutable original version for requests created before this
  -- migration, then append the new member edit.
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_application_versions
    WHERE loan_request_id = p_request_id AND application_version = 1
  ) THEN
    INSERT INTO public.loan_application_versions (
      loan_request_id, application_version, edited_by, editor_role,
      previous_data, updated_data, changed_fields, edit_reason
    ) VALUES (
      p_request_id, 1, NULL, 'applicant', previous_data, previous_data,
      '[]'::jsonb, 'Original submission'
    );
  END IF;

  next_version := current_version + 1;
  INSERT INTO public.loan_application_versions (
    loan_request_id, application_version, edited_by, editor_role,
    previous_data, updated_data, changed_fields, edit_reason
  ) VALUES (
    p_request_id, next_version, p_editor_id, 'member',
    previous_data, updated_data, changed_fields, NULLIF(LEFT(p_edit_reason, 500), '')
  );

  UPDATE public.loan_requests
  SET
    applicant_name = CASE WHEN p_changes ? 'applicant_name' THEN NULLIF(p_changes->>'applicant_name', '') ELSE applicant_name END,
    applicant_phone = CASE WHEN p_changes ? 'applicant_phone' THEN NULLIF(p_changes->>'applicant_phone', '') ELSE applicant_phone END,
    requester_phone = CASE WHEN p_changes ? 'applicant_phone' THEN NULLIF(p_changes->>'applicant_phone', '') ELSE requester_phone END,
    applicant_whatsapp = CASE WHEN p_changes ? 'applicant_whatsapp' THEN NULLIF(p_changes->>'applicant_whatsapp', '') ELSE applicant_whatsapp END,
    applicant_dob = CASE WHEN p_changes ? 'applicant_dob' THEN NULLIF(p_changes->>'applicant_dob', '')::date ELSE applicant_dob END,
    applicant_gender = CASE WHEN p_changes ? 'applicant_gender' THEN NULLIF(p_changes->>'applicant_gender', '') ELSE applicant_gender END,
    requester_address = CASE WHEN p_changes ? 'requester_address' THEN NULLIF(p_changes->>'requester_address', '') ELSE requester_address END,
    approximate_amount = CASE WHEN p_changes ? 'loan_amount_requested' THEN (p_changes->>'loan_amount_requested')::numeric ELSE approximate_amount END,
    loan_amount_requested = CASE WHEN p_changes ? 'loan_amount_requested' THEN (p_changes->>'loan_amount_requested')::numeric ELSE loan_amount_requested END,
    repayment_period_months = CASE WHEN p_changes ? 'repayment_period_months' THEN (p_changes->>'repayment_period_months')::integer ELSE repayment_period_months END,
    monthly_income = CASE WHEN p_changes ? 'monthly_income' THEN (p_changes->>'monthly_income')::numeric ELSE monthly_income END,
    income_source = CASE WHEN p_changes ? 'income_source' THEN NULLIF(p_changes->>'income_source', '') ELSE income_source END,
    existing_debts = CASE WHEN p_changes ? 'existing_debts' THEN (p_changes->>'existing_debts')::boolean ELSE existing_debts END,
    existing_debts_detail = CASE WHEN p_changes ? 'existing_debts_detail' THEN NULLIF(p_changes->>'existing_debts_detail', '') ELSE existing_debts_detail END,
    loan_purpose_detail = CASE WHEN p_changes ? 'loan_purpose_detail' THEN NULLIF(p_changes->>'loan_purpose_detail', '') ELSE loan_purpose_detail END,
    witness1_name = CASE WHEN p_changes ? 'witness1_name' THEN NULLIF(p_changes->>'witness1_name', '') ELSE witness1_name END,
    witness1_phone = CASE WHEN p_changes ? 'witness1_phone' THEN NULLIF(p_changes->>'witness1_phone', '') ELSE witness1_phone END,
    witness2_name = CASE WHEN p_changes ? 'witness2_name' THEN NULLIF(p_changes->>'witness2_name', '') ELSE witness2_name END,
    witness2_phone = CASE WHEN p_changes ? 'witness2_phone' THEN NULLIF(p_changes->>'witness2_phone', '') ELSE witness2_phone END,
    application_version = next_version,
    last_edited_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id AND application_version = current_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application version conflict' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'application_version', next_version,
    'updated_data', updated_data,
    'changed_fields', changed_fields,
    'last_edited_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_loan_request_edit(UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_loan_request_edit(UUID, UUID, INTEGER, JSONB, TEXT) TO service_role;

COMMIT;

-- ============================================================
-- supabase/migrations/017_complete_applicant_details.sql
-- ============================================================

-- SKSSF Portal: complete applicant details and witness persistence
-- Run after 015_member_inbox_status_and_rls_repair.sql and
-- 016_application_versions_and_member_editing.sql.

BEGIN;

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS application_reference TEXT,
  ADD COLUMN IF NOT EXISTS applicant_father_name TEXT,
  ADD COLUMN IF NOT EXISTS applicant_occupation TEXT,
  ADD COLUMN IF NOT EXISTS applicant_employer_name TEXT,
  ADD COLUMN IF NOT EXISTS declaration_truth_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS declaration_schedule_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS witness1_member_no TEXT,
  ADD COLUMN IF NOT EXISTS witness1_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS witness2_member_no TEXT,
  ADD COLUMN IF NOT EXISTS witness2_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS witnesses JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS application_reference TEXT,
  ADD COLUMN IF NOT EXISTS applicant_dob DATE,
  ADD COLUMN IF NOT EXISTS applicant_gender TEXT,
  ADD COLUMN IF NOT EXISTS applicant_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_house TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_street TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_city TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_pin TEXT,
  ADD COLUMN IF NOT EXISTS applicant_father_name TEXT,
  ADD COLUMN IF NOT EXISTS applicant_occupation TEXT,
  ADD COLUMN IF NOT EXISTS applicant_employer_name TEXT,
  ADD COLUMN IF NOT EXISTS loan_purpose_category TEXT,
  ADD COLUMN IF NOT EXISTS existing_debts BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS existing_debts_detail TEXT,
  ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS income_source TEXT,
  ADD COLUMN IF NOT EXISTS witness1_name TEXT,
  ADD COLUMN IF NOT EXISTS witness1_phone TEXT,
  ADD COLUMN IF NOT EXISTS witness1_member_no TEXT,
  ADD COLUMN IF NOT EXISTS witness1_status TEXT,
  ADD COLUMN IF NOT EXISTS witness1_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS witness2_name TEXT,
  ADD COLUMN IF NOT EXISTS witness2_phone TEXT,
  ADD COLUMN IF NOT EXISTS witness2_member_no TEXT,
  ADD COLUMN IF NOT EXISTS witness2_status TEXT,
  ADD COLUMN IF NOT EXISTS witness2_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS witnesses JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Recover only values already present in the saved reason summary. This does
-- not invent values and never overwrites a populated canonical column.
UPDATE public.loan_requests
SET
  application_reference = COALESCE(application_reference, NULLIF((regexp_match(reason, 'Application Reference:[[:space:]]*([^[:space:]]+)'))[1], '')),
  applicant_father_name = COALESCE(applicant_father_name, NULLIF(BTRIM((regexp_match(reason, 'Father:[[:space:]]*([^\n]+)'))[1]), '')),
  applicant_dob = COALESCE(applicant_dob, NULLIF((regexp_match(reason, 'DOB:[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1], '')::date),
  applicant_gender = COALESCE(applicant_gender, NULLIF(BTRIM((regexp_match(reason, 'DOB:[^\n]*\(([^)]*)\)'))[1]), '')),
  witness1_name = COALESCE(witness1_name, NULLIF(BTRIM((regexp_match(reason, 'Witness 1:[[:space:]]*([^()]*)'))[1]), '')),
  witness1_phone = COALESCE(witness1_phone, NULLIF(BTRIM((regexp_match(reason, 'Witness 1:[^\n]*\(([0-9+[:space:]-]+)\)'))[1]), '')),
  witness2_name = COALESCE(witness2_name, NULLIF(BTRIM((regexp_match(reason, 'Witness 2:[[:space:]]*([^()]*)'))[1]), '')),
  witness2_phone = COALESCE(witness2_phone, NULLIF(BTRIM((regexp_match(reason, 'Witness 2:[^\n]*\(([0-9+[:space:]-]+)\)'))[1]), ''))
WHERE reason IS NOT NULL;

UPDATE public.loan_requests
SET witnesses = jsonb_build_array(
  jsonb_build_object(
    'name', witness1_name,
    'phone', witness1_phone,
    'member_no', witness1_member_no,
    'status', witness1_status,
    'verified_at', NULL
  ),
  jsonb_build_object(
    'name', witness2_name,
    'phone', witness2_phone,
    'member_no', witness2_member_no,
    'status', witness2_status,
    'verified_at', NULL
  )
)
WHERE (witness1_name IS NOT NULL OR witness1_phone IS NOT NULL
    OR witness2_name IS NOT NULL OR witness2_phone IS NOT NULL)
  AND (witnesses IS NULL OR witnesses = '[]'::jsonb);

-- Extend untouched version-1 snapshots with the newly persisted fields. If a
-- request already has an edit, its original snapshot is left untouched.
UPDATE public.loan_application_versions v
SET
  previous_data = v.previous_data || jsonb_build_object(
    'application_reference', r.application_reference,
    'applicant_father_name', r.applicant_father_name,
    'applicant_occupation', r.applicant_occupation,
    'applicant_employer_name', r.applicant_employer_name,
    'applicant_address_house', r.applicant_address_house,
    'applicant_address_street', r.applicant_address_street,
    'applicant_address_city', r.applicant_address_city,
    'applicant_address_pin', r.applicant_address_pin,
    'witnesses', r.witnesses
  ),
  updated_data = v.updated_data || jsonb_build_object(
    'application_reference', r.application_reference,
    'applicant_father_name', r.applicant_father_name,
    'applicant_occupation', r.applicant_occupation,
    'applicant_employer_name', r.applicant_employer_name,
    'applicant_address_house', r.applicant_address_house,
    'applicant_address_street', r.applicant_address_street,
    'applicant_address_city', r.applicant_address_city,
    'applicant_address_pin', r.applicant_address_pin,
    'witnesses', r.witnesses
  )
FROM public.loan_requests r
WHERE v.loan_request_id = r.id
  AND v.application_version = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.loan_application_versions later
    WHERE later.loan_request_id = v.loan_request_id
      AND later.application_version > 1
  );

-- Keep the authoritative source request and the submitted loan aligned for
-- the existing admin review screens. Existing populated loan values win.
UPDATE public.loans l
SET
  application_reference = COALESCE(l.application_reference, r.application_reference),
  applicant_dob = COALESCE(l.applicant_dob, r.applicant_dob),
  applicant_gender = COALESCE(l.applicant_gender, r.applicant_gender),
  applicant_whatsapp = COALESCE(l.applicant_whatsapp, r.applicant_whatsapp),
  applicant_address = COALESCE(l.applicant_address, r.requester_address),
  applicant_address_house = COALESCE(l.applicant_address_house, r.applicant_address_house),
  applicant_address_street = COALESCE(l.applicant_address_street, r.applicant_address_street),
  applicant_address_city = COALESCE(l.applicant_address_city, r.applicant_address_city),
  applicant_address_pin = COALESCE(l.applicant_address_pin, r.applicant_address_pin),
  applicant_father_name = COALESCE(l.applicant_father_name, r.applicant_father_name),
  applicant_occupation = COALESCE(l.applicant_occupation, r.applicant_occupation),
  applicant_employer_name = COALESCE(l.applicant_employer_name, r.applicant_employer_name),
  loan_purpose_category = COALESCE(l.loan_purpose_category, r.loan_purpose_category),
  existing_debts = CASE WHEN l.existing_debts = FALSE AND r.existing_debts = TRUE THEN TRUE ELSE l.existing_debts END,
  existing_debts_detail = COALESCE(l.existing_debts_detail, r.existing_debts_detail),
  monthly_income = COALESCE(l.monthly_income, r.monthly_income),
  income_source = COALESCE(l.income_source, r.income_source),
  witness1_name = COALESCE(l.witness1_name, r.witness1_name),
  witness1_phone = COALESCE(l.witness1_phone, r.witness1_phone),
  witness1_member_no = COALESCE(l.witness1_member_no, r.witness1_member_no),
  witness1_status = COALESCE(l.witness1_status, r.witness1_status),
  witness2_name = COALESCE(l.witness2_name, r.witness2_name),
  witness2_phone = COALESCE(l.witness2_phone, r.witness2_phone),
  witness2_member_no = COALESCE(l.witness2_member_no, r.witness2_member_no),
  witness2_status = COALESCE(l.witness2_status, r.witness2_status),
  witnesses = CASE WHEN l.witnesses = '[]'::jsonb THEN r.witnesses ELSE l.witnesses END
FROM public.loan_requests r
WHERE r.id = l.source_request_id;

-- Replace the earlier RPC with the complete editable-field set. The
-- function remains service-role-only and performs the history insert plus
-- current-row update in one PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.apply_loan_request_edit(
  p_request_id UUID,
  p_editor_id UUID,
  p_expected_version INTEGER,
  p_changes JSONB,
  p_edit_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_request public.loan_requests%ROWTYPE;
  previous_data JSONB;
  updated_data JSONB;
  changed_fields JSONB := '[]'::jsonb;
  field_name TEXT;
  old_value JSONB;
  new_value JSONB;
  current_version INTEGER;
  next_version INTEGER;
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid application changes' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_request
  FROM public.loan_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_request.referred_member_id IS DISTINCT FROM p_editor_id THEN
    RAISE EXCEPTION 'Application ownership denied' USING ERRCODE = '42501';
  END IF;
  IF current_request.status <> 'DRAFT_UNASSIGNED' THEN
    RAISE EXCEPTION 'Application editing is locked' USING ERRCODE = '55000';
  END IF;

  current_version := COALESCE(current_request.application_version, 1);
  IF p_expected_version IS DISTINCT FROM current_version THEN
    RAISE EXCEPTION 'Application version conflict' USING ERRCODE = '40001';
  END IF;

  FOR field_name IN SELECT jsonb_object_keys(p_changes) LOOP
    IF field_name NOT IN (
      'applicant_name', 'applicant_phone', 'applicant_whatsapp',
      'applicant_dob', 'applicant_gender', 'requester_address',
      'applicant_address_house', 'applicant_address_street',
      'applicant_address_city', 'applicant_address_pin',
      'applicant_father_name', 'applicant_occupation',
      'applicant_employer_name', 'loan_amount_requested',
      'loan_purpose_category', 'loan_purpose_detail',
      'repayment_period_months', 'monthly_income', 'income_source',
      'existing_debts', 'existing_debts_detail', 'witnesses'
    ) THEN
      RAISE EXCEPTION 'Field is not editable: %', field_name USING ERRCODE = '22023';
    END IF;
  END LOOP;

  previous_data := jsonb_build_object(
    'applicant_name', current_request.applicant_name,
    'applicant_phone', current_request.applicant_phone,
    'applicant_whatsapp', current_request.applicant_whatsapp,
    'applicant_dob', current_request.applicant_dob,
    'applicant_gender', current_request.applicant_gender,
    'requester_address', current_request.requester_address,
    'applicant_address_house', current_request.applicant_address_house,
    'applicant_address_street', current_request.applicant_address_street,
    'applicant_address_city', current_request.applicant_address_city,
    'applicant_address_pin', current_request.applicant_address_pin,
    'applicant_father_name', current_request.applicant_father_name,
    'applicant_occupation', current_request.applicant_occupation,
    'applicant_employer_name', current_request.applicant_employer_name,
    'loan_amount_requested', current_request.loan_amount_requested,
    'loan_purpose_category', current_request.loan_purpose_category,
    'loan_purpose_detail', current_request.loan_purpose_detail,
    'repayment_period_months', current_request.repayment_period_months,
    'monthly_income', current_request.monthly_income,
    'income_source', current_request.income_source,
    'existing_debts', current_request.existing_debts,
    'existing_debts_detail', current_request.existing_debts_detail,
    'witnesses', current_request.witnesses
  );
  updated_data := previous_data || p_changes;

  FOR field_name IN SELECT jsonb_object_keys(p_changes) LOOP
    old_value := previous_data -> field_name;
    new_value := updated_data -> field_name;
    IF old_value IS DISTINCT FROM new_value THEN
      changed_fields := changed_fields || jsonb_build_array(jsonb_build_object(
        'field', field_name,
        'previous_value', old_value,
        'new_value', new_value
      ));
    END IF;
  END LOOP;

  IF changed_fields = '[]'::jsonb THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'application_version', current_version,
      'changed_fields', changed_fields,
      'last_edited_at', current_request.last_edited_at
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.loan_application_versions
    WHERE loan_request_id = p_request_id AND application_version = 1
  ) THEN
    INSERT INTO public.loan_application_versions (
      loan_request_id, application_version, edited_by, editor_role,
      previous_data, updated_data, changed_fields, edit_reason
    ) VALUES (
      p_request_id, 1, NULL, 'applicant', previous_data, previous_data,
      '[]'::jsonb, 'Original submission'
    );
  END IF;

  next_version := current_version + 1;
  INSERT INTO public.loan_application_versions (
    loan_request_id, application_version, edited_by, editor_role,
    previous_data, updated_data, changed_fields, edit_reason
  ) VALUES (
    p_request_id, next_version, p_editor_id, 'member',
    previous_data, updated_data, changed_fields, NULLIF(LEFT(p_edit_reason, 500), '')
  );

  UPDATE public.loan_requests
  SET
    applicant_name = CASE WHEN p_changes ? 'applicant_name' THEN NULLIF(p_changes->>'applicant_name', '') ELSE applicant_name END,
    applicant_phone = CASE WHEN p_changes ? 'applicant_phone' THEN NULLIF(p_changes->>'applicant_phone', '') ELSE applicant_phone END,
    requester_name = CASE WHEN p_changes ? 'applicant_name' THEN NULLIF(p_changes->>'applicant_name', '') ELSE requester_name END,
    requester_phone = CASE WHEN p_changes ? 'applicant_phone' THEN NULLIF(p_changes->>'applicant_phone', '') ELSE requester_phone END,
    applicant_whatsapp = CASE WHEN p_changes ? 'applicant_whatsapp' THEN NULLIF(p_changes->>'applicant_whatsapp', '') ELSE applicant_whatsapp END,
    applicant_dob = CASE WHEN p_changes ? 'applicant_dob' THEN NULLIF(p_changes->>'applicant_dob', '')::date ELSE applicant_dob END,
    applicant_gender = CASE WHEN p_changes ? 'applicant_gender' THEN NULLIF(p_changes->>'applicant_gender', '') ELSE applicant_gender END,
    requester_address = CASE WHEN p_changes ? 'requester_address' THEN NULLIF(p_changes->>'requester_address', '') ELSE requester_address END,
    applicant_address_house = CASE WHEN p_changes ? 'applicant_address_house' THEN NULLIF(p_changes->>'applicant_address_house', '') ELSE applicant_address_house END,
    applicant_address_street = CASE WHEN p_changes ? 'applicant_address_street' THEN NULLIF(p_changes->>'applicant_address_street', '') ELSE applicant_address_street END,
    applicant_address_city = CASE WHEN p_changes ? 'applicant_address_city' THEN NULLIF(p_changes->>'applicant_address_city', '') ELSE applicant_address_city END,
    applicant_address_pin = CASE WHEN p_changes ? 'applicant_address_pin' THEN NULLIF(p_changes->>'applicant_address_pin', '') ELSE applicant_address_pin END,
    applicant_father_name = CASE WHEN p_changes ? 'applicant_father_name' THEN NULLIF(p_changes->>'applicant_father_name', '') ELSE applicant_father_name END,
    applicant_occupation = CASE WHEN p_changes ? 'applicant_occupation' THEN NULLIF(p_changes->>'applicant_occupation', '') ELSE applicant_occupation END,
    applicant_employer_name = CASE WHEN p_changes ? 'applicant_employer_name' THEN NULLIF(p_changes->>'applicant_employer_name', '') ELSE applicant_employer_name END,
    approximate_amount = CASE WHEN p_changes ? 'loan_amount_requested' THEN (p_changes->>'loan_amount_requested')::numeric ELSE approximate_amount END,
    loan_amount_requested = CASE WHEN p_changes ? 'loan_amount_requested' THEN (p_changes->>'loan_amount_requested')::numeric ELSE loan_amount_requested END,
    loan_purpose_category = CASE WHEN p_changes ? 'loan_purpose_category' THEN NULLIF(p_changes->>'loan_purpose_category', '') ELSE loan_purpose_category END,
    loan_purpose_detail = CASE WHEN p_changes ? 'loan_purpose_detail' THEN NULLIF(p_changes->>'loan_purpose_detail', '') ELSE loan_purpose_detail END,
    repayment_period_months = CASE WHEN p_changes ? 'repayment_period_months' THEN (p_changes->>'repayment_period_months')::integer ELSE repayment_period_months END,
    monthly_income = CASE WHEN p_changes ? 'monthly_income' THEN (p_changes->>'monthly_income')::numeric ELSE monthly_income END,
    income_source = CASE WHEN p_changes ? 'income_source' THEN NULLIF(p_changes->>'income_source', '') ELSE income_source END,
    existing_debts = CASE WHEN p_changes ? 'existing_debts' THEN (p_changes->>'existing_debts')::boolean ELSE existing_debts END,
    existing_debts_detail = CASE WHEN p_changes ? 'existing_debts_detail' THEN NULLIF(p_changes->>'existing_debts_detail', '') ELSE existing_debts_detail END,
    witnesses = CASE WHEN p_changes ? 'witnesses' THEN p_changes->'witnesses' ELSE witnesses END,
    witness1_name = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->0->>'name', '') ELSE witness1_name END,
    witness1_phone = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->0->>'phone', '') ELSE witness1_phone END,
    witness1_member_no = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->0->>'member_no', '') ELSE witness1_member_no END,
    witness2_name = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->1->>'name', '') ELSE witness2_name END,
    witness2_phone = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->1->>'phone', '') ELSE witness2_phone END,
    witness2_member_no = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->1->>'member_no', '') ELSE witness2_member_no END,
    application_version = next_version,
    last_edited_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id AND application_version = current_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application version conflict' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'application_version', next_version,
    'updated_data', updated_data,
    'changed_fields', changed_fields,
    'last_edited_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_loan_request_edit(UUID, UUID, INTEGER, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_loan_request_edit(UUID, UUID, INTEGER, JSONB, TEXT) TO service_role;

COMMIT;

-- ============================================================
-- supabase/migrations/018_applicant_tracking_and_status_events.sql
-- ============================================================

-- SKSSF Portal: secure applicant tracking, verification sessions and
-- applicant-visible status events.
-- Run after 015, 016 and 017.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS loan_requests_application_reference_unique
  ON public.loan_requests(application_reference)
  WHERE application_reference IS NOT NULL;

ALTER TABLE public.loan_application_versions
  ADD COLUMN IF NOT EXISTS editor_identifier TEXT;

CREATE TABLE IF NOT EXISTS public.applicant_tracking_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  phone_hash TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  request_ip_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS applicant_tracking_challenges_lookup_idx
  ON public.applicant_tracking_challenges(loan_request_id, phone_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS public.applicant_tracking_sessions (
  token_hash TEXT PRIMARY KEY,
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS applicant_tracking_sessions_expiry_idx
  ON public.applicant_tracking_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.application_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  status_code TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('applicant', 'member', 'admin', 'super', 'system')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  applicant_visible_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_status_events_request_idx
  ON public.application_status_events(loan_request_id, created_at);

ALTER TABLE public.applicant_tracking_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_status_events ENABLE ROW LEVEL SECURITY;

-- These tables are intentionally service-role-only. No anonymous or
-- authenticated browser policy can read OTPs, sessions or status events.

CREATE OR REPLACE FUNCTION public.apply_applicant_loan_request_edit(
  p_request_id UUID,
  p_expected_version INTEGER,
  p_changes JSONB,
  p_editor_identifier TEXT DEFAULT 'Verified applicant',
  p_edit_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_request public.loan_requests%ROWTYPE;
  previous_data JSONB;
  updated_data JSONB;
  changed_fields JSONB := '[]'::jsonb;
  field_name TEXT;
  old_value JSONB;
  new_value JSONB;
  current_version INTEGER;
  next_version INTEGER;
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid application changes' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_request
  FROM public.loan_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_request.status <> 'DRAFT_UNASSIGNED' THEN
    RAISE EXCEPTION 'Application editing is locked' USING ERRCODE = '55000';
  END IF;
  IF current_request.converted_to_loan_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.loans WHERE source_request_id = p_request_id) THEN
    RAISE EXCEPTION 'Application editing is locked' USING ERRCODE = '55000';
  END IF;

  current_version := COALESCE(current_request.application_version, 1);
  IF p_expected_version IS DISTINCT FROM current_version THEN
    RAISE EXCEPTION 'Application version conflict' USING ERRCODE = '40001';
  END IF;

  FOR field_name IN SELECT jsonb_object_keys(p_changes) LOOP
    IF field_name NOT IN (
      'applicant_name', 'applicant_phone', 'applicant_whatsapp',
      'applicant_dob', 'applicant_gender', 'requester_address',
      'applicant_address_house', 'applicant_address_street',
      'applicant_address_city', 'applicant_address_pin',
      'applicant_father_name', 'applicant_occupation',
      'applicant_employer_name', 'loan_amount_requested',
      'loan_purpose_category', 'loan_purpose_detail',
      'repayment_period_months', 'monthly_income', 'income_source',
      'existing_debts', 'existing_debts_detail', 'witnesses'
    ) THEN
      RAISE EXCEPTION 'Field is not editable: %', field_name USING ERRCODE = '22023';
    END IF;
  END LOOP;

  previous_data := jsonb_build_object(
    'applicant_name', current_request.applicant_name,
    'applicant_phone', current_request.applicant_phone,
    'applicant_whatsapp', current_request.applicant_whatsapp,
    'applicant_dob', current_request.applicant_dob,
    'applicant_gender', current_request.applicant_gender,
    'requester_address', current_request.requester_address,
    'applicant_address_house', current_request.applicant_address_house,
    'applicant_address_street', current_request.applicant_address_street,
    'applicant_address_city', current_request.applicant_address_city,
    'applicant_address_pin', current_request.applicant_address_pin,
    'applicant_father_name', current_request.applicant_father_name,
    'applicant_occupation', current_request.applicant_occupation,
    'applicant_employer_name', current_request.applicant_employer_name,
    'loan_amount_requested', current_request.loan_amount_requested,
    'loan_purpose_category', current_request.loan_purpose_category,
    'loan_purpose_detail', current_request.loan_purpose_detail,
    'repayment_period_months', current_request.repayment_period_months,
    'monthly_income', current_request.monthly_income,
    'income_source', current_request.income_source,
    'existing_debts', current_request.existing_debts,
    'existing_debts_detail', current_request.existing_debts_detail,
    'witnesses', current_request.witnesses
  );
  updated_data := previous_data || p_changes;

  FOR field_name IN SELECT jsonb_object_keys(p_changes) LOOP
    old_value := previous_data -> field_name;
    new_value := updated_data -> field_name;
    IF old_value IS DISTINCT FROM new_value THEN
      changed_fields := changed_fields || jsonb_build_array(jsonb_build_object(
        'field', field_name,
        'previous_value', old_value,
        'new_value', new_value
      ));
    END IF;
  END LOOP;

  IF changed_fields = '[]'::jsonb THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'application_version', current_version, 'changed_fields', changed_fields, 'last_edited_at', current_request.last_edited_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.loan_application_versions
    WHERE loan_request_id = p_request_id AND application_version = 1
  ) THEN
    INSERT INTO public.loan_application_versions (
      loan_request_id, application_version, edited_by, editor_role,
      editor_identifier, previous_data, updated_data, changed_fields, edit_reason
    ) VALUES (
      p_request_id, 1, NULL, 'applicant', 'Original applicant',
      previous_data, previous_data, '[]'::jsonb, 'Original submission'
    );
  END IF;

  next_version := current_version + 1;
  INSERT INTO public.loan_application_versions (
    loan_request_id, application_version, edited_by, editor_role,
    editor_identifier, previous_data, updated_data, changed_fields, edit_reason
  ) VALUES (
    p_request_id, next_version, NULL, 'applicant', LEFT(p_editor_identifier, 120),
    previous_data, updated_data, changed_fields, NULLIF(LEFT(p_edit_reason, 500), '')
  );

  UPDATE public.loan_requests
  SET
    applicant_name = CASE WHEN p_changes ? 'applicant_name' THEN NULLIF(p_changes->>'applicant_name', '') ELSE applicant_name END,
    applicant_phone = CASE WHEN p_changes ? 'applicant_phone' THEN NULLIF(p_changes->>'applicant_phone', '') ELSE applicant_phone END,
    requester_name = CASE WHEN p_changes ? 'applicant_name' THEN NULLIF(p_changes->>'applicant_name', '') ELSE requester_name END,
    requester_phone = CASE WHEN p_changes ? 'applicant_phone' THEN NULLIF(p_changes->>'applicant_phone', '') ELSE requester_phone END,
    applicant_whatsapp = CASE WHEN p_changes ? 'applicant_whatsapp' THEN NULLIF(p_changes->>'applicant_whatsapp', '') ELSE applicant_whatsapp END,
    applicant_dob = CASE WHEN p_changes ? 'applicant_dob' THEN NULLIF(p_changes->>'applicant_dob', '')::date ELSE applicant_dob END,
    applicant_gender = CASE WHEN p_changes ? 'applicant_gender' THEN NULLIF(p_changes->>'applicant_gender', '') ELSE applicant_gender END,
    requester_address = CASE WHEN p_changes ? 'requester_address' THEN NULLIF(p_changes->>'requester_address', '') ELSE requester_address END,
    applicant_address_house = CASE WHEN p_changes ? 'applicant_address_house' THEN NULLIF(p_changes->>'applicant_address_house', '') ELSE applicant_address_house END,
    applicant_address_street = CASE WHEN p_changes ? 'applicant_address_street' THEN NULLIF(p_changes->>'applicant_address_street', '') ELSE applicant_address_street END,
    applicant_address_city = CASE WHEN p_changes ? 'applicant_address_city' THEN NULLIF(p_changes->>'applicant_address_city', '') ELSE applicant_address_city END,
    applicant_address_pin = CASE WHEN p_changes ? 'applicant_address_pin' THEN NULLIF(p_changes->>'applicant_address_pin', '') ELSE applicant_address_pin END,
    applicant_father_name = CASE WHEN p_changes ? 'applicant_father_name' THEN NULLIF(p_changes->>'applicant_father_name', '') ELSE applicant_father_name END,
    applicant_occupation = CASE WHEN p_changes ? 'applicant_occupation' THEN NULLIF(p_changes->>'applicant_occupation', '') ELSE applicant_occupation END,
    applicant_employer_name = CASE WHEN p_changes ? 'applicant_employer_name' THEN NULLIF(p_changes->>'applicant_employer_name', '') ELSE applicant_employer_name END,
    approximate_amount = CASE WHEN p_changes ? 'loan_amount_requested' THEN (p_changes->>'loan_amount_requested')::numeric ELSE approximate_amount END,
    loan_amount_requested = CASE WHEN p_changes ? 'loan_amount_requested' THEN (p_changes->>'loan_amount_requested')::numeric ELSE loan_amount_requested END,
    loan_purpose_category = CASE WHEN p_changes ? 'loan_purpose_category' THEN NULLIF(p_changes->>'loan_purpose_category', '') ELSE loan_purpose_category END,
    loan_purpose_detail = CASE WHEN p_changes ? 'loan_purpose_detail' THEN NULLIF(p_changes->>'loan_purpose_detail', '') ELSE loan_purpose_detail END,
    repayment_period_months = CASE WHEN p_changes ? 'repayment_period_months' THEN (p_changes->>'repayment_period_months')::integer ELSE repayment_period_months END,
    monthly_income = CASE WHEN p_changes ? 'monthly_income' THEN (p_changes->>'monthly_income')::numeric ELSE monthly_income END,
    income_source = CASE WHEN p_changes ? 'income_source' THEN NULLIF(p_changes->>'income_source', '') ELSE income_source END,
    existing_debts = CASE WHEN p_changes ? 'existing_debts' THEN (p_changes->>'existing_debts')::boolean ELSE existing_debts END,
    existing_debts_detail = CASE WHEN p_changes ? 'existing_debts_detail' THEN NULLIF(p_changes->>'existing_debts_detail', '') ELSE existing_debts_detail END,
    witnesses = CASE WHEN p_changes ? 'witnesses' THEN p_changes->'witnesses' ELSE witnesses END,
    witness1_name = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->0->>'name', '') ELSE witness1_name END,
    witness1_phone = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->0->>'phone', '') ELSE witness1_phone END,
    witness1_member_no = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->0->>'member_no', '') ELSE witness1_member_no END,
    witness2_name = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->1->>'name', '') ELSE witness2_name END,
    witness2_phone = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->1->>'phone', '') ELSE witness2_phone END,
    witness2_member_no = CASE WHEN p_changes ? 'witnesses' THEN NULLIF(p_changes->'witnesses'->1->>'member_no', '') ELSE witness2_member_no END,
    application_version = next_version,
    last_edited_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id AND application_version = current_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application version conflict' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('request_id', p_request_id, 'application_version', next_version, 'updated_data', updated_data, 'changed_fields', changed_fields, 'last_edited_at', NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.apply_applicant_loan_request_edit(UUID, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_applicant_loan_request_edit(UUID, INTEGER, JSONB, TEXT, TEXT) TO service_role;

COMMIT;

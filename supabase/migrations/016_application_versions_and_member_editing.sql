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

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

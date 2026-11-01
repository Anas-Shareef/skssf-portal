-- ============================================================
-- 019_witness_verification_and_member_filing.sql
-- ============================================================
--
-- Adds the minimum schema required for:
--   1. Server-issued, hashed, single-use, expiring witness verification links.
--   2. An append-only witness verification event history.
--   3. A member-filed application marker + idempotency key on loan_requests.
--
-- Existing data is preserved. Nothing is truncated, reset or rewritten.
-- Tokens are never stored in plain text; only a SHA-256 hash is persisted.
-- All functions are SECURITY DEFINER and executable by service_role only.

BEGIN;

-- ------------------------------------------------------------
-- 1. loan_requests: filing source + idempotency
-- ------------------------------------------------------------

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS filing_source TEXT NOT NULL DEFAULT 'PUBLIC_REFERRAL',
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

ALTER TABLE public.loan_requests
  DROP CONSTRAINT IF EXISTS loan_requests_filing_source_check;

ALTER TABLE public.loan_requests
  ADD CONSTRAINT loan_requests_filing_source_check
  CHECK (filing_source IN ('PUBLIC_REFERRAL', 'MEMBER_DIRECT'));

CREATE UNIQUE INDEX IF NOT EXISTS loan_requests_client_request_unique
  ON public.loan_requests(client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. witness_verifications
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.witness_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  witness_index SMALLINT NOT NULL CHECK (witness_index IN (1, 2)),
  witness_name TEXT,
  witness_phone_last4 TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'DECLINED', 'EXPIRED', 'REVOKED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  first_viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  shared_at TIMESTAMPTZ,
  share_channel TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  replaced_by UUID,
  created_by UUID,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_note TEXT
);

CREATE INDEX IF NOT EXISTS witness_verifications_request_idx
  ON public.witness_verifications(loan_request_id, witness_index, issued_at DESC);

CREATE INDEX IF NOT EXISTS witness_verifications_status_idx
  ON public.witness_verifications(status, expires_at);

CREATE INDEX IF NOT EXISTS witness_verifications_loan_idx
  ON public.witness_verifications(loan_id);

-- At most one live (PENDING) verification per witness.
CREATE UNIQUE INDEX IF NOT EXISTS witness_verifications_one_pending
  ON public.witness_verifications(loan_request_id, witness_index)
  WHERE status = 'PENDING';

-- ------------------------------------------------------------
-- 3. witness_verification_events (append-only)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.witness_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID NOT NULL REFERENCES public.witness_verifications(id) ON DELETE CASCADE,
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ISSUED',
    'LINK_PREPARED',
    'WHATSAPP_OPENED',
    'MARKED_SHARED',
    'VIEWED',
    'CONSENTED',
    'DECLINED',
    'EXPIRED',
    'REVOKED',
    'REGENERATED'
  )),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'member', 'admin', 'super', 'witness')),
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS witness_verification_events_verification_idx
  ON public.witness_verification_events(verification_id, created_at DESC);

CREATE INDEX IF NOT EXISTS witness_verification_events_request_idx
  ON public.witness_verification_events(loan_request_id, created_at DESC);

-- Append-only guard: events can never be updated or deleted by clients.
CREATE OR REPLACE FUNCTION public.witness_verification_events_no_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Witness verification events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS witness_verification_events_block_update
  ON public.witness_verification_events;
CREATE TRIGGER witness_verification_events_block_update
  BEFORE UPDATE OR DELETE ON public.witness_verification_events
  FOR EACH ROW EXECUTE FUNCTION public.witness_verification_events_no_mutation();

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------

ALTER TABLE public.witness_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.witness_verification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "witness_verifications_member_select" ON public.witness_verifications;
CREATE POLICY "witness_verifications_member_select"
ON public.witness_verifications
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loan_requests r
    WHERE r.id = witness_verifications.loan_request_id
      AND r.referred_member_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "witness_verifications_admin_select" ON public.witness_verifications;
CREATE POLICY "witness_verifications_admin_select"
ON public.witness_verifications
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super')
  )
);

DROP POLICY IF EXISTS "witness_events_member_select" ON public.witness_verification_events;
CREATE POLICY "witness_events_member_select"
ON public.witness_verification_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.loan_requests r
    WHERE r.id = witness_verification_events.loan_request_id
      AND r.referred_member_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "witness_events_admin_select" ON public.witness_verification_events;
CREATE POLICY "witness_events_admin_select"
ON public.witness_verification_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super')
  )
);

-- ------------------------------------------------------------
-- 5. issue_witness_verification
--    Revokes any live link for the witness, then issues a new one.
--    The raw token is generated by the API; only its hash reaches the DB.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_witness_verification(
  p_request_id UUID,
  p_witness_index SMALLINT,
  p_token_hash TEXT,
  p_witness_name TEXT DEFAULT NULL,
  p_witness_phone_last4 TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_ttl INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous UUID;
  v_id UUID;
  v_loan_id UUID;
BEGIN
  IF p_witness_index NOT IN (1, 2) THEN
    RAISE EXCEPTION 'witness index must be 1 or 2';
  END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  SELECT id INTO v_previous
  FROM public.witness_verifications
  WHERE loan_request_id = p_request_id
    AND witness_index = p_witness_index
    AND status = 'PENDING'
  FOR UPDATE;

  IF v_previous IS NOT NULL THEN
    UPDATE public.witness_verifications
    SET status = 'REVOKED',
        revoked_at = NOW(),
        revoked_reason = 'regenerated',
        last_activity_at = NOW()
    WHERE id = v_previous;

    INSERT INTO public.witness_verification_events
      (verification_id, loan_request_id, event_type, actor_type, actor_id, metadata)
    VALUES
      (v_previous, p_request_id, 'REVOKED', 'system', p_created_by,
       jsonb_build_object('reason', 'regenerated'));
  END IF;

  SELECT id INTO v_loan_id FROM public.loans WHERE source_request_id = p_request_id;

  INSERT INTO public.witness_verifications
    (loan_request_id, loan_id, witness_index, witness_name, witness_phone_last4,
     token_hash, expires_at, created_by)
  VALUES
    (p_request_id, v_loan_id, p_witness_index, p_witness_name, p_witness_phone_last4,
     p_token_hash, NOW() + COALESCE(p_ttl, INTERVAL '7 days'), p_created_by)
  RETURNING id INTO v_id;

  INSERT INTO public.witness_verification_events
    (verification_id, loan_request_id, event_type, actor_type, actor_id, metadata)
  VALUES
    (v_id, p_request_id, CASE WHEN v_previous IS NULL THEN 'ISSUED' ELSE 'REGENERATED' END,
     'system', p_created_by,
     jsonb_build_object('witness_index', p_witness_index, 'replaced', v_previous));

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 6. respond_witness_verification
--    Atomic single-use transition. Server owns the timestamp and status.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_witness_verification(
  p_token_hash TEXT,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.witness_verifications%ROWTYPE;
  v_decision TEXT := upper(COALESCE(p_decision, ''));
  v_now TIMESTAMPTZ := NOW();
  v_witness_status TEXT;
BEGIN
  IF v_decision NOT IN ('VERIFIED', 'DECLINED') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_decision');
  END IF;

  SELECT * INTO v_row
  FROM public.witness_verifications
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.status <> 'PENDING' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_processed',
      'status', v_row.status,
      'witness_index', v_row.witness_index
    );
  END IF;

  IF v_row.expires_at <= v_now THEN
    UPDATE public.witness_verifications
    SET status = 'EXPIRED', last_activity_at = v_now
    WHERE id = v_row.id;

    INSERT INTO public.witness_verification_events
      (verification_id, loan_request_id, event_type, actor_type, metadata)
    VALUES (v_row.id, v_row.loan_request_id, 'EXPIRED', 'system', '{}'::jsonb);

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'expired',
      'witness_index', v_row.witness_index
    );
  END IF;

  UPDATE public.witness_verifications
  SET status = v_decision,
      responded_at = v_now,
      consumed_at = v_now,
      last_activity_at = v_now,
      response_note = NULLIF(left(COALESCE(p_note, ''), 500), '')
  WHERE id = v_row.id;

  v_witness_status := v_decision;

  -- Mirror onto the canonical request row.
  IF v_row.witness_index = 1 THEN
    UPDATE public.loan_requests
    SET witness1_status = v_witness_status,
        witness1_verified_at = v_now,
        witnesses = jsonb_set(
          jsonb_set(
            CASE WHEN jsonb_typeof(witnesses) = 'array' AND jsonb_array_length(witnesses) >= 1
                 THEN witnesses ELSE '[{},{}]'::jsonb END,
            '{0,status}', to_jsonb(v_witness_status), true),
          '{0,verified_at}', to_jsonb(v_now), true),
        updated_at = v_now
    WHERE id = v_row.loan_request_id;
  ELSE
    UPDATE public.loan_requests
    SET witness2_status = v_witness_status,
        witness2_verified_at = v_now,
        witnesses = jsonb_set(
          jsonb_set(
            CASE WHEN jsonb_typeof(witnesses) = 'array' AND jsonb_array_length(witnesses) >= 2
                 THEN witnesses ELSE '[{},{}]'::jsonb END,
            '{1,status}', to_jsonb(v_witness_status), true),
          '{1,verified_at}', to_jsonb(v_now), true),
        updated_at = v_now
    WHERE id = v_row.loan_request_id;
  END IF;

  -- Mirror onto the formal loan row when the application was forwarded.
  IF v_row.witness_index = 1 THEN
    UPDATE public.loans
    SET witness1_status = v_witness_status,
        witness1_verified_at = v_now,
        witnesses = jsonb_set(
          jsonb_set(
            CASE WHEN jsonb_typeof(witnesses) = 'array' AND jsonb_array_length(witnesses) >= 1
                 THEN witnesses ELSE '[{},{}]'::jsonb END,
            '{0,status}', to_jsonb(v_witness_status), true),
          '{0,verified_at}', to_jsonb(v_now), true)
    WHERE source_request_id = v_row.loan_request_id;
  ELSE
    UPDATE public.loans
    SET witness2_status = v_witness_status,
        witness2_verified_at = v_now,
        witnesses = jsonb_set(
          jsonb_set(
            CASE WHEN jsonb_typeof(witnesses) = 'array' AND jsonb_array_length(witnesses) >= 2
                 THEN witnesses ELSE '[{},{}]'::jsonb END,
            '{1,status}', to_jsonb(v_witness_status), true),
          '{1,verified_at}', to_jsonb(v_now), true)
    WHERE source_request_id = v_row.loan_request_id;
  END IF;

  INSERT INTO public.witness_verification_events
    (verification_id, loan_request_id, event_type, actor_type, metadata)
  VALUES
    (v_row.id, v_row.loan_request_id,
     CASE WHEN v_decision = 'VERIFIED' THEN 'CONSENTED' ELSE 'DECLINED' END,
     'witness', jsonb_build_object('witness_index', v_row.witness_index));

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_decision,
    'witness_index', v_row.witness_index,
    'request_id', v_row.loan_request_id,
    'responded_at', v_now
  );
END;
$$;

-- ------------------------------------------------------------
-- 7. revoke_witness_verification
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_witness_verification(
  p_verification_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.witness_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.witness_verifications WHERE id = p_verification_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_row.status <> 'PENDING' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.witness_verifications
  SET status = 'REVOKED',
      revoked_at = NOW(),
      revoked_reason = left(COALESCE(p_reason, 'revoked'), 200),
      last_activity_at = NOW()
  WHERE id = v_row.id;

  INSERT INTO public.witness_verification_events
    (verification_id, loan_request_id, event_type, actor_type, actor_id, metadata)
  VALUES
    (v_row.id, v_row.loan_request_id, 'REVOKED', 'system', p_actor,
     jsonb_build_object('reason', left(COALESCE(p_reason, 'revoked'), 200)));

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------
-- 8. mark_witness_shared
--    Records a manual share action. Never claims delivery.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_witness_shared(
  p_verification_id UUID,
  p_channel TEXT DEFAULT 'whatsapp',
  p_actor UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.witness_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.witness_verifications WHERE id = p_verification_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.witness_verifications
  SET shared_at = COALESCE(shared_at, NOW()),
      share_channel = COALESCE(p_channel, 'whatsapp'),
      last_activity_at = NOW()
  WHERE id = v_row.id;

  INSERT INTO public.witness_verification_events
    (verification_id, loan_request_id, event_type, actor_type, actor_id, metadata)
  VALUES
    (v_row.id, v_row.loan_request_id, 'MARKED_SHARED', 'member', p_actor,
     jsonb_build_object('channel', COALESCE(p_channel, 'whatsapp'), 'delivery_confirmed', false));

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------
-- 9. Grants — service_role only
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.issue_witness_verification(UUID, SMALLINT, TEXT, TEXT, TEXT, UUID, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_witness_verification(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_witness_verification(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_witness_shared(UUID, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_witness_verification(UUID, SMALLINT, TEXT, TEXT, TEXT, UUID, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_witness_verification(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_witness_verification(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_witness_shared(UUID, TEXT, UUID) TO service_role;

COMMIT;

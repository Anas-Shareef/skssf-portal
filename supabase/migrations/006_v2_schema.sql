-- ============================================================
-- SKSSF Portal — Migration 006: PRD v2.0 Full Schema
-- ============================================================

-- ── 1. Extend profiles table ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_title      TEXT,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS assigned_zone    TEXT,
  ADD COLUMN IF NOT EXISTS member_unique_code TEXT,
  ADD COLUMN IF NOT EXISTS bio              TEXT;

-- Extend role ENUM to include coordinator (if using enum type)
-- If role is TEXT, just ensure values are enforced by app logic.
-- Add CHECK constraint if role column is TEXT:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='role'
    AND data_type = 'USER-DEFINED'
  ) THEN
    -- role is TEXT — add check constraint if not already present
    BEGIN
      ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
        CHECK (role IN ('super','admin','coordinator','member'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── 2. system_settings (single-row config) ────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  id                    SERIAL PRIMARY KEY,
  panel_coordinator_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_by            UUID REFERENCES profiles(id) ON DELETE SET NULL
);
-- Ensure exactly one row exists
INSERT INTO system_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ── 3. loan_requests (public /request/ form submissions) ──────
CREATE TABLE IF NOT EXISTS loan_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_name        TEXT NOT NULL,
  requester_phone       TEXT NOT NULL,
  requester_address     TEXT NOT NULL,
  reason                TEXT NOT NULL,
  approximate_amount    DECIMAL(12,2) NOT NULL,
  referred_member_name  TEXT,
  referred_member_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'DRAFT_UNASSIGNED'
                          CHECK (status IN ('DRAFT_UNASSIGNED','CONVERTED','DISMISSED')),
  converted_to_loan_id  UUID,  -- FK added after loans table exists
  dismissal_reason      TEXT,
  dismissed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Extend loans table ─────────────────────────────────────
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS submitted_by_member_id   UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS requester_name           TEXT,
  ADD COLUMN IF NOT EXISTS requester_phone          TEXT,
  ADD COLUMN IF NOT EXISTS requester_address        TEXT,
  ADD COLUMN IF NOT EXISTS purpose                  TEXT,
  ADD COLUMN IF NOT EXISTS repayment_period_months  INTEGER,
  ADD COLUMN IF NOT EXISTS loan_amount_requested    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS loan_amount_approved     DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS workflow_status          TEXT NOT NULL DEFAULT 'PENDING_COORDINATOR_REVIEW'
                              CHECK (workflow_status IN (
                                'DRAFT_UNASSIGNED',
                                'PENDING_COORDINATOR_REVIEW',
                                'PENDING_APPROVAL_PANEL',
                                'APPROVED',
                                'REJECTED_BY_COORDINATOR',
                                'REJECTED_BY_PANEL',
                                'REPAYMENT_COMPLETE'
                              )),
  ADD COLUMN IF NOT EXISTS coordinator_reviewer_id      UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS coordinator_review_notes     TEXT,
  ADD COLUMN IF NOT EXISTS coordinator_review_status    TEXT CHECK (coordinator_review_status IN ('VERIFIED','REJECTED')),
  ADD COLUMN IF NOT EXISTS coordinator_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS panel_coordinator_id         UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS president_vote               TEXT CHECK (president_vote IN ('APPROVE','REJECT')),
  ADD COLUMN IF NOT EXISTS president_vote_reason        TEXT,
  ADD COLUMN IF NOT EXISTS secretary_vote               TEXT CHECK (secretary_vote IN ('APPROVE','REJECT')),
  ADD COLUMN IF NOT EXISTS secretary_vote_reason        TEXT,
  ADD COLUMN IF NOT EXISTS panel_coordinator_vote       TEXT CHECK (panel_coordinator_vote IN ('APPROVE','REJECT')),
  ADD COLUMN IF NOT EXISTS panel_coordinator_vote_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by                  UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejection_reason             TEXT,
  ADD COLUMN IF NOT EXISTS disbursement_date            DATE,
  ADD COLUMN IF NOT EXISTS source_request_id            UUID REFERENCES loan_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supporting_documents         JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS member_notes                 TEXT;

-- Back-fill workflow_status from existing status column if present
UPDATE loans SET workflow_status =
  CASE
    WHEN status = 'pending'   THEN 'PENDING_COORDINATOR_REVIEW'
    WHEN status = 'approved'  THEN 'APPROVED'
    WHEN status = 'rejected'  THEN 'REJECTED_BY_PANEL'
    WHEN status = 'completed' THEN 'REPAYMENT_COMPLETE'
    ELSE 'PENDING_COORDINATOR_REVIEW'
  END
WHERE workflow_status IS NULL OR workflow_status = '';

-- ── 5. loan_audit_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  action              TEXT NOT NULL,
  performed_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  performed_at        TIMESTAMPTZ DEFAULT NOW(),
  notes               TEXT
);

-- ── 6. repayment_installments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS repayment_installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,
  due_date            DATE NOT NULL,
  amount_due          DECIMAL(12,2) NOT NULL,
  amount_paid         DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_date        DATE,
  payment_method      TEXT CHECK (payment_method IN ('Cash','Bank Transfer','Other')),
  reference_note      TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PARTIALLY_PAID','PAID','OVERDUE')),
  recorded_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_id, installment_number)
);

-- ── 7. repayment_notifications_sent ──────────────────────────
CREATE TABLE IF NOT EXISTS repayment_notifications_sent (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id  UUID NOT NULL REFERENCES repayment_installments(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('7_DAY','3_DAY','DUE_DATE','OVERDUE')),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(installment_id, trigger_type)
);

-- ── 8. requester_notifications ───────────────────────────────
CREATE TABLE IF NOT EXISTS requester_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_id      UUID REFERENCES repayment_installments(id) ON DELETE SET NULL,
  sent_by_member_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sent_at             TIMESTAMPTZ DEFAULT NOW(),
  message_text        TEXT NOT NULL,
  delivery_method     TEXT NOT NULL DEFAULT 'PORTAL_LOG'
                        CHECK (delivery_method IN ('PORTAL_LOG','SMS','WHATSAPP'))
);

-- ── 9. notifications (in-app bell) ────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  link_url    TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ── 10. Extend inventory_items (currently 'products') ─────────
-- Try products table first (current name), then inventory_items
DO $$
DECLARE tbl TEXT;
BEGIN
  SELECT table_name INTO tbl FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('inventory_items','products')
    ORDER BY CASE table_name WHEN 'inventory_items' THEN 1 ELSE 2 END LIMIT 1;

  IF tbl IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS issue_type          TEXT CHECK (issue_type IN (''LEASE'',''PERMANENT'')),
      ADD COLUMN IF NOT EXISTS lease_duration_days  INTEGER,
      ADD COLUMN IF NOT EXISTS category             TEXT,
      ADD COLUMN IF NOT EXISTS image_url            TEXT,
      ADD COLUMN IF NOT EXISTS available_stock      INTEGER,
      ADD COLUMN IF NOT EXISTS created_by           UUID REFERENCES profiles(id) ON DELETE SET NULL', tbl);
    -- Default existing items to PERMANENT
    EXECUTE format('UPDATE %I SET issue_type = ''PERMANENT'' WHERE issue_type IS NULL', tbl);
  END IF;
END $$;

-- ── 11. inventory_checkout_records ────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_checkout_records (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                     UUID NOT NULL,  -- FK to products/inventory_items
  item_name                   TEXT NOT NULL,  -- snapshot
  checked_out_by_member_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  approved_by_admin_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  quantity_checked_out        INTEGER NOT NULL DEFAULT 1,
  quantity_returned           INTEGER NOT NULL DEFAULT 0,
  checked_out_date            DATE,
  expected_return_date        DATE,
  return_date                 DATE,
  condition_notes             TEXT,
  issue_type                  TEXT NOT NULL DEFAULT 'PERMANENT'
                                CHECK (issue_type IN ('LEASE','PERMANENT')),
  status                      TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
                                CHECK (status IN ('PENDING_APPROVAL','ACTIVE','RETURNED','OVERDUE','REJECTED')),
  admin_rejection_reason      TEXT,
  purpose                     TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 12. Add FK for loan_requests.converted_to_loan_id ─────────
DO $$
BEGIN
  ALTER TABLE loan_requests
    ADD CONSTRAINT loan_requests_converted_to_loan_id_fkey
    FOREIGN KEY (converted_to_loan_id) REFERENCES loans(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 13. RLS Policies (basic) ──────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (auth.uid()::TEXT = user_id::TEXT);

ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loan_requests_member_own" ON loan_requests;
CREATE POLICY "loan_requests_member_own" ON loan_requests
  FOR ALL USING (TRUE);  -- public insert; members see via referred_member_id

ALTER TABLE repayment_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "installments_member" ON repayment_installments;
CREATE POLICY "installments_member" ON repayment_installments
  FOR ALL USING (TRUE);  -- app enforces scoping; RLS will tighten per role later

-- ── 14. Helper function: mark loan approved & generate schedule ─
CREATE OR REPLACE FUNCTION generate_repayment_schedule(
  p_loan_id UUID,
  p_amount DECIMAL,
  p_months INTEGER,
  p_disbursement_date DATE
) RETURNS VOID AS $$
DECLARE
  installment_amt DECIMAL;
  last_installment_amt DECIMAL;
  total_allocated DECIMAL;
  i INTEGER;
  due DATE;
BEGIN
  installment_amt := ROUND(p_amount / p_months, 2);
  total_allocated := installment_amt * (p_months - 1);
  last_installment_amt := p_amount - total_allocated;

  FOR i IN 1..p_months LOOP
    due := p_disbursement_date + (i * 30);
    INSERT INTO repayment_installments (
      loan_id, installment_number, due_date, amount_due, status
    ) VALUES (
      p_loan_id,
      i,
      due,
      CASE WHEN i = p_months THEN last_installment_amt ELSE installment_amt END,
      'PENDING'
    ) ON CONFLICT (loan_id, installment_number) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

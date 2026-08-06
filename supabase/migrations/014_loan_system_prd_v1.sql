-- ============================================================
-- SKSSF Portal — Migration 014: PRD v1.0 Loan System Schema
-- ============================================================

-- 1. Extend / Update loan_requests Table (Public Link Submissions)
ALTER TABLE loan_requests
  ADD COLUMN IF NOT EXISTS member_id                   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS applicant_name             TEXT,
  ADD COLUMN IF NOT EXISTS applicant_dob              DATE,
  ADD COLUMN IF NOT EXISTS applicant_gender           TEXT,
  ADD COLUMN IF NOT EXISTS applicant_phone            TEXT,
  ADD COLUMN IF NOT EXISTS applicant_whatsapp         TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_house    TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_street   TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_city     TEXT,
  ADD COLUMN IF NOT EXISTS applicant_address_pin      TEXT(6),
  ADD COLUMN IF NOT EXISTS applicant_aadhaar_last4    TEXT(4),
  ADD COLUMN IF NOT EXISTS loan_amount_requested      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS loan_purpose_category      TEXT,
  ADD COLUMN IF NOT EXISTS loan_purpose_detail        TEXT,
  ADD COLUMN IF NOT EXISTS repayment_period_months    INTEGER,
  ADD COLUMN IF NOT EXISTS existing_debts             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS existing_debts_detail      TEXT,
  ADD COLUMN IF NOT EXISTS monthly_income             DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS income_source              TEXT,
  ADD COLUMN IF NOT EXISTS declaration_agreed         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS member_notes               TEXT,
  ADD COLUMN IF NOT EXISTS member_recommended_amount  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS member_relationship        TEXT,
  ADD COLUMN IF NOT EXISTS updated_at                 TIMESTAMPTZ DEFAULT NOW();

-- Ensure status constraint on loan_requests
DO $$
BEGIN
  ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS loan_requests_status_check;
  ALTER TABLE loan_requests ADD CONSTRAINT loan_requests_status_check
    CHECK (status IN ('DRAFT', 'DRAFT_UNASSIGNED', 'REVIEWED', 'SUBMITTED', 'CONVERTED', 'DISMISSED'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill applicant_name from requester_name if needed
UPDATE loan_requests SET applicant_name = requester_name WHERE applicant_name IS NULL AND requester_name IS NOT NULL;
UPDATE loan_requests SET applicant_phone = requester_phone WHERE applicant_phone IS NULL AND requester_phone IS NOT NULL;
UPDATE loan_requests SET loan_amount_requested = approximate_amount WHERE loan_amount_requested IS NULL AND approximate_amount IS NOT NULL;
UPDATE loan_requests SET member_id = referred_member_id WHERE member_id IS NULL AND referred_member_id IS NOT NULL;

-- 2. Extend loans Table
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS loan_request_id            UUID REFERENCES loan_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filed_by_member_id          UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS applicant_name              TEXT,
  ADD COLUMN IF NOT EXISTS applicant_phone             TEXT,
  ADD COLUMN IF NOT EXISTS applicant_whatsapp          TEXT,
  ADD COLUMN IF NOT EXISTS loan_amount_requested       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS loan_amount_approved        DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS loan_purpose                TEXT,
  ADD COLUMN IF NOT EXISTS repayment_period_months     INTEGER,
  ADD COLUMN IF NOT EXISTS member_notes                TEXT,
  ADD COLUMN IF NOT EXISTS disbursement_date           DATE,
  ADD COLUMN IF NOT EXISTS coordinator_reviewer_id     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS coordinator_review_notes    TEXT,
  ADD COLUMN IF NOT EXISTS coordinator_review_status   TEXT CHECK (coordinator_review_status IN ('VERIFIED','REJECTED')),
  ADD COLUMN IF NOT EXISTS coordinator_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS panel_coordinator_id        UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS president_vote              TEXT CHECK (president_vote IN ('APPROVE','REJECT')),
  ADD COLUMN IF NOT EXISTS president_vote_reason       TEXT,
  ADD COLUMN IF NOT EXISTS secretary_vote              TEXT CHECK (secretary_vote IN ('APPROVE','REJECT')),
  ADD COLUMN IF NOT EXISTS secretary_vote_reason       TEXT,
  ADD COLUMN IF NOT EXISTS panel_coordinator_vote      TEXT CHECK (panel_coordinator_vote IN ('APPROVE','REJECT')),
  ADD COLUMN IF NOT EXISTS panel_coordinator_vote_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason            TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id         UUID REFERENCES profiles(id);

-- Ensure status check on loans
DO $$
BEGIN
  ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_workflow_status_check;
  ALTER TABLE loans ADD CONSTRAINT loans_workflow_status_check
    CHECK (workflow_status IN (
      'DRAFT_UNASSIGNED',
      'PENDING_COORDINATOR_REVIEW',
      'PENDING_APPROVAL_PANEL',
      'APPROVED',
      'REJECTED_BY_COORDINATOR',
      'REJECTED_BY_PANEL',
      'DISBURSED',
      'REPAYMENT_COMPLETE'
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Create / Ensure repayment_instalments Table
CREATE TABLE IF NOT EXISTS repayment_instalments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  instalment_number  INTEGER NOT NULL,
  due_date            DATE NOT NULL,
  amount_due          DECIMAL(12,2) NOT NULL,
  amount_paid         DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_date        DATE,
  payment_method      TEXT CHECK (payment_method IN ('Cash','Bank Transfer','Online','Other')),
  reference_note      TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE')),
  recorded_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_id, instalment_number)
);

-- 4. Deduplication Table for Automatic Reminders
CREATE TABLE IF NOT EXISTS repayment_notifications_sent (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalment_id  UUID NOT NULL REFERENCES repayment_instalments(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('7_DAY','3_DAY','1_DAY','DUE_DATE','OVERDUE_DAY1','OVERDUE_REPEAT')),
  sent_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instalment_id, trigger_type, sent_date)
);

-- 5. Requester Notifications Table (Member-triggered applicant messages)
CREATE TABLE IF NOT EXISTS requester_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  instalment_id      UUID REFERENCES repayment_instalments(id) ON DELETE SET NULL,
  sent_by_member_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_text        TEXT NOT NULL,
  delivery_method     TEXT NOT NULL DEFAULT 'PORTAL_LOG'
                        CHECK (delivery_method IN ('PORTAL_LOG','SMS','WHATSAPP')),
  sent_at             TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Notifications Table (In-app bell notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  link_url    TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- 7. PL/pgSQL Function: Generate Repayment Schedule
CREATE OR REPLACE FUNCTION generate_repayment_schedule(
  p_loan_id BIGINT,
  p_amount DECIMAL,
  p_months INTEGER,
  p_disbursement_date DATE
) RETURNS VOID AS $$
DECLARE
  instalment_amt DECIMAL;
  last_instalment_amt DECIMAL;
  total_allocated DECIMAL;
  i INTEGER;
  due DATE;
  base_date DATE;
BEGIN
  IF p_months <= 0 OR p_amount <= 0 THEN
    RETURN;
  END IF;

  base_date := COALESCE(p_disbursement_date, CURRENT_DATE);
  instalment_amt := ROUND(p_amount / p_months, 2);
  total_allocated := instalment_amt * (p_months - 1);
  last_instalment_amt := p_amount - total_allocated;

  FOR i IN 1..p_months LOOP
    due := base_date + (i * 30);
    INSERT INTO repayment_instalments (
      loan_id, instalment_number, due_date, amount_due, status
    ) VALUES (
      p_loan_id,
      i,
      due,
      CASE WHEN i = p_months THEN last_instalment_amt ELSE instalment_amt END,
      'PENDING'
    ) ON CONFLICT (loan_id, instalment_number) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

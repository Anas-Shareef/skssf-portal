-- =============================================================================
-- SKSSF Portal — Unified Loan Approval, Configurable Review Workflow,
-- Repayment Authorization & Permission Engine
-- Migration: 20261116_unified_workflow_permissions.sql
--
-- SAFETY CONTRACT
--   * Additive only. No column, table or row is dropped or rewritten.
--   * Every statement is idempotent (IF NOT EXISTS / guarded UPDATE).
--   * Existing loans keep working: they are tagged LEGACY_VOTES so the member
--     and admin screens render the historical 5-stage vote view.
--   * New loans default to CONFIGURABLE with an empty review history.
--
-- Run order: after 018_applicant_tracking_and_status_events.sql
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Granular administrative permissions on profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_review_loans       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_loans      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_review_repayments  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_verify_repayments  BOOLEAN DEFAULT false;

-- Legacy "Authorized Reviewer" (is_approver) keeps final-approval authority.
-- This is a one-time, non-destructive grant: it only ever sets true.
UPDATE public.profiles
SET can_approve_loans = true
WHERE is_approver = true
  AND can_approve_loans IS DISTINCT FROM true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Configurable workflow + immutable decision history on loans
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS workflow_type            TEXT DEFAULT 'CONFIGURABLE',
  ADD COLUMN IF NOT EXISTS review_decision_history  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_approver_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_approved_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_installment_due    DATE;

-- Normalise any pre-existing NULL history to an empty array so client code can
-- always append without a null guard.
UPDATE public.loans
SET review_decision_history = '[]'::jsonb
WHERE review_decision_history IS NULL;

-- Backfill: a loan is LEGACY_VOTES only when it actually carries legacy vote
-- evidence. Loans without evidence stay CONFIGURABLE (the column default).
UPDATE public.loans
SET workflow_type = 'LEGACY_VOTES'
WHERE (workflow_type IS NULL OR workflow_type = 'CONFIGURABLE')
  AND (
    president_vote IS NOT NULL
    OR secretary_vote IS NOT NULL
    OR panel_coordinator_vote IS NOT NULL
    OR coordinator_review_status IS NOT NULL
    OR panel_coordinator_id IS NOT NULL
  );

-- Any remaining NULL falls back to the safe default.
UPDATE public.loans
SET workflow_type = 'CONFIGURABLE'
WHERE workflow_type IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Repayment verification audit fields (additive)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.repayment_installments
  ADD COLUMN IF NOT EXISTS payment_mode     TEXT,
  ADD COLUMN IF NOT EXISTS transaction_ref  TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url      TEXT,
  ADD COLUMN IF NOT EXISTS verified_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes for the new lookups (all guarded)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loans_workflow_type
  ON public.loans(workflow_type);

CREATE INDEX IF NOT EXISTS idx_loans_review_history
  ON public.loans USING gin (review_decision_history);

CREATE INDEX IF NOT EXISTS idx_loans_final_approved_by
  ON public.loans(final_approved_by);

CREATE INDEX IF NOT EXISTS idx_repayment_installments_verified_by
  ON public.repayment_installments(verified_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verification (read-only; safe to keep in the migration)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  legacy_count   INTEGER;
  config_count   INTEGER;
  missing_cols   INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count FROM public.loans WHERE workflow_type = 'LEGACY_VOTES';
  SELECT COUNT(*) INTO config_count FROM public.loans WHERE workflow_type = 'CONFIGURABLE';

  SELECT COUNT(*) INTO missing_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'profiles' AND column_name IN
        ('can_review_loans','can_approve_loans','can_review_repayments','can_verify_repayments'))
      OR
      (table_name = 'loans' AND column_name IN
        ('workflow_type','review_decision_history','assigned_reviewer_id',
         'assigned_approver_id','final_approved_by','final_approved_at','first_installment_due'))
    );

  RAISE NOTICE 'Unified workflow migration: % LEGACY_VOTES loan(s), % CONFIGURABLE loan(s), %/11 expected columns present.',
    legacy_count, config_count, missing_cols;
END $$;

COMMIT;

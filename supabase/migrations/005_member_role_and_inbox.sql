-- Migration: Member Role Redesign and Loan Request Inbox System

-- 1. Extend Profiles Table (formerly users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS member_unique_code VARCHAR(12) UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_zone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;

-- 2. Extend Loans Table
ALTER TABLE loans ADD COLUMN IF NOT EXISTS submitted_by_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS submission_source VARCHAR(20) DEFAULT 'manual'; -- 'manual' or 'inbox'
ALTER TABLE loans ADD COLUMN IF NOT EXISTS inbox_submission_id UUID; -- REFERENCES inbox_submissions(id) added below after table creation

-- 3. Create Inbox Submissions Table
CREATE TABLE IF NOT EXISTS inbox_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    requester_name TEXT NOT NULL,
    requester_phone TEXT NOT NULL,
    requester_address TEXT NOT NULL,
    loan_amount_requested NUMERIC(12,2) NOT NULL,
    loan_purpose_category TEXT NOT NULL CHECK (loan_purpose_category IN ('medical', 'education', 'business', 'housing', 'personal', 'other')),
    loan_purpose_detail TEXT,
    monthly_income NUMERIC(10,2) NOT NULL,
    dependents_count INT DEFAULT 0,
    has_existing_loans BOOLEAN DEFAULT false,
    existing_loan_amount NUMERIC(10,2),
    has_collateral BOOLEAN DEFAULT false,
    collateral_description TEXT,
    preferred_tenure_months INT DEFAULT 12,
    document_url TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'under_review', 'forwarded', 'rejected')),
    rejection_reason TEXT,
    forwarded_loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    actioned_at TIMESTAMP WITH TIME ZONE
);

-- Link inbox_submissions in loans table
ALTER TABLE loans ADD CONSTRAINT fk_loans_inbox_submission FOREIGN KEY (inbox_submission_id) REFERENCES inbox_submissions(id) ON DELETE SET NULL;

-- 4. Create Inventory Request Approval Tables
CREATE TABLE IF NOT EXISTS checkout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    purpose TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('lease', 'permanent')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    actioned_at TIMESTAMP WITH TIME ZONE,
    actioned_by TEXT
);

CREATE TABLE IF NOT EXISTS return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id TEXT NOT NULL,
    unit_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    actioned_at TIMESTAMP WITH TIME ZONE,
    actioned_by TEXT
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_member_code ON profiles(member_unique_code);
CREATE INDEX IF NOT EXISTS idx_inbox_submissions_member ON inbox_submissions(member_id);
CREATE INDEX IF NOT EXISTS idx_inbox_submissions_status ON inbox_submissions(status);
CREATE INDEX IF NOT EXISTS idx_checkout_requests_member ON checkout_requests(member_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_member ON return_requests(member_id);

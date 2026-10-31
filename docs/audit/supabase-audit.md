# SKSSF Portal — Supabase Database Integrity Audit
**Audit Date:** 2026-10-29
**Auditor:** Antigravity
**Supabase Project:** jgxzdwbixqhkjrdbhnlc
**Source:** supabase_audit_results.json + migration files

---

## 1. Production Connection Verification

| Item | Value | Status |
|---|---|---|
| VITE_SUPABASE_URL | https://jgxzdwbixqhkjrdbhnlc.supabase.co | Matches PRD |
| Anon key used in frontend | sb_publishable_5a3eI8GYScx-4FKZUn3dmg_vu7lWGk1 | In .env.local |
| Service-role key | sb_secret_... (not exposed in report) | In .env.local (server-side only) |
| API functions use | SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY | Correct — server-side env |
| Vercel environment | Both VITE_ and non-VITE vars needed — verify in Vercel dashboard | Verify |

Only one Supabase client exists in the frontend (`supabaseClient.ts`). No legacy project detected.

---

## 2. Schema Inventory

### 2.1 profiles

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | Supabase auth.users FK |
| code | text | Member short code (nullable) |
| role | text | super / admin / coordinator / member |
| member_no | text | e.g. SKSSF-2026-6056 |
| name | text | |
| phone | text | |
| branch | text | |
| occupation | text | |
| designation | text | |
| avatar | text | |
| addr | text | |
| dob | date | |
| gender | text | |
| salary | numeric | |
| active | boolean | |
| join_date | date | |
| sahachari_paid | jsonb | Array of month numbers paid |
| sah_miss | jsonb | Array of missed months |
| total_donated | numeric | |
| perms | jsonb | Permission flags |
| is_approver | boolean | |
| created_at / updated_at | timestamptz | |
| member_unique_code | text | Public-link code |
| created_by | uuid | |
| assigned_zone | text | |
| is_active | boolean | |
| must_change_password | boolean | |
| admin_title | text | President / Secretary etc |
| bio | text | |

**Count:** 5 rows (verified)

**RLS status:** Unknown from source files — needs direct inspection.

### 2.2 loans

| Column | Type | Notes |
|---|---|---|
| id | bigint (PK) | Auto-increment |
| loan_no | text | e.g. LOAN-2026-3756 |
| user_id | uuid | (nullable — legacy, sometimes null) |
| member_no | text | |
| name | text | Applicant name |
| branch | text | |
| mob | text | Phone |
| amount | numeric | Loan amount |
| amt | numeric | Duplicate/alias field |
| purpose | text | |
| purpose_desc | text | |
| months | integer | Repayment period |
| status | text | pending/approved/rejected/completed |
| submitted_date | date | |
| approved_date | date | |
| disbursed_date | date | |
| admin_note | text | |
| super_note | text | |
| approved_by | text | |
| guarantors | jsonb | Array |
| repayments | jsonb | Array of installment objects (PRIMARY repayment store) |
| request | jsonb | Approval workflow state |
| audit | jsonb | Audit log array |
| signature | text | Base64 signature image |
| witnesses | jsonb | Array |
| submitted_by_member_id | uuid -> profiles | Filed by member |
| filed_by_member_id | uuid -> profiles | Added by migration 006 |
| workflow_status | text | CHECK constraint on defined values |
| coordinator_reviewer_id / review_notes / review_status | Various | Coordinator workflow |
| president_vote / secretary_vote / panel_coordinator_vote | text | Panel votes |
| rejection_reason / rejected_by | text / uuid | |
| disbursement_date | date | |
| source_request_id | uuid -> loan_requests | |
| repayment_period_months | integer | |
| loan_amount_requested / approved | numeric | |
| member_notes | text | |

**Count:** 8 rows (verified)

**Critical finding:** The `repayments` column is a JSONB array. This is the **de facto repayment store** for all 8 existing loans. The `repayment_installments` table exists but has **0 rows**.

### 2.3 repayment_installments

**Exists:** YES
**Row count:** 0
**Schema:** loan_id (bigint FK), installment_number, due_date, amount_due, amount_paid, payment_date, payment_method, reference_note, status (PENDING/PARTIALLY_PAID/PAID/OVERDUE), recorded_by_user_id

**Critical gap:** The `MemberRepayments.tsx` and `FiledLoanDetail.tsx` pages query this table directly. With 0 rows, both pages show no repayment data even for loans that have installment data in `loans.repayments` JSONB.

### 2.4 repayment_instalments (migration 014 table)

**Exists:** NO (confirmed: error PGRST205 "Could not find the table")
Migration 014 creates `repayment_instalments` (British spelling) but production only has `repayment_installments` (American spelling from migration 006). Migration 014 was not applied or was rolled back.

### 2.5 loan_requests

**Exists:** YES
**Count:** 1
**Status values allowed:** DRAFT_UNASSIGNED / CONVERTED / DISMISSED (migration 006 constraint)

Migration 014 adds additional statuses (DRAFT, REVIEWED, SUBMITTED) — if migration 014 was not applied, the constraint would reject these values.

### 2.6 loan_audit_log

**Exists:** YES
**Count:** 0 rows

`record-member-repayment.js` serverless function writes to `loan_audit_log`. The empty count suggests this serverless path has not been used.

### 2.7 inventory_items

**Exists:** YES
**Count:** 3 items
**Key columns:** id (uuid), name, category_id, item_type (permanent/lease), total_stock, available_stock, photo_url, is_active, public_visible, public_description, barcode_value

### 2.8 Other Inventory Tables

| Table | Exists | Count | Notes |
|---|---|---|---|
| inventory_units | YES | unknown | Physical unit tracking |
| inventory_checkout_records | YES | unknown | Member checkout records |
| inventory_audit_log | YES | unknown | Inventory change log |
| kits | YES | unknown | Kit bundles |
| inventory_transactions | YES | unknown | Legacy scan transactions |

### 2.9 Notification / Messaging Tables

| Table | Exists | Count |
|---|---|---|
| notifications | YES | 0 |
| inbox_submissions | YES | 0 |
| requester_notifications | YES | 0 |
| repayment_notifications_sent | YES | 0 |

### 2.10 Other Tables

| Table | Exists | Count |
|---|---|---|
| portal_configs | YES | unknown |
| campaigns | YES | unknown |
| donations | YES | unknown |
| system_settings | YES | unknown |

---

## 3. RLS Policies

### 3.1 notifications
```sql
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (auth.uid()::TEXT = user_id::TEXT);
```
Status: Reasonable — users see only their own notifications.

### 3.2 loan_requests
```sql
CREATE POLICY "loan_requests_member_own" ON loan_requests
  FOR ALL USING (TRUE);
```
Status: **OVERLY PERMISSIVE** — any authenticated user can read/write all loan requests.

### 3.3 repayment_installments
```sql
CREATE POLICY "installments_member" ON repayment_installments
  FOR ALL USING (TRUE);
```
Status: **CRITICAL** — any authenticated user can read or update any installment. A member can mark other members' installments as PAID.

### 3.4 profiles
RLS policy not found in migration files. Needs direct inspection via Supabase dashboard.

### 3.5 loans
RLS policy not found in migration files. The bootstrap query reads all loans:
```javascript
supabase.from('loans').select('*').order('created_at', { ascending: false })
```
If RLS is disabled or set to FOR ALL USING (TRUE), any authenticated user can read all loans.

---

## 4. Foreign Key Relationships

| From | Column | To | On Delete |
|---|---|---|---|
| profiles | id | auth.users(id) | (managed by Supabase Auth) |
| loans | submitted_by_member_id | profiles(id) | (no action specified) |
| loans | filed_by_member_id | profiles(id) | (no action) |
| loans | source_request_id | loan_requests(id) | SET NULL |
| loan_requests | referred_member_id | profiles(id) | SET NULL |
| loan_requests | converted_to_loan_id | loans(id) | SET NULL |
| repayment_installments | loan_id | loans(id) | CASCADE |
| repayment_installments | recorded_by_user_id | profiles(id) | SET NULL |
| loan_audit_log | loan_id | loans(id) | CASCADE |
| loan_audit_log | performed_by_user_id | profiles(id) | SET NULL |
| notifications | user_id | profiles(id) | CASCADE |

---

## 5. Schema Compatibility Issues

### Issue SC-001: Dual repayment models
The application has two repayment models:
- **Model A:** `loans.repayments` JSONB array (used by all 8 existing loans, admin dashboard, localDb)
- **Model B:** `repayment_installments` table (0 rows; used by member-facing pages, serverless record-member-repayment.js)

Both models exist but are not synchronized. The `api.ts` code handles this via fallback:
```javascript
// if repayment_installments query returns 0 rows, fall back to loans.repayments JSONB
throw new Error('FallbackToLoanRepayments');
```
However, `MemberRepayments.tsx` and `FiledLoanDetail.tsx` do NOT implement this fallback — they query `repayment_installments` directly and show empty results when it is empty.

**Impact:** Member-facing repayment pages show no data for all 8 existing loans.

### Issue SC-002: Column naming — amt vs amount
The `loans` table has both `amt` and `amount` columns. Several queries use one or the other:
- `mapLoanFromApi`: `Number(l.amount || l.amt || 0)` — handles both
- `api.ts /loans POST`: inserts both `amount` and `amt`
- Balance calculations use `loan.amt` in localDb but `loan.amount` in some queries

### Issue SC-003: user_id is null for most loans
Sample loan shows `user_id: null`. The newer columns `submitted_by_member_id` and `filed_by_member_id` are the correct FK to profiles. The legacy `user_id` column may be unused.

### Issue SC-004: migration 014 not applied
Migration 014 creates:
- `repayment_instalments` (different spelling) — does not exist in production
- Additional columns on `loan_requests` (member_notes, declaration_agreed, etc.) — some present, some may not be

### Issue SC-005: workflow_status constraint
Migration 006 CHECK constraint includes 7 values. Migration 014 tries to DROP and re-add this constraint with 8 values (adds DISBURSED). If migration 014 was not applied, inserting `workflow_status = 'DISBURSED'` will fail.

---

## 6. Data Integrity Observations

### 6.1 Sample loan (id=5, LOAN-2026-3756)
- `submitted_by_member_id`: null
- `filed_by_member_id`: not in sample (likely null)
- `workflow_status`: PENDING_COORDINATOR_REVIEW
- `repayments`: 6 installments, all unpaid (correct for pending loan)
- Conclusion: This loan was created before member-FK columns existed.

### 6.2 Repayment JSONB structure
Each element in `loans.repayments`:
```json
{
  "amt": 4167,
  "due": "2026-06-30",
  "paid": null
}
```
Some may also include `request` (pending payment proof), `paid_date`, `paid_amount`, `method`, `proof`.

---

## 7. Migration Status

| Migration | Filename | Applied (inferred) |
|---|---|---|
| 005 | member_role_and_inbox.sql | YES (inbox_submissions exists) |
| 006 | v2_schema.sql | YES (all columns present) |
| 007 | inventory_redesign.sql | YES (inventory_items exists) |
| 008 | barcode_and_catalog.sql | YES (barcode_value present) |
| 009 | physical_units.sql | YES (inventory_units exists) |
| 010 | inventory_reviews.sql | Likely YES |
| 011 | timestamp_and_rls_fixes.sql | Likely YES |
| 012 | db_missions.sql | Likely YES |
| 013 | audit_log.sql | YES (inventory_audit_log exists) |
| 014 | loan_system_prd_v1.sql | PARTIAL/NO — repayment_instalments table not found |

---

## 8. Confirmed Integrity Issues

| ID | Issue | Severity |
|---|---|---|
| SI-001 | repayment_installments has 0 rows while 8 loans exist with repayments in JSONB | High |
| SI-002 | RLS on repayment_installments: FOR ALL USING TRUE — cross-member write possible | Critical |
| SI-003 | RLS on loan_requests: FOR ALL USING TRUE — any user can read all loan requests | High |
| SI-004 | loans RLS not confirmed — may allow cross-member read | High |
| SI-005 | repayment_instalments (migration 014) does not exist — no impact currently | Medium |
| SI-006 | submitted_by_member_id is null on legacy loans — member-scoped queries may miss them | Medium |
| SI-007 | loan_audit_log is empty — repayment audit trail from serverless not functioning | Medium |

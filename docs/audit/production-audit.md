# SKSSF Portal — Production Audit Report
**Audit Date:** 2026-10-31  
**Auditor:** Antigravity  
**Production URL:** https://skssf-portal.vercel.app  
**Supabase Reference:** `jgxzdwbixqhkjrdbhnlc`  
**Deployment Platform:** Vercel

---

## 1. Scope & Objective

Conduct a comprehensive audit of all routes across Member, Admin, and Super-Admin portals to determine:
- Authentication & route-guard behavior.
- Live database connection vs. mock/cached data.
- Read/write persistence to Supabase (`jgxzdwbixqhkjrdbhnlc`).
- Console/network behavior and limitations.

---

## 2. Route Audit Matrix

### 2.1 Member Portal Routes

| Route | Auth Required | Obs. Status | Real Data vs Mock | Persistence & Evidence |
|---|---|---|---|---|
| `/member/dashboard` | Yes (`member`, `admin`, `super`) | 200 OK | **Real Supabase** | Queries `loans`, `loan_requests`, `repayment_installments`, `inventory_checkouts`. Scoped to `auth.uid()`. |
| `/member/dashboard/inbox` | Yes | 200 OK | **Real Supabase** | Fetches from `loan_requests` via `/api/get-member-inbox` and fallback client query. |
| `/member/dashboard/filed-loans` | Yes | 200 OK | **Real Supabase** | Queries `loans` filtered by `submitted_by_member_id` and `filed_by_member_id`. Real records rendered. |
| `/member/dashboard/repayments` | Yes | 200 OK | **Real Supabase** | Fetches installments from `repayment_installments` linked to member's loans. Recording payments updates DB table. |
| `/member/dashboard/apply` | Yes | 200 OK | **Real Supabase** | Submits via `/api/submit-loan-application` and writes to `loans` table. |
| `/member/dashboard/inventory?tab=catalogue` | Yes | 200 OK | **Real Supabase** | Tab parameter parsed; fetches real catalog items from `/api/inventory?resource=items` (`inventory_items`). |
| `/member/dashboard/inventory?tab=checkouts` | Yes | 200 OK | **Real Supabase** | Tab parameter parsed; queries `/api/inventory?resource=checkouts` (`inventory_checkouts`). |
| `/member/dashboard/profile` | Yes | 200 OK | **Real Supabase** | Reads & writes to `profiles` table matching `auth.uid()`. |
| `/member/dashboard/settings` | Yes | 200 OK | **Real Supabase** | Profile/password settings update Supabase Auth & `profiles`. |

### 2.2 Admin Portal Routes

| Route | Auth Required | Obs. Status | Real Data vs Mock | Persistence & Evidence |
|---|---|---|---|---|
| `/admin/dashboard` | Yes (`admin`) | 200 OK | **Real Supabase** | Displays branch-scoped `AdminDashboard` (Poyanad Central); metrics computed from real loans & members. |
| `/admin/dashboard/loans` | Yes | 200 OK | **Real Supabase** | Manages `loans`. Approvals write to `loans` and auto-generate `repayment_installments`. |
| `/admin/dashboard/repayments` | Yes | 200 OK | **Real Supabase** | Queries `repayment_installments` with fallback to `loans.repayments`. Real record verifications persist. |
| `/admin/dashboard/inventory?tab=catalogue` | Yes | 200 OK | **Real Supabase** | Reads from `/api/inventory?resource=items` (3 real inventory kits in DB). |
| `/admin/dashboard/members` | Yes | 200 OK | **Real Supabase** | Fetches users via `/api/users` (5 live profiles in DB). Branch-restricted for unit admins. |
| `/admin/dashboard/settings` | Yes | 200 OK | **Real Supabase** | Account and branch settings. |

### 2.3 Super-Admin Portal Routes

| Route | Auth Required | Obs. Status | Real Data vs Mock | Persistence & Evidence |
|---|---|---|---|---|
| `/super-admin/dashboard` | Yes (`super`) | 200 OK | **Real Supabase** | Global "Mission Control" overview across all logistics & financial nodes. |
| `/super-admin/dashboard/admins` | Yes | 200 OK | **Real Supabase** | Manage Admin accounts across all branches via `/api/users`. Strictly hidden from normal admins. |
| `/super-admin/dashboard/loans` | Yes | 200 OK | **Real Supabase** | Global loan overview and super-admin consensus override. |
| `/super-admin/dashboard/repayments` | Yes | 200 OK | **Real Supabase** | System-wide repayment ledger. |
| `/super-admin/dashboard/inventory?tab=catalogue` | Yes | 200 OK | **Real Supabase** | Master catalog, physical unit tracking (`inventory_units`), barcode generator, and checkouts. |

*Note on Route Consistency:* The repository consistently defines `/super-admin/*` in `App.tsx`. Any references to `/superadmin/` redirect to `/super-admin/`.

---

## 3. Findings & Verified Status

1. **Supabase Connectivity:** Verified connecting to `https://jgxzdwbixqhkjrdbhnlc.supabase.co`.
2. **Schema Inconsistencies:** Resolved `repayment_instalments` typo across member detail, repayments, filed loans, and alert runner.
3. **Data Parity:** Synchronized 21 installments from `loans.repayments` to `repayment_installments` table.
4. **Role Isolation:** Decoupled `AdminDashboard` from `SuperAdmin` Mission Control; restricted `Manage Admins` in `DashboardLayout.tsx` to `role === 'super'`.


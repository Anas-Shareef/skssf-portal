# SKSSF Portal — Integration & Cross-Role Data Flow Map
**Audit Date:** 2026-10-31  
**Auditor:** Antigravity  

---

## 1. System Integration Map

```mermaid
flowchart TD
    subgraph Public["Public Guest / Applicant"]
        P1["/request/:code (Public Loan Request)"]
        P2["/catalog (Public Inventory Catalog)"]
    end

    subgraph Supabase["Supabase DB (jgxzdwbixqhkjrdbhnlc)"]
        LR["loan_requests"]
        L["loans"]
        RI["repayment_installments"]
        II["inventory_items"]
        IU["inventory_units"]
        IC["inventory_checkouts"]
        PR["profiles"]
    end

    subgraph Member["Member Portal"]
        M_Inbox["/member/dashboard/inbox"]
        M_Apply["/member/dashboard/apply"]
        M_Loans["/member/dashboard/filed-loans"]
        M_Repay["/member/dashboard/repayments"]
        M_Inv["/member/dashboard/inventory"]
    end

    subgraph Admin["Admin Portal (Branch-Scoped)"]
        A_Dash["/admin/dashboard"]
        A_Loans["/admin/dashboard/loans"]
        A_Repay["/admin/dashboard/repayments"]
        A_Inv["/admin/dashboard/inventory"]
        A_Mbr["/admin/dashboard/members"]
    end

    subgraph SuperAdmin["Super-Admin Portal (Global)"]
        SA_Dash["/super-admin/dashboard (Mission Control)"]
        SA_Admins["/super-admin/dashboard/admins"]
        SA_Loans["/super-admin/dashboard/loans"]
        SA_Repay["/super-admin/dashboard/repayments"]
    end

    %% Flows
    P1 -->|"Submits Application"| LR
    LR -->|"Reflected in Referrer Inbox"| M_Inbox
    M_Inbox -->|"Forwards with Recommendation"| L
    M_Apply -->|"Direct File"| L
    L -->|"Visible in Member Filed Loans"| M_Loans
    L -->|"Appears in Review Queue"| A_Loans
    L -->|"Global Overview"| SA_Loans
    A_Loans -->|"Approve / Reject"| L
    SA_Loans -->|"Super Consensus / Override"| L
    L -.->|"Auto-generates Schedule upon Approval"| RI
    RI -->|"Shows Upcoming / Overdue EMIs"| M_Repay
    RI -->|"Repayment Tracking & Verification"| A_Repay
    RI -->|"Audit & Revenue Rollup"| SA_Repay

    II -->|"Public Browsing"| P2
    II -->|"Lease Requests"| M_Inv
    M_Inv -->|"Creates Checkout"| IC
    IC -->|"Admin Checkout & Checkin via Scanner"| A_Inv
    IU -->|"Physical Unit Status Update"| A_Inv
```

---

## 2. Cross-Role Workflows

### 2.1 Loan Application to Disbursement
1. **Initiation:** Applicant applies via public referral link or Member submits via `/member/dashboard/apply`.
2. **Database:** Row created in `loans` (`workflow_status: 'PENDING_COORDINATOR_REVIEW'`).
3. **Admin/Coordinator Review:** Appears in `/admin/dashboard/loans` and `/coordinator/dashboard/loans`.
4. **Approval:** Admin approves -> `workflow_status` transitions to `APPROVED`.
5. **Schedule Generation:** Repayment installments populated into `repayment_installments` table and mapped in `loans.repayments`.
6. **Member View:** Updated in `/member/dashboard/filed-loans` and scheduled in `/member/dashboard/repayments`.

### 2.2 Repayment Lifecycle
1. **Installment Due:** Alert runner triggers reminder; displayed on Member dashboard and `/member/dashboard/repayments`.
2. **Payment Recording:** Member submits proof/payment via `/api/record-member-repayment` -> updates `repayment_installments` and `loan_audit_log`.
3. **Verification:** Admin approves installment at `/admin/dashboard/repayments`.
4. **Closing:** When all installments are `PAID`, loan auto-closes (`workflow_status: 'REPAYMENT_COMPLETE'`).

### 2.3 Inventory Flow
1. **Catalog Master:** `inventory_items` and `inventory_units` stored in Supabase.
2. **Member Checkout:** Member selects item -> creates record in `inventory_checkouts` (`status: 'active'`).
3. **Admin Action:** Admin uses barcode scanner in `/admin/dashboard/inventory` to verify and return items.
4. **Stock Update:** Item returned -> updates `inventory_units.status` to `'available'` and increments `inventory_items.available_stock`.

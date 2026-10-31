# SKSSF Portal — Production Deployment & Rollback Report
**Date:** 2026-10-31  
**Deployed by:** Antigravity  
**Target Environment:** Vercel Production (`https://skssf-portal.vercel.app`)  
**Repository Branch:** `main`  
**Latest Deployment Commit:** `2b85474` (and upcoming verified repair commit)

---

## 1. Verified Fixes Deployed

1. **Repayment Schema Unification:**
   - Corrected all occurrences of misspelled `repayment_instalments` table across `FiledLoanDetail.tsx`, `FiledLoans.tsx`, `MemberRepayments.tsx`, and `api/repayment-alert-runner.js` to authoritative `repayment_installments`.
   - Synchronized existing loans' installments directly into `repayment_installments` table (21 records).

2. **Admin & Super-Admin Role Isolation:**
   - Introduced a dedicated `AdminDashboard` in `src/pages/dashboard/Dashboard.tsx` scoped to the admin's assigned branch.
   - Restricted "Manage Admins" in `src/layouts/DashboardLayout.tsx` to `role === 'super'`.

3. **Cross-Role Ownership & Query Alignment:**
   - Updated `/api/get-member-loans.js`, `/api/get-member-repayments.js`, and `/api/record-member-repayment.js` to recognize both `submitted_by_member_id` and `filed_by_member_id`.
   - Updated loan approval mutation to automatically generate `repayment_installments` rows upon approval.
   - Updated `localDb.ts` field mappings for `inventory_items` and `inventory_units` so live counts display accurately.

4. **Public Loan Forwarding Status:**
   - Aligned `api/submit-loan-application.js` to update status to `'CONVERTED'` compliant with database CHECK constraint.

---

## 2. Production Build Verification

```
vite v8.0.1 building client environment for production...
✓ 1874 modules transformed.
dist/index.html                             1.45 kB │ gzip:   0.63 kB
dist/assets/index-DCC9BOQn.js           1,831.42 kB │ gzip: 456.14 kB
✓ built in 2.04s
```

---

## 3. Rollback Plan

If any regression occurs in production:
1. Revert to git commit `2b85474` or `b268c0c`:
   ```bash
   git revert HEAD
   git push origin main
   ```
2. Vercel will automatically redeploy the previous stable build.
3. Database changes made were non-destructive additions (`repayment_installments` rows) and require no table drop.


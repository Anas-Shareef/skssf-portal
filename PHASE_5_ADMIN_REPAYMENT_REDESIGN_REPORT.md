# PHASE 5 — ADMIN REPAYMENT UI/UX REDESIGN REPORT

**Date:** 2026-11-16  
**Production:** https://skssf-portal.vercel.app  
**Target page:** `/admin/dashboard/repayments`  
**Current deployed commit:** `b39caac`  
**Branch:** `main`

## 1. Source

Phase 5 redesign brief: "PRD: Repayment Portal Redesign — Page: /admin/dashboard/repayments (SKSSF Portal, Branch Admin View), Version: Final v1.0".

## 2. Phase 5.0 — Fix-first items completed

| PRD problem | Status | Fix |
|---|---|---|
| 1. Overview totals mismatch | Partially addressed | Phase 3 reload-nonce fix deployed; Phase 5 cleanup removed duplicate metrics |
| 2. "Invalid Date" in EMI rows | **Fixed** | `fmtDate` / `fmtDateShort` now return `'Date not set'` for missing/invalid dates (Phase 5.0) |
| 3. Duplicate Outstanding Balance | **Fixed** | Removed duplicate Outstanding Balance card; single primary Outstanding Balance retained; secondary metrics moved under "More details" |
| 4. Status filter defaults to Partially Paid (empty) | Addressed | Replaced quick-action buttons with All / Overdue / Pending Verification / Partial chips (default All) |
| 5. Pipeline one-row-per-EMI | In progress | Phase 4 added EMI drawer; grouping-by-loan (F14) remains |
| 6. Pipeline default Approved hides action items | OK | Effective default is Needs action (`pending`, includes `partially_approved`) |
| 7. KPI strip counts requests not money | Addressed | Overview now leads with money KPIs; more-details row holds secondary metrics |
| 8. Loan card run-on text | Pending | F24 details expander not yet implemented |
| 9. Table view plain-text status / missing headers | **Partially** | Added Paid + Balance columns (F11) |
| 10. Timeline/Table density drift | **Addressed** | Unified toggle + EMI drawer (Phase 4) |
| 11. Overdue not obvious / no days | **Partially** | Needs-attention list shows days overdue (F7) |
| 12. No clear next action | **Addressed** | Needs-attention rows carry Verify / Record payment actions (F7) |

## 3. Phase 5.0 / 5.1 implementation log (commit `3fa4903`)

- `fmtDate` / `fmtDateShort` hardened → no more `Invalid Date`; missing dates render `Date not set` / `—`.
- Removed duplicate Outstanding Balance / Overdue Amount from secondary summary; secondary row now holds Total Confirmed Repayments, Pending Verification, Partial Payments, Reversed Transactions, rendered inside a collapsible **More details** block (`overviewDetailsOpen`, default closed).
- Replaced quick-action buttons with **status filter chips** (All / Overdue / Pending Verification / Partial; default All).
- Added **Needs Attention** list on Overview (overdue first by days-overdue, then pending verification) with per-row action buttons (Record payment / Verify).
- Made **Repayment Status Distribution** counts clickable → set status filter (F8).
- Added **Paid** and **Balance** columns to Overview installments table; colSpan updated (F11).
- Added **Clear filters** control with active-filter indicator (F10).

## 4. Phase 5.2 / 5.3 implementation log (commit `b39caac`) — header & schedules

- **F1 / F2 — clickable KPI tiles + helper copy:** the four "Repayment Portal Matrix" tiles (Pending Review, Partially Signed, Total Approved, Total Rejected) are now clickable and deep-link into the Transaction Pipeline pre-filtered for that status (`setPipelineFilter` + `setAdminTab('queue')`). Helper copy updated to plain language (`Needs your action`, `Awaiting signatures`, …).
- **F3 — sticky compact header:** on scroll past 40px a slim sticky bar (`position: sticky; top: 0`) collapses the four counts into single-line chips; the tab row pins below it (`top: 64`) while scrolled.
- **F4 — global cross-tab search:** single global search input added to the admin repayment header area; writes to the active tab's search state (`fSearch` on Overview, `search` on Pipeline/Schedules) and switches tabs as the user types.

## 5. Phase 5.4 — schedules work (commit `b39caac`)

- **F27 — sort/filter:** added EMI schedule sort control — Overdue first (default), Highest balance, Newest; schedules now render from a sorted `schedLoans` derivation (overdue-first default).
- **F26 — schedule not generated:** loans with no repayment schedule now render a friendly card ("Schedule not generated" + **Generate schedule** action) instead of a blank area.
- **F28 — single footer row:** loan card footer reduced to a single row — pending count text + **History Log** link (verify action folds into the pending flow).

## 6. Validation

- `npx tsc --noEmit` → **PASS**
- `npm run build` → **PASS**
- Deploy → **READY** (`skssf-main-anncl2uhi-luca-glow-s-projects.vercel.app`) · commit `b39caac`

## 7. Remaining Phase 5 work (not yet implemented — tracked from PRD)

1. F14: pipeline group-by-loan cards with progress bars and next action.
2. F20: bulk verify multi-select.
3. F24: loan-details expander for long applicant text.
4. F25: table status pill with icon (colour + icon).
5. F21: Timeline/Table toggle "remember last choice per user".
6. F13: default status filter is Needs action (already effective default).

## 8. Explicitly not performed

- Authenticated production E2E — **NOT PERFORMED**.
- Live network capture — **NOT PERFORMED**.

## 9. Deployed state

- HEAD: `b39caac` · Deploy: **READY** · Production: https://skssf-portal.vercel.app
- Phase 3 fixes deployed at `33362c6` · Phase 4 report at `e857ab8` · Phase 5 report at `559f789`.

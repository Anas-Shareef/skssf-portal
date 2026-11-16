# PHASE 6 — PROFILES PAYLOAD FIX REPORT

**Date:** 2026-11-16  
**Production:** https://skssf-portal.vercel.app  
**Target:** `profiles` table reads (payload too large — ~107 kB per row)  
**Current deployed commit:** `a5cf179`  
**Branch:** `main`

## 1. Problem

The app asked Supabase for the **entire `profiles` row** (`select('*'`) in nine places. The `profiles` table row is ~107 kB, far too large for a single-object fetch, because a column inside holds a large image/file payload (the `avatar` base64 image).

## 2. Fix applied (commit `a5cf179`)

Every `from('profiles')` read now uses an explicit column allow-list instead of `*`, excluding the heavy column:

- `src/contexts/AuthContext.tsx` — `fetchProfile` (session / auth context load)
- `src/lib/api.ts` — `/auth/me`, `/bootstrap`, `/auth/login` profile lookups
- `api/inventory.js` — inventory auth profile lookup
- `api/users.js` — admin user directory (GET), post-create lookup, get-by-id lookup
- `src/pages/dashboard/Settings.tsx` — super-admin coordinators list

Explicit allow-list used (heavy `avatar` column intentionally excluded):

```
id, name, code, addr, email, role, branch, admin_title, assigned_zone, member_unique_code, is_panel_coordinator, perms, phone, occupation, bio, is_active
```

## 3. Validation

- `npx tsc --noEmit` → **PASS**
- `npm run build` → **PASS**
- Deploy → **READY** — `skssf-main-bxguej5pj-luca-glow-s-projects.vercel.app` · commit `a5cf179`

## 4. Notes / follow-ups

- Reads that genuinely need the avatar (current-user display in Settings, admin avatars) should be served through targeted/single-row queries rather than blanket `*`.
- Remaining work from the Phase 5 PRD: F14 group-by-loan pipeline, F20 bulk verify, F24 loan-details expander, F25 status pill icon, F21 toggle persistence.

## 5. Explicitly not performed

- Authenticated production E2E — **NOT PERFORMED**.
- Live network capture — **NOT PERFORMED**.

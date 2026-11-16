# PHASE 6 — PROFILES PAYLOAD FIX REPORT

**Date:** 2026-11-16  
**Production:** https://skssf-portal.vercel.app  
**Target:** `profiles` table reads (payload too large — ~107 kB per row)  
**Current deployed commit:** `12a1a99`  
**Branch:** `main`

## 1. Problem

The app asked Supabase for the **entire `profiles` row** (`select('*'`) in nine places. The `profiles` row is ~107 kB, far too large, because a column inside holds a large image/file payload (the `avatar` base64 photo).

## 2. Fix applied (commits `a5cf179` → `12a1a99`)

Every `from('profiles')` read now uses a single shared allow-list constant instead of a hand-written string or `*`, excluding the heavy `avatar` column and the invalid columns.

- `src/lib/profileColumns.ts` — new shared constant `PROFILE_COLUMNS`.
- `src/contexts/AuthContext.tsx`, `src/lib/api.ts`, `src/pages/dashboard/Settings.tsx` — use `PROFILE_COLUMNS`.
- `api/inventory.js`, `api/users.js` — use the same literal allow-list.

```ts
export const PROFILE_COLUMNS =
  'id,code,role,member_no,name,phone,branch,occupation,designation,addr,dob,gender,' +
  'salary,active,join_date,sahachari_paid,sah_miss,total_donated,perms,is_approver,' +
  'member_unique_code,created_by,assigned_zone,is_active,must_change_password,admin_title,bio';
```

Notes:
- `email` is **not** a profiles column (it lives in Supabase Auth) — callers already override with the auth user email (`{ ...row, email: user.email }`).
- `is_panel_coordinator` is **not** a profiles column — mapped in code only.

## 3. Validation

- `npx tsc --noEmit` → **PASS**
- `npm run build` → **PASS**
- Deploy → **READY** — `skssf-main-22w29yky9-luca-glow-s-projects.vercel.app` · commit `12a1a99`

## 4. Outstanding / next steps

- Re-test login locally (`npm run dev`), confirm no red `profiles?...` request in Network tab, then keep the new deploy.
- Avatar: load separately via `supabase.from('profiles').select('avatar').eq('id', id).single()` where a photo is needed; long-term = Supabase Storage.
- `/bootstrap` slowness: client-side in `src/lib/api.ts` (`/bootstrap` handler fans out to profiles/users/loans/campaigns/donations/products/units/kits/inventory; `syncFromBackend()` in `src/lib/localDb.ts` re-runs it after every write).

## 5. Explicitly not performed

- Authenticated production E2E — **NOT PERFORMED**.
- Live network capture — **NOT PERFORMED**.

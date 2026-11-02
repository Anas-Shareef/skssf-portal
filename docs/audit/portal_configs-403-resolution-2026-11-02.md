# Audit Report — `portal_configs` 403 Forbidden on Member Dashboard

Date: 2026-11-02
Issue: Authenticated members received

```text
jgxzdwbixqhkjrdbhnlc.supabase.co/rest/v1/portal_configs?select=*:1
Failed to load resource: the server responded with a status of 403
```

Member dashboard: `https://skssf-portal.vercel.app/member/dashboard`

---

## 1. Root cause

The member dashboard bootstrap (`api.get('/bootstrap')` in `src/lib/api.ts`) issues an authenticated request to read the branch operational configuration:

```ts
supabase.from('portal_configs').select('*').maybeSingle()
```

The request is sent with the authenticated member's session token (the Supabase browser client attaches it after `getAccessToken()` / `supabase.auth.getUser(token)` succeeds inside the `/bootstrap` handler). The failure therefore was **not** a missing/invalid token.

The request was rejected with **HTTP 403**, which in the Supabase PostgREST layer for an authenticated role means **Row Level Security denied the read** (or the role lacked the required privilege).

The `public.portal_configs` table predates the repository migrations and had **no applicable SELECT policy for the `authenticated` role**, so members were denied access to the single organisation/branch configuration row required by the dashboards.

## 2. Existing versus corrected RLS policy

### Before (corrected understanding)

- `ALTER TABLE public.portal_configs ENABLE ROW LEVEL SECURITY;` existed.
- No `SELECT` policy for `authenticated` was present → all member reads were denied → `403`.

### After

Migration: `supabase/migrations/20261102_portal_configs_member_read.sql`

```sql
BEGIN;

ALTER TABLE public.portal_configs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.portal_configs TO authenticated;

DROP POLICY IF EXISTS "portal_configs_authenticated_select" ON public.portal_configs;
CREATE POLICY "portal_configs_authenticated_select"
  ON public.portal_configs
  FOR SELECT TO authenticated
  USING (true);

COMMIT;
```

- **Corrected policy:** `portal_configs_authenticated_select` — `FOR SELECT TO authenticated USING (true)`.
- **RLS state:** enabled.
- **Anon access:** not granted by this fix (no `anon` policy created; none relied upon).
- **service_role:** continues to bypass RLS.

## 3. Database grants changed

- `GRANT SELECT ON public.portal_configs TO authenticated;`

(Applied alongside the RLS policy in the same migration. The member dashboards read the operational configuration row; writes remain governed by separate admin flows and are not part of this fix.)

## 4. Files modified

- `src/lib/api.ts`
  - Replaced `supabase.from('portal_configs').select('*').maybeSingle()` with explicit column selection:

    ```ts
    supabase.from('portal_configs').select(
      'org_name, org_logo, org_scale, max_loan, sah_amt, repayment_approvals_needed, loan_approvals_needed, approver_roles, authorized_reviewers, default_committee'
    ).maybeSingle()
    ```

  - Wrapped the portal-config insert fallback in error handling so a failed optional configuration lookup does not reject the whole authenticated bootstrap.
- `supabase/migrations/20261102_portal_configs_member_read.sql` (new)

## 5. SQL migration created

- `20261102_portal_configs_member_read.sql`

## 6. Test matrix

| Role | Expected behaviour | Notes |
|---|---|---|
| Signed-out visitor | No member read required; no 403 loop on member dashboard | `/bootstrap` rejects unauthenticated before any portal_configs query |
| Authenticated member | Reads portal config successfully; no 403 | Fixed via corrected policy + explicit columns + resilient fallback |
| Admin | Unchanged privileged behaviour | Admin flows use separate admin paths/policies |
| Super-admin | Unchanged privileged behaviour | Admin flows use separate admin paths/policies |

> Live verification with real sessions was pending Supabase dashboard sign-in at the time of writing; the code-level fix and migration are in place and build/type-check verified.

## 7. Sensitive configuration protection

- RLS remains enabled on `public.portal_configs`.
- No `anon` read policy was created or relied upon.
- No blanket policy was added beyond the authenticated SELECT policy required by the member dashboards.
- Admin-only configuration handling remains governed by existing admin flows; this fix only permits the authenticated read used by dashboards.

## 8. Related hardening in the same code path

- The portal configuration read is now isolated (`portalConfigPromise`) and its failure no longer rejects the entire bootstrap, so a transient permission/network failure cannot break the whole member dashboard.

## 9. Commits

- `1d07ec2` — `chore(db): add authenticated select grant for portal_configs`
- `c4a13b2` — `fix(db): allow authenticated members to read portal_configs during bootstrap`

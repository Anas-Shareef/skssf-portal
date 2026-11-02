-- ============================================================
-- 20261102_portal_configs_member_read.sql
-- ============================================================
--
-- Fixes: authenticated members received 403 on
--   GET /rest/v1/portal_configs?select=*:1
-- during the member dashboard bootstrap.
--
-- Cause: Row Level Security was enabled on public.portal_configs
-- without an applicable SELECT policy for the authenticated role,
-- so members were denied read access to the branch operational
-- configuration required by the dashboards.
--
-- Fix (minimum necessary):
--   - Keep RLS enabled.
--   - Allow SELECT for the authenticated role on the single
--     organisation/branch configuration row.
--   - No anon access is granted.
--   - service_role continues to bypass RLS.

BEGIN;

ALTER TABLE public.portal_configs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.portal_configs TO authenticated;

DROP POLICY IF EXISTS "portal_configs_authenticated_select" ON public.portal_configs;
CREATE POLICY "portal_configs_authenticated_select"
  ON public.portal_configs
  FOR SELECT TO authenticated
  USING (true);

COMMIT;

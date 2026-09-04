-- ============================================================================
-- ePTW — Contractors can view their own contractor row
--
-- PROBLEM: contractor_admin users could read their own membership row in
-- contractor_users, but RLS on `contractors` only allowed platform admins or
-- COMPANY users linked via contractor_companies. A contractor admin therefore
-- could not read their own contractor (company_name, company_code), so:
--   * the header CompanyBadge could not show the contractor code, and
--   * GET /api/contractors returned [] for the contractor's own account.
--
-- FIX: add an additive SELECT policy that lets an ACTIVE member of the
-- contractor (via contractor_users) read their own contractor row. This is
-- additive (OR) — company-side and platform-admin visibility is unchanged.
-- Idempotent: safe to run more than once.
-- ============================================================================

DROP POLICY IF EXISTS "Contractors can view own contractor"
  ON public.contractors;

CREATE POLICY "Contractors can view own contractor"
  ON public.contractors
  FOR SELECT TO authenticated
  USING (
    (is_active = true)
    AND (
      is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.contractor_users cu
        WHERE cu.contractor_id = contractors.id
          AND cu.user_id = auth.uid()
          AND cu.is_active = true
      )
    )
  );

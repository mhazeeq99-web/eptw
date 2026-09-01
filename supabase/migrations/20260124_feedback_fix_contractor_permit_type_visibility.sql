-- ============================================================================
-- ePTW — Contractors cannot see permit-type Safety-Control / PPE mappings
-- ============================================================================
-- When a contractor creates a permit for a customer company they are authorized
-- for, the Safety Controls and PPE Requirements sections were empty ("No safety
-- controls are configured for this permit type", no PPE "Recommended" badges),
-- even though the Safety Manager's form for the same company/permit type showed
-- them.
--
-- Root cause: the SELECT policies on permit_type_safety_controls and
-- permit_type_ppe scoped visibility to `get_my_company_id()`, which returns
-- NULL for external contractor users (company_id is null). So contractors could
-- never read the mappings for the customer companies they serve.
--
-- Fix: add an additional permissive SELECT policy on each table that lets the
-- current user view mappings whose permit type belongs to a company that
-- authorizes the current user's contractor (mirrors the existing "Users can
-- view authorized permit types" policy on public.permit_types).
--
-- Idempotent: safe to run more than once.
-- ============================================================================

DROP POLICY IF EXISTS "Contractors can view authorized permit type safety controls"
  ON public.permit_type_safety_controls;
CREATE POLICY "Contractors can view authorized permit type safety controls"
  ON public.permit_type_safety_controls
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.permit_types pt
      WHERE pt.id = permit_type_safety_controls.permit_type_id
        AND pt.is_active = true
        AND EXISTS (
          SELECT 1
          FROM public.contractor_companies cc
          WHERE cc.company_id = pt.company_id
            AND cc.contractor_id = get_my_contractor_id()
            AND cc.is_active = true
        )
    )
  );

DROP POLICY IF EXISTS "Contractors can view authorized permit type PPE"
  ON public.permit_type_ppe;
CREATE POLICY "Contractors can view authorized permit type PPE"
  ON public.permit_type_ppe
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.permit_types pt
      WHERE pt.id = permit_type_ppe.permit_type_id
        AND pt.is_active = true
        AND EXISTS (
          SELECT 1
          FROM public.contractor_companies cc
          WHERE cc.company_id = pt.company_id
            AND cc.contractor_id = get_my_contractor_id()
            AND cc.is_active = true
        )
    )
  );

-- ============================================================================
-- ePTW — RLS fixes discovered by the 5-role compatibility audit
-- ============================================================================
-- 1. permit_approvals / "Requesters can create own contractor submission
--    history": the policy required p.status = 'submitted' (legacy supervisor
--    chain), but the current submit flow moves contractor PTWs directly
--    draft -> pending_approval, so the audit-history insert always violated
--    RLS and contractor submission returned HTTP 500.
--
--    Fix: accept both 'submitted' (legacy rows) and 'pending_approval'
--    (current flow). Isolation is unchanged: the actor must still be the
--    permit requester and the contractor must still be authorized for the
--    permit's company.
--
-- Idempotent: safe to run again.
-- ============================================================================

DROP POLICY IF EXISTS "Requesters can create own contractor submission history"
  ON public.permit_approvals;

CREATE POLICY "Requesters can create own contractor submission history"
  ON public.permit_approvals
  FOR INSERT
  WITH CHECK (
    (performed_by = auth.uid())
    AND (EXISTS (
      SELECT 1 FROM public.permits p
      WHERE ((p.id = permit_approvals.permit_id)
        AND (p.requester_id = auth.uid())
        AND (p.status = ANY (ARRAY[
          'submitted'::permit_status,
          'pending_approval'::permit_status
        ]))
        AND is_contractor_authorized_for_company(p.company_id))
    ))
  );

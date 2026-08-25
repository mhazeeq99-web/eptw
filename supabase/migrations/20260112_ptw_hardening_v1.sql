-- ============================================================================
-- ePTW — Production Hardening V1
--   * DB-level permit state-machine boundary (BEFORE UPDATE trigger)
--   * RLS hardening: verifier-gated writes on safety-readiness tables
-- ============================================================================
-- The application remains responsible for readiness, entitlement, validity
-- and detailed safety checks. This migration only enforces the FUNDAMENTAL
-- status-transition boundary at the database so direct REST/API manipulation
-- cannot bypass the workflow (e.g. DRAFT->ACTIVE, PENDING_APPROVAL->ACTIVE,
-- REJECTED->ACTIVE, SUSPENDED->COMPLETED, ACTIVE->CLOSED, REJECTED->CLOSED).
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permit state-machine boundary (BEFORE UPDATE trigger).
--    Any status change MUST be authorised through the controlled transition
--    RPC (public.perform_permit_transition) which sets a transaction-local
--    GUC. Raw REST/PostgREST writes that bypass the application are blocked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_permit_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  v_old := OLD.status::text;
  v_new := NEW.status::text;

  -- No status change (e.g. editing work details) is always allowed.
  IF v_old = v_new THEN
    RETURN NEW;
  END IF;

  -- Platform Admin may perform controlled administrative corrections.
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Any status change MUST have been authorised through
  -- public.perform_permit_transition() (which sets this transaction-local
  -- GUC). Raw REST/PostgREST writes that bypass the application are blocked.
  -- NOTE: the GUC is NULL (not set) on raw REST/PostgREST writes. The plain
  -- `<>` comparison would yield NULL (falsy) and silently allow the status
  -- change, so `IS DISTINCT FROM` is required to treat NULL as unauthorised.
  IF current_setting('app.permit_transition', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Direct permit status changes are not allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permit_state_transition ON public.permits;
CREATE TRIGGER trg_permit_state_transition
  BEFORE UPDATE ON public.permits
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_permit_state_transition();

-- ----------------------------------------------------------------------------
-- 1b. Controlled transition RPC (the ONLY way a permit status may change).
--     SECURITY DEFINER so it can set the GUC + update; enforces the state
--     machine, company/contractor scope, and returns the updated row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perform_permit_transition(
  p_permit_id bigint,
  p_expected_status text,
  p_new_status text,
  p_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_company bigint;
  v_row public.permits%ROWTYPE;
  v_old text;
  v_allowed boolean;
  v_is_contractor boolean := false;
  v_key text;
  v_expr text;
  v_sql text;
  v_kv text := '';
BEGIN
  SELECT role, company_id INTO v_role, v_company
  FROM public.profiles WHERE id = v_caller AND is_active = true;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_row FROM public.permits WHERE id = p_permit_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Permit not found'; END IF;

  -- Company user: permit must belong to caller's company.
  IF v_role <> 'platform_admin' AND v_company IS NOT NULL
     AND v_row.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Not authorized for this permit';
  END IF;

  -- Contractor admin: caller must be the requester of a contractor permit.
  IF v_role = 'contractor_admin' THEN
    IF v_row.requester_id IS DISTINCT FROM v_caller OR v_row.contractor_id IS NULL THEN
      RAISE EXCEPTION 'Not authorized for this permit';
    END IF;
    v_is_contractor := true;
  END IF;

  IF v_row.status::text <> p_expected_status THEN
    RAISE EXCEPTION 'Permit is not in the expected state (%)', p_expected_status;
  END IF;

  v_old := v_row.status::text;

  v_allowed := (
    (v_old = 'draft' AND p_new_status IN ('pending_approval','cancelled')) OR
    (v_old = 'pending_approval' AND p_new_status IN ('active','rejected','cancelled')) OR
    (v_old = 'rejected' AND p_new_status IN ('pending_approval','cancelled')) OR
    (v_old = 'active' AND p_new_status IN ('suspended','completed','cancelled')) OR
    (v_old = 'suspended' AND p_new_status IN ('active','cancelled')) OR
    (v_old = 'completed' AND p_new_status = 'closed') OR
    (v_old = 'approved' AND p_new_status IN ('issued','cancelled')) OR
    (v_old = 'issued' AND p_new_status IN ('active','cancelled'))
  );

  -- Contractors may only submit or cancel; they cannot approve/suspend/etc.
  IF v_is_contractor AND NOT (
    (v_old = 'draft' AND p_new_status = 'pending_approval') OR
    p_new_status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Contractor is not authorized for this transition';
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid permit status transition: % -> %', v_old, p_new_status;
  END IF;

  -- Build a safe, type-aware column assignment list from a whitelist
  -- using the ->> (text) operator then casting to the target column type.
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key IN (
      'approved_by','approved_at','actual_start','valid_from','valid_until',
      'submitted_by','submitted_at','rejection_reason','suspension_reason',
      'suspended_by','suspended_at','completed_by','completed_at','closed_by',
      'closed_at','cancelled_by','cancelled_at','workflow_stage'
    ) THEN
      IF v_key IN (
        'approved_at','actual_start','valid_from','valid_until',
        'submitted_at','suspended_at','completed_at','closed_at','cancelled_at'
      ) THEN
        v_expr := format('%I = NULLIF(($3::jsonb ->> %L), '''')::timestamptz', v_key, v_key);
      ELSIF v_key IN (
        'approved_by','submitted_by','suspended_by','completed_by',
        'closed_by','cancelled_by'
      ) THEN
        v_expr := format('%I = NULLIF(($3::jsonb ->> %L), '''')::uuid', v_key, v_key);
      ELSE
        v_expr := format('%I = ($3::jsonb ->> %L)::text', v_key, v_key);
      END IF;
      IF v_kv <> '' THEN v_kv := v_kv || ', '; END IF;
      v_kv := v_kv || v_expr;
    END IF;
  END LOOP;

  PERFORM set_config('app.permit_transition', 'true', true);

  IF v_kv = '' THEN
    UPDATE public.permits
      SET status = p_new_status::permit_status
      WHERE id = p_permit_id;
  ELSE
    EXECUTE 'UPDATE public.permits SET status = $2::permit_status, ' || v_kv || ' WHERE id = $1'
      USING p_permit_id, p_new_status::permit_status, p_fields;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_permit_id, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.perform_permit_transition(bigint, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_permit_transition(bigint, text, text, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 1c. is_safety_verifier helper + verifier-gated RLS (see below)
-- ----------------------------------------------------------------------------
-- 2. RLS hardening: safety-readiness tables are verifier-gated for writes.
--    SELECT stays can_access_permit (all permit stakeholders may view).
--    INSERT/UPDATE/DELETE require a Safety verifier (SM/SC) or platform admin.
-- ----------------------------------------------------------------------------

-- Helper: is the acting user a safety verifier (SM/SC)?
CREATE OR REPLACE FUNCTION public.is_safety_verifier()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('safety_manager'::user_role, 'safety_coordinator'::user_role)
  );
$$;

-- site verification
DROP POLICY IF EXISTS "Authorized users can add site verification" ON public.permit_site_verifications;
CREATE POLICY "Safety verifiers can add site verification"
  ON public.permit_site_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

DROP POLICY IF EXISTS "Authorized users can update site verification" ON public.permit_site_verifications;
CREATE POLICY "Safety verifiers can update site verification"
  ON public.permit_site_verifications
  FOR UPDATE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  )
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

DROP POLICY IF EXISTS "Authorized users can delete site verification" ON public.permit_site_verifications;
CREATE POLICY "Safety verifiers can delete site verification"
  ON public.permit_site_verifications
  FOR DELETE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

-- worker briefings
DROP POLICY IF EXISTS "Authorized users can add worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Safety verifiers can add worker briefings"
  ON public.permit_worker_briefings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

DROP POLICY IF EXISTS "Authorized users can update worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Safety verifiers can update worker briefings"
  ON public.permit_worker_briefings
  FOR UPDATE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  )
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

DROP POLICY IF EXISTS "Authorized users can delete worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Safety verifiers can delete worker briefings"
  ON public.permit_worker_briefings
  FOR DELETE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

-- emergency arrangements
DROP POLICY IF EXISTS "Authorized users can add emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Safety verifiers can add emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

DROP POLICY IF EXISTS "Authorized users can update emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Safety verifiers can update emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR UPDATE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  )
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

DROP POLICY IF EXISTS "Authorized users can delete emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Safety verifiers can delete emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR DELETE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

-- PPE verification: only the verification columns are verifier-written, but
-- RLS is row-based, so UPDATE is restricted to safety verifiers. The
-- requester keeps INSERT and DELETE (creating/replacing the PPE selection
-- during permit setup); only the UPDATE that marks items verified is gated.
DROP POLICY IF EXISTS "Authorized users can update permit PPE" ON public.permit_ppe;
CREATE POLICY "Safety verifiers can update permit PPE"
  ON public.permit_ppe
  FOR UPDATE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  )
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

-- worker acknowledgement (permit_workers.briefed/acknowledged): UPDATE is
-- verifier-gated so acknowledgement is recorded by an authorised actor. The
-- requester keeps INSERT/DELETE for managing the worker list during setup.
DROP POLICY IF EXISTS "Authorized users can update permit workers" ON public.permit_workers;
CREATE POLICY "Safety verifiers can update permit workers"
  ON public.permit_workers
  FOR UPDATE TO authenticated
  USING (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  )
  WITH CHECK (
    public.can_access_permit(permit_id)
    AND (public.is_safety_verifier() OR is_platform_admin())
  );

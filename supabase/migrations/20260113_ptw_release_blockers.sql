-- ============================================================================
-- ePTW — Production Release Blocker Fix (from the FINAL RELEASE AUDIT)
--   BLOCKER 1: perform_permit_transition RPC must not let internal_staff /
--              contractor_admin / platform_admin force a permit to ACTIVE.
--   BLOCKER 2: RLS/trigger verifier guard so internal_staff / contractor_admin
--              cannot self-certify safety readiness (JHA / LOTO / gas / PPE /
--              worker acknowledgement) via direct Supabase/PostgREST writes.
--
-- Scope: ONLY these two DB-layer authorization gaps. No role, workflow,
-- entitlement, or billing changes. No sixth role.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BLOCKER 1 — Role-gate ACTIVE transitions inside perform_permit_transition.
-- Only Safety Manager / Safety Coordinator may transition a permit to ACTIVE
-- (pending_approval -> active, suspended -> active). Internal Staff, Contractor
-- Admin and Platform Admin are NOT operational approvers. SM/SC self-approval
-- is preserved. All other lifecycle transitions and company/contractor scope
-- checks are unchanged.
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

  -- BLOCKER 1: Only a Safety Manager or Safety Coordinator may ACTIVATE or
  -- RESUME a permit (transition to ACTIVE). Internal Staff, Contractor Admin
  -- and Platform Admin are NOT operational approvers. SM/SC self-approval is
  -- preserved. This prevents direct-RPC internal_staff forcing ACTIVE while
  -- bypassing readiness / entitlement / validity / SM-approval.
  IF p_new_status = 'active' AND v_role NOT IN ('safety_manager','safety_coordinator') THEN
    RAISE EXCEPTION 'Only a Safety Manager or Safety Coordinator can activate or resume a permit';
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

-- The RPC is still a controlled, role-gated app endpoint for authenticated
-- users. Remove the anonymous execution grant (anon has no profile, but this
-- closes the surface). Keep authenticated (the role gate is enforced inside).
REVOKE ALL ON FUNCTION public.perform_permit_transition(bigint, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.perform_permit_transition(bigint, text, text, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- BLOCKER 2 — Verifier write guard on safety-readiness tables.
-- A non-verifier (internal_staff, contractor_admin) may create/edit ordinary
-- permit data during preparation (e.g. add workers, select PPE, create a JHA,
-- mark a JHA 'completed') but may NEVER self-certify safety readiness:
--   - set JHA / LOTO / gas status to 'verified' or write verified_by/at
--   - mark permit_ppe.verified = true
--   - mark permit_workers.acknowledged = true
-- The trusted service-role backend and platform_admin pass through unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verifier_readiness_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verifier boolean;
BEGIN
  v_verifier := public.is_safety_verifier()
                OR public.is_platform_admin()
                OR (auth.role() = 'service_role');

  -- JHA / LOTO / Gas testing.
  IF TG_TABLE_NAME IN ('jhas','loto_isolation_points','gas_tests') THEN
    IF NOT v_verifier THEN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'verified'
           OR NEW.verified_by IS NOT NULL
           OR NEW.verified_at IS NOT NULL THEN
          RAISE EXCEPTION 'Only a safety verifier can set verification on %', TG_TABLE_NAME;
        END IF;
      ELSIF TG_OP = 'UPDATE' THEN
        IF (NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified')
           OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
           OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
          RAISE EXCEPTION 'Only a safety verifier can set verification on %', TG_TABLE_NAME;
        END IF;
      END IF;
    END IF;
  END IF;

  -- permit_ppe: a non-verifier may select PPE but never mark it verified.
  -- (UPDATE is already verifier-gated via RLS; this guards INSERT.)
  IF TG_TABLE_NAME = 'permit_ppe' AND NOT v_verifier AND TG_OP = 'INSERT' THEN
    IF NEW.verified = true
       OR NEW.verified_by IS NOT NULL
       OR NEW.verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only a safety verifier can mark PPE as verified';
    END IF;
  END IF;

  -- permit_workers: a non-verifier may add workers but never acknowledge them.
  -- (UPDATE is already verifier-gated via RLS; this guards INSERT.)
  IF TG_TABLE_NAME = 'permit_workers' AND NOT v_verifier AND TG_OP = 'INSERT' THEN
    IF NEW.acknowledged = true
       OR NEW.acknowledged_by IS NOT NULL
       OR NEW.acknowledged_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only a safety verifier can acknowledge workers';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_jhas_verification ON public.jhas;
CREATE TRIGGER trg_guard_jhas_verification
  BEFORE INSERT OR UPDATE ON public.jhas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_readiness_writes();

DROP TRIGGER IF EXISTS trg_guard_loto_verification ON public.loto_isolation_points;
CREATE TRIGGER trg_guard_loto_verification
  BEFORE INSERT OR UPDATE ON public.loto_isolation_points
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_readiness_writes();

DROP TRIGGER IF EXISTS trg_guard_gas_verification ON public.gas_tests;
CREATE TRIGGER trg_guard_gas_verification
  BEFORE INSERT OR UPDATE ON public.gas_tests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_readiness_writes();

DROP TRIGGER IF EXISTS trg_guard_permit_ppe ON public.permit_ppe;
CREATE TRIGGER trg_guard_permit_ppe
  BEFORE INSERT OR UPDATE ON public.permit_ppe
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_readiness_writes();

DROP TRIGGER IF EXISTS trg_guard_permit_workers ON public.permit_workers;
CREATE TRIGGER trg_guard_permit_workers
  BEFORE INSERT OR UPDATE ON public.permit_workers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_readiness_writes();

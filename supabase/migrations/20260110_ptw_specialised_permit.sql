-- ============================================================================
-- ePTW — Phase E: Specialised Permit Requirements
-- ============================================================================
-- Adds the permit-type-driven specialised layer on top of the existing common
-- PTW modules (JHA / LOTO / Gas / PPE / Safety Controls / Site Verification /
-- Worker Briefing / Emergency Arrangements — all reused, never rebuilt).
--
-- Design:
--   1. permits.special_details  JSONB — permit-specific information per type
--      (HOT WORK DETAILS / CONFINED SPACE DETAILS / WORK AT HEIGHT DETAILS /
--      ELECTRICAL WORK DETAILS). JSONB is appropriate here: the specialised
--      fields are free-form job information, not reporting relationships.
--      Individual controls (fire watch, spark containment, attendant, rescue,
--      electrical isolation, test-before-touch...) are NOT duplicated — they
--      already exist in safety_controls / permit-type configuration.
--
--   2. permit_cse_personnel     relational table — permit-level CSE
--      responsibilities referencing permit_workers (Entry Supervisor /
--      Standby Attendant / Authorised Entrant). Relational is preferred here
--      because these are real references to listed workers.
--
--   3. companies.cse_separation_of_duties — configurable company policy
--      (default true): when enabled, the same worker cannot hold both the
--      Entry Supervisor and Standby responsibilities, and neither can also
--      be an Authorised Entrant on the same permit. When disabled, any
--      combination of listed workers is accepted. This is a COMPANY policy,
--      not a universal legal rule.
--
-- No sixth global role: CSE responsibilities are permit-level assignments.
-- No Excavation type is created (not present in the current catalogue).
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. permits.special_details (JSONB, default empty object)
-- ----------------------------------------------------------------------------
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS special_details jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. permit_cse_personnel (relational, references permit_workers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_cse_personnel (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  worker_id bigint NOT NULL REFERENCES public.permit_workers(id) ON DELETE CASCADE,
  responsibility text NOT NULL
    CHECK (responsibility IN ('entry_supervisor', 'standby_attendant', 'authorised_entrant')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, worker_id, responsibility)
);

CREATE INDEX IF NOT EXISTS permit_cse_personnel_permit_idx
  ON public.permit_cse_personnel (permit_id);

-- ----------------------------------------------------------------------------
-- 3. Configurable company separation-of-duty policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cse_separation_of_duties boolean NOT NULL DEFAULT true;

-- ----------------------------------------------------------------------------
-- 4. RLS — same can_access_permit() isolation model as every permit child
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_cse_personnel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view CSE personnel" ON public.permit_cse_personnel;
CREATE POLICY "Authorized users can view CSE personnel"
  ON public.permit_cse_personnel
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add CSE personnel" ON public.permit_cse_personnel;
CREATE POLICY "Authorized users can add CSE personnel"
  ON public.permit_cse_personnel
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update CSE personnel" ON public.permit_cse_personnel;
CREATE POLICY "Authorized users can update CSE personnel"
  ON public.permit_cse_personnel
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete CSE personnel" ON public.permit_cse_personnel;
CREATE POLICY "Authorized users can delete CSE personnel"
  ON public.permit_cse_personnel
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

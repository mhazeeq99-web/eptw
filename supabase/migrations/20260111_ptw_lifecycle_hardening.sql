-- ============================================================================
-- ePTW — Phase F: Final Operational Hardening (lifecycle)
-- ============================================================================
-- Hardens the PTW lifecycle: permit validity, expiry, suspension/revalidation,
-- completion and closure — without rebuilding existing modules or adding new
-- permit statuses.
--
-- Design:
--   1. permit_types.max_validity_hours      — configurable validity cap per
--      permit type (nullable; NULL = no cap). Company/system configuration,
--      NOT a DOSH mandate.
--   2. permit_types.expiry_warning_minutes  — configurable "expiring soon"
--      warning window (default 120 = 2 hours).
--   3. permits.valid_from / valid_until     — authoritative validity window,
--      set at approval/issue (valid_from = actual start; valid_until =
--      min(planned_end, valid_from + max_validity_hours)). Derived validity
--      state (ACTIVE / EXPIRING SOON / EXPIRED) is computed centrally — the
--      underlying permit status enum is NOT changed.
--   4. permits.suspended_by / suspended_at  — suspension actor + timestamp
--      (reason already stored in suspension_reason).
--   5. permit_resume_checklists             — resume/revalidation checklist
--      (permit-scoped; status: applicable/completed/not_applicable, with
--      verified_by / verified_at / remarks).
--   6. permit_completion_checklists         — completion checklist
--      (permit-scoped; required items must be completed).
--   7. permit_closure_checklists            — closure checklist
--      (permit-scoped; all items completed before closing).
--
-- No new permit status enum values, no automatic close/delete of expired
-- permits, no sixth role. RLS: can_access_permit() on every new table.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permit-type validity configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_types
  ADD COLUMN IF NOT EXISTS max_validity_hours integer,
  ADD COLUMN IF NOT EXISTS expiry_warning_minutes integer NOT NULL DEFAULT 120;

-- ----------------------------------------------------------------------------
-- 2. Permit validity window + suspension actor/timestamp
-- ----------------------------------------------------------------------------
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

CREATE INDEX IF NOT EXISTS permits_valid_until_idx
  ON public.permits (valid_until);

-- ----------------------------------------------------------------------------
-- 3. Resume / revalidation checklist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_resume_checklists (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'applicable'
    CHECK (status IN ('applicable', 'completed', 'not_applicable')),
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, item_key)
);

CREATE INDEX IF NOT EXISTS permit_resume_checklists_permit_idx
  ON public.permit_resume_checklists (permit_id);

-- ----------------------------------------------------------------------------
-- 4. Completion checklist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_completion_checklists (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, item_key)
);

CREATE INDEX IF NOT EXISTS permit_completion_checklists_permit_idx
  ON public.permit_completion_checklists (permit_id);

-- ----------------------------------------------------------------------------
-- 5. Closure checklist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_closure_checklists (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, item_key)
);

CREATE INDEX IF NOT EXISTS permit_closure_checklists_permit_idx
  ON public.permit_closure_checklists (permit_id);

-- ----------------------------------------------------------------------------
-- 6. RLS — same can_access_permit() isolation model
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_resume_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_completion_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_closure_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view resume checklists" ON public.permit_resume_checklists;
CREATE POLICY "Authorized users can view resume checklists"
  ON public.permit_resume_checklists
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add resume checklists" ON public.permit_resume_checklists;
CREATE POLICY "Authorized users can add resume checklists"
  ON public.permit_resume_checklists
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update resume checklists" ON public.permit_resume_checklists;
CREATE POLICY "Authorized users can update resume checklists"
  ON public.permit_resume_checklists
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete resume checklists" ON public.permit_resume_checklists;
CREATE POLICY "Authorized users can delete resume checklists"
  ON public.permit_resume_checklists
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can view completion checklists" ON public.permit_completion_checklists;
CREATE POLICY "Authorized users can view completion checklists"
  ON public.permit_completion_checklists
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add completion checklists" ON public.permit_completion_checklists;
CREATE POLICY "Authorized users can add completion checklists"
  ON public.permit_completion_checklists
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update completion checklists" ON public.permit_completion_checklists;
CREATE POLICY "Authorized users can update completion checklists"
  ON public.permit_completion_checklists
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete completion checklists" ON public.permit_completion_checklists;
CREATE POLICY "Authorized users can delete completion checklists"
  ON public.permit_completion_checklists
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can view closure checklists" ON public.permit_closure_checklists;
CREATE POLICY "Authorized users can view closure checklists"
  ON public.permit_closure_checklists
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add closure checklists" ON public.permit_closure_checklists;
CREATE POLICY "Authorized users can add closure checklists"
  ON public.permit_closure_checklists
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update closure checklists" ON public.permit_closure_checklists;
CREATE POLICY "Authorized users can update closure checklists"
  ON public.permit_closure_checklists
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete closure checklists" ON public.permit_closure_checklists;
CREATE POLICY "Authorized users can delete closure checklists"
  ON public.permit_closure_checklists
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

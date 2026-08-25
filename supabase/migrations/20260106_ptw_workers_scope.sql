-- ============================================================================
-- ePTW — Phase A: multi-worker permit_workers + work scope
-- ============================================================================
-- Replaces the single worker_name/worker_id concept with a relational
-- permit_workers child table (queried/filtered/reported), backfills existing
-- worker data, and adds permit.work_method (work method / sequence).
--
-- Worker fields:
--   internal    : full_name, id_number (employee ID)
--   contractor  : full_name, id_number (NRIC/passport), nationality,
--                 contractor_id, induction_completed (safety induction)
--
-- NRIC/passport is sensitive personal information: it lives only inside the
-- permit's RLS scope (can_access_permit) and is never exposed in list
-- queries, URLs or logs.
--
-- Legacy worker_name / worker_id columns are kept populated from the first
-- worker for back-compatibility; the application reads/writes permit_workers.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. permit_workers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_workers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  id_number text,
  nationality text,
  is_contractor boolean NOT NULL DEFAULT false,
  contractor_id bigint REFERENCES public.contractors(id) ON DELETE SET NULL,
  induction_completed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permit_workers_permit_idx
  ON public.permit_workers (permit_id);

-- Backfill the legacy single-worker fields into permit_workers (idempotent:
-- only permits with no existing worker rows and a worker_name are migrated;
-- induction status was not tracked historically, so it defaults to false).
INSERT INTO public.permit_workers (
  permit_id, full_name, id_number, is_contractor,
  contractor_id, induction_completed, created_by
)
SELECT
  p.id,
  p.worker_name,
  p.worker_id,
  (p.contractor_id IS NOT NULL),
  p.contractor_id,
  false,
  p.requester_id
FROM public.permits p
WHERE p.worker_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.permit_workers w WHERE w.permit_id = p.id
  );

-- ----------------------------------------------------------------------------
-- 2. Work scope (work method / sequence — genuine free text)
-- ----------------------------------------------------------------------------
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS work_method text;

-- ----------------------------------------------------------------------------
-- 3. RLS — same can_access_permit pattern as jhas/loto/gas (company isolation)
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view permit workers" ON public.permit_workers;
CREATE POLICY "Authorized users can view permit workers"
  ON public.permit_workers
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add permit workers" ON public.permit_workers;
CREATE POLICY "Authorized users can add permit workers"
  ON public.permit_workers
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update permit workers" ON public.permit_workers;
CREATE POLICY "Authorized users can update permit workers"
  ON public.permit_workers
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete permit workers" ON public.permit_workers;
CREATE POLICY "Authorized users can delete permit workers"
  ON public.permit_workers
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

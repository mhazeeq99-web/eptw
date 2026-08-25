-- ============================================================================
-- ePTW — Phase D: Site Verification + Worker Briefing + Safety Verification
-- ============================================================================
-- Adds the SELECTED -> COMPLETED -> VERIFIED distinction for the permit's
-- physical-readiness requirements:
--
--   1. Permit-type configuration flags:
--        permit_types.requires_site_verification      (default true)
--        permit_types.requires_worker_briefing        (default false, opt-in)
--        permit_types.requires_emergency_arrangements (default false, opt-in)
--
--   2. permit_type_site_checklist — per-permit-type site/work-area checklist
--      template (base items for every type + code-specific items for
--      HOT / CSE / WAH / ELEC). "Required" items gate approval; optional
--      items never block. Applicability is driven by permit type, which is
--      itself company-scoped configuration.
--
--   3. permit_site_verifications — 1:1 permit record:
--        status      NOT VERIFIED | VERIFIED | FAILED / NOT ACCEPTABLE
--        verified_by / verified_at / remarks
--        checklist   jsonb [{key,label,status:'ok'|'fail'|'na',applicable,required}]
--
--   4. permit_worker_briefings — 1:1 permit record:
--        status      NOT BRIEFED | BRIEFED
--        briefed_by / briefed_at / remarks
--        topics      jsonb [{key,label,covered}]
--      Worker acknowledgement reuses permit_workers (no separate master DB):
--        permit_workers.briefed / acknowledged / acknowledged_by / acknowledged_at
--
--   5. PPE availability/verification on the existing permit_ppe rows:
--        permit_ppe.verified / verified_by / verified_at
--      Required PPE must be SELECTED and VERIFIED; recommended never blocks.
--
--   6. permit_emergency_arrangements — 1:1 permit record (PTW readiness only):
--        status, emergency_contact, muster_point, emergency_procedure,
--        first_aid_available, fire_response_available,
--        rescue_required, rescue_available, confirmed_by / confirmed_at
--
--   7. RLS on every new table uses the existing can_access_permit() pattern
--      (company isolation; platform admin unchanged). No existing policy is
--      weakened.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permit-type configuration flags
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_types
  ADD COLUMN IF NOT EXISTS requires_site_verification boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_worker_briefing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_emergency_arrangements boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 2. Site / work-area checklist template per permit type
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_type_site_checklist (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_type_id bigint NOT NULL REFERENCES public.permit_types(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_type_id, item_key)
);

CREATE INDEX IF NOT EXISTS permit_type_site_checklist_type_idx
  ON public.permit_type_site_checklist (permit_type_id);

-- Base checklist items for every permit type (company-adopted defaults; NOT
-- universal legal requirements). Required = gates approval; optional = never.
INSERT INTO public.permit_type_site_checklist (permit_type_id, item_key, label, is_required, sort_order)
SELECT pt.id, v.item_key, v.label, v.is_required, v.sort_order
FROM public.permit_types pt
JOIN (VALUES
  ('work_area_inspected',        'Work area inspected',                    true,  10),
  ('work_boundaries',            'Work boundaries identified',             true,  20),
  ('access_egress',              'Access / egress acceptable',             true,  30),
  ('lighting',                   'Work area adequately lit',               false, 40),
  ('housekeeping',               'Housekeeping acceptable',                false, 50),
  ('safety_controls_available',  'Required safety controls available',     true,  60),
  ('ppe_available',              'Required PPE available',                 true,  70),
  ('equipment_condition',        'Equipment / plant condition acceptable', false, 80),
  ('isolation_confirmed',        'Isolation requirements confirmed',       false, 90),
  ('emergency_confirmed',        'Emergency arrangements confirmed',       true,  100),
  ('safe_to_commence',           'Work area safe to commence',             true,  110)
) AS v(item_key, label, is_required, sort_order) ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.permit_type_site_checklist c
  WHERE c.permit_type_id = pt.id AND c.item_key = v.item_key
);

-- Code-specific items (HOT / CSE / WAH / ELEC).
INSERT INTO public.permit_type_site_checklist (permit_type_id, item_key, label, is_required, sort_order)
SELECT pt.id, v.item_key, v.label, v.is_required, v.sort_order
FROM public.permit_types pt
JOIN (VALUES
  ('HOT',  'combustibles_removed',         'Combustibles removed',                   true,  120),
  ('HOT',  'fire_extinguisher_available',  'Fire extinguisher available',            true,  130),
  ('HOT',  'fire_watch_confirmed',         'Fire watch confirmed',                   true,  140),
  ('HOT',  'spark_containment',            'Spark containment confirmed',            true,  150),
  ('CSE',  'gas_test_verified',            'Gas test verified',                      true,  120),
  ('CSE',  'ventilation_confirmed',        'Ventilation confirmed',                  true,  130),
  ('CSE',  'standby_person_confirmed',     'Standby person confirmed',               true,  140),
  ('CSE',  'rescue_arrangement_confirmed', 'Rescue arrangement confirmed',           true,  150),
  ('CSE',  'entry_area_inspected',         'Entry area inspected',                   true,  160),
  ('WAH',  'access_equipment_inspected',   'Access equipment inspected',             true,  120),
  ('WAH',  'fall_protection_available',    'Fall protection available',              true,  130),
  ('WAH',  'exclusion_zone_established',   'Exclusion zone established',             true,  140),
  ('WAH',  'falling_object_controls',      'Falling-object controls established',    true,  150),
  ('ELEC', 'electrical_isolation_verified','Electrical isolation verified',          true,  120),
  ('ELEC', 'loto_verified',                'LOTO verified',                          true,  130),
  ('ELEC', 'test_verification_completed',  'Test / verification completed',          true,  140),
  ('ELEC', 'electrical_ppe_available',     'Electrical PPE available',               true,  150)
) AS v(code, item_key, label, is_required, sort_order) ON v.code = pt.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permit_type_site_checklist c
  WHERE c.permit_type_id = pt.id AND c.item_key = v.item_key
);

-- Isolation confirmation stays optional in the base set; the code-specific
-- rows above add the type-critical items (e.g. CSE gas test / ventilation /
-- standby / rescue, ELEC electrical isolation + LOTO) as required.

-- ----------------------------------------------------------------------------
-- 3. Site verification record (1:1 with permit)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_site_verifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL UNIQUE REFERENCES public.permits(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_verified'
    CHECK (status IN ('not_verified', 'verified', 'failed')),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Worker briefing (1:1 with permit) + worker acknowledgement state
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_worker_briefings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL UNIQUE REFERENCES public.permits(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_briefed'
    CHECK (status IN ('not_briefed', 'briefed')),
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  briefed_by uuid REFERENCES public.profiles(id),
  briefed_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permit_workers
  ADD COLUMN IF NOT EXISTS briefed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- ----------------------------------------------------------------------------
-- 5. PPE availability / verification (existing permit_ppe rows)
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_ppe
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- ----------------------------------------------------------------------------
-- 6. Emergency arrangements (PTW readiness only — no emergency module)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_emergency_arrangements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL UNIQUE REFERENCES public.permits(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_confirmed'
    CHECK (status IN ('not_confirmed', 'confirmed')),
  emergency_contact text,
  muster_point text,
  emergency_procedure text,
  first_aid_available boolean NOT NULL DEFAULT false,
  fire_response_available boolean NOT NULL DEFAULT false,
  rescue_required boolean NOT NULL DEFAULT false,
  rescue_available boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmed_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. RLS — same can_access_permit() isolation model as every permit child
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_type_site_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_site_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_worker_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_emergency_arrangements ENABLE ROW LEVEL SECURITY;

-- permit_type_site_checklist: company-scoped reads (same as
-- permit_type_safety_controls); safety manager / platform admin manage.
DROP POLICY IF EXISTS "Users can view company site checklist" ON public.permit_type_site_checklist;
CREATE POLICY "Users can view company site checklist"
  ON public.permit_type_site_checklist
  FOR SELECT TO authenticated
  USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.permit_types pt
      WHERE pt.id = permit_type_site_checklist.permit_type_id
        AND pt.company_id = get_my_company_id()
        AND pt.is_active = true
    )
  );

DROP POLICY IF EXISTS "Safety managers can manage site checklist" ON public.permit_type_site_checklist;
CREATE POLICY "Safety managers can manage site checklist"
  ON public.permit_type_site_checklist
  FOR ALL TO authenticated
  USING (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

DROP POLICY IF EXISTS "Authorized users can view site verification" ON public.permit_site_verifications;
CREATE POLICY "Authorized users can view site verification"
  ON public.permit_site_verifications
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add site verification" ON public.permit_site_verifications;
CREATE POLICY "Authorized users can add site verification"
  ON public.permit_site_verifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update site verification" ON public.permit_site_verifications;
CREATE POLICY "Authorized users can update site verification"
  ON public.permit_site_verifications
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete site verification" ON public.permit_site_verifications;
CREATE POLICY "Authorized users can delete site verification"
  ON public.permit_site_verifications
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can view worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Authorized users can view worker briefings"
  ON public.permit_worker_briefings
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Authorized users can add worker briefings"
  ON public.permit_worker_briefings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Authorized users can update worker briefings"
  ON public.permit_worker_briefings
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete worker briefings" ON public.permit_worker_briefings;
CREATE POLICY "Authorized users can delete worker briefings"
  ON public.permit_worker_briefings
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can view emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Authorized users can view emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Authorized users can add emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Authorized users can update emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete emergency arrangements" ON public.permit_emergency_arrangements;
CREATE POLICY "Authorized users can delete emergency arrangements"
  ON public.permit_emergency_arrangements
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

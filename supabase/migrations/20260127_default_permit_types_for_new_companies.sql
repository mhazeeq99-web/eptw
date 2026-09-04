-- ============================================================================
-- ePTW — Default permit types for newly registered companies
--
-- PROBLEM: companies created through register_company got NO permit types, so
-- a brand-new Safety Manager opened Settings -> Permit Types and found an
-- empty list (company 1 & 3 had their five standards seeded out-of-band).
--
-- FIX:
--   1. seed_company_defaults(company_id) — idempotently creates the five
--      standard permit types (HOT / COLD / CSE / ELEC / WAH) for a company,
--      together with their canonical site-checklists, recommended PPE and
--      required/recommended safety-control mappings. Everything is keyed by
--      code/name against the GLOBAL catalogues, so it works for any company.
--   2. register_company now calls it immediately after creating the company +
--      Safety Manager profile.
--   3. Backfill: every EXISTING company missing any of the five standards
--      gets them too (companies seeded before this migration).
--
-- Canonical baseline = company 1's untouched standard types (flags, checklist,
-- PPE and controls identical to company 3 for the five standards; company 3
-- later gained QA-only extra control rows).
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. seed_company_defaults(company_id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_company_defaults(
  p_company_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_type_ids bigint[] := '{}'::bigint[];
BEGIN
  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- ------------------------------------------------------------------
  -- 1a. The five standard permit types (code-keyed, idempotent)
  -- ------------------------------------------------------------------
  INSERT INTO public.permit_types
    (company_id, name, code, description, requires_jha, requires_loto,
     requires_gas_test, requires_site_verification, requires_worker_briefing,
     requires_emergency_arrangements, is_active, is_system)
  SELECT p_company_id, v.name, v.code, v.description, v.requires_jha,
         v.requires_loto, v.requires_gas_test,
         true, -- requires_site_verification (on for all standard types)
         false, false, true, true
  FROM (VALUES
    ('HOT',  'Hot Work Permit',
     'For welding, cutting, grinding and other work producing heat, sparks or flame.',
     true, false, true),
    ('COLD', 'Cold Work Permit',
     'For non-hot work activities that require formal permit control.',
     true, false, false),
    ('CSE',  'Confined Space Entry Permit',
     'For entry into confined spaces requiring controlled entry and atmospheric testing.',
     true, true, true),
    ('ELEC', 'Electrical Work Permit',
     'For electrical work requiring controlled isolation and authorization.',
     true, true, false),
    ('WAH',  'Work at Height Permit',
     'For work activities involving elevated work locations.',
     true, false, false)
  ) AS v(code, name, description, requires_jha, requires_loto, requires_gas_test)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permit_types pt
    WHERE pt.company_id = p_company_id AND pt.code = v.code
  );

  -- (Collect the full set below so config rows are applied even when the
  -- types pre-existed, e.g. re-running the backfill.)
  SELECT array_agg(pt.id ORDER BY pt.code)
    INTO v_type_ids
    FROM public.permit_types pt
   WHERE pt.company_id = p_company_id
     AND pt.code IN ('HOT','COLD','CSE','ELEC','WAH');

  IF v_type_ids IS NULL OR array_length(v_type_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- ------------------------------------------------------------------
  -- 1b. Base site checklist (every standard type)
  -- ------------------------------------------------------------------
  INSERT INTO public.permit_type_site_checklist
    (permit_type_id, item_key, label, is_required, sort_order)
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
   WHERE pt.id = ANY (v_type_ids)
     AND NOT EXISTS (
       SELECT 1 FROM public.permit_type_site_checklist c
       WHERE c.permit_type_id = pt.id AND c.item_key = v.item_key
     );

  -- ------------------------------------------------------------------
  -- 1c. Code-specific site checklist items
  -- ------------------------------------------------------------------
  INSERT INTO public.permit_type_site_checklist
    (permit_type_id, item_key, label, is_required, sort_order)
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
   WHERE pt.id = ANY (v_type_ids)
     AND NOT EXISTS (
       SELECT 1 FROM public.permit_type_site_checklist c
       WHERE c.permit_type_id = pt.id AND c.item_key = v.item_key
     );

  -- ------------------------------------------------------------------
  -- 1d. Recommended PPE per standard type (global catalogue by name)
  -- ------------------------------------------------------------------
  INSERT INTO public.permit_type_ppe (permit_type_id, ppe_item_id, requirement)
  SELECT pt.id, pi.id, 'recommended'
    FROM public.permit_types pt
    JOIN public.ppe_items pi
      ON (pt.code, pi.name) IN (
        ('COLD', 'Safety Helmet'),
        ('COLD', 'Safety Spectacles'),
        ('COLD', 'General Work Gloves'),
        ('COLD', 'Safety Shoes'),
        ('HOT',  'Safety Helmet'),
        ('HOT',  'Safety Spectacles'),
        ('HOT',  'Face Shield'),
        ('HOT',  'Welding Shield / Welding Goggles'),
        ('HOT',  'Ear Plugs'),
        ('HOT',  'Heat-Resistant Gloves'),
        ('HOT',  'Welding / Heat Protective Clothing'),
        ('HOT',  'Safety Shoes'),
        ('CSE',  'Safety Helmet'),
        ('CSE',  'Disposable Particulate Respirator'),
        ('CSE',  'Half-Face Respirator'),
        ('CSE',  'General Work Gloves'),
        ('CSE',  'Safety Shoes'),
        ('CSE',  'Full-Body Safety Harness'),
        ('WAH',  'Safety Helmet'),
        ('WAH',  'Safety Shoes'),
        ('WAH',  'Full-Body Safety Harness'),
        ('WAH',  'Lanyard'),
        ('WAH',  'Lifeline'),
        ('WAH',  'Self-Retracting Lifeline'),
        ('ELEC', 'Safety Helmet'),
        ('ELEC', 'Safety Spectacles'),
        ('ELEC', 'Electrical Gloves'),
        ('ELEC', 'Safety Shoes')
      )
   WHERE pt.id = ANY (v_type_ids)
     AND pi.is_active = true
   ON CONFLICT (permit_type_id, ppe_item_id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 1e. Required safety controls per standard type
  -- ------------------------------------------------------------------
  INSERT INTO public.permit_type_safety_controls
    (permit_type_id, safety_control_id, is_required, is_recommended)
  SELECT pt.id, sc.id, true, false
    FROM public.permit_types pt
    JOIN public.safety_controls sc
      ON (pt.code, sc.code) IN (
        ('HOT',  'FIRE_WATCH'),
        ('HOT',  'GAS'),
        ('HOT',  'JHA'),
        ('COLD', 'JHA'),
        ('CSE',  'GAS'),
        ('CSE',  'JHA'),
        ('CSE',  'LOTO'),
        ('ELEC', 'JHA'),
        ('ELEC', 'LOTO'),
        ('WAH',  'FALL_PROTECTION'),
        ('WAH',  'JHA')
      )
   WHERE pt.id = ANY (v_type_ids)
     AND sc.is_active = true
   ON CONFLICT (permit_type_id, safety_control_id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- 1f. Recommended safety controls per standard type
  -- ------------------------------------------------------------------
  INSERT INTO public.permit_type_safety_controls
    (permit_type_id, safety_control_id, is_required, is_recommended)
  SELECT pt.id, sc.id, false, true
    FROM public.permit_types pt
    JOIN public.safety_controls sc
      ON (pt.code, sc.code) IN (
        ('COLD', 'BARRIER'),
        ('COLD', 'SIGNAGE'),
        ('COLD', 'HOUSEKEEPING'),
        ('COLD', 'LIGHTING'),
        ('HOT',  'FIRE_EXTINGUISHER'),
        ('HOT',  'REMOVE_COMBUSTIBLES'),
        ('HOT',  'BARRIER'),
        ('HOT',  'SIGNAGE'),
        ('HOT',  'VENTILATION'),
        ('CSE',  'ATTENDANT'),
        ('CSE',  'RESCUE_PLAN'),
        ('CSE',  'VENTILATION'),
        ('CSE',  'BARRIER'),
        ('WAH',  'GUARDRAIL'),
        ('WAH',  'FALLING_OBJECT'),
        ('WAH',  'BARRIER'),
        ('ELEC', 'ELEC_ISOLATION'),
        ('ELEC', 'TEST_BEFORE_TOUCH'),
        ('ELEC', 'ELEC_PPE'),
        ('ELEC', 'BARRIER')
      )
   WHERE pt.id = ANY (v_type_ids)
     AND sc.is_active = true
   ON CONFLICT (permit_type_id, safety_control_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_company_defaults(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_company_defaults(bigint)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 2. register_company now seeds the five standards for every new company
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_company(
  p_company_name text,
  p_full_name text,
  p_email text,
  p_employee_no text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_department text DEFAULT NULL::text,
  p_job_position text DEFAULT NULL::text,
  p_ssm text DEFAULT NULL::text
)
RETURNS TABLE(company_id bigint, company_name text, company_code text, profile_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id bigint;
  v_company_code text;
  v_ssm text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN RAISE EXCEPTION 'User already has a profile'; END IF;
  IF trim(p_company_name) = '' THEN RAISE EXCEPTION 'Company name is required'; END IF;
  IF trim(p_full_name) = '' THEN RAISE EXCEPTION 'Full name is required'; END IF;
  v_ssm := upper(trim(COALESCE(p_ssm, '')));
  IF v_ssm = '' THEN RAISE EXCEPTION 'SSM Registration No. is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE upper(trim(ssm_registration_no)) = v_ssm) THEN
    RAISE EXCEPTION 'SSM Registration No. is already registered';
  END IF;
  v_company_code := public.generate_company_code();
  INSERT INTO public.companies (name, code, ssm_registration_no, is_active)
  VALUES (trim(p_company_name), v_company_code, v_ssm, true)
  RETURNING id INTO v_company_id;
  INSERT INTO public.profiles (id, full_name, employee_no, email, phone, role, department, position, is_active, company_id)
  VALUES (v_user_id, trim(p_full_name), NULLIF(trim(p_employee_no), ''), trim(p_email), NULLIF(trim(p_phone), ''), 'safety_manager'::public.user_role, NULLIF(trim(p_department), ''), NULLIF(trim(p_job_position), ''), true, v_company_id);

  -- Give the new Safety Manager the standard five permit types so
  -- Settings -> Permit Types is never empty for a fresh company.
  PERFORM public.seed_company_defaults(v_company_id);

  RETURN QUERY SELECT v_company_id, trim(p_company_name), v_company_code, v_user_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. Backfill companies created before this migration that are missing any of
--    the five standard codes (idempotent — safe on every run).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_company record;
BEGIN
  FOR v_company IN
    SELECT c.id
      FROM public.companies c
     WHERE NOT EXISTS (
       SELECT 1 FROM public.permit_types pt
       WHERE pt.company_id = c.id
         AND pt.code IN ('HOT','COLD','CSE','ELEC','WAH')
     )
  LOOP
    PERFORM public.seed_company_defaults(v_company.id);
  END LOOP;
END;
$$;

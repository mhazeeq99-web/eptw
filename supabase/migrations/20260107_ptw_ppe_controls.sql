-- ============================================================================
-- ePTW — Phase B: PPE catalogue + permit PPE + expanded safety controls
-- ============================================================================
-- Adds a relational PPE module and expands the safety-control catalogue.
--
-- New tables:
--   ppe_items                    — PPE catalogue (company_id NULL = platform-wide default)
--   permit_ppe                   — permit-level PPE selection
--   permit_type_ppe              — per-permit-type recommended/required PPE mapping
--   permit_recommended_controls  — permit-level confirmation of recommended controls
-- New columns:
--   permit_type_safety_controls.is_recommended
--   permits.ppe_other            — "Other — specify" free text
--
-- The existing REQUIRED-control flow (permit_type_safety_controls.is_required
-- -> permit_safety_controls -> verify -> approval gate) is preserved intact.
-- RECOMMENDED controls are displayed on the form and confirmed via
-- permit_recommended_controls; they never block approval.
--
-- PPE recommendation defaults are recommendations for UX, NOT universal
-- legal requirements; Safety Manager can modify the mapping.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PPE catalogue
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ppe_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, name)
);

INSERT INTO public.ppe_items (category, name, sort_order) VALUES
  ('HEAD PROTECTION', 'Safety Helmet', 10),
  ('HEAD PROTECTION', 'Bump Cap', 20),
  ('HEAD PROTECTION', 'Welding Helmet', 30),
  ('EYE / FACE PROTECTION', 'Safety Spectacles', 10),
  ('EYE / FACE PROTECTION', 'Chemical Splash Goggles', 20),
  ('EYE / FACE PROTECTION', 'Face Shield', 30),
  ('EYE / FACE PROTECTION', 'Welding Shield / Welding Goggles', 40),
  ('HEARING PROTECTION', 'Ear Plugs', 10),
  ('HEARING PROTECTION', 'Ear Muffs', 20),
  ('HEARING PROTECTION', 'Double Hearing Protection', 30),
  ('RESPIRATORY PROTECTION', 'Disposable Particulate Respirator', 10),
  ('RESPIRATORY PROTECTION', 'Half-Face Respirator', 20),
  ('RESPIRATORY PROTECTION', 'Full-Face Respirator', 30),
  ('RESPIRATORY PROTECTION', 'Supplied-Air Respirator', 40),
  ('HAND PROTECTION', 'General Work Gloves', 10),
  ('HAND PROTECTION', 'Cut-Resistant Gloves', 20),
  ('HAND PROTECTION', 'Chemical-Resistant Gloves', 30),
  ('HAND PROTECTION', 'Heat-Resistant Gloves', 40),
  ('HAND PROTECTION', 'Electrical Gloves', 50),
  ('BODY PROTECTION', 'High-Visibility Vest', 10),
  ('BODY PROTECTION', 'Chemical Protective Clothing', 20),
  ('BODY PROTECTION', 'Disposable Protective Coverall', 30),
  ('BODY PROTECTION', 'Welding / Heat Protective Clothing', 40),
  ('BODY PROTECTION', 'Apron', 50),
  ('FOOT PROTECTION', 'Safety Shoes', 10),
  ('FOOT PROTECTION', 'Safety Boots', 20),
  ('FOOT PROTECTION', 'Chemical-Resistant Boots', 30),
  ('FOOT PROTECTION', 'Anti-Slip Footwear', 40),
  ('FALL PROTECTION', 'Full-Body Safety Harness', 10),
  ('FALL PROTECTION', 'Lanyard', 20),
  ('FALL PROTECTION', 'Lifeline', 30),
  ('FALL PROTECTION', 'Self-Retracting Lifeline', 40),
  ('OTHER', 'Life Jacket / Buoyancy Aid', 10)
ON CONFLICT (category, name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Permit-level PPE selection + "Other — specify"
-- ----------------------------------------------------------------------------
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS ppe_other text;

CREATE TABLE IF NOT EXISTS public.permit_ppe (
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  ppe_item_id bigint NOT NULL REFERENCES public.ppe_items(id) ON DELETE CASCADE,
  is_selected boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (permit_id, ppe_item_id)
);

-- ----------------------------------------------------------------------------
-- 3. Permit-type PPE mapping (recommended / required)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_type_ppe (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_type_id bigint NOT NULL REFERENCES public.permit_types(id) ON DELETE CASCADE,
  ppe_item_id bigint NOT NULL REFERENCES public.ppe_items(id) ON DELETE CASCADE,
  requirement text NOT NULL DEFAULT 'recommended'
    CHECK (requirement IN ('recommended', 'required')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_type_id, ppe_item_id)
);

-- Default recommendations by permit type code (UX defaults; NOT legal mandates).
-- Applies to every company's permit types with the matching code.
INSERT INTO public.permit_type_ppe (permit_type_id, ppe_item_id, requirement)
SELECT pt.id, pi.id, 'recommended'
FROM public.permit_types pt
JOIN public.ppe_items pi
  ON (pt.code, pi.category, pi.name) IN (
    ('COLD', 'HEAD PROTECTION', 'Safety Helmet'),
    ('COLD', 'EYE / FACE PROTECTION', 'Safety Spectacles'),
    ('COLD', 'HAND PROTECTION', 'General Work Gloves'),
    ('COLD', 'FOOT PROTECTION', 'Safety Shoes'),
    ('HOT', 'HEAD PROTECTION', 'Safety Helmet'),
    ('HOT', 'EYE / FACE PROTECTION', 'Safety Spectacles'),
    ('HOT', 'EYE / FACE PROTECTION', 'Face Shield'),
    ('HOT', 'EYE / FACE PROTECTION', 'Welding Shield / Welding Goggles'),
    ('HOT', 'HEARING PROTECTION', 'Ear Plugs'),
    ('HOT', 'HAND PROTECTION', 'Heat-Resistant Gloves'),
    ('HOT', 'BODY PROTECTION', 'Welding / Heat Protective Clothing'),
    ('HOT', 'FOOT PROTECTION', 'Safety Shoes'),
    ('CSE', 'HEAD PROTECTION', 'Safety Helmet'),
    ('CSE', 'RESPIRATORY PROTECTION', 'Disposable Particulate Respirator'),
    ('CSE', 'RESPIRATORY PROTECTION', 'Half-Face Respirator'),
    ('CSE', 'HAND PROTECTION', 'General Work Gloves'),
    ('CSE', 'FOOT PROTECTION', 'Safety Shoes'),
    ('CSE', 'FALL PROTECTION', 'Full-Body Safety Harness'),
    ('WAH', 'HEAD PROTECTION', 'Safety Helmet'),
    ('WAH', 'FOOT PROTECTION', 'Safety Shoes'),
    ('WAH', 'FALL PROTECTION', 'Full-Body Safety Harness'),
    ('WAH', 'FALL PROTECTION', 'Lanyard'),
    ('WAH', 'FALL PROTECTION', 'Lifeline'),
    ('WAH', 'FALL PROTECTION', 'Self-Retracting Lifeline'),
    ('ELEC', 'HEAD PROTECTION', 'Safety Helmet'),
    ('ELEC', 'EYE / FACE PROTECTION', 'Safety Spectacles'),
    ('ELEC', 'HAND PROTECTION', 'Electrical Gloves'),
    ('ELEC', 'FOOT PROTECTION', 'Safety Shoes')
  )
ON CONFLICT (permit_type_id, ppe_item_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Expanded safety-control catalogue (preserves existing rows/mappings)
-- ----------------------------------------------------------------------------
INSERT INTO public.safety_controls (code, name, category, description, is_active) VALUES
  ('BARRIER', 'Barricade / Exclusion Zone', 'General', 'Barricade or exclusion zone around the work area', true),
  ('SIGNAGE', 'Warning Signage', 'General', 'Warning signs displayed for the work', true),
  ('ACCESS_CONTROL', 'Access Control', 'General', 'Controlled access to the work area', true),
  ('HOUSEKEEPING', 'Housekeeping', 'General', 'Work area kept clean and tidy', true),
  ('LIGHTING', 'Adequate Lighting', 'General', 'Adequate lighting provided', true),
  ('SAFE_ACCESS', 'Safe Access / Egress', 'General', 'Safe access and egress maintained', true),
  ('AREA_INSPECTION', 'Work Area Inspection', 'General', 'Work area inspected before work', true),
  ('EQUIP_ISOLATION', 'Equipment Isolation', 'Energy / Equipment', 'Equipment isolated from energy sources', true),
  ('DEPRESSURISE', 'Depressurisation', 'Energy / Equipment', 'System depressurised before work', true),
  ('DRAINAGE', 'Drainage', 'Energy / Equipment', 'Lines drained before work', true),
  ('MECH_ISOLATION', 'Mechanical Isolation', 'Energy / Equipment', 'Mechanical isolation applied', true),
  ('ELEC_ISOLATION', 'Electrical Isolation', 'Energy / Equipment', 'Electrical isolation applied', true),
  ('FIRE_EXTINGUISHER', 'Fire Extinguisher', 'Fire / Hot Work', 'Fire extinguisher available', true),
  ('REMOVE_COMBUSTIBLES', 'Remove Combustible Materials', 'Fire / Hot Work', 'Combustible materials removed from the area', true),
  ('FIRE_COVER', 'Fire-Resistant Covering', 'Fire / Hot Work', 'Fire-resistant covering used', true),
  ('SPARK_CONTAIN', 'Spark Containment', 'Fire / Hot Work', 'Sparks contained', true),
  ('VENTILATION', 'Ventilation', 'Environment / Atmosphere', 'Adequate ventilation provided', true),
  ('DUST_CONTROL', 'Dust Control', 'Environment / Atmosphere', 'Dust controlled', true),
  ('FUME_CONTROL', 'Fume Control', 'Environment / Atmosphere', 'Fumes controlled', true),
  ('GUARDRAIL', 'Guardrail', 'Work at Height', 'Guardrail provided', true),
  ('SCAFFOLD_INSPECT', 'Scaffold Inspection', 'Work at Height', 'Scaffold inspected before use', true),
  ('FALLING_OBJECT', 'Falling-Object Protection', 'Work at Height', 'Falling-object protection in place', true),
  ('LIFT_INSPECT', 'Lifting Equipment Inspection', 'Lifting', 'Lifting equipment inspected', true),
  ('LIFT_ACCESSORIES', 'Lifting Accessories Inspection', 'Lifting', 'Lifting accessories inspected', true),
  ('COMPETENT_PERSONNEL', 'Competent Personnel', 'Lifting', 'Competent personnel assigned', true),
  ('TEST_BEFORE_TOUCH', 'Test Before Touch / Verification', 'Electrical', 'Electrical verification (test before touch)', true),
  ('ELEC_PPE', 'Appropriate Electrical PPE', 'Electrical', 'Electrical-rated PPE used', true)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Recommended controls per permit type (required set preserved)
-- ----------------------------------------------------------------------------
ALTER TABLE public.permit_type_safety_controls
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

INSERT INTO public.permit_type_safety_controls (permit_type_id, safety_control_id, is_required, is_recommended)
SELECT pt.id, sc.id, false, true
FROM public.permit_types pt
JOIN public.safety_controls sc
  ON (pt.code, sc.code) IN (
    ('COLD', 'BARRIER'),
    ('COLD', 'SIGNAGE'),
    ('COLD', 'HOUSEKEEPING'),
    ('COLD', 'LIGHTING'),
    ('HOT', 'FIRE_EXTINGUISHER'),
    ('HOT', 'REMOVE_COMBUSTIBLES'),
    ('HOT', 'BARRIER'),
    ('HOT', 'SIGNAGE'),
    ('HOT', 'VENTILATION'),
    ('CSE', 'ATTENDANT'),
    ('CSE', 'RESCUE_PLAN'),
    ('CSE', 'VENTILATION'),
    ('CSE', 'BARRIER'),
    ('WAH', 'GUARDRAIL'),
    ('WAH', 'FALLING_OBJECT'),
    ('WAH', 'BARRIER'),
    ('ELEC', 'ELEC_ISOLATION'),
    ('ELEC', 'TEST_BEFORE_TOUCH'),
    ('ELEC', 'ELEC_PPE'),
    ('ELEC', 'BARRIER')
  )
ON CONFLICT (permit_type_id, safety_control_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Permit-level recommended-control confirmation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_recommended_controls (
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  safety_control_id bigint NOT NULL REFERENCES public.safety_controls(id) ON DELETE CASCADE,
  is_selected boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (permit_id, safety_control_id)
);

-- ----------------------------------------------------------------------------
-- 7. RLS — same isolation model as permit_workers / permit_safety_controls
-- ----------------------------------------------------------------------------
ALTER TABLE public.ppe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_ppe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_type_ppe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_recommended_controls ENABLE ROW LEVEL SECURITY;

-- ppe_items: global defaults + own-company items readable; safety managers
-- of a company may manage their company items; platform admin manages all.
DROP POLICY IF EXISTS "Users can view applicable PPE catalogue" ON public.ppe_items;
CREATE POLICY "Users can view applicable PPE catalogue"
  ON public.ppe_items
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id = get_my_company_id()
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "Safety managers can create PPE items" ON public.ppe_items;
CREATE POLICY "Safety managers can create PPE items"
  ON public.ppe_items
  FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role AND company_id = get_my_company_id())
  );

DROP POLICY IF EXISTS "Safety managers can update PPE items" ON public.ppe_items;
CREATE POLICY "Safety managers can update PPE items"
  ON public.ppe_items
  FOR UPDATE TO authenticated
  USING (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role AND company_id = get_my_company_id())
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role AND company_id = get_my_company_id())
  );

DROP POLICY IF EXISTS "Safety managers can delete PPE items" ON public.ppe_items;
CREATE POLICY "Safety managers can delete PPE items"
  ON public.ppe_items
  FOR DELETE TO authenticated
  USING (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role AND company_id = get_my_company_id())
  );

-- permit_type_ppe: company-scoped reads + safety-manager writes (mirrors
-- permit_type_safety_controls).
DROP POLICY IF EXISTS "Users can view company permit type PPE" ON public.permit_type_ppe;
CREATE POLICY "Users can view company permit type PPE"
  ON public.permit_type_ppe
  FOR SELECT TO authenticated
  USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.permit_types pt
      WHERE pt.id = permit_type_ppe.permit_type_id
        AND pt.company_id = get_my_company_id()
        AND pt.is_active = true
    )
  );

DROP POLICY IF EXISTS "Safety managers can manage PPE mappings" ON public.permit_type_ppe;
CREATE POLICY "Safety managers can manage PPE mappings"
  ON public.permit_type_ppe
  FOR ALL TO authenticated
  USING (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

-- permit_ppe + permit_recommended_controls: permit-access scoped (same as
-- permit_workers / jhas / loto / gas).
DROP POLICY IF EXISTS "Authorized users can view permit PPE" ON public.permit_ppe;
CREATE POLICY "Authorized users can view permit PPE"
  ON public.permit_ppe FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add permit PPE" ON public.permit_ppe;
CREATE POLICY "Authorized users can add permit PPE"
  ON public.permit_ppe FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update permit PPE" ON public.permit_ppe;
CREATE POLICY "Authorized users can update permit PPE"
  ON public.permit_ppe FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete permit PPE" ON public.permit_ppe;
CREATE POLICY "Authorized users can delete permit PPE"
  ON public.permit_ppe FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can view permit recommended controls" ON public.permit_recommended_controls;
CREATE POLICY "Authorized users can view permit recommended controls"
  ON public.permit_recommended_controls FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add permit recommended controls" ON public.permit_recommended_controls;
CREATE POLICY "Authorized users can add permit recommended controls"
  ON public.permit_recommended_controls FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update permit recommended controls" ON public.permit_recommended_controls;
CREATE POLICY "Authorized users can update permit recommended controls"
  ON public.permit_recommended_controls FOR UPDATE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin())
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete permit recommended controls" ON public.permit_recommended_controls;
CREATE POLICY "Authorized users can delete permit recommended controls"
  ON public.permit_recommended_controls FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

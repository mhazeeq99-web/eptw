-- ============================================================================
-- ePTW — Reduce user_role enum to the final 5-role business model
-- ============================================================================
-- Per docs/ROLE_MATRIX.md the only roles are:
--   platform_admin, safety_manager, safety_coordinator, internal_staff,
--   contractor_admin
--
-- PostgreSQL cannot drop enum labels in place, so the enum is rebuilt:
--
--   1. Guards: no unknown role values on profiles, and no column outside
--      profiles.role / roles.name still uses user_role.
--   2. A new 5-role enum is created and the two columns (profiles.role and
--      roles.name — the legacy role catalog) are converted, mapping legacy
--      labels to their 5-role equivalents (same mapping migration 20260101
--      section 11.3 applies: admin->safety_manager, safety->safety_coordinator,
--      permit_issuer/supervisor/work_supervisor->internal_staff,
--      requester->internal_staff (company) / contractor_admin (contractor)).
--   3. The canonical name user_role is swapped onto the new type.
--   4. get_my_role() (RETURNS user_role) is recreated so its return type
--      re-resolves to the new enum; the CASCADE on it drops every RLS policy
--      that referenced the role helper (verified live: exactly the 17 policies
--      recreated below).
--   5. All of those policies are recreated; the two that still carried legacy
--      role labels are rewritten to 5-role scope.
--   6. The old enum is dropped, the roles catalog is refreshed to the 5-role
--      set, and the profiles.role default (if any) is restored mapped.
--   7. Verification queries list any remaining policy/function mentioning a
--      legacy label and confirm the enum contents.
--
-- Idempotent: safe to run again from a clean state.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Safety guards
-- ----------------------------------------------------------------------------

-- Temp type names must not collide with leftovers from an aborted run.
DROP TYPE IF EXISTS public.user_role_new;
DROP TYPE IF EXISTS public.user_role_old;

-- Fail loudly if any profile carries a role value this migration does not
-- know how to map (rather than silently corrupting data).
DO $$
DECLARE
  v_unknown text;
BEGIN
  SELECT string_agg(DISTINCT role::text, ', ')
    INTO v_unknown
    FROM public.profiles
    WHERE role::text NOT IN (
      'platform_admin', 'safety_manager', 'safety_coordinator',
      'internal_staff', 'contractor_admin',
      'admin', 'permit_issuer', 'safety', 'supervisor', 'work_supervisor',
      'requester'
    );

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected user_role value(s) found on profiles: %', v_unknown;
  END IF;
END;
$$;

-- The old enum must not be referenced by any other table column besides the
-- two columns this migration converts (profiles.role and roles.name).
DO $$
DECLARE
  v_other_tables text;
BEGIN
  SELECT string_agg(DISTINCT c.relname, ', ')
    INTO v_other_tables
    FROM pg_depend d
    JOIN pg_class c
      ON c.oid = d.objid
    WHERE d.classid = 'pg_class'::regclass
      AND d.objsubid > 0
      AND d.refclassid = 'pg_type'::regclass
      AND d.refobjid = 'public.user_role'::regtype
      AND c.relname NOT IN ('profiles', 'roles');

  IF v_other_tables IS NOT NULL THEN
    RAISE EXCEPTION 'user_role is still referenced by column(s) of: %', v_other_tables;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Snapshot & prepare
-- ----------------------------------------------------------------------------

-- The column default (if any) must not pin the old enum. The original live
-- default was 'requester'::user_role; section 6 restores a mapped 5-role
-- default ('internal_staff'). (No temp-table guard here: pg-meta does not
-- keep temp tables across statements, so the restore is unconditional.)
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

-- roles.name is UNIQUE; the legacy rows map onto only 3 distinct 5-role
-- targets, which would violate UNIQUE during the conversion. The constraint
-- is re-added after the catalog is refreshed (no FK references roles, and
-- the application does not query it — verified on the live project).
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;

-- ----------------------------------------------------------------------------
-- 2. New enum + convert columns
-- ----------------------------------------------------------------------------

CREATE TYPE public.user_role_new AS ENUM (
  'platform_admin',
  'safety_manager',
  'safety_coordinator',
  'internal_staff',
  'contractor_admin'
);

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role_new
  USING (
    CASE role::text
      WHEN 'admin' THEN 'safety_manager'::text
      WHEN 'safety' THEN 'safety_coordinator'::text
      WHEN 'permit_issuer' THEN 'internal_staff'::text
      WHEN 'supervisor' THEN 'internal_staff'::text
      WHEN 'work_supervisor' THEN 'internal_staff'::text
      WHEN 'requester' THEN
        CASE WHEN company_id IS NOT NULL
             THEN 'internal_staff'::text
             ELSE 'contractor_admin'::text
        END
      ELSE role::text
    END
  )::public.user_role_new;

ALTER TABLE public.roles
  ALTER COLUMN name TYPE public.user_role_new
  USING (
    CASE name::text
      WHEN 'admin' THEN 'safety_manager'::text
      WHEN 'safety' THEN 'safety_coordinator'::text
      WHEN 'permit_issuer' THEN 'internal_staff'::text
      WHEN 'supervisor' THEN 'internal_staff'::text
      WHEN 'work_supervisor' THEN 'internal_staff'::text
      WHEN 'requester' THEN 'internal_staff'::text
      ELSE name::text
    END
  )::public.user_role_new;

-- ----------------------------------------------------------------------------
-- 3. Swap the canonical type name onto the new enum
-- ----------------------------------------------------------------------------

ALTER TYPE public.user_role RENAME TO user_role_old;
ALTER TYPE public.user_role_new RENAME TO user_role;

-- ----------------------------------------------------------------------------
-- 4. Recreate the role helper (its RETURNS user_role must re-resolve to the
--    new enum). The CASCADE drops every RLS policy that calls get_my_role();
--    all of them are recreated in section 5.
-- ----------------------------------------------------------------------------

DROP FUNCTION public.get_my_role() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true
  LIMIT 1;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Recreate every RLS policy that referenced user_role (dropped by the
--    CASCADE above). Legacy role labels are rewritten to 5-role scope per
--    docs/ROLE_MATRIX.md. Expressions are the live definitions, with only the
--    legacy arrays changed.
-- ----------------------------------------------------------------------------

-- 5.1 areas
DROP POLICY IF EXISTS "Admins can manage company areas" ON public.areas;
CREATE POLICY "Admins can manage company areas" ON public.areas
  FOR ALL
  USING (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  )
  WITH CHECK (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  );

-- 5.2 contractor_companies
DROP POLICY IF EXISTS "Admins can manage contractor relationships" ON public.contractor_companies;
CREATE POLICY "Admins can manage contractor relationships" ON public.contractor_companies
  FOR ALL
  USING (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  )
  WITH CHECK (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  );

-- 5.3 contractors
DROP POLICY IF EXISTS "Admins can manage contractors" ON public.contractors;
CREATE POLICY "Admins can manage contractors" ON public.contractors
  FOR ALL
  USING (
    is_platform_admin()
    OR (
      (get_my_role() = 'safety_manager'::user_role)
      AND (EXISTS (
        SELECT 1 FROM public.contractor_companies cc
        WHERE ((cc.contractor_id = contractors.id) AND (cc.company_id = get_my_company_id()))
      ))
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

-- 5.4 equipment
DROP POLICY IF EXISTS "Admins can manage company equipment" ON public.equipment;
CREATE POLICY "Admins can manage company equipment" ON public.equipment
  FOR ALL
  USING (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  )
  WITH CHECK (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  );

-- 5.5 permit_approvals — legacy array rewritten to safety roles
DROP POLICY IF EXISTS "Users can view company approval history" ON public.permit_approvals;
CREATE POLICY "Users can view company approval history" ON public.permit_approvals
  FOR SELECT
  TO authenticated
  USING (
    is_platform_admin()
    OR (EXISTS (
      SELECT 1 FROM public.permits p
      WHERE ((p.id = permit_approvals.permit_id)
        AND (p.company_id = get_my_company_id())
        AND (
          (p.requester_id = auth.uid())
          OR (p.supervisor_id = auth.uid())
          OR (p.permit_issuer_id = auth.uid())
          OR (p.safety_reviewer_id = auth.uid())
          OR (get_my_role() = ANY (ARRAY[
            'safety_coordinator'::user_role,
            'safety_manager'::user_role
          ]))
        ))
    ))
  );

-- 5.6 permit_safety_controls
DROP POLICY IF EXISTS "Authorized users can verify company permit safety controls" ON public.permit_safety_controls;
CREATE POLICY "Authorized users can verify company permit safety controls" ON public.permit_safety_controls
  FOR UPDATE
  USING (
    is_platform_admin()
    OR (
      (EXISTS (
        SELECT 1 FROM public.permits p
        WHERE ((p.id = permit_safety_controls.permit_id) AND (p.company_id = get_my_company_id()))
      ))
      AND (get_my_role() = ANY (ARRAY[
        'safety_manager'::user_role,
        'safety_coordinator'::user_role
      ]))
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR (
      (EXISTS (
        SELECT 1 FROM public.permits p
        WHERE ((p.id = permit_safety_controls.permit_id) AND (p.company_id = get_my_company_id()))
      ))
      AND (get_my_role() = ANY (ARRAY[
        'safety_manager'::user_role,
        'safety_coordinator'::user_role
      ]))
    )
  );

DROP POLICY IF EXISTS "Users can view company permit safety controls" ON public.permit_safety_controls;
CREATE POLICY "Users can view company permit safety controls" ON public.permit_safety_controls
  FOR SELECT
  USING (
    is_platform_admin()
    OR (EXISTS (
      SELECT 1 FROM public.permits p
      WHERE ((p.id = permit_safety_controls.permit_id)
        AND (p.company_id = get_my_company_id())
        AND (
          (p.requester_id = auth.uid())
          OR (p.supervisor_id = auth.uid())
          OR (p.permit_issuer_id = auth.uid())
          OR (p.safety_reviewer_id = auth.uid())
          OR (get_my_role() = ANY (ARRAY[
            'safety_manager'::user_role,
            'safety_coordinator'::user_role,
            'internal_staff'::user_role
          ]))
        ))
    ))
  );

-- 5.7 permit_type_safety_controls
DROP POLICY IF EXISTS "Safety managers can manage control mappings" ON public.permit_type_safety_controls;
CREATE POLICY "Safety managers can manage control mappings" ON public.permit_type_safety_controls
  FOR INSERT
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

DROP POLICY IF EXISTS "Safety managers can update control mappings" ON public.permit_type_safety_controls;
CREATE POLICY "Safety managers can update control mappings" ON public.permit_type_safety_controls
  FOR UPDATE
  USING (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

-- 5.8 permit_types
DROP POLICY IF EXISTS "Admins can manage company permit types" ON public.permit_types;
CREATE POLICY "Admins can manage company permit types" ON public.permit_types
  FOR ALL
  USING (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  )
  WITH CHECK (
    is_platform_admin()
    OR ((get_my_role() = 'safety_manager'::user_role) AND (company_id = get_my_company_id()))
  );

-- 5.9 permits
DROP POLICY IF EXISTS "Authorized users can update company permits" ON public.permits;
CREATE POLICY "Authorized users can update company permits" ON public.permits
  FOR UPDATE
  USING (
    is_platform_admin()
    OR (
      (company_id = get_my_company_id())
      AND (get_my_role() = ANY (ARRAY[
        'safety_manager'::user_role,
        'safety_coordinator'::user_role
      ]))
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR (
      (company_id = get_my_company_id())
      AND (get_my_role() = ANY (ARRAY[
        'safety_manager'::user_role,
        'safety_coordinator'::user_role
      ]))
    )
  );

DROP POLICY IF EXISTS "Company users can submit own internal permits" ON public.permits;
CREATE POLICY "Company users can submit own internal permits" ON public.permits
  FOR UPDATE
  USING (
    (requester_id = auth.uid())
    AND (company_id = get_my_company_id())
    AND (status = 'draft'::permit_status)
    AND (initiation_mode = 'internal'::text)
    AND (get_my_role() = ANY (ARRAY[
      'internal_staff'::user_role,
      'safety_manager'::user_role,
      'safety_coordinator'::user_role
    ]))
  )
  WITH CHECK (
    (requester_id = auth.uid())
    AND (company_id = get_my_company_id())
    AND (status = 'pending_approval'::permit_status)
    AND (workflow_stage = 'safety_approval'::text)
    AND (initiation_mode = 'internal'::text)
    AND (get_my_role() = ANY (ARRAY[
      'internal_staff'::user_role,
      'safety_manager'::user_role,
      'safety_coordinator'::user_role
    ]))
  );

DROP POLICY IF EXISTS "Contractor admins can update own contractor drafts" ON public.permits;
CREATE POLICY "Contractor admins can update own contractor drafts" ON public.permits
  FOR UPDATE
  USING (
    (requester_id = auth.uid())
    AND (contractor_id IS NOT NULL)
    AND (status = ANY (ARRAY['draft'::permit_status, 'rejected'::permit_status]))
    AND (get_my_role() = 'contractor_admin'::user_role)
  )
  WITH CHECK (
    (requester_id = auth.uid())
    AND (contractor_id IS NOT NULL)
    AND (status = ANY (ARRAY['draft'::permit_status, 'rejected'::permit_status]))
    AND (get_my_role() = 'contractor_admin'::user_role)
  );

DROP POLICY IF EXISTS "Safety coordinators and managers can review safety permits" ON public.permits;
CREATE POLICY "Safety coordinators and managers can review safety permits" ON public.permits
  FOR UPDATE
  USING (
    (company_id = get_my_company_id())
    AND (get_my_role() = ANY (ARRAY[
      'safety_coordinator'::user_role,
      'safety_manager'::user_role
    ]))
    AND (status = 'pending_approval'::permit_status)
    AND (workflow_stage = 'safety_approval'::text)
  )
  WITH CHECK (
    (company_id = get_my_company_id())
    AND (get_my_role() = ANY (ARRAY[
      'safety_coordinator'::user_role,
      'safety_manager'::user_role
    ]))
    AND (
      ((status = 'active'::permit_status) AND (workflow_stage = 'active'::text))
      OR (status = 'rejected'::permit_status)
    )
  );

-- 5.10 permits — legacy array rewritten to safety roles
DROP POLICY IF EXISTS "Users can view authorized permits" ON public.permits;
CREATE POLICY "Users can view authorized permits" ON public.permits
  FOR SELECT
  TO authenticated
  USING (
    is_platform_admin()
    OR (
      (company_id = get_my_company_id())
      AND (
        (requester_id = auth.uid())
        OR (supervisor_id = auth.uid())
        OR (permit_issuer_id = auth.uid())
        OR (safety_reviewer_id = auth.uid())
        OR (get_my_role() = ANY (ARRAY[
          'safety_manager'::user_role,
          'safety_coordinator'::user_role
        ]))
      )
    )
    OR ((requester_id = auth.uid()) AND is_contractor_authorized_for_company(company_id))
  );

-- 5.11 safety_controls
DROP POLICY IF EXISTS "Safety managers can create safety controls" ON public.safety_controls;
CREATE POLICY "Safety managers can create safety controls" ON public.safety_controls
  FOR INSERT
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

DROP POLICY IF EXISTS "Safety managers can update safety controls" ON public.safety_controls;
CREATE POLICY "Safety managers can update safety controls" ON public.safety_controls
  FOR UPDATE
  USING (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

-- ----------------------------------------------------------------------------
-- 5.12 set_contractor_authorization: company admins are Safety Managers now
--      (ROLE_MATRIX.md: "Create / authorize contractors" = platform_admin +
--      safety_manager). Kept here so the deployment path is self-contained.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_contractor_authorization(
  p_contractor_id bigint,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles WHERE id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User is not assigned to a company';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id
      AND role IN ('safety_manager', 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Only company administrators can manage contractor authorization';
  END IF;

  INSERT INTO public.contractor_companies (contractor_id, company_id, is_active)
  VALUES (p_contractor_id, v_company_id, p_is_active)
  ON CONFLICT (contractor_id, company_id)
  DO UPDATE SET is_active = p_is_active;

  RETURN jsonb_build_object(
    'contractor_id', p_contractor_id,
    'company_id', v_company_id,
    'is_active', p_is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_contractor_authorization(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_contractor_authorization(bigint, boolean)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Drop the old enum, refresh the roles catalog, restore defaults
-- ----------------------------------------------------------------------------

-- Safety net: if anything still depends on the old enum, fail loudly instead
-- of silently dropping objects (the implicit array type is the only allowed
-- dependent).
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(DISTINCT d.classid::regclass::text || ':' || d.objid::text, ', ')
    INTO v_left
    FROM pg_depend d
    JOIN pg_type t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role_old'
      AND d.classid <> 'pg_type'::regclass;

  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'user_role_old still has dependents: %', v_left;
  END IF;
END;
$$;

DROP TYPE public.user_role_old;

-- Refresh the legacy roles catalog to the 5-role set.
DELETE FROM public.roles;
INSERT INTO public.roles (id, name, description) VALUES
  (1, 'platform_admin',     'Platform-wide administrator. Not an operational PTW user.'),
  (2, 'safety_manager',     'Company admin + operational user; manages company settings and can self-approve permits.'),
  (3, 'safety_coordinator', 'Main safety approval authority; reviews/approves/rejects PTWs.'),
  (4, 'internal_staff',     'Ordinary company employee; creates/submits internal PTWs.'),
  (5, 'contractor_admin',   'Authorized person from a contractor company; creates/submits contractor PTWs.');

ALTER TABLE public.roles ADD CONSTRAINT roles_name_key UNIQUE (name);

-- Restore a sensible default (the original live default was 'requester',
-- mapped to the least-privileged company role). The application always
-- supplies the role explicitly, so this only affects direct inserts.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'internal_staff'::public.user_role;

-- ----------------------------------------------------------------------------
-- 7. Verification: flag any stored expression that still mentions a legacy
--    role label (e.g. base-schema policies/functions created outside this
--    repository). Those labels no longer exist, so such expressions would
--    error at runtime; review and fix anything these queries return.
-- ----------------------------------------------------------------------------

SELECT p.schemaname, p.tablename, p.policyname, 'USING' AS part,
       p.qual AS expression
FROM pg_policies p
WHERE p.qual ~
      '''(admin|permit_issuer|safety|supervisor|work_supervisor|requester)'''
UNION ALL
SELECT p.schemaname, p.tablename, p.policyname, 'WITH CHECK',
       p.with_check
FROM pg_policies p
WHERE p.with_check ~
      '''(admin|permit_issuer|safety|supervisor|work_supervisor|requester)'''
ORDER BY 1, 2, 3, 4;

SELECT n.nspname AS schema, p.proname, p.prosrc AS body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ~ '''(admin|permit_issuer|safety|supervisor|work_supervisor|requester)'''
ORDER BY 1, 2;

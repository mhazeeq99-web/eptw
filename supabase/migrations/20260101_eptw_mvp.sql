-- ============================================================================
-- ePTW — Commercial MVP migration
-- ============================================================================
-- This migration is IDEMPOTENT: every statement is safe to run again on an
-- already-migrated database. It only fills gaps; it never removes or alters
-- existing working structures, tables, enums, or policies.
--
-- Contents (as built incrementally):
--   1. permits: completed_by / completed_at / closed_by / closed_at /
--      cancelled_by / cancelled_at columns
--   2. sync_permit_safety_controls function + trigger + draft backfill
--   3. JHA / LOTO / Gas-testing tables
--   4. permit_attachments table + storage bucket
--   5. notifications table
--   6. RLS policies for all new tables
--   7. Guarded RLS policies for existing tables (only when missing)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permit lifecycle columns (added only if missing)
-- ----------------------------------------------------------------------------

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. Safety-control synchronization
-- ----------------------------------------------------------------------------

-- Idempotently (re)creates the required safety-control rows of a permit from
-- its permit type definition. SECURITY DEFINER so company users can call it
-- without direct DELETE/INSERT grants on permit_safety_controls.
CREATE OR REPLACE FUNCTION public.sync_permit_safety_controls(
  p_permit_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit_type_id bigint;
BEGIN
  SELECT permit_type_id INTO v_permit_type_id
  FROM public.permits
  WHERE id = p_permit_id;

  IF v_permit_type_id IS NULL THEN
    RAISE EXCEPTION 'Permit % does not exist', p_permit_id;
  END IF;

  DELETE FROM public.permit_safety_controls
  WHERE permit_id = p_permit_id;

  INSERT INTO public.permit_safety_controls
    (permit_id, safety_control_id, is_required, status)
  SELECT
    p_permit_id,
    ptc.safety_control_id,
    true,
    'pending'
  FROM public.permit_type_safety_controls ptc
  WHERE ptc.permit_type_id = v_permit_type_id
    AND ptc.is_required = true;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_permit_safety_controls(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_permit_safety_controls(bigint)
  TO authenticated;

-- Trigger: populate safety controls on permit creation (guarded so we never
-- duplicate an existing trigger).
CREATE OR REPLACE FUNCTION public.sync_permit_safety_controls_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_permit_safety_controls(NEW.id);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_permit_safety_controls'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_sync_permit_safety_controls
    AFTER INSERT ON public.permits
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_permit_safety_controls_trigger();
  END IF;
END;
$$;

-- Backfill for permits that were created before this migration and have no
-- safety-control rows yet (drafts are the ones still editable).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.permits
    WHERE status IN ('draft', 'pending_approval', 'rejected')
      AND NOT EXISTS (
        SELECT 1 FROM public.permit_safety_controls psc
        WHERE psc.permit_id = permits.id
      )
  LOOP
    PERFORM public.sync_permit_safety_controls(r.id);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. JHA / LOTO / Gas-testing tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.jhas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  hazards_controls jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loto_isolation_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  tag_number text,
  description text NOT NULL,
  isolation_point text,
  lock_number text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gas_tests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  tester_id uuid NOT NULL REFERENCES public.profiles(id),
  tested_at timestamptz NOT NULL DEFAULT now(),
  o2 numeric(5,2),
  lel numeric(6,2),
  h2s numeric(6,2),
  co numeric(6,2),
  remarks text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3a. Shared permit-access helper used by RLS policies of the new tables
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_permit(p_permit_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permits p
    WHERE p.id = p_permit_id
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = auth.uid() AND pr.role = 'platform_admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = auth.uid() AND pr.company_id = p.company_id
        )
        OR (
          p.contractor_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.contractor_users cu
            JOIN public.contractor_companies cc
              ON cc.contractor_id = cu.contractor_id
            WHERE cu.user_id = auth.uid()
              AND cu.is_active
              AND cc.is_active
              AND cc.contractor_id = p.contractor_id
              AND cc.company_id = p.company_id
          )
        )
      )
  );
$$;

-- 3b. RLS policies for the safety-document tables

ALTER TABLE public.jhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jhas_select" ON public.jhas;
CREATE POLICY "jhas_select" ON public.jhas
  FOR SELECT USING (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "jhas_insert" ON public.jhas;
CREATE POLICY "jhas_insert" ON public.jhas
  FOR INSERT WITH CHECK (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "jhas_update" ON public.jhas;
CREATE POLICY "jhas_update" ON public.jhas
  FOR UPDATE USING (public.can_access_permit(permit_id))
  WITH CHECK (public.can_access_permit(permit_id));

ALTER TABLE public.loto_isolation_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loto_select" ON public.loto_isolation_points;
CREATE POLICY "loto_select" ON public.loto_isolation_points
  FOR SELECT USING (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "loto_insert" ON public.loto_isolation_points;
CREATE POLICY "loto_insert" ON public.loto_isolation_points
  FOR INSERT WITH CHECK (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "loto_update" ON public.loto_isolation_points;
CREATE POLICY "loto_update" ON public.loto_isolation_points
  FOR UPDATE USING (public.can_access_permit(permit_id))
  WITH CHECK (public.can_access_permit(permit_id));

ALTER TABLE public.gas_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gas_tests_select" ON public.gas_tests;
CREATE POLICY "gas_tests_select" ON public.gas_tests
  FOR SELECT USING (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "gas_tests_insert" ON public.gas_tests;
CREATE POLICY "gas_tests_insert" ON public.gas_tests
  FOR INSERT WITH CHECK (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "gas_tests_update" ON public.gas_tests;
CREATE POLICY "gas_tests_update" ON public.gas_tests
  FOR UPDATE USING (public.can_access_permit(permit_id))
  WITH CHECK (public.can_access_permit(permit_id));

-- ----------------------------------------------------------------------------
-- 4. Contractor workflow support
-- ----------------------------------------------------------------------------

-- Registers a contractor company and links the calling (just-signed-up) user
-- as its first active user. SECURITY DEFINER so a brand-new auth user can
-- create their own contractor record safely.
CREATE OR REPLACE FUNCTION public.register_contractor(
  p_company_name text,
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_position text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_contractor_id bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Contractor company name is required';
  END IF;

  INSERT INTO public.contractors (company_name)
  VALUES (btrim(p_company_name))
  RETURNING id INTO v_contractor_id;

  -- Ensure the caller has a requester profile linked to the contractor.
  INSERT INTO public.profiles (id, full_name, email, phone, position, role, is_active, company_id)
  VALUES (
    v_user_id,
    btrim(p_full_name),
    btrim(p_email),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_position, '')), ''),
    'requester',
    true,
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    position = EXCLUDED.position,
    role = 'requester',
    is_active = true;

  INSERT INTO public.contractor_users (user_id, contractor_id, is_active)
  VALUES (v_user_id, v_contractor_id, true);

  RETURN jsonb_build_object(
    'contractor_id', v_contractor_id,
    'user_id', v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_contractor(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_contractor(text, text, text, text, text)
  TO authenticated;

-- Sets whether the calling user's company authorizes a given contractor.
-- SECURITY DEFINER so company admins can manage authorizations regardless of
-- the RLS state of contractor_companies.
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
      AND role IN ('safety_manager', 'admin', 'platform_admin')
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

-- Guarded: give company users read access to their own contractor
-- authorizations only when the table has no policies yet (never widens an
-- already-configured security model).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contractor_companies'
  ) THEN
    ALTER TABLE public.contractor_companies ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "contractor_companies_company_select"
      ON public.contractor_companies
      FOR SELECT
      USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.contractor_users cu
          WHERE cu.user_id = auth.uid()
            AND cu.contractor_id = contractor_companies.contractor_id
            AND cu.is_active
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'platform_admin'
        )
      );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Permit attachments (metadata + storage bucket)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permit_attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  filename text NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permit_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permit_attachments_select" ON public.permit_attachments;
CREATE POLICY "permit_attachments_select" ON public.permit_attachments
  FOR SELECT USING (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "permit_attachments_insert" ON public.permit_attachments;
CREATE POLICY "permit_attachments_insert" ON public.permit_attachments
  FOR INSERT WITH CHECK (public.can_access_permit(permit_id));
DROP POLICY IF EXISTS "permit_attachments_delete" ON public.permit_attachments;
CREATE POLICY "permit_attachments_delete" ON public.permit_attachments
  FOR DELETE USING (public.can_access_permit(permit_id));

-- Storage bucket (idempotent creation)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'permit-attachments',
  'permit-attachments',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Helper: can the current user access the permit referenced by a storage
-- object path of the form "{permit_id}/{rest}"?
CREATE OR REPLACE FUNCTION public.can_access_attachment_path(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_permit(
    NULLIF(split_part(p_path, '/', 1), '')::bigint
  );
$$;

-- Storage object policies (permit-attachments bucket only)
DROP POLICY IF EXISTS "permit_attachments_objects_select" ON storage.objects;
CREATE POLICY "permit_attachments_objects_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'permit-attachments'
    AND public.can_access_attachment_path(name)
  );

DROP POLICY IF EXISTS "permit_attachments_objects_insert" ON storage.objects;
CREATE POLICY "permit_attachments_objects_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'permit-attachments'
    AND public.can_access_attachment_path(name)
  );

DROP POLICY IF EXISTS "permit_attachments_objects_update" ON storage.objects;
CREATE POLICY "permit_attachments_objects_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'permit-attachments'
    AND public.can_access_attachment_path(name)
  )
  WITH CHECK (
    bucket_id = 'permit-attachments'
    AND public.can_access_attachment_path(name)
  );

DROP POLICY IF EXISTS "permit_attachments_objects_delete" ON storage.objects;
CREATE POLICY "permit_attachments_objects_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'permit-attachments'
    AND public.can_access_attachment_path(name)
  );

-- ----------------------------------------------------------------------------
-- 6. Notifications
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  permit_id bigint REFERENCES public.permits(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Notifications are created through the SECURITY DEFINER helper below so
-- that users can notify colleagues within their company.
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_permit_id bigint,
  p_type text,
  p_title text,
  p_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, permit_id, type, title, message)
  VALUES
    (p_user_id, p_permit_id, p_type, p_title, p_message);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, bigint, text, text, text)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Guarded RLS policies for existing tables
-- ----------------------------------------------------------------------------
-- Policies are only created for a table when it currently has NO policies at
-- all. This never widens an already-configured security model.

-- 7.1 profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "profiles_select_own_company" ON public.profiles
      FOR SELECT USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR id = auth.uid()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "profiles_update_own" ON public.profiles
      FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
END;
$$;

-- 7.2 companies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
  ) THEN
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "companies_select" ON public.companies
      FOR SELECT USING (
        id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );
  END IF;
END;
$$;

-- 7.3 permits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'permits'
  ) THEN
    ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "permits_select" ON public.permits
      FOR SELECT USING (public.can_access_permit(id));

    CREATE POLICY "permits_insert" ON public.permits
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
        OR (
          contractor_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.contractor_users cu
            JOIN public.contractor_companies cc
              ON cc.contractor_id = cu.contractor_id
            WHERE cu.user_id = auth.uid()
              AND cu.is_active
              AND cc.is_active
              AND cc.contractor_id = permits.contractor_id
              AND cc.company_id = permits.company_id
          )
        )
      );

    CREATE POLICY "permits_update" ON public.permits
      FOR UPDATE USING (public.can_access_permit(id))
      WITH CHECK (public.can_access_permit(id));
  END IF;
END;
$$;

-- 7.4 permit_approvals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'permit_approvals'
  ) THEN
    ALTER TABLE public.permit_approvals ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "permit_approvals_select" ON public.permit_approvals
      FOR SELECT USING (public.can_access_permit(permit_id));
  END IF;
END;
$$;

-- 7.5 permit_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'permit_types'
  ) THEN
    ALTER TABLE public.permit_types ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "permit_types_select" ON public.permit_types
      FOR SELECT USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "permit_types_admin_write" ON public.permit_types
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin')
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "permit_types_admin_update" ON public.permit_types
      FOR UPDATE USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin')
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );
  END IF;
END;
$$;

-- 7.6 safety_controls (catalog: read for authenticated users,
--     write for company admins / platform admin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'safety_controls'
  ) THEN
    ALTER TABLE public.safety_controls ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "safety_controls_select" ON public.safety_controls
      FOR SELECT USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
      );

    CREATE POLICY "safety_controls_admin_write" ON public.safety_controls
      FOR INSERT WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin', 'platform_admin')
      );

    CREATE POLICY "safety_controls_admin_update" ON public.safety_controls
      FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin', 'platform_admin')
      );
  END IF;
END;
$$;

-- 7.7 permit_type_safety_controls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'permit_type_safety_controls'
  ) THEN
    ALTER TABLE public.permit_type_safety_controls ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "permit_type_safety_controls_select" ON public.permit_type_safety_controls
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.permit_types pt
          WHERE pt.id = permit_type_safety_controls.permit_type_id
            AND pt.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "permit_type_safety_controls_admin_write" ON public.permit_type_safety_controls
      FOR INSERT WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin', 'platform_admin')
      );

    CREATE POLICY "permit_type_safety_controls_admin_update" ON public.permit_type_safety_controls
      FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin', 'platform_admin')
      );
  END IF;
END;
$$;

-- 7.8 permit_safety_controls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'permit_safety_controls'
  ) THEN
    ALTER TABLE public.permit_safety_controls ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "permit_safety_controls_select" ON public.permit_safety_controls
      FOR SELECT USING (public.can_access_permit(permit_id));

    CREATE POLICY "permit_safety_controls_update" ON public.permit_safety_controls
      FOR UPDATE USING (public.can_access_permit(permit_id))
      WITH CHECK (public.can_access_permit(permit_id));
  END IF;
END;
$$;

-- 7.9 areas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'areas'
  ) THEN
    ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "areas_select" ON public.areas
      FOR SELECT USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "areas_admin_write" ON public.areas
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin')
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "areas_admin_update" ON public.areas
      FOR UPDATE USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin')
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );
  END IF;
END;
$$;

-- 7.10 equipment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'equipment'
  ) THEN
    ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "equipment_select" ON public.equipment
      FOR SELECT USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "equipment_admin_write" ON public.equipment
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin')
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );

    CREATE POLICY "equipment_admin_update" ON public.equipment
      FOR UPDATE USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin')
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
      );
  END IF;
END;
$$;

-- 7.11 contractors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contractors'
  ) THEN
    ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "contractors_select" ON public.contractors
      FOR SELECT USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
        OR (SELECT company_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.contractor_users cu
          WHERE cu.user_id = auth.uid() AND cu.contractor_id = contractors.id
        )
      );

    CREATE POLICY "contractors_admin_insert" ON public.contractors
      FOR INSERT WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin', 'platform_admin')
      );

    CREATE POLICY "contractors_admin_update" ON public.contractors
      FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid())
          IN ('safety_manager', 'admin', 'platform_admin')
      );
  END IF;
END;
$$;

-- 7.12 contractor_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contractor_users'
  ) THEN
    ALTER TABLE public.contractor_users ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "contractor_users_select" ON public.contractor_users
      FOR SELECT USING (
        user_id = auth.uid()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin'
        OR EXISTS (
          SELECT 1 FROM public.contractor_users me
          WHERE me.user_id = auth.uid()
            AND me.contractor_id = contractor_users.contractor_id
            AND me.is_active
        )
      );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Column additions that newer features depend on (idempotent)
-- ----------------------------------------------------------------------------

ALTER TABLE public.safety_controls
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.permit_type_safety_controls
  ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'permit_type_safety_controls_type_control_key'
  ) THEN
    ALTER TABLE public.permit_type_safety_controls
      ADD CONSTRAINT permit_type_safety_controls_type_control_key
      UNIQUE (permit_type_id, safety_control_id);
  END IF;
END;
$$;

-- Unique pair on contractor_companies is required by the
-- set_contractor_authorization RPC's ON CONFLICT upsert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contractor_companies_contractor_company_key'
  ) THEN
    ALTER TABLE public.contractor_companies
      ADD CONSTRAINT contractor_companies_contractor_company_key
      UNIQUE (contractor_id, company_id);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Notification preferences (per-user email toggles per event type)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_preferences_select" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select" ON public.notification_preferences
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notification_preferences_insert" ON public.notification_preferences;
CREATE POLICY "notification_preferences_insert" ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notification_preferences_update" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update" ON public.notification_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 10. Final QA fixes (applied to the live project)
-- ----------------------------------------------------------------------------

-- 10.1 permits.initiation_mode defaults to 'internal' so drafts created by
--      the application (or seeded directly) always have a workflow.
ALTER TABLE public.permits
  ALTER COLUMN initiation_mode SET DEFAULT 'internal';

-- 10.3 permits: safety coordinators/managers may transition a safety-stage
--      permit to ACTIVE (approve & issue) or REJECTED (reject). The original
--      policy only allowed ACTIVE, which blocked the commercial reject flow.
DROP POLICY IF EXISTS "Safety coordinators and managers can review safety permits"
  ON public.permits;

CREATE POLICY "Safety coordinators and managers can review safety permits"
  ON public.permits
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
      (status = 'active'::permit_status AND workflow_stage = 'active'::text)
      OR (status = 'rejected'::permit_status)
    )
  );

-- 10.2 permit_safety_controls: the original policies only allowed
--      admin/permit_issuer/safety/supervisor. Safety Coordinators and Safety
--      Managers must be able to view and verify controls to perform their
--      commercial approval role. Same-company restriction is preserved.
DROP POLICY IF EXISTS "Authorized users can verify company permit safety controls"
  ON public.permit_safety_controls;
DROP POLICY IF EXISTS "Users can view company permit safety controls"
  ON public.permit_safety_controls;

CREATE POLICY "Users can view company permit safety controls"
  ON public.permit_safety_controls
  FOR SELECT
  USING (
    is_platform_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.permits p
        WHERE p.id = permit_safety_controls.permit_id
          AND p.company_id = get_my_company_id()
          AND (
            p.requester_id = auth.uid()
            OR p.supervisor_id = auth.uid()
            OR p.permit_issuer_id = auth.uid()
            OR p.safety_reviewer_id = auth.uid()
            OR get_my_role() = ANY (ARRAY[
              'admin'::user_role,
              'permit_issuer'::user_role,
              'safety'::user_role,
              'supervisor'::user_role,
              'safety_manager'::user_role,
              'safety_coordinator'::user_role,
              'work_supervisor'::user_role
            ])
          )
      )
    )
  );

CREATE POLICY "Authorized users can verify company permit safety controls"
  ON public.permit_safety_controls
  FOR UPDATE
  USING (
    is_platform_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.permits p
        WHERE p.id = permit_safety_controls.permit_id
          AND p.company_id = get_my_company_id()
      )
      AND get_my_role() = ANY (ARRAY[
        'admin'::user_role,
        'permit_issuer'::user_role,
        'safety'::user_role,
        'supervisor'::user_role,
        'safety_manager'::user_role,
        'safety_coordinator'::user_role,
        'work_supervisor'::user_role
      ])
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.permits p
        WHERE p.id = permit_safety_controls.permit_id
          AND p.company_id = get_my_company_id()
      )
      AND get_my_role() = ANY (ARRAY[
        'admin'::user_role,
        'permit_issuer'::user_role,
        'safety'::user_role,
        'supervisor'::user_role,
        'safety_manager'::user_role,
        'safety_coordinator'::user_role,
        'work_supervisor'::user_role
      ])
    )
  );

-- ----------------------------------------------------------------------------
-- 11. FINAL 5-ROLE BUSINESS MODEL (platform_admin, safety_manager,
--     safety_coordinator, internal_staff, contractor_admin)
-- ----------------------------------------------------------------------------

-- 11.1 New enum values (idempotent)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'internal_staff';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contractor_admin';

-- 11.2 Contractor PTW columns
ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS staff_reference_name text;

-- 11.3 Migrate existing profiles to the 5-role model (idempotent)
UPDATE public.profiles SET role = 'safety_manager'::user_role WHERE role = 'admin'::user_role;
UPDATE public.profiles SET role = 'safety_coordinator'::user_role WHERE role = 'safety'::user_role;
UPDATE public.profiles SET role = 'internal_staff'::user_role
  WHERE role IN ('permit_issuer'::user_role, 'supervisor'::user_role, 'work_supervisor'::user_role);
UPDATE public.profiles SET role = 'internal_staff'::user_role
  WHERE role = 'requester'::user_role AND company_id IS NOT NULL;
UPDATE public.profiles SET role = 'contractor_admin'::user_role
  WHERE role = 'requester'::user_role
    AND company_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.contractor_users cu WHERE cu.user_id = profiles.id
    );

-- 11.4 Contractor registration now creates a Contractor Admin
CREATE OR REPLACE FUNCTION public.register_contractor(
  p_company_name text,
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_position text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_contractor_id bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Contractor company name is required';
  END IF;

  INSERT INTO public.contractors (company_name)
  VALUES (btrim(p_company_name))
  RETURNING id INTO v_contractor_id;

  INSERT INTO public.profiles (id, full_name, email, phone, position, role, is_active, company_id)
  VALUES (
    v_user_id,
    btrim(p_full_name),
    btrim(p_email),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_position, '')), ''),
    'contractor_admin'::user_role,
    true,
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    position = EXCLUDED.position,
    role = 'contractor_admin'::user_role,
    is_active = true;

  INSERT INTO public.contractor_users (user_id, contractor_id, is_active)
  VALUES (v_user_id, v_contractor_id, true);

  RETURN jsonb_build_object(
    'contractor_id', v_contractor_id,
    'user_id', v_user_id
  );
END;
$$;

-- 11.5 RLS updates for the 5-role model

-- Edit own drafts / revise rejected permits (internal + safety roles).
DROP POLICY IF EXISTS "Requesters can update own company drafts" ON public.permits;
CREATE POLICY "Requesters can update own company drafts" ON public.permits
  FOR UPDATE
  USING (
    is_platform_admin()
    OR (
      (company_id = get_my_company_id())
      AND (requester_id = auth.uid())
      AND (status IN ('draft'::permit_status, 'rejected'::permit_status))
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR (
      (company_id = get_my_company_id())
      AND (requester_id = auth.uid())
      AND (status IN ('draft'::permit_status, 'rejected'::permit_status))
    )
  );

-- Contractor Admin edits own drafts / revises rejected permits.
DROP POLICY IF EXISTS "Contractor admins can update own contractor drafts" ON public.permits;
CREATE POLICY "Contractor admins can update own contractor drafts" ON public.permits
  FOR UPDATE
  USING (
    (requester_id = auth.uid())
    AND (contractor_id IS NOT NULL)
    AND (status IN ('draft'::permit_status, 'rejected'::permit_status))
    AND (get_my_role() = 'contractor_admin'::user_role)
  )
  WITH CHECK (
    (requester_id = auth.uid())
    AND (contractor_id IS NOT NULL)
    AND (status IN ('draft'::permit_status, 'rejected'::permit_status))
    AND (get_my_role() = 'contractor_admin'::user_role)
  );

-- Contractor Admin submits own contractor PTW (fixes the old policy whose
-- with_check required status='submitted').
DROP POLICY IF EXISTS "Requesters can submit own contractor drafts" ON public.permits;
CREATE POLICY "Requesters can submit own contractor drafts" ON public.permits
  FOR UPDATE
  USING (
    (requester_id = auth.uid())
    AND (status = 'draft'::permit_status)
    AND (contractor_id IS NOT NULL)
  )
  WITH CHECK (
    (requester_id = auth.uid())
    AND (status = 'pending_approval'::permit_status)
    AND (workflow_stage = 'safety_approval'::text)
    AND (contractor_id IS NOT NULL)
  );

-- Internal Staff and safety roles submit their own internal PTW.
DROP POLICY IF EXISTS "Work supervisors can submit own internal permits" ON public.permits;
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

-- Company administration policies move from role 'admin' to 'safety_manager'.
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

DROP POLICY IF EXISTS "Admins can manage contractors" ON public.contractors;
CREATE POLICY "Admins can manage contractors" ON public.contractors
  FOR ALL
  USING (
    is_platform_admin()
    OR (
      (get_my_role() = 'safety_manager'::user_role)
      AND EXISTS (
        SELECT 1 FROM public.contractor_companies cc
        WHERE cc.contractor_id = contractors.id
          AND cc.company_id = get_my_company_id()
      )
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR (get_my_role() = 'safety_manager'::user_role)
  );

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

-- safety_controls: allow company admins (Safety Manager) and platform admin
-- to create/update the control catalog.
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

-- permit_type_safety_controls: allow company admins / platform admin to
-- manage the mapping.
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

-- 11.6 Safety roles are the operational PTW users: same-company update
--      covering the operational lifecycle states (suspend/resume/complete/
--      close). State-transition correctness is enforced by the API routes.
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

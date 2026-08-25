-- ============================================================================
-- ePTW — Company Identity + Contractor Authorization
--   * SSM registration number on companies (mandatory for NEW registration)
--   * Unique, server-generated 4-char company code (companies + contractors)
--   * Contractor search function for customer authorization
--   * register_company / register_contractor updated (SSM + code)
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. generate_company_code() — 4-char, uppercase, collision-safe, safe alphabet
--    (avoids O/0, I/1, S/5). Identifier only, never a security boundary.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_company_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet text := 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  v_code text;
  v_taken boolean;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(
        v_alphabet,
        1 + floor(random() * length(v_alphabet))::int,
        1
      );
    END LOOP;
    SELECT EXISTS (
      SELECT 1 FROM public.companies WHERE code = v_code
      UNION ALL
      SELECT 1 FROM public.contractors WHERE company_code = v_code
    ) INTO v_taken;
    IF NOT v_taken THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. companies: SSM registration number + unique indexes + search index
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ssm_registration_no text;

CREATE UNIQUE INDEX IF NOT EXISTS companies_ssm_unique
  ON public.companies (ssm_registration_no)
  WHERE ssm_registration_no IS NOT NULL;

-- Existing company codes are already distinct; enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS companies_code_unique
  ON public.companies (code);

CREATE INDEX IF NOT EXISTS companies_name_idx ON public.companies (name);

-- ----------------------------------------------------------------------------
-- 3. contractors: 4-char company code + unique SSM + search index
-- ----------------------------------------------------------------------------
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS company_code text;

CREATE UNIQUE INDEX IF NOT EXISTS contractors_code_unique
  ON public.contractors (company_code)
  WHERE company_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contractors_registration_no_unique
  ON public.contractors (registration_no)
  WHERE registration_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS contractors_name_idx
  ON public.contractors (company_name);

-- Drop the legacy overloads so only the SSM-aware signatures exist (prevents
-- PostgREST ambiguity when p_ssm is omitted).
DROP FUNCTION IF EXISTS public.register_company(
  text, text, text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.register_contractor(
  text, text, text, text, text
);

-- ----------------------------------------------------------------------------
-- 4. register_company — SSM mandatory for new registration + 4-char code
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
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User already has a profile';
  END IF;
  IF trim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;
  IF trim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;
  IF trim(COALESCE(p_ssm, '')) = '' THEN
    RAISE EXCEPTION 'SSM Registration No. is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE ssm_registration_no = trim(p_ssm)) THEN
    RAISE EXCEPTION 'SSM Registration No. is already registered';
  END IF;

  v_company_code := public.generate_company_code();

  INSERT INTO public.companies (name, code, ssm_registration_no, is_active)
  VALUES (trim(p_company_name), v_company_code, trim(p_ssm), true)
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (
    id, full_name, employee_no, email, phone, role, department, position, is_active, company_id
  ) VALUES (
    v_user_id, trim(p_full_name), NULLIF(trim(p_employee_no), ''), trim(p_email),
    NULLIF(trim(p_phone), ''), 'safety_manager'::public.user_role,
    NULLIF(trim(p_department), ''), NULLIF(trim(p_job_position), ''), true, v_company_id
  );

  RETURN QUERY SELECT v_company_id, trim(p_company_name), v_company_code, v_user_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. register_contractor — SSM mandatory + 4-char company_code
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_contractor(
  p_company_name text,
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL::text,
  p_position text DEFAULT NULL::text,
  p_ssm text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_contractor_id bigint;
  v_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Contractor company name is required';
  END IF;
  IF trim(COALESCE(p_ssm, '')) = '' THEN
    RAISE EXCEPTION 'SSM Registration No. is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contractors WHERE registration_no = trim(p_ssm)) THEN
    RAISE EXCEPTION 'SSM Registration No. is already registered';
  END IF;

  v_code := public.generate_company_code();

  INSERT INTO public.contractors (company_name, registration_no, company_code)
  VALUES (btrim(p_company_name), trim(p_ssm), v_code)
  RETURNING id INTO v_contractor_id;

  INSERT INTO public.profiles (id, full_name, email, phone, position, role, is_active, company_id)
  VALUES (
    v_user_id, btrim(p_full_name), btrim(p_email),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_position, '')), ''),
    'contractor_admin'::user_role, true, NULL
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
    'user_id', v_user_id,
    'company_code', v_code
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. search_contractors(p_query) — SECURITY DEFINER search over registered
--    contractor companies by name / code / SSM. Company isolation preserved:
--    returns only identifier-level info (no customer data), and marks whether
--    the caller's own customer company already authorizes the contractor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_contractors(p_query text DEFAULT NULL::text)
RETURNS TABLE(
  contractor_id bigint,
  company_name text,
  company_code text,
  registration_no text,
  is_authorized boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_company bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT role, company_id INTO v_role, v_company FROM public.profiles WHERE id = v_uid;
  IF v_role NOT IN ('safety_manager','safety_coordinator','platform_admin') THEN
    RAISE EXCEPTION 'Not authorized to search contractors';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS contractor_id,
    c.company_name,
    c.company_code,
    c.registration_no,
    EXISTS (
      SELECT 1 FROM public.contractor_companies cc
      WHERE cc.contractor_id = c.id
        AND cc.company_id = v_company
        AND cc.is_active = true
    ) AS is_authorized
  FROM public.contractors c
  WHERE c.is_active = true
    AND (
      p_query IS NULL
      OR trim(p_query) = ''
      OR c.company_name ILIKE '%' || trim(p_query) || '%'
      OR c.company_code ILIKE '%' || trim(p_query) || '%'
      OR c.registration_no ILIKE '%' || trim(p_query) || '%'
    )
  ORDER BY c.company_name
  LIMIT 20;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_contractors(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_contractors(text) TO authenticated;

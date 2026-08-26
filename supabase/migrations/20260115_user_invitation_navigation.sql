-- ============================================================================
-- ePTW — User Invitation + SSM normalization + navigation support
--   * profiles.invitation_sent_at (internal-staff INVITED/ACTIVE tracking)
--   * SSM normalization in register_company / register_contractor
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invitation_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_invitation_sent_at_idx
  ON public.profiles (invitation_sent_at);

-- SSM normalization: trim + uppercase for consistent uniqueness comparison.
-- Register functions store the normalized value for NEW registrations only.
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
  RETURN QUERY SELECT v_company_id, trim(p_company_name), v_company_code, v_user_id;
END;
$function$;

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
  v_ssm text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN RAISE EXCEPTION 'Contractor company name is required'; END IF;
  v_ssm := upper(trim(COALESCE(p_ssm, '')));
  IF v_ssm = '' THEN RAISE EXCEPTION 'SSM Registration No. is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.contractors WHERE upper(trim(registration_no)) = v_ssm) THEN
    RAISE EXCEPTION 'SSM Registration No. is already registered';
  END IF;
  v_code := public.generate_company_code();
  INSERT INTO public.contractors (company_name, registration_no, company_code)
  VALUES (btrim(p_company_name), v_ssm, v_code)
  RETURNING id INTO v_contractor_id;
  INSERT INTO public.profiles (id, full_name, email, phone, position, role, is_active, company_id)
  VALUES (v_user_id, btrim(p_full_name), btrim(p_email), NULLIF(btrim(COALESCE(p_phone, '')), ''), NULLIF(btrim(COALESCE(p_position, '')), ''), 'contractor_admin'::user_role, true, NULL)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone = EXCLUDED.phone, position = EXCLUDED.position, role = 'contractor_admin'::user_role, is_active = true;
  INSERT INTO public.contractor_users (user_id, contractor_id, is_active) VALUES (v_user_id, v_contractor_id, true);
  RETURN jsonb_build_object('contractor_id', v_contractor_id, 'user_id', v_user_id, 'company_code', v_code);
END;
$function$;

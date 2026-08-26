-- ============================================================================
-- ePTW — Per-company permit numbering
--   Format: PTW-{Company Code}-{Year}-{number}
--   Each company's series is independent and starts at 0001.
--   Numbering is derived per company + year, counting only permits that match
--   the new-format prefix, so pre-existing legacy-format permits
--   (PTW-{Year}-{seq}) are not counted and each company's new series starts
--   at 0001.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Company-aware generator.
CREATE OR REPLACE FUNCTION public.generate_permit_number(p_company_id bigint)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_code text;
  v_year text;
  v_prefix text;
  v_seq bigint;
BEGIN
  SELECT code INTO v_code FROM public.companies WHERE id = p_company_id;
  v_code := COALESCE(v_code, 'XXX');
  v_year := to_char(current_date, 'YYYY');
  v_prefix := 'PTW-' || v_code || '-' || v_year || '-';

  SELECT count(*) + 1 INTO v_seq
  FROM public.permits
  WHERE company_id = p_company_id
    AND permit_no LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_seq::text, 4, '0');
END;
$function$;

-- BEFORE INSERT trigger assigns the number using NEW.company_id (a column
-- DEFAULT cannot reference other columns, so a trigger is required).
CREATE OR REPLACE FUNCTION public.set_permit_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.permit_no IS NULL THEN
    NEW.permit_no := public.generate_permit_number(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_permit_no ON public.permits;
CREATE TRIGGER trg_set_permit_no
  BEFORE INSERT ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.set_permit_no();

-- Permit_no is now assigned by the trigger; remove the old default and the
-- legacy 0-arg generator.
ALTER TABLE public.permits
  ALTER COLUMN permit_no DROP DEFAULT;

DROP FUNCTION IF EXISTS public.generate_permit_number();

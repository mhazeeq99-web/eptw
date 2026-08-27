-- ============================================================================
-- ePTW — Permit numbering concurrency fix
--   generate_permit_number previously used `count(*) + 1`, which is NOT safe:
--     * under concurrent inserts (two creates can compute the same next number),
--     * when rows are deleted (gaps make count+1 reuse an existing number).
--   Both cause `permits_permit_no_key` violations during normal operation.
--
--   The generator now:
--     * parses the numeric suffix of the highest existing permit in the
--       company+year series and returns max+1 (gap-tolerant), AND
--     * takes a transaction-scoped advisory lock keyed on the company so
--       concurrent inserts for the same company serialize and never collide.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_permit_number(p_company_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_code text;
  v_year text;
  v_prefix text;
  v_last text;
  v_seq bigint;
  v_max_seq bigint;
BEGIN
  -- Serialize concurrent permit creation for the same company so two
  -- transactions cannot compute the same number. Keyed on company id.
  PERFORM pg_advisory_xact_lock(hashtext('eptw_permit_no:' || p_company_id::text));

  SELECT code INTO v_code FROM public.companies WHERE id = p_company_id;
  v_code := COALESCE(v_code, 'XXX');
  v_year := to_char(current_date, 'YYYY');
  v_prefix := 'PTW-' || v_code || '-' || v_year || '-';

  -- Take the highest existing number in the series (gap-tolerant), then +1.
  SELECT max(permit_no) INTO v_last
  FROM public.permits
  WHERE company_id = p_company_id
    AND permit_no LIKE v_prefix || '%';

  IF v_last IS NULL THEN
    v_seq := 1;
  ELSE
    -- permit_no is 'PTW-{code}-{year}-NNNN'; take the trailing digits.
    v_max_seq := NULLIF(substring(v_last from length(v_prefix) + 1), '')::bigint;
    v_seq := COALESCE(v_max_seq, 0) + 1;
  END IF;

  RETURN v_prefix || lpad(v_seq::text, 4, '0');
END;
$function$;

-- Recreate the BEFORE INSERT trigger (no-op if it already exists with the
-- same function, but re-created here to be safe and idempotent).
DROP TRIGGER IF EXISTS trg_set_permit_no ON public.permits;
CREATE TRIGGER trg_set_permit_no
  BEFORE INSERT ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.set_permit_no();

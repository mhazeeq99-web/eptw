-- ============================================================================
-- ePTW — Phase C: structured JHA/HIRARC + LOTO + Gas Testing upgrades
-- ============================================================================
-- Upgrades the existing modules in place (no v2 tables):
--
--   jhas                     status CHECK extended with 'completed'
--                            (pending -> completed -> verified)
--   jha_hazards (new)        structured HIRARC rows per JHA
--   loto_isolation_points    + energy_type, isolation_method, remarks
--   gas_tests                + instrument, instrument_id, calibration_status,
--                            test_location, result (PASS/CONDITIONAL/FAIL)
--   gas_test_readings (new)  flexible parameter readings (O2, LEL, H2S, CO, Other)
--
-- Existing records are preserved and backfilled:
--   jhas.hazards_controls (jsonb [{hazard, control}]) -> jha_hazards
--   gas_tests.o2/lel/h2s/co                             -> gas_test_readings
--
-- RISK MATRIX: a 5x5 likelihood x severity matrix (rating = L x S, bands
-- LOW 1-4 / MEDIUM 5-9 / HIGH 10-15 / VERY HIGH 16-25) is ADOPTED BY THE
-- COMPANY. It is NOT claimed to be a legally mandated DOSH matrix; bands can
-- be adjusted by company configuration in a later phase.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. JHA status: add 'completed'
-- ----------------------------------------------------------------------------
ALTER TABLE public.jhas
  DROP CONSTRAINT IF EXISTS jhas_status_check;
ALTER TABLE public.jhas
  ADD CONSTRAINT jhas_status_check
  CHECK (status IN ('pending', 'completed', 'verified', 'rejected'));

-- ----------------------------------------------------------------------------
-- 2. Structured JHA hazard rows
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jha_hazards (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jha_id bigint NOT NULL REFERENCES public.jhas(id) ON DELETE CASCADE,
  hazard text NOT NULL,
  hazard_category text,
  consequence text,
  existing_controls text,
  control_types text[] NOT NULL DEFAULT '{}',
  likelihood integer CHECK (likelihood BETWEEN 1 AND 5),
  severity integer CHECK (severity BETWEEN 1 AND 5),
  risk_rating integer,
  additional_controls text,
  residual_likelihood integer CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_severity integer CHECK (residual_severity BETWEEN 1 AND 5),
  residual_risk integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jha_hazards_jha_idx ON public.jha_hazards (jha_id);

-- Backfill legacy jsonb hazards_controls [{hazard, control}] into rows.
INSERT INTO public.jha_hazards (jha_id, hazard, existing_controls, sort_order)
SELECT
  j.id,
  (item.value ->> 'hazard') AS hazard,
  (item.value ->> 'control') AS existing_controls,
  row_number() OVER (PARTITION BY j.id)::integer - 1
FROM public.jhas j
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(j.hazards_controls) = 'array' THEN j.hazards_controls
    ELSE '[]'::jsonb
  END
) AS item
WHERE (item.value ->> 'hazard') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.jha_hazards h WHERE h.jha_id = j.id
  );

-- ----------------------------------------------------------------------------
-- 3. LOTO: energy type + isolation method + remarks
-- ----------------------------------------------------------------------------
ALTER TABLE public.loto_isolation_points
  ADD COLUMN IF NOT EXISTS energy_type text,
  ADD COLUMN IF NOT EXISTS isolation_method text,
  ADD COLUMN IF NOT EXISTS remarks text;

-- ----------------------------------------------------------------------------
-- 4. Gas tests: instrument + result + location
-- ----------------------------------------------------------------------------
ALTER TABLE public.gas_tests
  ADD COLUMN IF NOT EXISTS instrument text,
  ADD COLUMN IF NOT EXISTS instrument_id text,
  ADD COLUMN IF NOT EXISTS calibration_status text,
  ADD COLUMN IF NOT EXISTS test_location text,
  ADD COLUMN IF NOT EXISTS result text
    CHECK (result IS NULL OR result IN ('PASS', 'CONDITIONAL', 'FAIL'));

-- ----------------------------------------------------------------------------
-- 5. Flexible gas-test parameter readings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gas_test_readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gas_test_id bigint NOT NULL REFERENCES public.gas_tests(id) ON DELETE CASCADE,
  parameter text NOT NULL,
  reading numeric,
  unit text,
  result text CHECK (result IS NULL OR result IN ('PASS', 'CONDITIONAL', 'FAIL')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gas_test_readings_gas_test_idx
  ON public.gas_test_readings (gas_test_id);

-- Backfill legacy flat columns into readings (units: O2 %, LEL %LEL, H2S/CO ppm).
INSERT INTO public.gas_test_readings (gas_test_id, parameter, reading, unit, result, sort_order)
SELECT id, 'O2', o2, '%', NULL, 0 FROM public.gas_tests WHERE o2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gas_test_readings r WHERE r.gas_test_id = gas_tests.id);
INSERT INTO public.gas_test_readings (gas_test_id, parameter, reading, unit, result, sort_order)
SELECT id, 'LEL', lel, '%LEL', NULL, 1 FROM public.gas_tests WHERE lel IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gas_test_readings r WHERE r.gas_test_id = gas_tests.id);
INSERT INTO public.gas_test_readings (gas_test_id, parameter, reading, unit, result, sort_order)
SELECT id, 'H2S', h2s, 'ppm', NULL, 2 FROM public.gas_tests WHERE h2s IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gas_test_readings r WHERE r.gas_test_id = gas_tests.id);
INSERT INTO public.gas_test_readings (gas_test_id, parameter, reading, unit, result, sort_order)
SELECT id, 'CO', co, 'ppm', NULL, 3 FROM public.gas_tests WHERE co IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.gas_test_readings r WHERE r.gas_test_id = gas_tests.id);

-- ----------------------------------------------------------------------------
-- 6. RLS — same can_access_permit pattern as jhas / loto / gas_tests
-- ----------------------------------------------------------------------------
ALTER TABLE public.jha_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gas_test_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view JHA hazards" ON public.jha_hazards;
CREATE POLICY "Authorized users can view JHA hazards"
  ON public.jha_hazards FOR SELECT TO authenticated
  USING (public.can_access_permit((SELECT permit_id FROM public.jhas WHERE id = jha_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add JHA hazards" ON public.jha_hazards;
CREATE POLICY "Authorized users can add JHA hazards"
  ON public.jha_hazards FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit((SELECT permit_id FROM public.jhas WHERE id = jha_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update JHA hazards" ON public.jha_hazards;
CREATE POLICY "Authorized users can update JHA hazards"
  ON public.jha_hazards FOR UPDATE TO authenticated
  USING (public.can_access_permit((SELECT permit_id FROM public.jhas WHERE id = jha_id)) OR is_platform_admin())
  WITH CHECK (public.can_access_permit((SELECT permit_id FROM public.jhas WHERE id = jha_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete JHA hazards" ON public.jha_hazards;
CREATE POLICY "Authorized users can delete JHA hazards"
  ON public.jha_hazards FOR DELETE TO authenticated
  USING (public.can_access_permit((SELECT permit_id FROM public.jhas WHERE id = jha_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can view gas test readings" ON public.gas_test_readings;
CREATE POLICY "Authorized users can view gas test readings"
  ON public.gas_test_readings FOR SELECT TO authenticated
  USING (public.can_access_permit((SELECT permit_id FROM public.gas_tests WHERE id = gas_test_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add gas test readings" ON public.gas_test_readings;
CREATE POLICY "Authorized users can add gas test readings"
  ON public.gas_test_readings FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit((SELECT permit_id FROM public.gas_tests WHERE id = gas_test_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can update gas test readings" ON public.gas_test_readings;
CREATE POLICY "Authorized users can update gas test readings"
  ON public.gas_test_readings FOR UPDATE TO authenticated
  USING (public.can_access_permit((SELECT permit_id FROM public.gas_tests WHERE id = gas_test_id)) OR is_platform_admin())
  WITH CHECK (public.can_access_permit((SELECT permit_id FROM public.gas_tests WHERE id = gas_test_id)) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete gas test readings" ON public.gas_test_readings;
CREATE POLICY "Authorized users can delete gas test readings"
  ON public.gas_test_readings FOR DELETE TO authenticated
  USING (public.can_access_permit((SELECT permit_id FROM public.gas_tests WHERE id = gas_test_id)) OR is_platform_admin());

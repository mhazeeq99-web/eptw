-- ============================================================================
-- ePTW — Pricing/entitlement revision
-- ============================================================================
-- 1. Contractor Admins become UNLIMITED on both Free and Pro:
--      plans.max_contractor_admins set to NULL (null = unlimited).
--      Contractor Admin security/RLS/company isolation is unchanged; this only
--      removes the advertised numeric cap.
-- 2. Storage limits revised:
--      Free = 250 MB, Pro = 5 GB.
-- 3. Permit history retention added:
--      plans.max_history_years = Free 2, Pro 10. This is an ePTW product
--      retention/access limit (an access/search visibility rule), NOT a DOSH
--      legal requirement, and it does not delete any records.
--
-- Existing plans are updated idempotently. No other Free/Pro limit changes:
-- sites 1/5, monthly 20/unlimited, active 10/unlimited, SM 1/3, SC 2/10,
-- internal staff 5/50.
-- ============================================================================

-- 1. Contractor Admins unlimited on both plans.
ALTER TABLE public.plans
  ALTER COLUMN max_contractor_admins DROP NOT NULL;

UPDATE public.plans
SET max_contractor_admins = NULL
WHERE code IN ('free', 'pro')
  AND max_contractor_admins IS NOT NULL;

-- 2. Storage limits.
UPDATE public.plans
SET max_storage_bytes = 262144000   -- 250 MB
WHERE code = 'free'
  AND max_storage_bytes IS DISTINCT FROM 262144000;

UPDATE public.plans
SET max_storage_bytes = 5368709120  -- 5 GB
WHERE code = 'pro'
  AND max_storage_bytes IS DISTINCT FROM 5368709120;

-- 3. Permit history retention (years).
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_history_years integer;

UPDATE public.plans
SET max_history_years = 2
WHERE code = 'free'
  AND max_history_years IS DISTINCT FROM 2;

UPDATE public.plans
SET max_history_years = 10
WHERE code = 'pro'
  AND max_history_years IS DISTINCT FROM 10;

-- ============================================================================
-- ePTW — Pricing revision: TWO plans (Free / Pro) with new pricing + storage
-- ============================================================================
--
-- Business rules (production pricing model):
--   FREE: RM0/month, NO attachment storage (0 MB). Core PTW workflow is fully
--         functional; attachments are the ONLY gated capability.
--   PRO:  RM149/month (or RM1,490/year), 5 GB attachment storage.
--
-- This migration:
--   1. Adds an annual price column to plans (price_annual) so the pricing
--      pages can advertise the annual option without hardcoding amounts.
--   2. Sets Free max_storage_bytes = 0 (attachments blocked — server-side
--      entitlement check rejects any upload since usage 0 + size > 0 > limit).
--   3. Sets Pro price_monthly = 149.00 and price_annual = 1490.00.
--   4. Keeps Pro max_storage_bytes = 5 GB (5368709120).
--
-- Backward compatible: existing plans are updated idempotently, no rows are
-- deleted, existing subscriptions are untouched, existing attachments are NOT
-- removed (only new uploads are limited by the entitlement check).
-- ============================================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS price_annual numeric(10,2);

-- Free: no attachment storage (uploads blocked server-side).
UPDATE public.plans
SET max_storage_bytes = 0
WHERE code = 'free'
  AND max_storage_bytes IS DISTINCT FROM 0;

-- Pro: RM149/month, RM1,490/year, 5 GB storage.
UPDATE public.plans
SET price_monthly = 149.00,
    price_annual = 1490.00,
    max_storage_bytes = 5368709120
WHERE code = 'pro'
  AND (
    price_monthly IS DISTINCT FROM 149.00
    OR price_annual IS DISTINCT FROM 1490.00
    OR max_storage_bytes IS DISTINCT FROM 5368709120
  );

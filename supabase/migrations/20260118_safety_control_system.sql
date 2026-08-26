-- ============================================================================
-- ePTW — Safety-control "system" flag
--   Marks the seeded global safety-control catalogue as system so they can be
--   deactivated but NOT deleted. Controls added later (is_system = false) may
--   be deleted.
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE public.safety_controls
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- All currently-seeded safety controls are treated as system catalogue rows.
UPDATE public.safety_controls
SET is_system = true
WHERE is_system = false;

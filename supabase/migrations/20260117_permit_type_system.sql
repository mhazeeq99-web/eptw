-- ============================================================================
-- ePTW — Permit-type "system" flag
--   Marks the standard seeded permit types (COLD/CSE/ELEC/HOT/WAH) as system
--   defaults so they can be deactivated but NOT deleted. User-added permit
--   types default to is_system = false and may be deleted.
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE public.permit_types
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- The standard seeded defaults across companies are treated as system types.
UPDATE public.permit_types
SET is_system = true
WHERE code IN ('COLD', 'CSE', 'ELEC', 'HOT', 'WAH');

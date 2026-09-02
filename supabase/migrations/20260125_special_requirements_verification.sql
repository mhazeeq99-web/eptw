-- ============================================================================
-- ePTW — Specialised Requirements verification
-- ============================================================================
-- Adds a real SM/SC verification flag for the specialised requirement sections
-- (Hot Work / Confined Space / Work at Height / Electrical Requirements).
--
-- Before this change the section's "Verified" pill was derived purely from the
-- details being filled in, so it appeared verified to everyone (including
-- internal staff) before any safety verification happened. These columns record
-- WHO verified the specialised requirements and WHEN, set only by a Safety
-- Manager / Safety Coordinator through the verify endpoint.
--
--   permits.special_verified_by  uuid        — the SM/SC who verified
--   permits.special_verified_at  timestamptz — when they verified
--
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS special_verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS special_verified_at timestamptz;

-- ============================================================================
-- ePTW — Unified PTW: Applicant Declaration
-- ============================================================================
-- Adds the applicant's declaration to the permits record so the canonical
-- applicant PTW (Create == Draft) can persist and display it.
--
--   permits.declaration_confirmed_at  timestamptz — when the applicant
--                                      confirmed the declaration
--   permits.declaration_confirmed_by  uuid        — the applicant who confirmed
--
-- RLS is unchanged; these are read-only/derived fields on the existing permits
-- table governed by the existing permits policies. No new tables, no roles,
-- no workflow change.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS declaration_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS declaration_confirmed_by uuid REFERENCES public.profiles(id);

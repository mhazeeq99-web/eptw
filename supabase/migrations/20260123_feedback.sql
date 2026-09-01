-- ============================================================================
-- ePTW — User Feedback
-- ============================================================================
-- Lets any authenticated user submit product feedback (title + message) and
-- lets Platform Administrators review all submissions.
--
-- Privacy note: after submitting, a user does NOT see their own feedback list
-- (only the submission acknowledgement). Only platform_admin can SELECT all
-- feedback. No user-to-user visibility.
--
-- Columns:
--   feedback.id          bigserial PK
--   feedback.user_id     uuid  — the submitting auth user (NOT NULL)
--   feedback.company_id  bigint — the submitter's company (nullable for PA)
--   feedback.title       text  — short subject line
--   feedback.message     text  — the feedback body
--   feedback.created_at  timestamptz
--
-- Idempotent: safe to run more than once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  company_id BIGINT REFERENCES public.companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx
  ON public.feedback (created_at DESC);

COMMENT ON COLUMN public.feedback.company_id IS
  'Company of the submitting user, if any (profiles.company_id).';

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated, active user may submit feedback. They may only insert a
-- row attributed to their own auth.uid().
DROP POLICY IF EXISTS "feedback_insert" ON public.feedback;
CREATE POLICY "feedback_insert" ON public.feedback
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

-- Platform administrators may view all feedback. Regular users cannot read
-- any feedback (including their own) — they only get the acknowledgement.
DROP POLICY IF EXISTS "feedback_select_platform" ON public.feedback;
CREATE POLICY "feedback_select_platform" ON public.feedback
  FOR SELECT
  USING (is_platform_admin());

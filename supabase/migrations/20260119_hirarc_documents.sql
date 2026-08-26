-- ============================================================================
-- ePTW — Phase G.1: JHA/HIRARC dual-method (manual JHA OR uploaded HIRARC)
-- ============================================================================
-- The JHA/HIRARC requirement is satisfied by EITHER:
--   Option A — a manual JHA (existing jhas table), OR
--   Option B — an uploaded HIRARC document (new hirarc_documents table).
--
-- JHA_REQUIRED  = permit_types.requires_jha
-- JHA_COMPLIANCE= manual_jha_completed OR hirarc_document_uploaded
--
-- This migration adds the hirarc_documents table (permit-scoped, mirrors
-- permit_attachments metadata; files live in the existing 'permit-attachments'
-- bucket so storage RLS/entitlements apply unchanged). No existing policy is
-- weakened; RLS uses the established can_access_permit() isolation model.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hirarc_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_id bigint NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  filename text NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hirarc_documents_permit_idx
  ON public.hirarc_documents (permit_id);

ALTER TABLE public.hirarc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view HIRARC documents" ON public.hirarc_documents;
CREATE POLICY "Authorized users can view HIRARC documents"
  ON public.hirarc_documents
  FOR SELECT TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can add HIRARC documents" ON public.hirarc_documents;
CREATE POLICY "Authorized users can add HIRARC documents"
  ON public.hirarc_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_permit(permit_id) OR is_platform_admin());

DROP POLICY IF EXISTS "Authorized users can delete HIRARC documents" ON public.hirarc_documents;
CREATE POLICY "Authorized users can delete HIRARC documents"
  ON public.hirarc_documents
  FOR DELETE TO authenticated
  USING (public.can_access_permit(permit_id) OR is_platform_admin());

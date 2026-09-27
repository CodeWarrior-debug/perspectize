-- Add content.privacy so a content row can be owner-only.
-- Existing rows default to 'public' (no behaviour change). CLAIM content is
-- created 'private' by ContentService.CreateClaim; a future public gate (TBD)
-- promotes it. Stored lowercase like perspectives.privacy; see
-- backend/internal/adapters/repositories/postgres/helpers.go.
-- Idempotent: safe on a fresh DB or one already patched out of band.

ALTER TABLE public.content ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public';

ALTER TABLE public.content DROP CONSTRAINT IF EXISTS content_privacy_check;
ALTER TABLE public.content
    ADD CONSTRAINT content_privacy_check CHECK (privacy IN ('public', 'private'));

-- Owner branch of the "public OR mine" list filter.
CREATE INDEX IF NOT EXISTS idx_content_private_owner
    ON public.content (added_by_user_id) WHERE privacy = 'private';

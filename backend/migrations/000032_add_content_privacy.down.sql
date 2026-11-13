DROP INDEX IF EXISTS public.idx_content_private_owner;
ALTER TABLE public.content DROP CONSTRAINT IF EXISTS content_privacy_check;
ALTER TABLE public.content DROP COLUMN IF EXISTS privacy;

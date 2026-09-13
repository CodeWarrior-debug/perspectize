ALTER TABLE public.perspectives DROP CONSTRAINT IF EXISTS perspectives_privacy_check;
ALTER TABLE public.perspectives ALTER COLUMN privacy DROP NOT NULL;
-- DEFAULT 'public' predates this migration (000004); leave it in place.

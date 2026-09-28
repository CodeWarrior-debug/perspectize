-- Insert "[system]" sentinel user for pre-existing content (before user tracking).
-- Distinct from "[deleted]" which receives orphaned content/perspectives on user deletion.
INSERT INTO public.users (username, email)
VALUES ('[system]', 'system@system.internal')
ON CONFLICT (username) DO NOTHING;

-- Reassign pre-existing content from [deleted] to [system] sentinel.
-- These are rows backfilled by migration 000006 that existed before user tracking.
UPDATE public.content
SET added_by_user_id = (SELECT id FROM public.users WHERE username = '[system]')
WHERE added_by_user_id = (SELECT id FROM public.users WHERE username = '[deleted]');

-- Drop claim-related constraint and column from perspectives
ALTER TABLE public.perspectives DROP CONSTRAINT IF EXISTS perspectives_unique_user_claims;
ALTER TABLE public.perspectives DROP COLUMN IF EXISTS claim;

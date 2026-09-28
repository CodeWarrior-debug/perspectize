-- Re-add claim column to perspectives
ALTER TABLE public.perspectives ADD COLUMN claim varchar(255);

-- Backfill claim with empty string for existing rows (NOT NULL required for constraint)
UPDATE public.perspectives SET claim = '' WHERE claim IS NULL;

-- Make claim NOT NULL and re-add unique constraint
ALTER TABLE public.perspectives ALTER COLUMN claim SET NOT NULL;
ALTER TABLE public.perspectives
ADD CONSTRAINT perspectives_unique_user_claims UNIQUE(claim, user_id);

-- Reassign content from [system] back to [deleted]
UPDATE public.content
SET added_by_user_id = (SELECT id FROM public.users WHERE username = '[deleted]')
WHERE added_by_user_id = (SELECT id FROM public.users WHERE username = '[system]');

-- Remove [system] sentinel user
DELETE FROM public.users WHERE username = '[system]';

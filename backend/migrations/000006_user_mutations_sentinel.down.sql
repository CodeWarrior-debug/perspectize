-- Remove added_by FK and column from content
ALTER TABLE public.content DROP CONSTRAINT IF EXISTS content_added_by_user_fk;
ALTER TABLE public.content DROP COLUMN IF EXISTS added_by_user_id;

-- Restore original perspectives FK (default RESTRICT, no explicit clause)
ALTER TABLE public.perspectives DROP CONSTRAINT perspectives_users_fk;
ALTER TABLE public.perspectives
ADD CONSTRAINT perspectives_users_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Remove sentinel user (only if no content/perspectives reference it)
DELETE FROM public.users WHERE username = '[deleted]';

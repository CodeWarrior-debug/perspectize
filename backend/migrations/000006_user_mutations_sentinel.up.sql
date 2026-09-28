-- Insert sentinel "[deleted]" user for reassignment on user deletion.
-- All FKs use ON DELETE RESTRICT; the delete service reassigns owned
-- content/perspectives to this sentinel before removing the real user.
INSERT INTO public.users (username, email)
VALUES ('[deleted]', 'deleted@system.internal')
ON CONFLICT (username) DO NOTHING;

-- Add added_by_user_id FK on content table
ALTER TABLE public.content ADD COLUMN added_by_user_id integer;

-- Backfill existing content rows to sentinel user
UPDATE public.content
SET added_by_user_id = (SELECT id FROM public.users WHERE username = '[deleted]')
WHERE added_by_user_id IS NULL;

-- Now make the column NOT NULL
ALTER TABLE public.content ALTER COLUMN added_by_user_id SET NOT NULL;

-- Add FK constraint with explicit ON DELETE RESTRICT
ALTER TABLE public.content
ADD CONSTRAINT content_added_by_user_fk
    FOREIGN KEY (added_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- Make perspectives FK explicitly ON DELETE RESTRICT (was implicit default)
ALTER TABLE public.perspectives DROP CONSTRAINT perspectives_users_fk;
ALTER TABLE public.perspectives
ADD CONSTRAINT perspectives_users_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

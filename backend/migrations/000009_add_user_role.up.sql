-- Add role column with CHECK constraint
ALTER TABLE public.users
ADD COLUMN role TEXT NOT NULL DEFAULT 'default',
ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'sentinel', 'default'));

-- Backfill: user ID 1 is admin
UPDATE public.users SET role = 'admin' WHERE id = 1;

-- Backfill: sentinel users by username
UPDATE public.users SET role = 'sentinel'
WHERE username IN ('[deleted]', '[system]');

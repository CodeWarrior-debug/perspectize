-- Add active boolean column to users, defaulting to true
ALTER TABLE public.users ADD COLUMN active boolean NOT NULL DEFAULT true;

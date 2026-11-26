-- Restores the column, empty.
ALTER TABLE public.perspectives ADD COLUMN IF NOT EXISTS review_status text NULL;

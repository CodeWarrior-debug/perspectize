-- Removes the perspective review status; no code reads or writes the column.
ALTER TABLE public.perspectives DROP COLUMN IF EXISTS review_status;

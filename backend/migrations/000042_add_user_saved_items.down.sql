-- Reverses 000042_add_user_saved_items.up.sql.
-- Dropping the table also drops its indexes and constraints, including the self-referencing
-- source FK. Saved items are user data: this down discards every row.
DROP TRIGGER IF EXISTS set_updated_at ON public.user_saved_items;
DROP TABLE IF EXISTS public.user_saved_items;

-- JSONB convention: optional JSONB columns are nullable with no default. NULL means unset,
-- so a row that never uses the column stores nothing. Existing '{}' values are kept as they
-- are; only rows written from now on are NULL when no custom fields are set.
-- Idempotent: DROP DEFAULT is a no-op when the default is already gone.

ALTER TABLE public.perspectives ALTER COLUMN custom_fields DROP DEFAULT;

-- Add content.custom_fields: user-named attributes on a content item, the same shape
-- as perspectives.custom_fields (migration 000013). Nullable with no default: NULL means
-- no custom fields, so rows that never use the column store nothing.
-- Idempotent: safe on a fresh DB or one already patched out of band.

ALTER TABLE public.content ADD COLUMN IF NOT EXISTS custom_fields JSONB;

DROP INDEX IF EXISTS idx_content_parent_content_id;

ALTER TABLE content DROP COLUMN IF EXISTS parent_content_id;

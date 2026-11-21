ALTER TABLE content ADD COLUMN IF NOT EXISTS parent_content_id BIGINT NULL REFERENCES content(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_content_parent_content_id ON content (parent_content_id) WHERE parent_content_id IS NOT NULL;

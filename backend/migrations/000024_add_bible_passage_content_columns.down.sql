DROP INDEX IF EXISTS content_verse_range_idx;
ALTER TABLE content DROP COLUMN IF EXISTS display_title;
ALTER TABLE content DROP COLUMN IF EXISTS verse_end_id;
ALTER TABLE content DROP COLUMN IF EXISTS verse_start_id;

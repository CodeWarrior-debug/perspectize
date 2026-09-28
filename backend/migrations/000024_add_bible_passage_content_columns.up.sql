-- Bible passage content: ordinal range + optional display title on content.
--
-- verse_start_id / verse_end_id are plain integers with NO foreign key: there
-- is no bible_verse table. Ordinals are computed from bible_book.verses_per_chapter
-- (see migration 000023): ordinal = verses in earlier books + verses in earlier
-- chapters of this book + verse.
--
-- Numbering note: 000022 is claimed by in-flight PR #394 (youtube_video rename);
-- 000023 is PR A (bible_book). Re-check at merge time.
--
-- Manual application required: this repo does not auto-run migrations.

ALTER TABLE content ADD COLUMN IF NOT EXISTS verse_start_id integer NULL;
ALTER TABLE content ADD COLUMN IF NOT EXISTS verse_end_id integer NULL;
ALTER TABLE content ADD COLUMN IF NOT EXISTS display_title varchar NULL;

CREATE INDEX IF NOT EXISTS content_verse_range_idx
    ON content (verse_start_id, verse_end_id);

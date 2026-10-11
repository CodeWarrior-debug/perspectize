-- length_display: where content.length came from and the smallest unit that
-- source reports, as JSONB so new sources/precisions need no further migration:
--   {"source": "youtube", "precision": "seconds"}
--   {"source": "tmdb",    "precision": "minutes"}
-- length itself stays in seconds for every type (sorting/filtering compare it
-- directly); clients format it to `precision` (a TMDB runtime shows as h:mm).
--
-- Numbering: 000030 is the next free number on main. Open PRs also claim 000030
-- (hermeneutic) and 000031 (claims); numbers on open PRs are provisional, so
-- finalize this one just before merging (backend/CLAUDE.md -> Migrations).
--
-- Apply BEFORE deploying the backend that writes this column: inserts name it.

ALTER TABLE content ADD COLUMN IF NOT EXISTS length_display JSONB NULL;

UPDATE content
SET length_display = '{"source": "tmdb", "precision": "minutes"}'::jsonb
WHERE content_type = 'movie' AND length IS NOT NULL AND length_display IS NULL;

UPDATE content
SET length_display = '{"source": "youtube", "precision": "seconds"}'::jsonb
WHERE content_type = 'youtube_video' AND length IS NOT NULL AND length_display IS NULL;

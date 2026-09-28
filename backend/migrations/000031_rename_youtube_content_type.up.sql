-- Numbering: originally 000022 (a gap on main, since main went 000021 -> 000023). A lower
-- number than the latest applied migration is skipped by `migrate up`, so this was renumbered
-- to 000031: 000027 is on main and 000028-000030 are claimed by in-flight branches.
-- Rename content_type 'youtube' -> 'youtube_video' so youtube_channel / youtube_playlist etc. can follow.
-- Must be applied manually per environment, together with the deploy that introduces the
-- YOUTUBE_VIDEO GraphQL enum value (rows still holding 'youtube' map to no enum value).
-- Idempotent: safe to re-run or apply to a DB already patched out of band.
UPDATE content SET content_type = 'youtube_video' WHERE content_type = 'youtube';

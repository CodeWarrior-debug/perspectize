-- Rename content_type 'youtube' -> 'youtube_video' so youtube_channel / youtube_playlist etc. can follow.
-- Must be applied manually per environment, together with the deploy that introduces the
-- YOUTUBE_VIDEO GraphQL enum value (rows still holding 'youtube' map to no enum value).
-- Idempotent: safe to re-run or apply to a DB already patched out of band.
UPDATE content SET content_type = 'youtube_video' WHERE content_type = 'youtube';

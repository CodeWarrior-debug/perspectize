-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. Was 000032_youtube_music_isrc_index (ADR 0001 renames it
-- before it is ever applied).
-- Dedupe step 1 (ADR 0005): find an AUDIO_TRACK by ISRC in response.music.
CREATE INDEX IF NOT EXISTS idx_content_music_isrc
    ON content ((response->'music'->>'isrc'))
    WHERE content_type = 'audio_track';

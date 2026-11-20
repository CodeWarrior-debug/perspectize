-- Dedupe step 1 (ADR 0005): find an AUDIO_TRACK by ISRC in response.music.
CREATE INDEX IF NOT EXISTS idx_content_music_isrc
    ON content ((response->'music'->>'isrc'))
    WHERE content_type = 'audio_track';

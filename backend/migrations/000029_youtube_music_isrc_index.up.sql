-- YOUTUBE_MUSIC tracks are deduplicated by ISRC, stored in response JSONB.
-- Number 29: main has 000027 and branch claude/claim-content-type-html-form-17cx78
-- has 000028_add_content_privacy in flight (checked 2026-09-27).
-- content_type is a plain varchar with no check constraint (see issue #470),
-- so 'youtube_music' needs no constraint change here.
-- Apply manually per environment; nothing runs migrations automatically.
CREATE INDEX IF NOT EXISTS idx_content_isrc
    ON content ((response->>'isrc'))
    WHERE content_type = 'youtube_music';

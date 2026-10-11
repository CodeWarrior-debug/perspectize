-- YOUTUBE_MUSIC tracks are deduplicated by ISRC, stored in response JSONB.
-- Number 32: next free on main as of 2026-10-10 (main has 000031_add_user_todos).
-- Still provisional until merge; renumber if main moves again.
-- content_type is a plain varchar with no check constraint (see issue #470),
-- so 'youtube_music' needs no constraint change here.
-- Apply manually per environment; nothing runs migrations automatically.
CREATE INDEX IF NOT EXISTS idx_content_isrc
    ON content ((response->>'isrc'))
    WHERE content_type = 'youtube_music';

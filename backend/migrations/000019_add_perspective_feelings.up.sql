-- Add feelings column for the emoji feel-wheel (see
-- docs/superpowers/specs/2026-09-12-feel-wheel-design.md). Mirrors the
-- categorized_ratings jsonb[] pattern from 000004_add_perspectives_users.
ALTER TABLE perspectives
    ADD COLUMN IF NOT EXISTS feelings jsonb[] NULL;

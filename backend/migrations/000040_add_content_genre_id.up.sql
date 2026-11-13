-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. ADR 0006: an AUDIO_TRACK's genre is one node of the
-- seeded music_genres tree. Nullable: no match means no genre.
ALTER TABLE content
    ADD COLUMN IF NOT EXISTS genre_id INTEGER NULL
    REFERENCES music_genres(id) ON DELETE SET NULL;

COMMENT ON COLUMN content.genre_id IS 'AUDIO_TRACK genre (music_genres.id). Anyone sets it while NULL; the adder may change it within 30 days (ADR 0006).';

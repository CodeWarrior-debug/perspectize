-- Verse text per translation, keyed by the computed verse ordinal (see
-- migration 000023: ordinal = verses in earlier books + verses in earlier
-- chapters + verse). No FK: there is no per-verse table.
-- Populated only via `go run ./cmd/seed-bible` (reads data/bible/bsb.tsv).
--
-- Manual application required: this repo does not auto-run migrations.

CREATE TABLE IF NOT EXISTS bible_verse_text (
    verse_id    integer NOT NULL,
    translation varchar NOT NULL,
    text        text NOT NULL,
    PRIMARY KEY (translation, verse_id)
);

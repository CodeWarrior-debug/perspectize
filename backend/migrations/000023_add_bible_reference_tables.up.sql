-- Bible reference data tables: bible_book, bible_verse.
-- Populated only via `go run ./cmd/seed-bible` (see backend/cmd/seed-bible/main.go).
-- This migration creates empty tables; it does not insert data.
--
-- Manual application required: this repo does not auto-run migrations against
-- any environment. Apply manually per environment, then run the seeder.

CREATE TABLE IF NOT EXISTS bible_book (
    id            integer PRIMARY KEY,
    name          varchar NOT NULL,
    testament     varchar NOT NULL,
    canon         varchar NOT NULL DEFAULT 'protestant',
    division      varchar NOT NULL,
    chapter_count integer NOT NULL,
    aliases       jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS bible_verse (
    id      integer PRIMARY KEY,
    book_id integer NOT NULL REFERENCES bible_book(id),
    chapter integer NOT NULL,
    verse   integer NOT NULL
);

CREATE INDEX IF NOT EXISTS bible_verse_book_chapter_idx
    ON bible_verse (book_id, chapter, verse);

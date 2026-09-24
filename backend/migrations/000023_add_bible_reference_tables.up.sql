-- Bible reference data table: bible_book.
-- Populated only via `go run ./cmd/seed-bible` (see backend/cmd/seed-bible/main.go).
-- This migration creates an empty table; it does not insert data.
--
-- Verse ordinals are derived from `verses_per_chapter` (one integer per
-- chapter, giving that chapter's verse count) rather than materialized as a
-- separate per-verse table: ordinal = sum(verses in earlier books)
-- + sum(verses in earlier chapters of this book) + verse.
--
-- Manual application required: this repo does not auto-run migrations against
-- any environment. Apply manually per environment, then run the seeder.

CREATE TABLE IF NOT EXISTS bible_book (
    id                 integer PRIMARY KEY,
    name               varchar NOT NULL,
    testament          varchar NOT NULL,
    canon              varchar NOT NULL DEFAULT 'protestant',
    division           varchar NOT NULL,
    chapter_count      integer NOT NULL,
    aliases            jsonb NOT NULL DEFAULT '[]'::jsonb,
    verses_per_chapter jsonb NOT NULL DEFAULT '[]'::jsonb
);

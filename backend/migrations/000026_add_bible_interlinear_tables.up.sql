-- Interlinear (original-language) word data for BSB passages. See
-- docs/superpowers/specs/2026-09-24-bible-interlinear-design.md.
--
-- bible_word: one row per Berean source word, plus rows for English words that
-- have no source word (so the verse text can be rebuilt exactly). chunk_text /
-- space_before are the precomputed text of the row; span_head is the bsb_sort of
-- the first row of the English phrase the word belongs to (NULL = no phrase).
-- orig_strongs is Berean's plain Strong's number exactly as published; strongs
-- is the disambiguated STEPBible tag (e.g. H1254B). Populated only by
-- `go run ./cmd/seed-bible` from the versioned release files.
--
-- Indexes: the primary key ONLY (owner decision 2026-09-24). No FK to a verse
-- table: verse ordinals are computed (see migration 000023), like bible_verse_text.
--
-- Manual application required: this repo does not auto-run migrations.
-- Apply per environment, then run the seeder.

CREATE TABLE IF NOT EXISTS bible_word (
    verse_id       integer NOT NULL,
    bsb_sort       integer NOT NULL,
    language       varchar NOT NULL DEFAULT '',
    source_sort    integer,
    source         varchar NOT NULL DEFAULT '',
    translit       varchar NOT NULL DEFAULT '',
    parse_short    varchar NOT NULL DEFAULT '',
    parse_full     varchar NOT NULL DEFAULT '',
    orig_strongs   integer,
    strongs        varchar NOT NULL DEFAULT '',
    strongs_source varchar NOT NULL DEFAULT '',
    span_head      integer,
    chunk_text     varchar NOT NULL DEFAULT '',
    space_before   boolean NOT NULL DEFAULT false,
    PRIMARY KEY (verse_id, bsb_sort)
);

-- Short meaning (STEPBible "Gloss" column, CC BY 4.0) per disambiguated tag.
CREATE TABLE IF NOT EXISTS bible_lexicon (
    tag      varchar PRIMARY KEY,
    plain    varchar NOT NULL,
    language varchar NOT NULL,
    gloss    varchar NOT NULL
);

-- One row recording which data version an environment has loaded.
CREATE TABLE IF NOT EXISTS bible_data_version (
    id               integer PRIMARY KEY CHECK (id = 1),
    manifest_version integer NOT NULL,
    word_sha256      varchar NOT NULL,
    lexicon_sha256   varchar NOT NULL,
    loaded_at        timestamptz NOT NULL DEFAULT now()
);

-- Hermeneutic approach lookup table, plus the perspective columns that
-- reference it.
--
-- The list is small and fixed, so (unlike bible_book) it is seeded inline
-- via INSERT rather than through a separate `cmd/seed-*` program.
--
-- A perspective on a BIBLE_PASSAGE piece of content may set EITHER
-- hermeneutic_approach_id (a choice from this table) OR
-- hermeneutic_custom_text (a free-text "in my own words" answer), not both
-- -- enforced at the service layer, not by a DB constraint, matching the
-- existing pattern for other perspective fields (e.g. rating ranges).
--
-- Manual application required: this repo does not auto-run migrations
-- against any environment. Apply manually per environment.

CREATE TABLE IF NOT EXISTS hermeneutic_approach (
    id            integer PRIMARY KEY,
    code          varchar NOT NULL UNIQUE,
    name          varchar NOT NULL,
    description   varchar NULL,
    display_order integer NOT NULL DEFAULT 0
);

INSERT INTO hermeneutic_approach (id, code, name, description, display_order) VALUES
    (1, 'LITERAL', 'Literal / Plain Sense', 'Reading the text according to its plain, ordinary meaning.', 1),
    (2, 'HISTORICAL_GRAMMATICAL', 'Historical-Grammatical', 'Interpreting the text in light of its original historical context, language, and grammar.', 2),
    (3, 'ALLEGORICAL', 'Allegorical', 'Reading the text as symbolic of deeper spiritual truths beyond the literal narrative.', 3),
    (4, 'TYPOLOGICAL', 'Typological', 'Seeing earlier persons, events, or institutions as foreshadowing later ones.', 4),
    (5, 'CHRISTOLOGICAL', 'Christological', 'Reading the passage as pointing to or being fulfilled in Christ.', 5),
    (6, 'DEVOTIONAL', 'Devotional', 'Reading for personal spiritual formation and application rather than technical analysis.', 6),
    (7, 'REDEMPTIVE_HISTORICAL', 'Redemptive-Historical', 'Situating the passage within the unfolding story of redemption across Scripture.', 7)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE perspectives ADD COLUMN IF NOT EXISTS hermeneutic_approach_id integer NULL REFERENCES hermeneutic_approach(id);
ALTER TABLE perspectives ADD COLUMN IF NOT EXISTS hermeneutic_custom_text text NULL;

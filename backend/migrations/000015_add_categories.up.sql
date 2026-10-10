CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    wikidata_qid    TEXT NOT NULL UNIQUE,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    entity_type     TEXT DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_wikidata_qid ON categories(wikidata_qid);

ALTER TABLE content ADD COLUMN primary_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX idx_content_primary_category_id ON content(primary_category_id);

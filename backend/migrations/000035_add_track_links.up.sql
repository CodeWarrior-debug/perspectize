-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. ADR 0005: one content row per recording; every link to
-- it (including the first pasted one, which is also content.url) is a row
-- here. A provider track id belongs to exactly one track.
CREATE TABLE IF NOT EXISTS track_links (
    id                SERIAL PRIMARY KEY,
    content_id        INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    provider          VARCHAR(32)  NOT NULL CHECK (provider IN ('youtube', 'spotify', 'apple_music', 'amazon_music')),
    provider_track_id VARCHAR(128) NOT NULL,
    url               TEXT         NOT NULL,
    kind              VARCHAR(16)  NOT NULL DEFAULT 'listen' CHECK (kind IN ('listen', 'embed')),
    source            VARCHAR(16)  NOT NULL DEFAULT 'pasted' CHECK (source IN ('pasted', 'matched')),
    unavailable_at    TIMESTAMPTZ  NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_track_links_provider_track UNIQUE (provider, provider_track_id)
);

-- LinksByContentIDs (the details view and the dataloader) reads by content_id.
CREATE INDEX IF NOT EXISTS idx_track_links_content_id ON track_links (content_id);

COMMENT ON TABLE track_links IS 'Links to one AUDIO_TRACK recording (ADR 0005). kind=embed plays in-page (YouTube); listen opens the provider.';
COMMENT ON COLUMN track_links.unavailable_at IS 'Set once when the embed reports 101/150 (ticket 03). Never cleared automatically in v1.';

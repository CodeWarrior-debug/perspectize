-- Import staging: named imports (import_jobs) of one or more sources
-- (import_job_sources: a YouTube channel, a TMDB person's filmography), each
-- listed into candidate rows (import_job_items) that users pick from and import.
-- Spec: docs/superpowers/specs/2026-10-27-youtube-channel-import-design.md
-- Plan: docs/superpowers/plans/2026-10-27-import-staging-plan.md
--
-- Numbering: 000036, not the next number on main (000032). Production is already
-- at version 34 (feature/audio-track-content-type's 000032-000034, applied ahead
-- of its merge; that branch also holds 000035), so a lower number would be
-- skipped by `migrate up`. Re-check before merging.
--
-- FKs: the creator FK to users blocks (RESTRICT, reassigned on user delete).
-- Sources and items are children of their job (CASCADE). content_id is an
-- optional pointer to what an item became (SET NULL).
--
-- Idempotent: safe on a fresh DB or one already patched out of band.

CREATE TABLE IF NOT EXISTS public.import_jobs (
    id serial NOT NULL,
    user_id integer NOT NULL,
    name varchar(120) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT import_jobs_pk PRIMARY KEY (id),
    CONSTRAINT import_jobs_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.import_job_sources (
    id serial NOT NULL,
    job_id integer NOT NULL,
    source_type text NOT NULL,
    -- What the admin entered: a channel id/handle, or a TMDB person id.
    source_ref varchar(200) NOT NULL,
    -- Resolved display name and link (channel title, person name); NULL until resolved.
    title varchar(300) NULL,
    url varchar(500) NULL,
    -- Role filter for TMDB people: 'director' or 'cast'. NULL for channels.
    role text NULL,
    destination_type varchar NOT NULL,
    status text NOT NULL DEFAULT 'listing',
    status_detail text NULL,
    item_count integer NOT NULL DEFAULT 0,
    fetched_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT import_job_sources_pk PRIMARY KEY (id),
    CONSTRAINT import_job_sources_job_fk FOREIGN KEY (job_id) REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    CONSTRAINT import_job_sources_type_check CHECK (source_type IN ('youtube_channel', 'tmdb_person')),
    CONSTRAINT import_job_sources_status_check CHECK (status IN ('listing', 'ready', 'failed')),
    CONSTRAINT import_job_sources_role_check CHECK (role IS NULL OR role IN ('director', 'cast')),
    CONSTRAINT import_job_sources_destination_check CHECK (destination_type IN ('youtube_video', 'movie'))
);

CREATE TABLE IF NOT EXISTS public.import_job_items (
    id serial NOT NULL,
    job_id integer NOT NULL,
    source_id integer NOT NULL,
    -- YouTube video id or TMDB movie id, as text.
    external_id varchar(64) NOT NULL,
    destination_type varchar NOT NULL,
    -- Exactly the URL the content row would store (content.url), so "in library" is a join.
    canonical_url varchar NOT NULL,
    kind text NOT NULL,
    title varchar NOT NULL,
    -- First meaningful description line, boilerplate removed (computed at staging).
    summary text NULL,
    published_at timestamptz NULL,
    duration_seconds integer NULL,
    view_count bigint NULL,
    like_count bigint NULL,
    comment_count bigint NULL,
    -- Normalised 0-10 score, how many ratings it rests on, and whose it is (e.g. 'TMDB').
    rating numeric(4, 2) NULL,
    rating_count integer NULL,
    rating_source varchar(40) NULL,
    chapter_count integer NOT NULL DEFAULT 0,
    has_captions boolean NULL,
    thumbnail_url varchar(500) NULL,
    -- Position in the source listing (0 = first returned, newest for channels).
    position integer NOT NULL DEFAULT 0,
    -- Detail-panel data only (description, tags, chapters, people, links): never sent in list rows.
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    stats_fetched_at timestamptz NOT NULL DEFAULT NOW(),
    import_status text NULL,
    import_error text NULL,
    content_id integer NULL,
    imported_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT import_job_items_pk PRIMARY KEY (id),
    CONSTRAINT import_job_items_source_external_unique UNIQUE (source_id, external_id),
    CONSTRAINT import_job_items_job_fk FOREIGN KEY (job_id) REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    CONSTRAINT import_job_items_source_fk FOREIGN KEY (source_id) REFERENCES public.import_job_sources(id) ON DELETE CASCADE,
    CONSTRAINT import_job_items_content_fk FOREIGN KEY (content_id) REFERENCES public.content(id) ON DELETE SET NULL,
    CONSTRAINT import_job_items_kind_check CHECK (kind IN ('video', 'short', 'live', 'movie')),
    CONSTRAINT import_job_items_destination_check CHECK (destination_type IN ('youtube_video', 'movie')),
    CONSTRAINT import_job_items_status_check CHECK (import_status IS NULL OR import_status IN ('queued', 'imported', 'skipped', 'failed')),
    CONSTRAINT import_job_items_rating_check CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10))
);

-- (job_id, position) serves the sheet's one list query; source_id and content_id are FK indexes.
CREATE INDEX IF NOT EXISTS import_job_items_job_position_idx ON public.import_job_items (job_id, position);
CREATE INDEX IF NOT EXISTS import_job_items_source_id_idx ON public.import_job_items (source_id);
CREATE INDEX IF NOT EXISTS import_job_items_content_id_idx ON public.import_job_items (content_id);
CREATE INDEX IF NOT EXISTS import_job_sources_job_id_idx ON public.import_job_sources (job_id);
CREATE INDEX IF NOT EXISTS import_jobs_user_id_idx ON public.import_jobs (user_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.import_jobs;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.import_job_sources;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.import_job_sources
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.import_job_items;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.import_job_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

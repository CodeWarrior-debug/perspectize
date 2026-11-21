-- User saved items: one table for a user's saved formulas, themes, views and settings.
-- Spec: docs/superpowers/specs/2026-11-20-custom-columns-and-saved-items-design.md (Schema).
--
-- PROVISIONAL NUMBER: 000039 is claimed by other open PRs as well. Rename to the next
-- free number on main as the last step before merging (golang-migrate will not run with
-- two files sharing a version).
--
-- Every FK is ON DELETE RESTRICT: nothing cascades and nothing is nulled. The service
-- clears or reassigns references before it deletes a parent. A copy or link row points at
-- the row it came from through (source_id, type), so a copy can never cross types.
--
-- payload is nullable JSONB with no default: NULL means unset (always so for link rows,
-- which read the source's payload).
--
-- Idempotent: safe on a fresh DB or one already patched out of band. All constraints are
-- created inside CREATE TABLE IF NOT EXISTS, so a re-run on an existing table is a no-op.

CREATE TABLE IF NOT EXISTS public.user_saved_items (
    id serial NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    name varchar(100) NOT NULL,
    payload jsonb NULL,
    payload_version integer NOT NULL DEFAULT 1,
    privacy text NOT NULL DEFAULT 'private',
    origin text NOT NULL DEFAULT 'own',
    source_id integer NULL,
    deleted_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT user_saved_items_pk PRIMARY KEY (id),
    -- Target of the composite source FK below.
    CONSTRAINT user_saved_items_id_type_unique UNIQUE (id, type),
    CONSTRAINT user_saved_items_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
    CONSTRAINT user_saved_items_source_fk FOREIGN KEY (source_id, type) REFERENCES public.user_saved_items(id, type) ON DELETE RESTRICT,
    CONSTRAINT user_saved_items_type_check CHECK (type IN ('formula', 'theme', 'view', 'setting')),
    CONSTRAINT user_saved_items_privacy_check CHECK (privacy IN ('public', 'private')),
    CONSTRAINT user_saved_items_origin_check CHECK (origin IN ('own', 'copy', 'link')),
    CONSTRAINT user_saved_items_setting_private_own_check CHECK (type <> 'setting' OR (privacy = 'private' AND origin = 'own')),
    CONSTRAINT user_saved_items_link_no_payload_check CHECK (origin <> 'link' OR payload IS NULL),
    CONSTRAINT user_saved_items_own_no_source_check CHECK (origin <> 'own' OR source_id IS NULL),
    CONSTRAINT user_saved_items_copy_link_source_check CHECK (origin = 'own' OR source_id IS NOT NULL)
);

-- A live (not soft-deleted) name is unique per owner and type.
CREATE UNIQUE INDEX IF NOT EXISTS user_saved_items_user_type_name_unique
    ON public.user_saved_items (user_id, type, name)
    WHERE deleted_at IS NULL;

-- FK index: RESTRICT checks and "who copied or linked this" scan source_id.
CREATE INDEX IF NOT EXISTS user_saved_items_source_id_idx
    ON public.user_saved_items (source_id);

-- The owner's list of live items of one type.
CREATE INDEX IF NOT EXISTS user_saved_items_user_type_idx
    ON public.user_saved_items (user_id, type)
    WHERE deleted_at IS NULL;

-- The shared list: live public items of one type.
CREATE INDEX IF NOT EXISTS user_saved_items_type_public_idx
    ON public.user_saved_items (type, privacy)
    WHERE deleted_at IS NULL AND privacy = 'public';

-- updated_at trigger (CREATE TRIGGER has no IF NOT EXISTS, so drop first).
DROP TRIGGER IF EXISTS set_updated_at ON public.user_saved_items;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.user_saved_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

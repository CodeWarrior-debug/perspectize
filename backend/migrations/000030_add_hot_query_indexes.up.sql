-- Indexes for the hottest read paths, and removal of three indexes that
-- exactly duplicate a unique constraint's own index (pure write cost).
--
-- Numbering: 000028 (content privacy) and 000029 (youtube music isrc) are
-- claimed by in-flight branches, so this takes 000030.
--
-- Plain CREATE INDEX (not CONCURRENTLY): golang-migrate sends the file as one
-- multi-statement query, which runs in an implicit transaction where
-- CONCURRENTLY is not allowed. These tables are small enough that the brief
-- write lock is not a concern; revisit if that changes.

-- Compare page / details-modal aggregates / owner-scoped deletes:
-- WHERE content_id = ? / content_id IN (...)
CREATE INDEX IF NOT EXISTS idx_perspectives_content_id
    ON perspectives (content_id);

-- Home page "my perspectives" list and onboarding counts:
-- WHERE user_id = ? ORDER BY created_at DESC, id DESC (keyset pagination)
CREATE INDEX IF NOT EXISTS idx_perspectives_user_created
    ON perspectives (user_id, created_at DESC, id DESC);

-- Home page content grid default sort: ORDER BY updated_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_content_updated_at_id
    ON content (updated_at DESC, id DESC);

-- Duplicates of UNIQUE-constraint indexes on the same columns:
--   users_clerk_user_id_key          (clerk_user_id)
--   categories_wikidata_qid_key      (wikidata_qid)
--   messages_thread_id_seq_key       (thread_id, seq) — a btree serves
--                                    ORDER BY seq DESC by scanning backward
DROP INDEX IF EXISTS idx_users_clerk_user_id;
DROP INDEX IF EXISTS idx_categories_wikidata_qid;
DROP INDEX IF EXISTS idx_messages_thread_seq_desc;

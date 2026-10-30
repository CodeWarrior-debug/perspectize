-- Restore the duplicate indexes exactly as migrations 000014/000015/000020
-- created them, and drop the hot-path indexes.
CREATE INDEX IF NOT EXISTS idx_messages_thread_seq_desc ON messages (thread_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_categories_wikidata_qid ON categories (wikidata_qid);
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users (clerk_user_id);

DROP INDEX IF EXISTS idx_content_updated_at_id;
DROP INDEX IF EXISTS idx_perspectives_user_created;
DROP INDEX IF EXISTS idx_perspectives_content_id;

-- At most one public and one private perspective per user per content.
--
-- PRECONDITION: the production database was de-duplicated by hand on
-- 2026-11-17 (perspective ids 13, 14, 30 deleted), so this index builds
-- cleanly there. Any OTHER environment must be checked first, and any rows
-- returned fixed by hand, before applying (the CREATE fails otherwise):
--
--   SELECT user_id, content_id, privacy, count(*)
--   FROM perspectives
--   WHERE content_id IS NOT NULL
--   GROUP BY 1, 2, 3
--   HAVING count(*) > 1;
--
-- This migration deliberately does NOT delete or dedupe anything.
--
-- Plain CREATE UNIQUE INDEX (not CONCURRENTLY): golang-migrate sends the file
-- as one multi-statement batch (implicit transaction), where CONCURRENTLY is
-- not allowed. The table is small, so the brief lock is acceptable.
-- Partial (content_id IS NOT NULL) because NULLs never compare equal anyway
-- and perspectives without content are not covered by this rule.

CREATE UNIQUE INDEX IF NOT EXISTS uq_perspectives_user_content_privacy
    ON public.perspectives (user_id, content_id, privacy)
    WHERE content_id IS NOT NULL;

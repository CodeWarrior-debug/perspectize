-- Records which import (import_jobs) created a content row, so a row can say
-- where it came from. Nullable: hand-added content has no import.
--
-- ON DELETE SET NULL: removing an import never removes the content it created.
-- No index: nothing filters content by import yet; add one when a query does.
--
-- Numbering: 000033 is provisional (open PRs may claim it too). Rename to the
-- next free number on main before merging (backend/CLAUDE.md -> Migrations).
--
-- Idempotent: safe on a fresh DB or one already patched out of band. Apply by
-- hand per environment, after 000032 (import_jobs must exist).

ALTER TABLE content ADD COLUMN IF NOT EXISTS import_job_id integer NULL;

ALTER TABLE content DROP CONSTRAINT IF EXISTS content_import_job_fk;
ALTER TABLE content ADD CONSTRAINT content_import_job_fk
    FOREIGN KEY (import_job_id) REFERENCES public.import_jobs(id) ON DELETE SET NULL;

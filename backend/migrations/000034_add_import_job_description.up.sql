-- The description of an import request: what the requester asked for and why.
-- Sanitized HTML (the same policy as perspective reviews), at most 20,000
-- characters, written by the requester only (not a comment thread).
--
-- Nullable: imports created before this column, and requests made with only
-- sources, have none. No CHECK: the service enforces the length and sanitizes.
--
-- Numbering: 000034 is provisional (open PRs may claim it too). Rename to the
-- next free number on main before merging (backend/CLAUDE.md -> Migrations).
--
-- Idempotent: safe on a fresh DB or one already patched out of band. Apply by
-- hand per environment, after 000032 (import_jobs must exist).

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS description text NULL;

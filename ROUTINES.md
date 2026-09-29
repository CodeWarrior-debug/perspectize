# Routines

Tracks runs of scheduled maintenance routines for this repo. Task lists for each routine live in skills (not here); this file only records date, completion, the measured bundle-size and LOC snapshots, and a short comment — see `.claude/skills/monthly-maintenance/SKILL.md` for the monthly routine's task list.

## Monthly Maintenance

Triggered automatically (via a SessionStart hook) on the first session after the 1st of each month, but only once at least 10 merges have landed on `main` since the last recorded run below.

| Date (Month-Year) | Completed (Y/N) | Bundle size / speed | Files / LOC / est. tokens (total) | Comments |
|---|---|---|---|---|
| 2026-09 | Y | — | — | Deleted 3 stale local merged branches (2 others skipped — checked out in active worktrees). No open dependabot/security PRs to merge (2 gradle bumps already landed). Ran `graphify update` and refreshed `.planning/codebase/` via gsd:map-codebase. Flagged: 4 open high-severity Dependabot alerts for `fast-uri` with no PR yet — needs manual follow-up. |

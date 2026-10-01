# Routines

Tracks runs of scheduled maintenance routines for this repo. Task lists for each routine live in skills (not here); this file only records date, completion, the measured bundle-size and LOC snapshots, and a short comment — see `.claude/skills/monthly-maintenance/SKILL.md` for the monthly routine's task list.

## Monthly Maintenance

Triggered automatically (via a SessionStart hook) on the first session after the 1st of each month, but only once at least 10 merges have landed on `main` since the last recorded run below.

| Date (Month-Year) | Completed (Y/N) | Bundle size / speed | Files / LOC / est. tokens (total) | Routine cost (active time / output tokens) | Comments |
|---|---|---|---|---|---|
| 2026-09 | Y | — | — | — | Deleted 3 stale local merged branches (2 others skipped — checked out in active worktrees). No open dependabot/security PRs to merge (2 gradle bumps already landed). Ran `graphify update` and refreshed `.planning/codebase/` via gsd:map-codebase. Flagged: 4 open high-severity Dependabot alerts for `fast-uri` with no PR yet — needs manual follow-up. |
| 2026-10 | N | Cloud run: build 4,428 KB; client JS 2.39 MB raw / 707 KB gz, CSS 110 KB raw / 19 KB gz (largest chunk 988 KB). Lighthouse (cloud, median of 3): `/` and `/discover` perf 83, FCP ~3.2 s, LCP ~3.65 s, TBT 0, CLS 0 | 1,495 files / 276,904 LOC / ~2.78M tokens | ~8 min active / 8.5K output tokens (cloud portion) | Cloud portion only. Applied frontend minor/patch bumps (kit, tiptap, svelte-query, lucide, jest-dom, jscpd) and raised pnpm overrides (fast-uri, devalue, brace-expansion, +qs, +tmp): `pnpm audit` 16 → 4 findings (extract-zip has no patch; uuid via Capacitor CLI). Backend direct deps all current. No open dependabot/security PRs. **Skipped, do locally:** delete 7 merged remote branches (cloud proxy 403s on `git push --delete`), `graphify update .` (not installed in cloud), `gsd:map-codebase`, k6 backend latency, video-capture demo compaction + `~/Downloads/screenshots` pruning. |

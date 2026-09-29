---
name: monthly-maintenance
description: Run the monthly repo maintenance routine (merged-branch cleanup, dependabot/security PR merges, graphify update, gsd map-codebase refresh, bundle size + lines-of-code measurement, video-capture demo tool compaction). Use when prompted by the SessionStart monthly-routine check, or when the user asks to "run the monthly routine" / "run monthly maintenance".
---

# Monthly Maintenance Routine

This routine is normally triggered by a SessionStart hook (`.claude/hooks/monthly-routine-check.sh`) once at least 10 merges have landed on `main` since the last recorded run. It can also be run manually by invoking this skill.

The run log lives in [ROUTINES.md](../../../ROUTINES.md) at the repo root — record every run there (append a row), even a partial or skipped one. Do not put task details in ROUTINES.md; it only tracks date/completed/comments.

## Steps

1. **Confirm scope with the user** before making changes — this routine touches branches and merges PRs. A quick one-line heads-up is enough ("Running monthly maintenance: cleaning merged branches, merging dependabot/security PRs, updating graphify, re-running gsd map-codebase — proceeding unless you'd like to skip any of these").

2. **Delete merged branches (local + remote).**
   - `git fetch origin --prune`
   - List branches already merged into `origin/main`: `git branch -r --merged origin/main` (exclude `origin/main` itself and any branch someone is actively working on).
   - For each merged remote branch, delete it: `git push origin --delete <branch>`.
   - Delete the corresponding local branches: `git branch -d <branch>` (use local `git branch --merged main` to find them).
   - Skip any branch you're not confident is safe to delete (ask the user rather than guessing).

3. **Merge dependabot / security PRs.**
   - `gh pr list --search "author:app/dependabot"` and check for any other security-labeled PRs (e.g. `gh pr list --label security`).
   - For each, confirm CI is green (`gh pr checks <number>`), then merge per the repo's standard merge preferences: `gh pr merge <number> --squash --delete-branch --admin`.
   - Do not merge a PR with failing checks or merge conflicts — flag it for the user instead.

4. **Update graphify.**
   - `graphify update .` (AST-only refresh, no API cost) to keep the knowledge graph current.

5. **Re-run `gsd:map-codebase`.**
   - Invoke the `gsd:map-codebase` command/skill to refresh `.planning/codebase/` docs.

6. **Check dependency freshness.**
   - Frontend: `npx npm-check-updates` in `frontend/`, refresh [FRONTEND_DEPENDENCY_ANALYSIS.md](FRONTEND_DEPENDENCY_ANALYSIS.md) with current findings.
   - Backend: `go list -m -u -versions` against the direct (non-indirect) requires in `backend/go.mod`, refresh [BACKEND_DEPENDENCY_ANALYSIS.md](BACKEND_DEPENDENCY_ANALYSIS.md).
   - Patch/minor bumps with no known breaking changes can be applied directly (verify with `go build`/`go test` or `pnpm run test:run` per `CLAUDE.md`'s self-verification checklist). Majors — especially interdependent ones (e.g. Vite + its Svelte plugin + Vitest) — get flagged in the doc for a follow-up PR rather than bundled into this routine's commit.

7. **Measure app bundle size and speed.**
   - `pnpm run build` in `frontend/` (static adapter → output in `frontend/build/`).
   - Record total size of `frontend/build/` (`du -sk frontend/build`) and of the client JS/CSS in `frontend/build/_app/immutable/` (raw and gzipped: e.g. `find frontend/build/_app/immutable -name '*.js' -exec cat {} + | wc -c` and the same piped through `gzip -c | wc -c`; repeat for `*.css`).
   - List the 5 largest chunks (`find frontend/build/_app/immutable -type f -exec du -k {} + | sort -rn | head -5`) and name what's in them (AG Grid, TanStack, Clerk, etc.) so growth is attributable.
   - Compare against the previous month's row in [ROUTINES.md](../../../ROUTINES.md) (Bundle column); flag any >10% growth in total or gzipped JS for the user.
   - Optional backend: size of the compiled server binary (`go build -o /tmp/server ./cmd/server` in `backend/`, then `ls -l`), recorded but not compared unless it jumps notably.
   - **Speed (Lighthouse):** with the build in place, run `pnpm run perf:lighthouse` in `frontend/` (3 runs per route, config in `lighthouserc.cjs`). Report the median performance score, FCP, LCP, TBT, and CLS for `/` and `/discover`, pulled from `frontend/perf/lighthouse/results/*-report.json`. Flag a performance score drop of 5+ points or LCP growth of 15%+ against last month. `/messages` is auth-gated, so it only measures the logged-out view. In a cloud/root container Chrome refuses to start without `--no-sandbox`: run `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm exec lhci autorun --collect.settings.chromeFlags="--no-sandbox --headless=new" --collect.url=http://localhost:4173/ --collect.url=http://localhost:4173/discover` instead. Numbers from a cloud container are only comparable to other cloud-container runs.
   - Backend latency (k6, `backend/perf/k6/`) needs a running server plus database, so it is local-only; note it as skipped in a cloud run.

8. **Count files, lines of code and tokens.**
   - Run `python3 .claude/skills/monthly-maintenance/codebase-metrics.py --md` (drop `--md` for plain text). It reports files, lines, bytes and estimated tokens (bytes/4) for the repo total, `backend/`, `frontend/`, `.claude/` and every other top-level folder, using `git ls-files` and excluding lockfiles, generated code, binaries and bulk data (`*.tsv`). Add folders to `FOLDERS` in the script when they become worth tracking.
   - Note that `.claude/` includes the vendored GSD subset, so its size is mostly not hand-written.
   - Record total files / LOC / tokens in ROUTINES.md and paste the full table into the routine's PR body, with notable deltas versus last month.

9. **Compact the video-capture demo tools.**
   - This tool lives outside the repo at `~/.claude/tools/video-capture/` (global, not git-tracked) — see its `README.md` for the recorder-etiquette lifecycle (reuse → copy-and-adapt into `demos/<name>/` → promote).
   - List `demos/*` and skim each directory. For each one, check whether its one-off scenario has proven reusable (recorded more than once, or the PR/feature it was built for has shipped and the flow is generic): if so, **promote** it — merge the scenario branch into the shared `record-clip.mjs` (following its existing `if (SCENARIO === '...')` pattern) and delete the demo copy.
   - Flag (don't silently delete) any demo directory with multiple near-duplicate scripts recording the same flow (e.g. a `.snapshot.mjs` variant alongside the original) — ask the user which to keep before consolidating.
   - Delete demo directories/scripts that were genuinely throwaway (one-off clip for a since-merged PR, never reused) — but never delete a shared file (`record-clip.mjs`, `checks/*`) without the user's explicit go-ahead.
   - Keep the "Recorders index" table in `README.md` in sync with whatever remains after promotion/deletion.
   - Prune stale clips in `~/Downloads/screenshots/sv-*.mp4|png` — cross-check against currently open PRs (`gh pr list`) and delete clips for PRs that have since merged or closed.

10. **Record the run in ROUTINES.md.**
   - Append a row: `| <Month-Year> | Y | <bundle size + speed> | <LOC: total / backend / frontend / .claude> | <one-line summary — branches deleted, PRs merged, anything skipped> |`
   - If the routine was only partially completed (e.g. user deferred a step), mark `Completed` as `N` and explain why in Comments — a future session can pick it up, and the 10-merges gate won't re-trigger prematurely since the row already exists for that month.

## Notes

- No chained bash commands (`&&`) — run each command as a separate step.
- This routine is additive/cleanup only — it should never force-push, rewrite history, or delete a branch that isn't confirmed merged.

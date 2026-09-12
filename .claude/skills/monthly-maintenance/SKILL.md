---
name: monthly-maintenance
description: Run the monthly repo maintenance routine (merged-branch cleanup, dependabot/security PR merges, graphify update, gsd map-codebase refresh). Use when prompted by the SessionStart monthly-routine check, or when the user asks to "run the monthly routine" / "run monthly maintenance".
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

7. **Record the run in ROUTINES.md.**
   - Append a row: `| <Month-Year> | Y | <one-line summary — branches deleted, PRs merged, anything skipped> |`
   - If the routine was only partially completed (e.g. user deferred a step), mark `Completed` as `N` and explain why in Comments — a future session can pick it up, and the 10-merges gate won't re-trigger prematurely since the row already exists for that month.

## Notes

- No chained bash commands (`&&`) — run each command as a separate step.
- This routine is additive/cleanup only — it should never force-push, rewrite history, or delete a branch that isn't confirmed merged.

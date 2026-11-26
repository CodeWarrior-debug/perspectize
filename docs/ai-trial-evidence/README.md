# AI-coding workflow trial: evidence

Raw material behind `docs/ai-trial-summary.md`, `docs/ai-trial-backend.md` and `docs/ai-trial-frontend.md`. These files were produced in one cloud session and copied here so they outlive it. Nothing here is product code, and nothing in it is run by CI.

## What is here

| Path | What |
|---|---|
| `phase1/results.md`, `phase1/report.md`, `phase1/tasks.md` | Per-attempt notes, the report for both tracks, and the ticket texts (A and B) for the nine tasks |
| `phase1/prompts/` | The exact prompt each Phase 1 agent received |
| `phase1/attempts/` | Each Phase 1 attempt's diff, `T<n>-A.patch` and `T<n>-B.patch` |
| `phase1/scripts/` | The harness: `common.sh` (paths and helpers), `prep.sh` (worktree at the task's parent commit), `gen-prompt.sh`, `hidden.sh` (overlay the real commit's tests and run them), `snapshot.sh`, `reset.sh`, `commit-facts.sh` |
| `phase4/results.md` | Per-task notes for the nine reruns, the two shortcut tasks and their controls |
| `phase4/prompts/` | The exact prompts for the reruns (`<slot>-T<n>-A.md`), the shortcut tasks (`*-S-*-A.md`) and their controls (`*-S-*-ctl.md`) |
| `phase4/attempts/` | Each Phase 4 attempt's diff: `T<n>-A`, `S-backend-A`, `S-frontend-A` and the control diffs |
| `phase4/scripts/` | The Phase 4 harness. `prep.sh` adds one scratch commit with the guardrails to the task's parent; `prep-shortcut.sh` does the same for the shortcut base |
| `phase4/fe-old-deps/package.json` | The dependency set used for the frontend tasks whose parents predate SvelteKit 3 (T5 to T8) |
| `guardrails/backend-phase2-3.patch`, `guardrails/frontend-phase2-3.patch` | The Phase 2 and 3 code the agents ran with: check scripts, hook, nested `CLAUDE.md`, architecture rules and baselines. `git apply` them to `92c03c5` (both were checked to apply). The frontend patch leaves out `pnpm-lock.yaml`, so reinstall after applying its `package.json` change. They are not proposed for `main`, which has its own enforcement from #861 and #862 |

## How a run worked

1. A numbered worktree slot is checked out at the **parent** of a past commit (Phase 4 adds one scratch commit carrying the Phase 2 and 3 files, with a baseline regenerated for that older code).
2. A fresh general-purpose subagent gets the ticket and a fixed rule block (no git history, no commit or branch changes, no database, no `&&`). The prompt is in `prompts/`.
3. The attempt is saved as a patch. Scoring then overlays the **real commit's test files** and runs them ("hidden tests"), runs the agent's own tests, and judges the diff.
4. Name mismatches, exact-text mismatches and behaviour divergences are told apart by temporary renames or shims, always restored.

## What is not here, and caveats

- **Agent transcripts are not included.** Counts of `check.sh` runs and tool calls come from grepping them and are approximate; the numbers are in the `results.md` files.
- **Agent-written test files and `.orig` backups** used during scoring are not copied; the agents' own tests are inside the patches.
- **Lockfiles, install logs and timing logs are not copied.** `phase4/fe-old-deps/` has the `package.json` only.
- **Scripts hard-code the session's paths** (`/home/user/perspectize/.claude/worktrees/<n>` and the session scratchpad). Read them as a description of the method, and change the paths to reuse them.
- The patches apply to the parent commits named in the logs, not to `main`.
- **One run per cell.** Nothing here is a repeated measurement.

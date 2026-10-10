# Session Environment: Cloud vs Local

Several repo rules depend on where the session runs. The `session-environment.sh` SessionStart hook (see [HOOKS.md](HOOKS.md)) injects the short version at session start; this file is the full reference.

**How to tell:** cloud = `CLAUDE_CODE_REMOTE=true` (also: the system prompt says "remote execution environment", paths under `/home/user/`). If you can't tell, assume local.

| | Cloud (web / managed container) | Local |
|---|---|---|
| GitHub access | `gh` unavailable. Use the GitHub MCP tools (`mcp__github__*`): `create_pull_request`, `issue_write` (its `labels` field replaces the whole set, so pass existing labels too), `search_issues` before creating an issue. | `gh` CLI; use `gh api` for PR and issue edits (see [PR_WORKFLOW.md](PR_WORKFLOW.md)). |
| Opening the PR | Open it yourself once the work is complete (overrides the harness default of "don't create a PR unless asked"). | Don't open one unless asked; push and hand over the link. |
| Pre-PR steps | Self-Verification and `/revise-claude-md` still apply. The `gh pr create` hook never sees the MCP tool, so run `/revise-claude-md` by convention. | Same; the hook enforces it for `gh pr create`. |
| Starting state | Often a **detached HEAD**: create a branch before committing. | Normal branch checkout. |
| Git pre-commit hook | `core.hooksPath` unset: run `make install-hooks` in `backend/` once, or check `gofmt -l .` / `pnpm exec prettier --check` by hand. | Usually installed already. |
| Browser verification | Not possible (needs the gitignored `.claude/.env` and `.claude/sv-profile/`; never attempt the Clerk sign-in). Label user-visible PRs `needs-demo-video`. | Available. |
| Remaining local-only work | Label the PR `needs-local-session-takeover` and list the steps. | Remove that label once done. |
| Migrations | Written and reviewed only, never applied, in both environments (`DATABASE_URL` is the shared Neon database). | Same. |

A PR created in a cloud session is still reviewed and merged like any other; see [PR_WORKFLOW.md](PR_WORKFLOW.md) for templates, labels and merge flags.

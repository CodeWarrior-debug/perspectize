# Hooks

Two independent hook systems. The root [CLAUDE.md](../CLAUDE.md) keeps only what a session must act on (`/revise-claude-md` before PRs, `make install-hooks` in fresh checkouts).

## Claude Code PreToolUse hooks

`.claude/hooks/*.sh`, wired in `.claude/settings.json` (hookify plugin retired).

- **Secret protection:** `deny-env-read.sh` blocks any Bash command that reads a real `.env` file (deny-by-default; `.env.example` / `.env.test` stay readable). Pairs with `permissions.deny` Read rules. Real secret values are entered by humans only — see [SECURITY.md](SECURITY.md).
- **Pre-PR:** `require-session-reflection-before-pr.sh` denies `gh pr create` until the `/revise-claude-md` command (from the `claude-md-management` plugin) has been run. It can't detect completion, so use `gh api` to create the PR after running the command (see [PR_WORKFLOW.md](PR_WORKFLOW.md)). It only pattern-matches a Bash `gh pr create`, so it doesn't block PR creation via the GitHub MCP tool in cloud sessions — run `/revise-claude-md` there anyway, by convention.
  - `/revise-claude-md` is also the Skill entry `claude-md-management:revise-claude-md` once the plugin is loaded. If it won't resolve — Skill says "Unknown skill" and typing it shows nothing — the plugin marketplace cache is stale: run `/reload-plugins` (and `/plugin` to refresh), then retry.
- **Pre-commit tests:** `require-tests.sh` injects a non-blocking reminder on `git commit` to verify test coverage for new/modified frontend `src/` files. Config, styles, docs, and test files are exempt.
- **Pre-commit query budget:** `query-budget-precommit.sh` injects a non-blocking reminder on `git commit` when staged files touch repositories, resolvers/dataloaders, services, `lib/queries/**` or a component that fetches, and no test file is staged alongside. It nudges toward the query-count / cache-contract tests in [QUERY_BUDGET.md](QUERY_BUDGET.md); the tests, not the hook, are the gate. There is deliberately no PR-creation variant: cloud PRs go through the GitHub MCP tool, which a Bash-command hook never sees.
- **Pre-commit prettier:** `prettier-precommit.sh` injects a non-blocking reminder on `git commit` to run `pnpm exec prettier --write` on staged frontend files.
- **Pre-commit gofmt (fallback):** `gofmt-precommit.sh` only fires when `core.hooksPath` isn't set to `.hooks` in the current checkout — see below for the real fix — and then reminds to run `make install-hooks` rather than to gofmt by hand.
- **Matching is anchored on command position** (start of string or after a shell separator), not a raw substring search — a trigger phrase (e.g. `gh pr create`) appearing inside a quoted commit message or PR body elsewhere on the line does not fire the hook.

## Shared git pre-commit hook

`.hooks/pre-commit`, a real `core.hooksPath` hook — not a Claude Code hook. It auto-formats staged `backend/*.go` (gofmt) and `frontend/src/*.{svelte,ts,js}` (prettier) files and re-stages them on every `git commit`, regardless of what tool/human is committing. It also **blocks** (does not auto-fix) new raw hex/rgb colour literals in frontend components — see [frontend/CLAUDE.md](../frontend/CLAUDE.md).

Not active by default — activate once per checkout with `make install-hooks` (from `backend/`, sets `core.hooksPath` to `.hooks`). This is what actually prevents the CI `Build` job's `gofmt -l .` check from failing (as it did on PR #366); the `gofmt-precommit.sh` PreToolUse reminder above is only a fallback for a checkout where this hasn't been activated yet.

**Cloud/CI sessions start with `core.hooksPath` unset** — a fresh container checkout has never run `make install-hooks`, so commits made there get no gofmt/prettier auto-fix at all (the PreToolUse reminders only fire on a matching Bash command, and there's no frontend-side reminder). Either run `make install-hooks` once per session, or manually run `gofmt -l .` (backend) / `pnpm exec prettier --check <files>` (frontend) before every commit and fix flagged files with `--write` before pushing.

#!/usr/bin/env bash
# SessionStart hook: tell Claude whether this is a cloud or local session and
# what that changes (gh vs GitHub MCP, PR autonomy, browser verification, git
# hooks, detached HEAD). Full table: .docs/SESSION_ENVIRONMENT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Cloud signal documented in the root CLAUDE.md ("PR autonomy").
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  CONTEXT="Session environment: CLOUD (CLAUDE_CODE_REMOTE=true). gh is unavailable, so use the GitHub MCP tools (mcp__github__*) for PRs, issues and labels. Open the PR yourself when the work is complete (overrides the harness default). Browser verification and Clerk sign-in are not possible: label user-visible PRs needs-demo-video. Fresh checkouts have no git pre-commit hook: run make install-hooks in backend/ once. Details: .docs/SESSION_ENVIRONMENT.md."
else
  CONTEXT="Session environment: LOCAL. gh is available. Do not open a PR unless asked; push and hand over the link. Browser verification is available if .claude/.env and .claude/sv-profile/ exist. Details: .docs/SESSION_ENVIRONMENT.md."
fi

# Detached HEAD (common at cloud session start): committing here loses work.
if ! git symbolic-ref -q HEAD >/dev/null 2>&1; then
  CONTEXT="$CONTEXT HEAD is DETACHED: create a branch (git checkout -b <type>/<name>) before committing."
fi

# Shared git pre-commit hook (gofmt + prettier) is opt-in per checkout.
if [ "$(git config --get core.hooksPath || true)" != ".hooks" ]; then
  CONTEXT="$CONTEXT core.hooksPath is not .hooks in this checkout: gofmt/prettier will not auto-fix on commit."
fi

# graphify: the CLI and the (untracked) graphify-out/ graph live on the owner's machine.
if ! command -v graphify >/dev/null 2>&1; then
  CONTEXT="$CONTEXT graphify CLI is not installed: skip graphify query/update and use Grep/Glob or an Explore agent for codebase questions."
elif [ ! -f "$REPO_ROOT/graphify-out/graph.json" ]; then
  CONTEXT="$CONTEXT graphify is installed but graphify-out/graph.json does not exist: answer codebase questions with Grep/Glob, not graphify query."
fi

jq -n --arg ctx "$CONTEXT" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'

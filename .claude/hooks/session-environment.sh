#!/usr/bin/env bash
# SessionStart hook: tell Claude whether this is a cloud or local session and
# what that changes (gh vs GitHub MCP, PR autonomy, browser verification, git
# hooks, detached HEAD). Full table: .docs/SESSION_ENVIRONMENT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Cloud signal documented in the root CLAUDE.md ("PR autonomy").
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  CONTEXT="Session environment: CLOUD (CLAUDE_CODE_REMOTE=true). gh is unavailable, so use the GitHub MCP tools (mcp__github__*) for PRs, issues and labels. Open the PR yourself when the work is complete (overrides the harness default). Browser verification and Clerk sign-in are not possible: label user-visible PRs needs-demo-evidence. Fresh checkouts have no git pre-commit hook: run make install-hooks in backend/ once. Details: .docs/SESSION_ENVIRONMENT.md."
else
  CONTEXT="Session environment: LOCAL. gh is available. Open the PR yourself when you push a task branch (overrides the harness default; the owner wants PRs opened, not just a link). Browser verification is available if .claude/.env and .claude/sv-profile/ exist. Details: .docs/SESSION_ENVIRONMENT.md."
fi

# Detached HEAD (common at cloud session start): committing here loses work.
if ! git symbolic-ref -q HEAD >/dev/null 2>&1; then
  CONTEXT="$CONTEXT HEAD is DETACHED: create a branch (git checkout -b <type>/<name>) before committing."
fi

# Shared git pre-commit hook (gofmt + prettier) is opt-in per checkout.
if [ "$(git config --get core.hooksPath || true)" != ".hooks" ]; then
  CONTEXT="$CONTEXT core.hooksPath is not .hooks in this checkout: gofmt/prettier will not auto-fix on commit."
fi

# graphify: the CLI and the (untracked) graph live on the owner's machine. There is
# one graph, in the main checkout, which linked worktrees read too.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
MAIN_ROOT="${COMMON_DIR:+$(dirname "$COMMON_DIR")}"
MAIN_ROOT="${MAIN_ROOT:-$REPO_ROOT}"
GRAPH="$MAIN_ROOT/graphify-out/graph.json"

if ! command -v graphify >/dev/null 2>&1; then
  CONTEXT="$CONTEXT graphify CLI is not installed: skip graphify query/update and use Grep/Glob or an Explore agent for codebase questions."
elif [ ! -f "$GRAPH" ]; then
  CONTEXT="$CONTEXT graphify is installed but the main checkout has no graphify-out/graph.json: answer codebase questions with Grep/Glob, not graphify query."
elif [ "$MAIN_ROOT" != "$REPO_ROOT" ]; then
  CONTEXT="$CONTEXT This is a worktree: query the shared graph with --graph $GRAPH, and never run graphify update/extract here. It does not include this branch's changes."
fi

jq -n --arg ctx "$CONTEXT" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'

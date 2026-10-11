#!/bin/bash
# Real-repo case: extracts this repo at a pinned commit so the ground truth in
# graders/ stays valid as the live CLAUDE.md files change. Bump PIN (and
# re-verify every grader) to refresh it.
set -euo pipefail

PIN=276bf24
CASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$CASE_DIR" rev-parse --show-toplevel)"

git -C "$REPO" archive "$PIN" | tar -x

# Strip Claude Code config that would load into the run (project hooks,
# settings, skills, agents, commands) — only the plugin under test should.
# Keep .claude/CLAUDE.md and .claude/docs: they are audit targets/references.
rm -rf .claude/settings.json .claude/settings.local.json .claude/hooks \
  .claude/skills .claude/agents .claude/commands .claude/get-shit-done \
  .claude/scripts .mcp.json evals

git init -q
git config user.name "Eval"
git config user.email "eval@example.com"
git add -A
git commit -qm "snapshot $PIN"

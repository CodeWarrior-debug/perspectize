#!/bin/bash
# PreToolUse hook (Bash) — non-blocking reminder to run gofmt before
# committing backend Go files. Mirrors prettier-precommit.sh for the
# frontend.

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Anchor on command position so this doesn't fire on `git commit` merely
# mentioned inside a commit message or other quoted text on the line.
if ! echo "$command" | grep -qE '(^|[;&|]|`|\$\()\s*git\s+commit\b'; then
  exit 0
fi

reason='Before this commit, check if any staged files are under backend/ and end in .go. If so, run:
cd backend && gofmt -l $(git diff --cached --name-only --diff-filter=ACMR -- "backend/*.go" | sed "s|^backend/||")
and gofmt -w any files it lists, then re-stage them with `git add` before committing.'

jq -n --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: $reason
  }
}'
exit 0

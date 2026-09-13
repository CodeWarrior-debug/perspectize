#!/bin/bash
# PreToolUse hook (Bash) — non-blocking reminder on `git commit` for a
# session where the repo's shared git pre-commit hook (.hooks/pre-commit,
# auto-formats staged Go/Svelte/TS via gofmt/prettier) isn't yet active.
# If it's active, that hook already handles formatting — this only fires
# as a fallback, so the fix isn't a one-off manual gofmt but activating
# the real hook for good.

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Anchor on command position so this doesn't fire on `git commit` merely
# mentioned inside a commit message or other quoted text on the line.
if ! echo "$command" | grep -qE '(^|[;&|]|`|\$\()\s*git\s+commit\b'; then
  exit 0
fi

if [ "$(git config --get core.hooksPath 2>/dev/null)" = ".hooks" ]; then
  # Real hook is active; it auto-formats and re-stages on every commit.
  exit 0
fi

reason='The shared git pre-commit hook (.hooks/pre-commit) is not active in this
checkout, so staged backend/*.go and frontend/src/*.{svelte,ts,js} files will
not be auto-formatted on commit. Run `make install-hooks` (from backend/) once
to activate it for the rest of this session/checkout — cheaper and more
reliable than gofmt-checking staged files by hand each time.'

jq -n --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: $reason
  }
}'
exit 0

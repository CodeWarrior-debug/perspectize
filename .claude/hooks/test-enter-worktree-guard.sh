#!/bin/bash
# Test for enter-worktree-guard.sh. Pipes PreToolUse JSON (tool_input of EnterWorktree)
# into the hook and checks it allows (no output) or denies. Run from any checkout:
#   bash .claude/hooks/test-enter-worktree-guard.sh
# Read-only: it never creates a worktree.

HOOK="$(cd "$(dirname "$0")" && pwd)/enter-worktree-guard.sh"
MAIN=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
[ -n "$MAIN" ] || { echo "not in a git repo"; exit 2; }

fail=0
run() { # <tool_input json>
  jq -n --arg cwd "$MAIN" --argjson ti "$1" '{cwd:$cwd, tool_input:$ti}' | bash "$HOOK"
}
expect_allow() {
  out=$(run "$1")
  if [ -z "$out" ]; then echo "PASS allow: $1"; else echo "FAIL allow: $1 -> $out"; fail=1; fi
}
expect_deny() {
  out=$(run "$1")
  if echo "$out" | grep -q '"permissionDecision": "deny"'; then echo "PASS deny:  $1"; else echo "FAIL deny:  $1 -> ${out:-<no output>}"; fail=1; fi
}

# Allowed: switching into a worktree under the main checkout's .claude/worktrees/
expect_allow "{\"path\":\"$MAIN/.claude/worktrees/5\"}"
expect_allow "{\"path\":\"$MAIN/.claude/worktrees/some-overflow\"}"
expect_allow '{"path":".claude/worktrees/3"}'

# Denied: new named / random worktrees
expect_deny '{"name":"comment-editor-scroll"}'
expect_deny '{}'
# Denied: paths outside the convention
expect_deny '{"path":"/tmp/wt"}'
expect_deny "{\"path\":\"$MAIN/.claude/worktrees/../../x\"}"
expect_deny "{\"path\":\"$MAIN/.claude/worktrees-evil/x\"}"

[ "$fail" -eq 0 ] && echo "ALL PASS" || echo "FAILURES"
exit $fail

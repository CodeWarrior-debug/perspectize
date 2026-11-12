#!/bin/bash
# Test for worktree-guard.sh. Pipes PreToolUse JSON into the hook and checks it
# allows (no output) or denies (permissionDecision "deny"). Run from any checkout:
#   bash .claude/hooks/test-worktree-guard.sh
# Read-only: it never creates a worktree, it only feeds command strings to the hook.

HOOK="$(cd "$(dirname "$0")" && pwd)/worktree-guard.sh"
MAIN=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
[ -n "$MAIN" ] || { echo "not in a git repo"; exit 2; }
NESTED="$MAIN/.claude/worktrees/2"

fail=0
run() { # <cwd> <command>
  jq -n --arg cwd "$1" --arg cmd "$2" '{cwd:$cwd, tool_input:{command:$cmd}}' | bash "$HOOK"
}
expect_allow() { # <cwd> <command>
  out=$(run "$1" "$2")
  if [ -z "$out" ]; then echo "PASS allow: $2"; else echo "FAIL allow: $2 -> $out"; fail=1; fi
}
expect_deny() { # <cwd> <command>
  out=$(run "$1" "$2")
  if echo "$out" | grep -q '"permissionDecision": "deny"'; then echo "PASS deny:  $2"; else echo "FAIL deny:  $2 -> ${out:-<no output>}"; fail=1; fi
}

# Allowed: absolute or main-relative paths under <main>/.claude/worktrees/
expect_allow "$MAIN" "git worktree add $MAIN/.claude/worktrees/x -b b origin/main"
expect_allow "$MAIN" "git -C $MAIN worktree add $MAIN/.claude/worktrees/x branch"
expect_allow "$MAIN" "git worktree add .claude/worktrees/x branch"
expect_allow "$MAIN" "git worktree add --lock --reason why $MAIN/.claude/worktrees/x branch"

# Denied: anywhere else
expect_deny "$MAIN" "git worktree add /tmp/x branch"
expect_deny "$MAIN" "git worktree add /private/tmp/claude-501/s/scratchpad/wt branch"
expect_deny "$MAIN" "git -C $MAIN worktree add /tmp/x branch"
expect_deny "$MAIN" "git worktree add $MAIN/.claude/worktrees/../../x branch"
expect_deny "$MAIN" "git worktree add $MAIN/.claude/worktrees-evil/x branch"
expect_deny "$MAIN" "cd foo && git worktree add /tmp/x branch"
expect_deny "$MAIN" "git worktree add --lock --reason why /tmp/x branch"
expect_deny "$NESTED" "git worktree add .claude/worktrees/x branch"

# Not a worktree add: must not fire
expect_allow "$MAIN" "git status"
expect_allow "$MAIN" "git worktree list"
expect_allow "$MAIN" "git worktree remove /tmp/x"
expect_allow "$MAIN" "git commit -m \"git worktree add /tmp/x\""

exit $fail

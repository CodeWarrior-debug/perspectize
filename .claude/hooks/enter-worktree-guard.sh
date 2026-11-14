#!/bin/bash
# PreToolUse hook (EnterWorktree) — closes the blind spot worktree-guard.sh documents.
# EnterWorktree with a `name` (or no arguments, which picks a random name) creates a
# brand-new, unnumbered worktree and a `worktree-<name>` branch, bypassing the
# numbered-slot convention in .docs/WORKTREES.md. Denied.
# EnterWorktree with `path` only switches into an existing worktree; allowed when the
# path is under the MAIN checkout's .claude/worktrees/ (numbered slots or a named
# overflow worktree that already exists).
#
# Overflow (all 5 slots busy) is the one case for a new named worktree: create it with
# .claude/scripts/new-worktree.sh <branch> <name>, then enter it by `path`.
# Like the sibling hooks it allows when jq or the main checkout is missing.
# Test: bash .claude/hooks/test-enter-worktree-guard.sh

input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
name=$(echo "$input" | jq -r '.tool_input.name // empty')
path=$(echo "$input" | jq -r '.tool_input.path // empty')
cwd=$(echo "$input" | jq -r '.cwd // empty')
[ -z "$cwd" ] && cwd=$PWD

main_root=$(git -C "$cwd" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')
[ -n "$main_root" ] || exit 0
allowed="$main_root/.claude/worktrees/"

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

if [ -n "$path" ]; then
  case "$path" in /*) abs="$path" ;; *) abs="$cwd/$path" ;; esac
  case "$abs" in
    *"/.."*|*"/../"*) deny "Blocked: EnterWorktree path must not contain '..'. Got: $abs" ;;
  esac
  case "$abs/" in
    "$allowed"*) exit 0 ;;
  esac
  deny "Blocked: EnterWorktree path must be under $allowed (see .docs/WORKTREES.md). Got: $abs"
fi

deny "Blocked: EnterWorktree with a name (or no arguments) makes a new unnumbered worktree. Use a numbered slot per .docs/WORKTREES.md: pick the lowest free one of .claude/worktrees/1..5 (git worktree list; create a missing slot with .claude/scripts/new-worktree.sh <branch> <n>), then EnterWorktree with path. Only when all 5 are busy, create a named overflow worktree with new-worktree.sh and enter it by path. Whoever creates a worktree removes it when done."

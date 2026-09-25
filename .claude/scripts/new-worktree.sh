#!/bin/bash
# new-worktree.sh — create a git worktree under .claude/worktrees/ AND copy the
# gitignored files listed in .worktreeinclude (.env files, local Claude settings).
#
# Why this exists: Claude Code copies .worktreeinclude files only into worktrees it
# creates itself (EnterWorktree, --worktree, isolation: worktree). Those all start a
# NEW branch, so they can't put a worktree on an EXISTING branch (for example a
# long-running integration branch). Plain `git worktree add` can, but it skips the
# copy, leaving a checkout with no DATABASE_URL and no local settings. This script
# does the git step and the copy step together, and always uses an absolute path under
# the main checkout's .claude/worktrees/ (a relative path from inside another
# worktree nests the new one inside it).
#
# Usage:
#   .claude/scripts/new-worktree.sh <branch> [name] [--dry-run]
#
#   <branch>   Existing local branch, existing origin/<branch>, or a new branch name.
#              New branches start from a freshly fetched origin/main.
#   [name]     Directory name under .claude/worktrees/ (default: branch with / -> -).
#   --dry-run  Print what would be created and copied, change nothing.
#
# Secret handling: files are copied by `cp`; their contents are never printed. Only
# relative paths are listed. Existing files in the destination are never overwritten.

set -euo pipefail

DRY_RUN=0
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then DRY_RUN=1; else ARGS+=("$arg"); fi
done

if [ "${#ARGS[@]}" -lt 1 ] || [ "${#ARGS[@]}" -gt 2 ]; then
  echo "usage: new-worktree.sh <branch> [name] [--dry-run]" >&2
  exit 2
fi

BRANCH="${ARGS[0]}"
NAME="${ARGS[1]:-${BRANCH//\//-}}"

# Main checkout root, even when invoked from inside a linked worktree.
COMMON_DIR=$(cd "$(git rev-parse --git-common-dir)" && pwd)
MAIN_ROOT=$(dirname "$COMMON_DIR")
DEST="$MAIN_ROOT/.claude/worktrees/$NAME"
INCLUDE_FILE="$MAIN_ROOT/.worktreeinclude"

if [ -e "$DEST" ]; then
  echo "error: $DEST already exists" >&2
  exit 1
fi

git -C "$MAIN_ROOT" fetch -q origin

if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  MODE="existing local branch"
  ADD_CMD=(git -C "$MAIN_ROOT" worktree add "$DEST" "$BRANCH")
elif git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  MODE="existing remote branch (tracking origin/$BRANCH)"
  ADD_CMD=(git -C "$MAIN_ROOT" worktree add -b "$BRANCH" "$DEST" "origin/$BRANCH")
else
  MODE="new branch from origin/main"
  ADD_CMD=(git -C "$MAIN_ROOT" worktree add --no-track -b "$BRANCH" "$DEST" origin/main)
fi

# Files that are untracked, match a .worktreeinclude pattern, AND are gitignored.
FILES=()
if [ -f "$INCLUDE_FILE" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if git -C "$MAIN_ROOT" check-ignore -q -- "$f"; then FILES+=("$f"); fi
  done < <(git -C "$MAIN_ROOT" ls-files --others --ignored --exclude-from="$INCLUDE_FILE" \
             -- . ':!node_modules' ':!**/node_modules/**' ':!.claude/worktrees' 2>/dev/null)
fi

echo "worktree: $DEST"
echo "branch:   $BRANCH ($MODE)"
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "copy:     nothing matched .worktreeinclude"
else
  echo "copy:"
  printf '  %s\n' "${FILES[@]}"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "(dry run: nothing changed)"
  exit 0
fi

"${ADD_CMD[@]}"

for f in "${FILES[@]:-}"; do
  [ -n "$f" ] || continue
  if [ -e "$DEST/$f" ]; then
    echo "skip (exists): $f"
    continue
  fi
  mkdir -p "$DEST/$(dirname "$f")"
  cp -p "$MAIN_ROOT/$f" "$DEST/$f"
done

echo "done. Remember: pnpm install --dir frontend (node_modules is not copied)."

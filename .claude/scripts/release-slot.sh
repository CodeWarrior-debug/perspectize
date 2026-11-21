#!/usr/bin/env bash
# release-slot.sh <n> — free numbered worktree slot <n> as soon as its task branch is pushed.
#
# PURPOSE: return the slot to its home branch wt/<n> and delete the local task branch, so the
#   slot is claimable and no stale local branch lingers while the PR is open.
# SAFE BY CONSTRUCTION: refuses unless the tracked tree is clean and HEAD equals origin/<branch>
#   (task branches are made with --no-track, so "ahead of upstream" can't be used; this compares
#   against the remote branch directly). Untracked files survive the switch and are listed.
# RE-ATTACH (follow-up fixes, CI, review): in any free slot,
#   git checkout --no-track -b <branch> origin/<branch>
#   then push with `git push origin HEAD:<branch>` (no upstream is set).
# READ-ONLY GUARANTEE: touches only slot <n>'s checkout and its local task branch; never pushes.
set -euo pipefail

n="${1:?usage: release-slot.sh <n>   (slot number 1-5)}"
common="$(git rev-parse --path-format=absolute --git-common-dir)"
slot="$(dirname "$common")/.claude/worktrees/$n"
[ -d "$slot" ] || { echo "no such slot: $slot" >&2; exit 1; }

branch="$(git -C "$slot" branch --show-current)"
home="wt/$n"
if [ "$branch" = "$home" ]; then
  echo "slot $n is already free (on $home)"
  exit 0
fi
[ -n "$branch" ] || { echo "slot $n has a detached HEAD; handle it by hand" >&2; exit 1; }

if [ -n "$(git -C "$slot" status --porcelain --untracked-files=no)" ]; then
  echo "refusing: slot $n has uncommitted changes on $branch" >&2
  exit 1
fi

git -C "$slot" fetch -q origin "$branch" 2>/dev/null || true
remote="$(git -C "$slot" rev-parse -q --verify "refs/remotes/origin/$branch" || true)"
if [ -z "$remote" ]; then
  echo "refusing: $branch is not on origin yet (push it first)" >&2
  exit 1
fi
if [ "$remote" != "$(git -C "$slot" rev-parse HEAD)" ]; then
  echo "refusing: $branch differs from origin/$branch (unpushed or diverged commits)" >&2
  exit 1
fi

untracked="$(git -C "$slot" status --porcelain | grep '^??' || true)"
git -C "$slot" checkout -q "$home"
git -C "$slot" branch -D "$branch" >/dev/null
echo "slot $n freed: on $home, local $branch deleted (origin/$branch at ${remote:0:8})"
echo "re-attach: git checkout --no-track -b $branch origin/$branch"
[ -z "$untracked" ] || printf 'untracked files kept in the slot:\n%s\n' "$untracked"

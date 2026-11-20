#!/bin/bash
# Read-only: prints the end-of-task teardown checklist for the current checkout, with live state
# (servers listening, the verification Chrome, the branch to delete). Never stops, kills or deletes.
# Procedure and rationale: .docs/WORKTREES.md -> Finishing.
#
#   finish-checklist.sh            always print the checklist (used right after a merge)
#   finish-checklist.sh --if-merged  print only when this checkout's task branch already has a
#                                    merged PR (used at session start, for merges done on the web)
#
# Test seams: FINISH_PORTS (space-separated, default the verification ports), FINISH_MERGED_PR
# (skip the gh lookup and use this PR number; empty = none).

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
branch=$(git symbolic-ref --short -q HEAD)
slot=$(basename "$ROOT")
case "$ROOT" in */.claude/worktrees/[1-5]) ;; *) slot="" ;; esac

# A slot resting on its home branch (wt/<n>) or the main checkout has no task to finish.
case "$branch" in ""|main|wt/*) [ "$1" = "--if-merged" ] && exit 0 ;; esac

merged_pr=""
if [ -n "${FINISH_MERGED_PR+x}" ]; then
  merged_pr="$FINISH_MERGED_PR"
elif [ -n "$branch" ] && command -v gh >/dev/null 2>&1; then
  merged_pr=$(gh pr list --head "$branch" --state merged --json number --jq '.[0].number // empty' 2>/dev/null)
fi
[ "$1" = "--if-merged" ] && [ -z "$merged_pr" ] && exit 0

listening=""
for port in ${FINISH_PORTS:-5173 5174 5175 8080 8090 8091 9222}; do
  pid=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
  [ -n "$pid" ] && listening="$listening :$port(pid $pid)"
done

home="wt/<n>"; [ -n "$slot" ] && home="wt/$slot"
echo "Finishing checklist${merged_pr:+ (PR #$merged_pr merged)} for ${branch:-detached HEAD}:"
echo "1. node .claude/agent-registry/agent-registry.mjs verify-release   (stops the servers it started, frees the slot)"
if [ -n "$listening" ]; then
  echo "2. Still listening:${listening}. Quit only what this session started (e.g. the sv-chrome on :9222); another session's or your own 'make start' may be among them."
else
  echo "2. No listeners on the verification ports. Nothing to stop."
fi
echo "3. Return the slot to its home branch, then delete the task branch:"
echo "     git checkout $home ; git merge --ff-only origin/main ; git branch -D ${branch:-<task-branch>}"
echo "4. node .claude/agent-registry/agent-registry.mjs release${slot:+ --path $ROOT}   (only if you are done with this slot)"
echo "5. bash .claude/scripts/worktree-report.sh   (remove only worktrees you created)"

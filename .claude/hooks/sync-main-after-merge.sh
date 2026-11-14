#!/bin/bash
# PostToolUse hook (Bash) — after a PR merge (`gh pr merge`, or `gh api` PUT to
# .../pulls/<n>/merge or .../merge-async), fast-forwards LOCAL main in the main
# checkout to origin/main, so local main never lags behind a merge this session did.
# Procedure and rationale: .docs/PR_WORKFLOW.md → Merge preferences.
#
# Never blocks, never commits, never resets: it only runs `git merge --ff-only`.
# It skips (and says why) when:
#   - the main checkout is not on `main`;
#   - a file the merge changes also has uncommitted edits in that checkout;
#   - local main is not a fast-forward of origin/main (diverged or ahead).
#
# `merge-async` returns before GitHub has finished, so when origin/main has not
# moved yet the hook re-fetches a few times (SYNC_MAIN_TRIES x SYNC_MAIN_WAIT s).
#
# Test seams (used by test-sync-main-after-merge.sh):
#   SYNC_MAIN_CHECKOUT  path of the checkout to sync (default: the main checkout)
#   SYNC_MAIN_DRY_RUN=1 only report that the command matched; touch nothing

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Anchor on command position (start, or after a shell separator) so a merge command
# merely mentioned inside a commit message or PR body does not fire the hook.
MERGE_CMD='(^|[;&|]|`|\$\()\s*gh\s+(pr\s+merge\b|api\b[^;&|]*pulls/[0-9]+/merge(-async)?\b)'
echo "$command" | grep -qE "$MERGE_CMD" || exit 0

say() { # <message>: show it to the user and to the model, never block
  jq -n --arg m "$1" '{systemMessage: $m, hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
  exit 0
}

if [ "${SYNC_MAIN_DRY_RUN:-}" = "1" ]; then say "DRY RUN: merge command matched, would sync local main."; fi

MAIN="${SYNC_MAIN_CHECKOUT:-$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')}"
[ -n "$MAIN" ] && [ -d "$MAIN" ] || exit 0

branch=$(git -C "$MAIN" symbolic-ref --short -q HEAD)
[ "$branch" = "main" ] || say "Local main not synced: the main checkout is on '${branch:-a detached HEAD}', not main. After the merge, sync it by hand: git -C $MAIN fetch origin && git -C $MAIN merge --ff-only origin/main (from a checkout on main)."

before=$(git -C "$MAIN" rev-parse main)
tries=${SYNC_MAIN_TRIES:-5}
wait_s=${SYNC_MAIN_WAIT:-3}
i=0
while :; do
  git -C "$MAIN" fetch -q origin main 2>/dev/null || say "Local main not synced: 'git fetch origin main' failed (offline?). Run it by hand after the merge."
  remote=$(git -C "$MAIN" rev-parse origin/main)
  [ "$remote" != "$before" ] && break
  i=$((i + 1))
  [ "$i" -ge "$tries" ] && say "Local main already matches origin/main (or the merge has not landed yet). If it was an async merge, fetch and fast-forward once it finishes."
  sleep "$wait_s"
done

# Refuse when uncommitted edits sit on a file the merge changes.
changed=$(git -C "$MAIN" diff --name-only main origin/main)
dirty=$(git -C "$MAIN" status --porcelain | sed -E 's/^.{3}//; s/.* -> //')
overlap=$(comm -12 <(echo "$changed" | sort -u) <(echo "$dirty" | sort -u))
[ -z "$overlap" ] || say "Local main not synced: uncommitted edits overlap the merge ($(echo "$overlap" | tr '\n' ' ')). Commit or move them, then: git -C $MAIN merge --ff-only origin/main"

if ! git -C "$MAIN" merge -q --ff-only origin/main 2>/dev/null; then
  ahead=$(git -C "$MAIN" rev-list --count origin/main..main)
  say "Local main not synced: it has $ahead commit(s) not on origin/main, so it cannot fast-forward. Never commit to local main; move those commits to a branch."
fi

n=$(git -C "$MAIN" rev-list --count "$before"..main)
say "Synced local main to $(git -C "$MAIN" rev-parse --short main) (+$n commits)."

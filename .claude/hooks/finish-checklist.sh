#!/bin/bash
# One hook, two triggers: shows the end-of-task teardown checklist (.claude/scripts/finish-checklist.sh)
#   - PostToolUse (Bash): right after a merge this session ran (`gh pr merge`, or `gh api` PUT to
#     .../pulls/<n>/merge or .../merge-async);
#   - SessionStart: when this checkout is on a task branch whose PR already merged, which is how a
#     merge done on github.com is caught (no Claude hook runs there).
# Prints only: never blocks, stops, kills or deletes. Silent when there is nothing to finish.
#
# Test seam: FINISH_DRY_RUN=1 reports a match instead of running the script.

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
script="$(dirname "$0")/../scripts/finish-checklist.sh"

case "$event" in
  PostToolUse)
    command=$(echo "$input" | jq -r '.tool_input.command // empty')
    # Anchor on command position so a merge command merely mentioned in a commit message or PR
    # body does not fire. Same pattern as sync-main-after-merge.sh.
    MERGE_CMD='(^|[;&|]|`|\$\()\s*gh\s+(pr\s+merge\b|api\b[^;&|]*pulls/[0-9]+/merge(-async)?\b)'
    echo "$command" | grep -qE "$MERGE_CMD" || exit 0
    if [ "${FINISH_DRY_RUN:-}" = "1" ]; then text="DRY RUN: merge matched, would print the finishing checklist."
    else text=$(bash "$script" 2>/dev/null); fi
    ;;
  SessionStart)
    if [ "${FINISH_DRY_RUN:-}" = "1" ]; then text="DRY RUN: session start, would check for a merged branch."
    else text=$(timeout 10 bash "$script" --if-merged 2>/dev/null); fi
    ;;
  *) exit 0 ;;
esac

[ -n "$text" ] || exit 0
if [ "$event" = "PostToolUse" ]; then
  jq -n --arg m "$text" '{systemMessage: $m, hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
else
  jq -n --arg m "$text" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $m}}'
fi

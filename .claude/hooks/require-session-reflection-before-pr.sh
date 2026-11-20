#!/bin/bash
# PreToolUse hook (Bash) — warns (never blocks) when `gh pr create` runs, as a
# reminder that session learnings still need reviewing after the PR is up.
# Originally a hookify "block" rule; made non-blocking so the PR is never
# delayed by /revise-claude-md. Flow: .docs/PR_WORKFLOW.md → "Session learnings".
#
# Detection: this hook cannot tell whether /revise-claude-md has run, so it
# warns on every `gh pr create`. The command is always allowed.

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Anchor on command position (start of string, or after a shell separator)
# so this doesn't fire on `gh pr create` merely mentioned inside a commit
# message, PR body, or other quoted text elsewhere in the command line.
if ! echo "$command" | grep -qE '(^|[;&|]|`|\$\()\s*gh\s+pr\s+create\b'; then
  exit 0
fi

warning='Session learnings must still be reviewed after the PR is up (this is a warning, not a block).

Push and open the PR now, then, while CI runs for the first time:
1. Run /revise-claude-md (claude-md-management plugin).
2. CRITICAL learning (see .docs/PR_WORKFLOW.md#session-learnings) -> commit the CLAUDE.md/doc edit on the PR branch.
3. Anything else -> put it in the PR body under "Session Learnings" for the monthly-maintenance routine.

Note: `gh pr create` also fails due to Projects Classic deprecation; create the PR via `gh api repos/CodeWarrior-debug/perspectize/pulls -f ...` (per .docs/PR_WORKFLOW.md).'

jq -n --arg warning "$warning" '{
  systemMessage: $warning,
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: $warning
  }
}'
exit 0

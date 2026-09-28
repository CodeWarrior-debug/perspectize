#!/usr/bin/env bash
# SessionStart hook. Runs two independent, unrelated due-date checks and
# emits at most one combined hookSpecificOutput (multiple jq objects would
# only let the last one win, so contexts are concatenated into one).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CURRENT_MONTH="$(date +%Y-%m)"
cd "$REPO_ROOT"

CONTEXTS=()

# --- 1. monthly-maintenance routine (branch cleanup, dependabot merges, etc.) ---
check_maintenance_routine() {
  local routines_file="$REPO_ROOT/ROUTINES.md"

  [ -f "$routines_file" ] || return 0

  # Already have a row for this month (completed or not) -> don't prompt again.
  grep -qE "^\| *${CURRENT_MONTH} *\|" "$routines_file" && return 0

  local last_month cutoff merge_count
  last_month="$(grep -E '^\| *[0-9]{4}-[0-9]{2} *\|' "$routines_file" | tail -1 | awk -F'|' '{gsub(/^ +| +$/, "", $2); print $2}' || true)"

  if [ -n "${last_month:-}" ]; then
    cutoff="${last_month}-01"
  else
    cutoff="$(date -v-90d +%Y-%m-%d 2>/dev/null || date -d '90 days ago' +%Y-%m-%d)"
  fi

  merge_count="$(git log --oneline --since="$cutoff" origin/main 2>/dev/null | wc -l | tr -d ' ')"
  [ -n "$merge_count" ] && [ "$merge_count" -ge 10 ] || return 0

  CONTEXTS+=("Monthly maintenance routine is due: ${merge_count} merges have landed on main since the last recorded run (cutoff ${cutoff}), and no routine has been logged for ${CURRENT_MONTH} yet in ROUTINES.md. Invoke the monthly-maintenance skill to run it (branch cleanup, dependabot/security PR merges, graphify update, gsd map-codebase refresh), then record the outcome as a new row in ROUTINES.md.")
}

# --- 2. monthly codebase audit (lint/vuln/coverage/duplication/migration triage) ---
check_codebase_audit() {
  local audit_report="$REPO_ROOT/.docs/audits/${CURRENT_MONTH}.md"
  [ -f "$audit_report" ] && return 0

  CONTEXTS+=("Monthly codebase audit is due: no .docs/audits/${CURRENT_MONTH}.md found yet. Run the monthly-audit skill (/monthly-audit local) to generate it.")
}

check_maintenance_routine
check_codebase_audit

if [ "${#CONTEXTS[@]}" -eq 0 ]; then
  exit 0
fi

COMBINED="$(printf '%s\n\n' "${CONTEXTS[@]}")"
jq -n --arg ctx "$COMBINED" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'

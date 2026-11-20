#!/bin/bash
# Test for finish-checklist.sh (the hook) and ../scripts/finish-checklist.sh. Matching uses
# FINISH_DRY_RUN; the script runs against a throwaway repo, with the gh lookup and ports faked.
#   bash .claude/hooks/test-finish-checklist.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/finish-checklist.sh"
SCRIPT="$DIR/../scripts/finish-checklist.sh"
fail=0
pass() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fail=1; }

post() { jq -n --arg c "$1" '{hook_event_name:"PostToolUse",tool_input:{command:$c}}' | FINISH_DRY_RUN=1 bash "$HOOK"; }
expect_fire() { out=$(post "$1"); echo "$out" | grep -q 'DRY RUN' && pass "fires:  $1" || bad "fires:  $1 -> ${out:-<none>}"; }
expect_quiet() { out=$(post "$1"); [ -z "$out" ] && pass "quiet:  $1" || bad "quiet:  $1 -> $out"; }

# --- PostToolUse matching ---
expect_fire  'gh pr merge 123 --squash --delete-branch --admin'
expect_fire  'gh api -X PUT repos/o/r/pulls/707/merge-async -f merge_method=merge'
expect_quiet 'gh pr view 123'
expect_quiet 'git commit -m "docs: mention gh pr merge 5"'
out=$(jq -n '{hook_event_name:"SessionStart"}' | FINISH_DRY_RUN=1 bash "$HOOK")
echo "$out" | grep -q 'session start' && pass "fires:  SessionStart" || bad "fires:  SessionStart -> ${out:-<none>}"
out=$(jq -n '{hook_event_name:"Stop"}' | FINISH_DRY_RUN=1 bash "$HOOK")
[ -z "$out" ] && pass "quiet:  other events" || bad "quiet:  other events -> $out"

# --- the script, in a throwaway repo ---
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
g() { git -c user.email=t@t -c user.name=t -c init.defaultBranch=main "$@"; }
g init -q "$T/repo"; g -C "$T/repo" commit -q --allow-empty -m base
run() { (cd "$T/repo" && FINISH_PORTS="${PORTS:-1}" "$@" bash "$SCRIPT" $ARGS); }

g -C "$T/repo" checkout -q -b feature/x
ARGS=--if-merged; out=$(FINISH_MERGED_PR= run env)
[ -z "$out" ] && pass "--if-merged: silent when the PR is not merged" || bad "--if-merged unmerged -> $out"

out=$(FINISH_MERGED_PR=42 run env)
echo "$out" | grep -q 'PR #42 merged' && echo "$out" | grep -q 'git branch -D feature/x' && pass "--if-merged: prints once merged" || bad "--if-merged merged -> $out"

g -C "$T/repo" checkout -q -b wt/3
out=$(FINISH_MERGED_PR=42 run env)
[ -z "$out" ] && pass "--if-merged: silent on a slot's home branch" || bad "home branch -> $out"

ARGS=""; out=$(FINISH_MERGED_PR=42 run env)
echo "$out" | grep -q 'No listeners' && pass "reports no listeners" || bad "no listeners -> $out"

(python3 -m http.server 38123 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "$T/pid")
for _ in 1 2 3 4 5 6 7 8 9 10; do lsof -nP -iTCP:38123 -sTCP:LISTEN -t >/dev/null 2>&1 && break; sleep 0.5; done
PORTS=38123; out=$(FINISH_MERGED_PR=42 run env)
kill "$(cat "$T/pid")" 2>/dev/null
echo "$out" | grep -q ':38123' && pass "reports a listening port" || bad "listener -> $out"

exit $fail

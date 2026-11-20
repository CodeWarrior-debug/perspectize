#!/bin/bash
# Test for sync-main-after-merge.sh. Matching tests use SYNC_MAIN_DRY_RUN; sync
# tests run against throwaway repos in a temp dir (a bare "origin" plus clones), so
# the real checkout and the network are never touched. Run from any checkout:
#   bash .claude/hooks/test-sync-main-after-merge.sh

HOOK="$(cd "$(dirname "$0")" && pwd)/sync-main-after-merge.sh"
fail=0
pass() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fail=1; }

run_cmd() { # <command> -> hook stdout (dry run)
  jq -n --arg cmd "$1" '{tool_input:{command:$cmd}}' | SYNC_MAIN_DRY_RUN=1 bash "$HOOK"
}
expect_fire() { out=$(run_cmd "$1"); if echo "$out" | grep -q 'DRY RUN'; then pass "fires:  $1"; else bad "fires:  $1 -> ${out:-<none>}"; fi; }
expect_quiet() { out=$(run_cmd "$1"); if [ -z "$out" ]; then pass "quiet:  $1"; else bad "quiet:  $1 -> $out"; fi; }

# --- matching ---
expect_fire  'gh pr merge 123 --squash --delete-branch --admin'
expect_fire  'gh api -X PUT repos/o/r/pulls/707/merge-async -f merge_method=merge -F bypass_rules=true'
expect_fire  'gh api -X PUT repos/o/r/pulls/12/merge -f merge_method=squash'
expect_fire  'cd x && gh pr merge 5 --squash'
expect_quiet 'gh pr view 123'
expect_quiet 'gh pr create --title x'
expect_quiet 'gh api repos/o/r/pulls/707 --jq .state'
expect_quiet 'git commit -m "docs: mention gh pr merge 5 in the guide"'
expect_quiet 'echo "run gh pr merge later"'

# --- syncing, in throwaway repos ---
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
g() { git -c user.email=t@t -c user.name=t -c init.defaultBranch=main "$@"; }
g init -q --bare "$T/origin.git"
g clone -q "$T/origin.git" "$T/main" 2>/dev/null
g -C "$T/main" checkout -q -b main 2>/dev/null
echo a > "$T/main/a.txt"; echo b > "$T/main/b.txt"
g -C "$T/main" add -A; g -C "$T/main" commit -q -m base; g -C "$T/main" push -q origin main
g clone -q "$T/origin.git" "$T/other" 2>/dev/null          # stands in for GitHub merging a PR
land() { echo "$1" >> "$T/other/$2"; g -C "$T/other" add -A; g -C "$T/other" commit -q -m "merge $1"; g -C "$T/other" push -q origin main; }
sync() { jq -n '{tool_input:{command:"gh pr merge 9 --squash"}}' | SYNC_MAIN_CHECKOUT="$T/main" SYNC_MAIN_TRIES=1 SYNC_MAIN_WAIT=0 bash "$HOOK"; }

land one a.txt
out=$(sync)
if echo "$out" | grep -q 'Synced local main' && [ "$(g -C "$T/main" rev-parse main)" = "$(g -C "$T/main" rev-parse origin/main)" ]; then pass "fast-forwards a behind main"; else bad "fast-forwards a behind main -> $out"; fi

out=$(sync)
if echo "$out" | grep -q 'already matches'; then pass "nothing to do when already in sync"; else bad "already in sync -> $out"; fi

land two a.txt; echo mine >> "$T/main/b.txt"                # dirty file the merge does NOT touch
out=$(sync)
if echo "$out" | grep -q 'Synced local main' && grep -q mine "$T/main/b.txt"; then pass "syncs and keeps an unrelated uncommitted edit"; else bad "unrelated dirty file -> $out"; fi

land three b.txt                                            # now the merge touches the dirty b.txt
before=$(g -C "$T/main" rev-parse main)
out=$(sync)
if echo "$out" | grep -q 'uncommitted edits overlap' && [ "$(g -C "$T/main" rev-parse main)" = "$before" ] && grep -q mine "$T/main/b.txt"; then pass "skips when an uncommitted edit overlaps the merge"; else bad "overlap -> $out"; fi
g -C "$T/main" checkout -q -- b.txt; sync >/dev/null        # clean again: catches up

echo local > "$T/main/c.txt"; g -C "$T/main" add -A; g -C "$T/main" commit -q -m "stray local commit"
land four a.txt
out=$(sync)
if echo "$out" | grep -q 'cannot fast-forward' && g -C "$T/main" log -1 --format=%s | grep -q 'stray local commit'; then pass "refuses a diverged local main and leaves it alone"; else bad "diverged -> $out"; fi

g -C "$T/main" reset -q --hard origin/main; g -C "$T/main" checkout -q -b feature
land five a.txt
out=$(sync)
if echo "$out" | grep -q "not main" && [ "$(g -C "$T/main" symbolic-ref --short HEAD)" = "feature" ]; then pass "skips when the main checkout is on another branch"; else bad "other branch -> $out"; fi

exit $fail

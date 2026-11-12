#!/usr/bin/env bash
# Read-only report: classify every git worktree so stale ones are cleaned up
# deliberately. Never removes anything; it prints the commands to run, one per line.
#
# Groups:
#   REMOVABLE     clean, PR merged, tip == PR head or reachable from origin/main
#   MERGED-DIRTY  PR merged but uncommitted files: inspect/salvage first
#   NO-PR         no PR found (or tip has commits beyond the PR head): may hold
#                 unpushed work, push it to a <branch>-followup before removing
#   OPEN-PR       keep
#   OUT-OF-PLACE  not under <main checkout>/.claude/worktrees/ (scratchpad, /tmp,
#                 sibling folder): breaks the .docs/WORKTREES.md convention
#
# Usage: bash .claude/scripts/worktree-report.sh     (needs gh; run from any checkout)
# Convention: .docs/WORKTREES.md. macOS bash 3.2 safe (no mapfile, no `set -u`).
set -o pipefail

main_root=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
[ -n "$main_root" ] || { echo "not in a git repo" >&2; exit 2; }
git -C "$main_root" fetch -q origin main 2>/dev/null
allowed="$main_root/.claude/worktrees/"

removable=(); merged_dirty=(); no_pr=(); open_pr=(); out_of_place=()
while IFS=$'\t' read -r path branch; do
  [ "$path" = "$main_root" ] && continue
  dirty=$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  case "$path/" in
    "$allowed"*) ;;
    *) out_of_place+=("$path [${branch:-detached}] dirty=$dirty"); continue ;;
  esac
  [ -n "$branch" ] || { no_pr+=("$path (detached HEAD) dirty=$dirty"); continue; }
  pr=$(gh pr list --head "$branch" --state all --json number,state,headRefOid \
        --jq '.[0] | "\(.number) \(.state) \(.headRefOid)"' 2>/dev/null)
  num=${pr%% *}; rest=${pr#* }; state=${rest%% *}; head=${rest#* }
  tip=$(git -C "$path" rev-parse HEAD)
  case "$state" in
    OPEN) open_pr+=("$path [$branch] #$num dirty=$dirty") ;;
    MERGED)
      if [ "$dirty" != 0 ]; then
        merged_dirty+=("$path [$branch] #$num dirty=$dirty")
      elif [ "$tip" = "$head" ] || git merge-base --is-ancestor "$tip" "$head" 2>/dev/null \
           || git merge-base --is-ancestor "$tip" origin/main 2>/dev/null; then
        removable+=("$path|$branch")
      else
        no_pr+=("$path [$branch] #$num merged but the local tip has commits beyond the PR head")
      fi ;;
    *) no_pr+=("$path [$branch] dirty=$dirty ahead=$(git rev-list --count "origin/main..$branch" 2>/dev/null)") ;;
  esac
done < <(git worktree list --porcelain | awk '
  /^worktree /{p=$2; b=""} /^branch /{b=$2; sub("refs/heads/","",b)} /^$/{if (p != "") print p "\t" b; p=""; b=""}
  END{if (p != "") print p "\t" b}')

section() { printf '\n== %s (%d)\n' "$1" "$2"; }

section "REMOVABLE: clean, PR merged (run each line as its own command)" "${#removable[@]}"
for r in "${removable[@]}"; do
  echo "git worktree remove '${r%%|*}'"
  echo "git branch -D '${r##*|}'"
done
section "MERGED-DIRTY: salvage or discard by hand" "${#merged_dirty[@]}"
for r in "${merged_dirty[@]}"; do echo "$r"; done
section "NO-PR: check for unpushed commits" "${#no_pr[@]}"
for r in "${no_pr[@]}"; do echo "$r"; done
section "OPEN-PR: keep" "${#open_pr[@]}"
for r in "${open_pr[@]}"; do echo "$r"; done
section "OUT-OF-PLACE: not under $allowed" "${#out_of_place[@]}"
for r in "${out_of_place[@]}"; do echo "$r"; done
exit 0

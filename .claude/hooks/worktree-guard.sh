#!/bin/bash
# PreToolUse hook (Bash) — denies `git worktree add` unless the new worktree lands
# under the MAIN checkout's .claude/worktrees/ (the .docs/WORKTREES.md convention).
# Scratchpads, /tmp, sibling folders and paths nested inside another worktree are
# denied with a pointer to .claude/scripts/new-worktree.sh.
#
# Matching is anchored on command position (start of a segment after && || ; |),
# so a commit message that merely mentions `git worktree add` does not fire.
# Relative paths resolve against `git -C <dir>` if given, else the tool call's cwd,
# and `.`/`..` are collapsed before the prefix check (so `..` cannot escape).
#
# Blind spot: worktrees the harness makes itself (Agent `isolation: worktree`,
# EnterWorktree) never go through Bash. `.claude/scripts/worktree-report.sh` covers
# those. Like the sibling hooks it allows when jq or the main checkout is missing.
# Test: bash .claude/hooks/test-worktree-guard.sh

input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
command=$(echo "$input" | jq -r '.tool_input.command // empty')
cwd=$(echo "$input" | jq -r '.cwd // empty')
[ -z "$command" ] && exit 0
[ -z "$cwd" ] && cwd=$PWD

# Cheap pre-filter: nothing to do unless the text mentions a worktree add at all.
case "$command" in
  *worktree*add*) ;;
  *) exit 0 ;;
esac

main_root=$(git -C "$cwd" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')
[ -n "$main_root" ] || exit 0
allowed="$main_root/.claude/worktrees/"

# Collapse "." and ".." in an absolute path (no filesystem access).
normalize() {
  echo "$1" | awk -F/ '{
    n = 0
    for (i = 1; i <= NF; i++) {
      if ($i == "" || $i == ".") continue
      if ($i == "..") { if (n > 0) n--; continue }
      s[++n] = $i
    }
    out = ""
    for (i = 1; i <= n; i++) out = out "/" s[i]
    print (out == "" ? "/" : out)
  }'
}

bad_path=""
segments=$(echo "$command" | sed -E 's/\&\&|\|\||[;|]/\n/g')
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # ltrim
  # Command position only: `git [-C dir] worktree add ...`
  echo "$seg" | grep -qE '^git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+worktree[[:space:]]+add([[:space:]]|$)' || continue

  base="$cwd"
  if echo "$seg" | grep -qE '^git[[:space:]]+-C[[:space:]]'; then
    base=$(echo "$seg" | sed -E 's/^git[[:space:]]+-C[[:space:]]+([^[:space:]]+).*/\1/' | tr -d "\"'")
    case "$base" in /*) ;; *) base="$cwd/$base" ;; esac
  fi

  # First positional argument after "worktree add"; -b/-B/--reason consume a value.
  path=$(echo "$seg" | sed -E 's/^git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+worktree[[:space:]]+add[[:space:]]*//' | awk '{
    for (i = 1; i <= NF; i++) {
      if ($i == "-b" || $i == "-B" || $i == "--reason") { i++; continue }
      if ($i ~ /^-/) continue
      print $i; exit
    }
  }' | tr -d "\"'")

  if [ -z "$path" ]; then bad_path="<unparsed>"; break; fi
  case "$path" in /*) abs="$path" ;; *) abs="$base/$path" ;; esac
  abs=$(normalize "$abs")
  case "$abs/" in
    "$allowed"*/.claude/worktrees/*) bad_path="$abs (nested inside another worktree)"; break ;;
    "$allowed"*) ;;
    *) bad_path="$abs"; break ;;
  esac
done <<< "$segments"

[ -z "$bad_path" ] && exit 0

reason="Blocked: worktrees must live under $allowed (see .docs/WORKTREES.md). Use: .claude/scripts/new-worktree.sh <branch> [name]   (it also copies the .env files). Got: $bad_path. Whoever creates a worktree removes it when done."

jq -n --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'
exit 0

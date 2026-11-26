#!/usr/bin/env bash
# usage: gen-prompt.sh <slot> <T1..T9> <A|B>
# Writes prompts/<slot>-<T>-<C>.md : identical rules for every attempt; condition B adds the key-files-and-interfaces block.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/common.sh"
SLOT_N=$1; T=$2; C=$3
SLOT=$WT/$SLOT_N
mkdir -p "$HERE/prompts"
OUT=$HERE/prompts/$SLOT_N-$T-$C.md

section() { # $1 = A | B  -> text of that field of the task in tasks.md
  awk -v t="### $T " -v want="$1" '
    index($0, t) == 1 { on = 1; next }
    on && /^### / { exit }
    on && /^A: /      { mode = "A"; sub(/^A: /, "") }
    on && /^B adds: / { mode = "B"; sub(/^B adds: /, "") }
    on && /^Hidden tests:/ { mode = "" }
    on && /^Test cmd/      { mode = "" }
    on && mode == want { print }
  ' "$HERE/tasks.md" | grep -v '^(The original commit has no body'
}

{
  if [ "${TRACK[$T]}" = backend ]; then
    echo "You are implementing one ticket in a Go + SvelteKit monorepo (Perspectize). Your working copy is the git worktree at $SLOT. The Go backend is its \`backend/\` folder. Edit files only inside that directory. Read the CLAUDE.md files there as you would on a normal task."
  else
    echo "You are implementing one ticket in a Go + SvelteKit monorepo (Perspectize). Your working copy is the git worktree at $SLOT. The SvelteKit app is its \`frontend/\` folder, and its dependencies are already installed. Edit files only inside that directory. Read the CLAUDE.md files there as you would on a normal task."
  fi
  echo
  echo "Rules for this run:"
  echo "- Do not commit, push, create or switch branches, or run git stash, reset or checkout."
  echo "- Do not look at git history or other refs: no git log, show, blame, reflog, cat-file, branch -a, or diffing against another commit, and do not read the .git directory. The upstream fix already exists in the object store and looking at it voids the experiment. \`git status\` and \`git diff\` of your own uncommitted changes are fine."
  if [ "${TRACK[$T]}" = backend ]; then
    echo "- Do not touch a database or set DATABASE_URL (tests that need a database skip without it). Never run migrations. Never try to log in or read .env files."
    echo "- Run each shell command as its own Bash call: never join commands with \`&&\`. Use \`go -C $SLOT/backend ...\` instead of cd."
  else
    echo "- Never try to sign in, and never read .env files. No browser verification is possible here."
    echo "- Run each shell command as its own Bash call: never join commands with \`&&\`. Use \`pnpm --dir $SLOT/frontend ...\` instead of cd."
  fi
  echo "- No web search or web fetch."
  echo "- Write or update tests as you see fit. Stop when you consider the ticket done."
  echo
  echo "TICKET:"
  section A
  if [ "$C" = B ]; then
    echo
    echo "KEY FILES AND INTERFACES (supplied with the ticket; paths are relative to the worktree root):"
    section B
  fi
  echo
  echo "FINAL REPORT (plain text, under 200 words):"
  echo "1) files you changed, one line each;"
  echo "2) the build/test commands you ran and their results;"
  echo "3) anything you were unsure about or could not verify;"
  echo "4) every git command you ran."
} > "$OUT"
echo "$OUT ($(wc -w < "$OUT") words)"

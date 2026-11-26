#!/usr/bin/env bash
# Prints, per task commit: parent hash, files changed (prod vs test), hunk function contexts, and added signatures.
# Read-only git. Output feeds the condition B/C hints (names only, no bodies).
set -u
REPO=/home/user/perspectize
for h in "$@"; do
  p=$(git -C "$REPO" rev-parse "$h^")
  echo "################ $h  parent=$p"
  git -C "$REPO" log -1 --format='%s' "$h"
  echo "--- files (numstat):"
  git -C "$REPO" diff --numstat "$p" "$h"
  echo "--- hunk function contexts (production files only):"
  git -C "$REPO" diff -U0 "$p" "$h" -- . ':!*_test.go' ':!*.test.ts' ':!*.md' \
    | grep -E '^(diff --git|@@)' | sed -E 's/^diff --git a\/(.*) b\/.*/FILE \1/' | sed -E 's/^@@ [^@]*@@ ?/  ctx: /' | awk '!seen[$0]++'
  echo "--- added/changed declarations (production files only):"
  git -C "$REPO" diff -U0 "$p" "$h" -- . ':!*_test.go' ':!*.test.ts' ':!*.md' \
    | grep -E '^\+(func |type |export (async )?(function|const|type|interface)|const [A-Za-z]+ =|\s+[A-Z][A-Za-z]+\(.*\) (error|\()|\s+[A-Za-z]+\(.*\)\s*(error|\{))' \
    | head -40
  echo
done

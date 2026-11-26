#!/usr/bin/env bash
# usage: hidden.sh <slot> <T> <cond>
# Overlays the REAL commit's test files onto the attempt, runs just those tests, then removes the overlay.
# Output is the raw test output; the caller classifies failures (compile error on a new name = name-mismatch).
# DATABASE_URL stays unset so DB integration tests skip.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../phase1/common.sh"; P1=$HERE
SLOT=$WT/$1; T=$2; C=$3
unset DATABASE_URL
# keep the agent's own tests: snapshot their versions of the hidden paths first
mkdir -p "$P1/attempts/own-$T-$C"
for f in ${HIDDEN[$T]}; do
  if [ -f "$SLOT/$f" ]; then mkdir -p "$P1/attempts/own-$T-$C/$(dirname "$f")"; cp "$SLOT/$f" "$P1/attempts/own-$T-$C/$f"; fi
  mkdir -p "$SLOT/$(dirname "$f")"
  git -C "$REPO" show "${REAL[$T]}:$f" > "$SLOT/$f"
done
echo "== overlaid real tests: ${HIDDEN[$T]}"
if [ "${TRACK[$T]}" = backend ]; then
  go -C "$SLOT/backend" test -count=1 ${GOPKGS[$T]} 2>&1 | tail -60
else
  files=""
  for f in ${HIDDEN[$T]}; do files="$files ${f#frontend/}"; done
  pnpm --dir "$SLOT/frontend" exec vitest run --project unit $files 2>&1 | tail -60
fi
echo "== restoring the agent's own versions"
for f in ${HIDDEN[$T]}; do
  if [ -f "$P1/attempts/own-$T-$C/$f" ]; then cp "$P1/attempts/own-$T-$C/$f" "$SLOT/$f"
  else rm -f "$SLOT/$f"; fi
done

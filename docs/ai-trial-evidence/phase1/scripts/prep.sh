#!/usr/bin/env bash
# usage: prep.sh <slot 3|4|5> <T1..T9> <A|B|C>
# Puts the slot on a fresh task branch at the task's PARENT commit (the state just before the real fix).
# Frontend tasks also run a frozen-lockfile install, timed, into the slot's own node_modules.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/common.sh"
SLOT_N=$1; T=$2; C=$3
SLOT=$WT/$SLOT_N
BR=ai-trial/p1-$T-$C
unset DATABASE_URL
if [ -n "$(git -C "$SLOT" status --porcelain)" ]; then echo "slot $SLOT_N is not clean; refusing"; exit 1; fi
git -C "$SLOT" checkout -q --no-track -b "$BR" "${PARENT[$T]}"
echo "slot $SLOT_N -> $BR at $(git -C "$SLOT" rev-parse --short HEAD) (parent of ${REAL[$T]})"
if [ "${TRACK[$T]}" = frontend ]; then
  # svelte-check keeps a generated copy of every .svelte file it has seen in this slot (gitignored), so a
  # file from an earlier checkout of the slot can fail the check at a commit that has no such file.
  rm -rf "$SLOT/frontend/.svelte-kit/.svelte-check"
  s=$(date +%s.%N)
  pnpm install --frozen-lockfile --prefer-offline --dir "$SLOT/frontend" > "$P1/install-$SLOT_N-$T-$C.log" 2>&1
  rc=$?
  e=$(date +%s.%N)
  printf 'pnpm install exit=%d  %.1fs (log install-%s-%s-%s.log)\n' "$rc" "$(echo "$e - $s" | bc)" "$SLOT_N" "$T" "$C"
fi

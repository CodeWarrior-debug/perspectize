#!/usr/bin/env bash
# usage: reset.sh <slot> <T> <cond>
# Throws the attempt away (its patch is already saved by snapshot.sh) and returns the slot to its home branch wt/<n>.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../phase1/common.sh"; P1=$HERE
SLOT=$WT/$1; T=$2; C=$3
BR=ai-trial/p4-$T-$C
[ -f "$P1/attempts/$T-$C.patch" ] || { echo "no saved patch for $T-$C; refusing to reset"; exit 1; }
git -C "$SLOT" reset -q --hard
git -C "$SLOT" clean -fdq
git -C "$SLOT" checkout -q "wt/$1"
git -C "$SLOT" branch -D "$BR" > /dev/null
echo "slot $1 back on wt/$1 ($(git -C "$SLOT" status --short --branch | head -1))"

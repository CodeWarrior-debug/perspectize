#!/usr/bin/env bash
# usage: snapshot.sh <slot> <T> <cond>
# Stages the attempt's working tree locally (no commit), saves the patch and a stat, and lists non-test vs test files.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/common.sh"
SLOT=$WT/$1; T=$2; C=$3
mkdir -p "$P1/attempts"
git -C "$SLOT" add -A
git -C "$SLOT" diff --cached > "$P1/attempts/$T-$C.patch"
git -C "$SLOT" diff --cached --stat | tee "$P1/attempts/$T-$C.stat"
echo "patch: $P1/attempts/$T-$C.patch ($(wc -l < "$P1/attempts/$T-$C.patch") lines)"

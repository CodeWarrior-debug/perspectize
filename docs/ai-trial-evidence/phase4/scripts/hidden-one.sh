#!/usr/bin/env bash
# usage: hidden-one.sh <slot> <T> <relative test file>   (overlay ONE real test file, run its package, restore)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../phase1/common.sh"
SLOT=$WT/$1; T=$2; F=$3
unset DATABASE_URL
cp "$SLOT/$F" "$HERE/attempts/own-one.bak"
git -C "$REPO" show "${REAL[$T]}:$F" > "$SLOT/$F"
go -C "$SLOT/backend" test -count=1 ${GOPKGS[$T]} 2>&1 | tail -60
cp "$HERE/attempts/own-one.bak" "$SLOT/$F"
echo "== restored; cmp: $(cmp "$HERE/attempts/own-one.bak" "$SLOT/$F" && echo identical)"

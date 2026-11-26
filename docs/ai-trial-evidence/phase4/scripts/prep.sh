#!/usr/bin/env bash
# usage: prep.sh <slot 3|4|5> <T1..T9>
# Phase 4 harness. Puts the slot on a fresh scratch branch ai-trial/p4-<T>-A at the task's PARENT commit, lays the
# Phase 2-3 guardrails (check tiers, arch rules, nested CLAUDE.md with the red-green loop) on top, regenerates the
# baseline for that older code, and makes ONE local scratch commit ("main with the guardrails"). Never pushed.
# Frontend tasks also run a frozen-lockfile install into the slot's own node_modules.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../phase1/common.sh"
P4=$HERE
SLOT_N=$1; T=$2
SLOT=$WT/$SLOT_N
BR=ai-trial/p4-$T-A
unset DATABASE_URL
if [ -n "$(git -C "$SLOT" status --porcelain)" ]; then echo "slot $SLOT_N is not clean; refusing"; exit 1; fi
git -C "$SLOT" checkout -q --no-track -b "$BR" "${PARENT[$T]}"
echo "slot $SLOT_N -> $BR at $(git -C "$SLOT" rev-parse --short HEAD) (parent of ${REAL[$T]})"

copy() { # copy <src root> <relative path>
  mkdir -p "$SLOT/$(dirname "$2")"
  cp -p "$1/$2" "$SLOT/$2"
}

if [ "${TRACK[$T]}" = backend ]; then
  SRC=$WT/1
  FILES="backend/.go-arch-lint.yml backend/internal/CLAUDE.md backend/scripts/arch-check.sh backend/scripts/check.sh backend/scripts/gotest-summary.py backend/tools/archcheck/go.mod backend/tools/archcheck/go.sum backend/tools/archcheck/main.go docs/ticket-template-backend.md"
  for f in $FILES; do copy "$SRC" "$f"; done
  bash "$SLOT/backend/scripts/arch-check.sh" init
  n=$(grep -v -e '^#' -e '^$' "$SLOT/backend/arch-baseline.txt" | wc -l | tr -d ' ')
  # the nested CLAUDE.md quotes the baseline size at the commit it was written for; use this parent's
  sed -i "s/(23 lines:/($n lines:/" "$SLOT/backend/internal/CLAUDE.md"
  git -C "$SLOT" add -A
else
  SRC=$WT/2
  FILES="frontend/.prettierignore frontend/eslint-rules/arch.js frontend/eslint.config.js frontend/scripts/arch-check.sh frontend/scripts/check.sh frontend/src/CLAUDE.md docs/ticket-template-frontend.md"
  for f in $FILES; do copy "$SRC" "$f"; done
  if [ "$T" = T9 ]; then
    copy "$SRC" frontend/package.json
    copy "$SRC" frontend/pnpm-lock.yaml
  else
    # T5-T8 parents are on the older dependency set (SvelteKit 2, `$lib` alias); see phase4/fe-old-deps
    cp -p "$P4/fe-old-deps/package.json" "$SLOT/frontend/package.json"
    cp -p "$P4/fe-old-deps/pnpm-lock.yaml" "$SLOT/frontend/pnpm-lock.yaml"
    # the nested CLAUDE.md names the `#lib` alias; these parents use `$lib`
    sed -i 's/#lib/$lib/g' "$SLOT/frontend/src/CLAUDE.md"
  fi
  rm -rf "$SLOT/frontend/.svelte-kit/.svelte-check"
  s=$(date +%s.%N)
  pnpm install --frozen-lockfile --prefer-offline --config.engine-strict=false --dir "$SLOT/frontend" > "$P4/install-$SLOT_N-$T.log" 2>&1
  rc=$?
  e=$(date +%s.%N)
  printf 'pnpm install exit=%d  %.1fs (log install-%s-%s.log)\n' "$rc" "$(echo "$e - $s" | bc)" "$SLOT_N" "$T"
  bash "$SLOT/frontend/scripts/arch-check.sh" init
  n=$(jq '[.[] | .[] | .count] | add' "$SLOT/frontend/eslint-suppressions.json")
  sed -i "s/(34 violations;/($n violations;/" "$SLOT/frontend/src/CLAUDE.md"
  git -C "$SLOT" add -A
fi
git -C "$SLOT" commit -q -m "chore(ai-trial): scratch base for $T: guardrails on the parent (never pushed)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015P6RSkBMK7ZGLYn3MyVASQ"
echo "scratch base commit: $(git -C "$SLOT" rev-parse --short HEAD)"
git -C "$SLOT" status --short | head -5

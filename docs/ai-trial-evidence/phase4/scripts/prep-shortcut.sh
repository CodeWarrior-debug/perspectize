#!/usr/bin/env bash
# usage: prep-shortcut.sh <slot 3|4|5> <backend|frontend>
# Tempting-shortcut task base: the trial branch itself (92c03c5f + Phase 2-3 guardrails, baseline already committed),
# plus the red-green loop paragraph that exists only in the working tree of slots 1 and 2. One local scratch commit.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../phase1/common.sh"
SLOT_N=$1; TR=$2
SLOT=$WT/$SLOT_N
unset DATABASE_URL
if [ -n "$(git -C "$SLOT" status --porcelain)" ]; then echo "slot $SLOT_N is not clean; refusing"; exit 1; fi
if [ "$TR" = backend ]; then
  SRC=$WT/1; F=backend/internal/CLAUDE.md
else
  SRC=$WT/2; F=frontend/src/CLAUDE.md
fi
BR=ai-trial/p4-S-$TR-A
git -C "$SLOT" checkout -q --no-track -b "$BR" "ai-trial/$TR"
cp -p "$SRC/$F" "$SLOT/$F"
if [ "$TR" = frontend ]; then
  rm -rf "$SLOT/frontend/.svelte-kit/.svelte-check"
  pnpm install --frozen-lockfile --prefer-offline --config.engine-strict=false --dir "$SLOT/frontend" > "$HERE/install-$SLOT_N-S-$TR.log" 2>&1
  echo "pnpm install exit=$?"
fi
git -C "$SLOT" add -A
git -C "$SLOT" commit -q -m "chore(ai-trial): scratch base for the $TR shortcut task: red-green loop paragraph (never pushed)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015P6RSkBMK7ZGLYn3MyVASQ"
echo "slot $SLOT_N -> $BR at $(git -C "$SLOT" rev-parse --short HEAD)"
git -C "$SLOT" status --short | head -3

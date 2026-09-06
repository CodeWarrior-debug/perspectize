#!/bin/bash
# sv-chrome.sh — launch Chrome with the persistent self-verify profile.
#
# The profile at .claude/sv-profile/ holds a logged-in app session (a dedicated
# throwaway test user). Claude drives this already-authenticated browser via the
# chrome-devtools MCP and never handles a credential.
#
# Usage:
#   .claude/scripts/sv-chrome.sh                 # open with the profile
#   .claude/scripts/sv-chrome.sh http://localhost:5173   # ...and navigate
#
# One-time setup: run this, sign in as the self-verify test user, close Chrome.
# The session persists in .claude/sv-profile/ (gitignored, and unreadable by the
# agent via settings.json deny rules).
#
# The remote-debugging port lets the chrome-devtools MCP attach to THIS browser
# instead of spawning its own. Point the MCP at it with --browser-url
# http://127.0.0.1:9222 (exact flag name varies by MCP version — see
# .docs/VERIFICATION.md §0).

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PROFILE_DIR="$REPO_ROOT/.claude/sv-profile"
PORT="${SV_CHROME_PORT:-9222}"
URL="${1:-}"

case "$(uname -s)" in
  Darwin)
    CHROME="${SV_CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
    ;;
  Linux)
    CHROME="${SV_CHROME_BIN:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
    ;;
  *)
    CHROME="${SV_CHROME_BIN:-}"
    ;;
esac

if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "sv-chrome: Chrome binary not found. Set SV_CHROME_BIN to its path." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

echo "sv-chrome: profile=$PROFILE_DIR  debug-port=$PORT"
exec "$CHROME" \
  --user-data-dir="$PROFILE_DIR" \
  --remote-debugging-port="$PORT" \
  --no-first-run \
  --no-default-browser-check \
  ${URL:+"$URL"}

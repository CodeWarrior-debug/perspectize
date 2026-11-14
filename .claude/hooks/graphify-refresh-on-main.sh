#!/bin/bash
# SessionStart (startup) — refresh the graphify knowledge graph in the background,
# but only when the session starts on the `main` branch of a repo that already has
# a graph. Skips when the graph is newer than the latest commit (already current).
# Fail-open: any missing tool, graph, repo or branch mismatch => do nothing.
command -v graphify >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -n "$cwd" ] || exit 0

root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ "$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ] || exit 0
graph="$root/graphify-out/graph.json"
[ -f "$graph" ] || exit 0

# Already current: graph written after the last commit.
commit_ts=$(git -C "$root" log -1 --format=%ct 2>/dev/null) || exit 0
graph_ts=$(stat -f %m "$graph" 2>/dev/null || stat -c %Y "$graph" 2>/dev/null) || exit 0
[ "$graph_ts" -ge "$commit_ts" ] && exit 0

# Detached so session start isn't held up (~10 s, AST-only, no API cost).
log="${TMPDIR:-/tmp}/graphify-refresh-on-main.log"
(cd "$root" && nohup graphify update . >"$log" 2>&1 &) >/dev/null 2>&1
exit 0

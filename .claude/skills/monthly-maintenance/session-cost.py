#!/usr/bin/env python3
"""Wall-clock time and Claude token usage for a Claude Code session.

Usage: python3 .claude/skills/monthly-maintenance/session-cost.py [--md] [transcript.jsonl]

Defaults to the most recently modified transcript under
~/.claude/projects/<this-repo>/. Run it at the end of the monthly routine and
record the result in ROUTINES.md / the PR body.

Token counts come from the `usage` blocks Claude Code writes into the transcript
(exact, as billed) — unlike codebase-metrics.py's bytes/4 estimate. Messages are
de-duplicated by message id. Subagent work is only included if it appears in this
transcript. "Active" time drops gaps longer than 10 minutes (idle waiting on the user).
"""
import glob, json, os, sys
from datetime import datetime

args = [a for a in sys.argv[1:] if a != "--md"]
if args:
    path = args[0]
else:
    repo = os.getcwd().replace("/", "-")
    files = glob.glob(os.path.expanduser(f"~/.claude/projects/{repo}/*.jsonl"))
    if not files: sys.exit("no transcript found; pass a path")
    path = max(files, key=os.path.getmtime)

seen, ts = {}, []
for line in open(path):
    try: j = json.loads(line)
    except ValueError: continue
    if j.get("timestamp"): ts.append(datetime.fromisoformat(j["timestamp"].replace("Z", "+00:00")))
    m = j.get("message") or {}
    if j.get("type") == "assistant" and m.get("usage"):
        seen[m.get("id") or j.get("uuid")] = m["usage"]  # last write wins per message

tot = {k: sum(u.get(k, 0) for u in seen.values()) for k in
       ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")}
ts.sort()
wall = (ts[-1] - ts[0]).total_seconds() if ts else 0
active = sum(g for g in ((b - a).total_seconds() for a, b in zip(ts, ts[1:])) if g <= 600)
fmt = lambda s: f"{int(s // 3600)}h {int(s % 3600 // 60)}m"
rows = [("Model turns", len(seen)), ("Wall-clock", fmt(wall)), ("Active time", fmt(active)),
        ("Input tokens (uncached)", f"{tot['input_tokens']:,}"),
        ("Cache-write tokens", f"{tot['cache_creation_input_tokens']:,}"),
        ("Cache-read tokens", f"{tot['cache_read_input_tokens']:,}"),
        ("Output tokens", f"{tot['output_tokens']:,}")]
if "--md" in sys.argv:
    print("| Metric | Value |\n|---|--:|")
    for k, v in rows: print(f"| {k} | {v} |")
else:
    for k, v in rows: print(f"{k:<26}{v}")

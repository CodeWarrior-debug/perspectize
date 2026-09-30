#!/usr/bin/env python3
"""Files / lines / estimated-token counts for the repo and key folders.

Usage: python3 .claude/skills/monthly-maintenance/codebase-metrics.py [--md]

Counts git-tracked text files only (so ignored/vendored output is skipped) and
excludes lockfiles, generated code and bulk data so month-over-month numbers
stay comparable. Tokens are an estimate (UTF-8 bytes / 4, typically within
~15% of a real BPE tokenizer) — there is no offline Claude tokenizer, and the
point is trend tracking, not billing.
"""
import subprocess, sys, os

FOLDERS = ["backend", "frontend", ".claude"]  # add more here when worth tracking
EXCLUDE_NAMES = {"pnpm-lock.yaml", "go.sum", "package-lock.json", "generated.go"}
EXCLUDE_EXT = {".tsv", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
               ".mp4", ".woff", ".woff2", ".ttf", ".pdf", ".zip"}
EXCLUDE_PARTS = ("graphify-out/", "/gen/", "models_gen.go")

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
os.chdir(root)
files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")

def keep(p):
    if not p or not os.path.isfile(p): return False
    b = os.path.basename(p)
    if b in EXCLUDE_NAMES or os.path.splitext(b)[1].lower() in EXCLUDE_EXT: return False
    return not any(x in p or p.startswith(x.strip("/")) for x in EXCLUDE_PARTS)

stats = {}  # folder -> [files, lines, bytes]
for p in filter(keep, files):
    data = open(p, "rb").read()
    if b"\0" in data: continue  # binary
    top = p.split("/")[0] if "/" in p else "(root files)"
    for key in {top, "TOTAL"}:
        s = stats.setdefault(key, [0, 0, 0])
        s[0] += 1; s[1] += data.count(b"\n"); s[2] += len(data)

order = ["TOTAL"] + FOLDERS + sorted(k for k in stats if k not in FOLDERS + ["TOTAL"])
md = "--md" in sys.argv
rows = [(k, *stats[k], stats[k][2] // 4) for k in order if k in stats]
if md:
    print("| Folder | Files | Lines | Bytes | Est. tokens |\n|---|--:|--:|--:|--:|")
    for r in rows: print(f"| {r[0]} | {r[1]:,} | {r[2]:,} | {r[3]:,} | ~{r[4]:,} |")
else:
    for r in rows: print(f"{r[0]:<14}{r[1]:>7,} files {r[2]:>9,} lines {r[3]:>11,} B  ~{r[4]:>9,} tokens")

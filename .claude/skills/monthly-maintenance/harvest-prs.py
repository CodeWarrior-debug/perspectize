#!/usr/bin/env python3
"""Harvest loose ends from merged PR bodies so they are not lost after merge.

Usage: python3 .claude/skills/monthly-maintenance/harvest-prs.py --since YYYY-MM-DD [--md]
           [--input prs.json] [--issues issues.json] [--repo-root DIR]

Reads merged PRs (from `gh pr list --state merged --search "merged:>=<since>"`, or from a
saved `--input` JSON array of {number,title,body,labels,mergedAt,url}) and extracts:
  1. Session Learnings proposals (diff blocks / bullets), each checked against the repo's
     CLAUDE.md files: the `+` lines of a diff are looked up in the named target file (or any
     CLAUDE.md if none is named) -> applied / partial / not found.
  2. Unchecked `- [ ]` items (Follow-up Steps, Test Plan, anywhere outside code fences).
  3. QA Acceptance Criteria table rows whose Result cell is empty.
  4. Bullets under a "Known gaps" heading or bold label.
  5. Leftover labels: migrations-unapplied, check-migration-number-before-apply,
     needs-demo-video, needs-local-session-takeover.
Items are then fuzzy-matched (normalized title words) against open issues (`--issues`, a saved
`gh issue list --state open --json number,title`) and FEATURE_BACKLOG.md headings, and marked
"possibly tracked". The gitignored private bug backlog is never read.

Read-only: never creates issues or edits files. Heading assumptions: sections are markdown
headings (`## Follow-up Steps`) or a lone bold label line (`**Known gaps:**`), matched
case-insensitively by substring.
"""
import argparse, json, os, re, subprocess, sys

LEFTOVER_LABELS = ["migrations-unapplied", "check-migration-number-before-apply",
                   "needs-demo-video", "needs-local-session-takeover"]
LABEL_FIX = {
    "migrations-unapplied": "apply migration per environment, then set migrations-applied",
    "check-migration-number-before-apply": "verify migration number vs main before applying",
    "needs-demo-video": "record demo evidence or drop label with a one-line reason",
    "needs-local-session-takeover": "finish in a local session, then drop label",
}
STOP = set("the and for with from that this into when then are was not but any all can add use via per its".split())
HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$")
BOLD_LABEL = re.compile(r"^\s*\*\*([^*]+?)\*\*\s*:?\s*(.*)$")
COMMENT = re.compile(r"<!--.*?-->", re.S)
CLAUDE_PATH = re.compile(r"[\w./-]*CLAUDE(?:\.local)?\.md")


def trim(s, n=160):
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def parse_sections(body):
    """Yield (section_name, line, in_fence) for every body line."""
    body = COMMENT.sub("", body or "")
    name, fence, out = "", False, []
    for line in body.splitlines():
        if line.strip().startswith("```"):
            out.append((name, line, fence or True))
            fence = not fence
            continue
        if not fence:
            h = HEADING.match(line)
            if h:
                name = h.group(1).strip().lower()
                out.append((name, line, False))
                continue
            b = BOLD_LABEL.match(line)
            if b and ("known gap" in b.group(1).lower() or "session learning" in b.group(1).lower()):
                name = b.group(1).strip().lower()
                out.append((name, line, False))
                continue
        out.append((name, line, fence))
    return out


def learnings(lines):
    """Return list of dicts {text, target, added} from the Session Learnings section."""
    res, cur_target, block, in_block = [], None, [], False
    for name, line, fence in lines:
        if "session learning" not in name:
            continue
        m = CLAUDE_PATH.findall(line)
        if line.strip().startswith("```"):
            if not in_block:
                in_block, block = True, []
            else:
                in_block = False
                added = [l[1:].strip() for l in block
                         if l.startswith("+") and not l.startswith("+++") and l[1:].strip()]
                tgt = cur_target
                for l in block:
                    if l.startswith(("+++", "---")):
                        f = CLAUDE_PATH.findall(l)
                        if f:
                            tgt = f[0]
                if added or block:
                    res.append({"text": added[0] if added else (block[0] if block else ""),
                                "target": tgt, "added": added})
            continue
        if in_block:
            block.append(line)
            continue
        if m:
            cur_target = m[0]
        bullet = re.match(r"^\s*[-*]\s+(?!\[[ xX]\])(.+)", line)
        if bullet:
            res.append({"text": bullet.group(1), "target": (m[0] if m else cur_target), "added": []})
    return res


def read_text(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def read_claude_files(root):
    files = {}
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "worktrees", "graphify-out")]
        for f in fn:
            if f in ("CLAUDE.md", "CLAUDE.local.md"):
                p = os.path.join(dp, f)
                try:
                    files[os.path.relpath(p, root)] = read_text(p)
                except OSError:
                    pass
    return files


def norm(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def learning_status(item, claude_files):
    if not item["added"]:
        return "no diff (manual review)"
    hay = {k: norm(v) for k, v in claude_files.items()}
    tgt = item["target"]
    cands = [v for k, v in hay.items() if tgt and (k == tgt.lstrip("./") or k.endswith("/" + tgt.lstrip("./")))]
    pool = cands or list(hay.values())
    found = sum(1 for a in item["added"] if any(norm(a) in h for h in pool))
    if found == len(item["added"]):
        return "applied"
    return "partial" if found else "not found"


def words(s):
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if len(w) > 2 and w not in STOP}


def tracked_match(text, known):
    w = words(text)
    for label, kw in known:
        if not kw or not w:
            continue
        shared = len(w & kw)
        if shared >= 3 and shared / min(len(w), len(kw)) >= 0.6:
            return label
    return None


def extract(pr, claude_files):
    items, n = [], pr["number"]
    lines = parse_sections(pr.get("body") or "")
    for it in learnings(lines):
        st = learning_status(it, claude_files)
        tgt = it["target"] or "CLAUDE.md"
        items.append(("Session Learnings", n, f"[{st}] ({tgt}) {it['text']}",
                      "drop (already applied)" if st == "applied" else "CLAUDE.md (needs approval)"))
    qa_cols = None
    for name, line, fence in lines:
        if fence:
            continue
        m = re.match(r"^\s*[-*]\s+\[ \]\s*(.*)", line)
        if m and m.group(1).strip():
            items.append(("Unchecked follow-ups", n, f"{m.group(1)} (under: {name or 'top'})",
                          "issue or backlog"))
        if "qa acceptance" in name and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            low = [c.lower() for c in cells]
            if "result" in low:
                qa_cols = low.index("result")
                continue
            if set("".join(cells)) <= set("-: "):
                continue
            if qa_cols is not None and len(cells) > qa_cols and not cells[qa_cols] and any(cells[1:3]):
                items.append(("QA rows without a result", n,
                              f"#{cells[0]} When: {cells[1] if len(cells) > 1 else ''} / Then: {cells[2] if len(cells) > 2 else ''}",
                              "QA tester / issue"))
        if "known gap" in name:
            b = re.match(r"^\s*[-*]\s+(?!\[[ xX]\])(.+)", line)
            lab = BOLD_LABEL.match(line)
            text = b.group(1) if b else (lab.group(2) if lab and lab.group(2).strip() else None)
            if text:
                items.append(("Known gaps", n, text, "issue or backlog"))
    labels = {(l["name"] if isinstance(l, dict) else l) for l in pr.get("labels") or []}
    for lab in LEFTOVER_LABELS:
        if lab in labels:
            items.append(("Leftover labels", n, f"{lab}: {LABEL_FIX[lab]}", "fix label"))
    return items


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--since", required=True, help="YYYY-MM-DD")
    ap.add_argument("--md", action="store_true")
    ap.add_argument("--input")
    ap.add_argument("--issues")
    ap.add_argument("--repo-root", default=os.getcwd())
    a = ap.parse_args(argv)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.since):
        sys.exit("--since must be YYYY-MM-DD")
    if a.input:
        prs = json.loads(read_text(a.input))
    else:
        r = subprocess.run(["gh", "pr", "list", "--state", "merged", "--search", f"merged:>={a.since}",
                            "--limit", "200", "--json", "number,title,body,labels,mergedAt,url"],
                           capture_output=True, text=True)
        if r.returncode:
            sys.exit(r.stderr.strip() or "gh pr list failed")
        prs = json.loads(r.stdout)
    prs = [p for p in prs if not p.get("mergedAt") or p["mergedAt"][:10] >= a.since]
    known = []
    if a.issues:
        for i in json.loads(read_text(a.issues)):
            known.append((f"#{i['number']}", words(i["title"])))
    bl = os.path.join(a.repo_root, "FEATURE_BACKLOG.md")
    if os.path.exists(bl):
        for l in read_text(bl).splitlines():
            if l.startswith("## "):
                known.append(("backlog", words(l[3:])))
    claude_files = read_claude_files(a.repo_root)
    cats = ["Session Learnings", "Unchecked follow-ups", "QA rows without a result", "Known gaps", "Leftover labels"]
    rows = {c: [] for c in cats}
    for pr in sorted(prs, key=lambda p: p["number"]):
        for cat, n, text, home in extract(pr, claude_files):
            tr = tracked_match(text, known) if cat in ("Unchecked follow-ups", "Known gaps") else None
            if tr:
                home = f"possibly tracked: {tr}"
            rows[cat].append((n, trim(text), home))
    total = sum(len(v) for v in rows.values())
    out = [f"# Merged-PR harvest since {a.since} ({len(prs)} PRs, {total} items)" if a.md
           else f"Merged-PR harvest since {a.since}: {len(prs)} PRs, {total} items"]
    for c in cats:
        out.append("")
        out.append(f"## {c} ({len(rows[c])})" if a.md else f"{c} ({len(rows[c])})")
        for n, text, home in rows[c]:
            out.append(f"- PR #{n}: {text} -> {home}" if a.md else f"  #{n}: {text} -> {home}")
    print("\n".join(out))


if __name__ == "__main__":
    main()

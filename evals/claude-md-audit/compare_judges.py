#!/usr/bin/env python3
"""Compare two rejudge.py outputs (same jobs, different judge models). No API calls.

    python3 compare_judges.py judgements/<dirA> judgements/<dirB> [--md out.md]
"""
import argparse
import json
import re
import statistics as st


def load(d):
    j = json.load(open(f"{d}/judgements.json"))
    return j, {r["id"]: r for r in j["results"] if "verdict" in r}


def quotes(t):
    return {re.sub(r"\s+", " ", q).strip().lower() for q in re.findall(r"[\"“]([^\"”]{12,})[\"”]", t)}


def words(t):
    return len(t.split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--md")
    x = ap.parse_args()
    (ja, A), (jb, B) = load(x.a), load(x.b)
    ids = sorted(set(A) & set(B))
    la = (ja["judge_models_used"] or ["A"])[-1]
    lb = (jb["judge_models_used"] or ["B"])[-1]
    out = [f"# Judge comparison: `{la}` vs `{lb}`\n", f"{len(ids)} shared judgements (harness-failed checks). "
           f"Cost: {la} ${ja['total_cost_usd']:.2f}, {lb} ${jb['total_cost_usd']:.2f}.\n"]

    dis = [i for i in ids if A[i]["verdict"] != B[i]["verdict"]]
    out.append(f"**Verdict agreement:** {len(ids) - len(dis)}/{len(ids)}. "
               f"Harness majority verdict (all FAIL) matched by {la}: {sum(A[i]['verdict'] == A[i]['harness_verdict'] for i in ids)}, "
               f"{lb}: {sum(B[i]['verdict'] == B[i]['harness_verdict'] for i in ids)}.\n")
    out.append("| | " + la + " | " + lb + " |\n|---|---|---|")
    for name, f in (("mean words", lambda R: st.mean(words(R[i]["reasoning"]) for i in ids)),
                    ("mean cost / judgement ($)", lambda R: st.mean(R[i]["cost_usd"] for i in ids)),
                    ("reasonings that quote the report", lambda R: sum(bool(quotes(R[i]["reasoning"])) for i in ids)),
                    ("mean quotes per reasoning", lambda R: st.mean(len(quotes(R[i]["reasoning"])) for i in ids))):
        fa, fb = f(A), f(B)
        fmt = (lambda v: str(v)) if isinstance(fa, int) else (lambda v: f"{v:.2f}")
        out.append(f"| {name} | {fmt(fa)} | {fmt(fb)} |")

    # do the two judges lean on the same passage? (Jaccard of quoted spans; only where both quote)
    jac = []
    for i in ids:
        qa, qb = quotes(A[i]["reasoning"]), quotes(B[i]["reasoning"])
        if qa and qb:
            jac.append(len(qa & qb) / len(qa | qb))
    out.append(f"\n**Same quoted passage:** in {len(jac)} judgements both quote the report; mean overlap of quoted spans "
               f"{st.mean(jac):.2f} (1.0 = identical evidence, 0 = disjoint).\n" if jac else "")

    by = {}
    for i in ids:
        by.setdefault(A[i]["grader"], []).append(i)
    out.append("## Per grader (failed checks judged)\n\n| case / grader | n | verdict differences |\n|---|---|---|")
    for g, l in sorted(by.items(), key=lambda kv: (A[kv[1][0]]["case"], kv[0])):
        out.append(f"| {A[l[0]]['case']} / {g} | {len(l)} | {sum(A[i]['verdict'] != B[i]['verdict'] for i in l)} |")

    def block(i):
        return (f"### {i}\nharness votes {A[i]['harness_votes']}\n\n**{la}** → {'PASS' if A[i]['verdict'] else 'FAIL'}: {A[i]['reasoning']}\n\n"
                f"**{lb}** → {'PASS' if B[i]['verdict'] else 'FAIL'}: {B[i]['reasoning']}\n")

    out.append(f"\n## Verdict disagreements ({len(dis)})\n")
    out += [block(i) for i in dis] or ["None.\n"]
    # widest divergence in what they cite, among judgements where both quote
    far = sorted((i for i in ids if quotes(A[i]["reasoning"]) and quotes(B[i]["reasoning"])),
                 key=lambda i: len(quotes(A[i]["reasoning"]) & quotes(B[i]["reasoning"])) /
                 len(quotes(A[i]["reasoning"]) | quotes(B[i]["reasoning"])))[:3]
    out.append("\n## Three least-overlapping reasonings (same verdict, different evidence)\n")
    out += [block(i) for i in far]
    text = "\n".join(out)
    if x.md:
        open(x.md, "w").write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()

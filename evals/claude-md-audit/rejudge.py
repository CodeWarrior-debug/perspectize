#!/usr/bin/env python3
"""Re-judge the llm graders of `claude plugin eval --json` results, keeping reasoning.

`claude plugin eval` asks its judge to "respond with exactly one word: PASS or FAIL"
(3 votes, majority), so it never produces reasoning and only stores the votes. This
script rebuilds the same judge prompt from the stored criterion + agent output, asks
for reasoning first, and saves it next to the harness verdict.

It is a reproduction, not the harness judge's own thinking: asking for reasoning can
change a verdict, so the output reports how often the two agree. One vote per grader.

    python3 rejudge.py haiku.json sonnet.json opus.json --out judgements/2026-09-29 \
        --skip r5-cors --workers 6

Each input file is labelled by its stem (haiku.json -> "haiku"). Resumes if --out
already holds judgements.json. Writes judgements.json, JUDGEMENTS.md and reports/.
"""
import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import tempfile
import threading

PROMPT = """You are grading the output of a coding agent against a criterion.
Criterion:
{criteria}
Agent output ({focus}):
{evidence}
Explain your reasoning in 3-6 sentences, quoting the exact passage of the agent output that decides the verdict (or say that no such passage exists). Then, on a final line by itself, write exactly PASS or FAIL."""


def ask(prompt, model):
    with tempfile.TemporaryDirectory() as cwd:  # empty cwd: no project CLAUDE.md gets loaded
        p = subprocess.run(
            ["claude", "-p", "--model", model, "--tools", "", "--no-session-persistence",
             "--system-prompt", "You are a careful, impartial grader.",
             "--setting-sources", "", "--disable-slash-commands", "--output-format", "json"],
            input=prompt, capture_output=True, text=True, cwd=cwd, timeout=600)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip()[-500:] or p.stdout.strip()[-500:])
    out = json.loads(p.stdout)
    if out.get("is_error"):
        raise RuntimeError(str(out.get("result"))[:500])
    text = out["result"].strip()
    lines = [l for l in text.splitlines() if l.strip()]
    verdict = lines[-1].strip().strip("*`. ").upper() if lines else ""
    if verdict not in ("PASS", "FAIL"):
        raise RuntimeError(f"no PASS/FAIL on the last line: {text[-200:]!r}")
    reasoning = "\n".join(lines[:-1]).strip()
    return verdict == "PASS", reasoning, out.get("total_cost_usd") or 0.0, sorted((out.get("modelUsage") or {}).keys())


def collect(paths, skip, only_case, only_arm, only_failed, only_passed=False, mixed=False):
    jobs, reports = [], {}
    seen = {}  # (case, grader) -> [passes, fails] across all inputs, for --mixed
    for path in paths:
        label = os.path.splitext(os.path.basename(path))[0]
        d = json.load(open(path))
        for case in d["cases"]:
            if only_case and case["name"] != only_case:
                continue
            spec = {g["name"]: g for g in case["graders"] if g["type"] == "llm"}
            for arm, runs in case["arms"].items():
                if only_arm and arm != only_arm:
                    continue
                for i, run in enumerate(runs):
                    for g in run["graders"]:
                        if g["name"] in skip or g["name"] not in spec or "judgeVotes" not in g:
                            continue
                        seen.setdefault((case["name"], g["name"]), [0, 0])[0 if g["passed"] else 1] += 1
                        if only_failed and g["passed"]:
                            continue
                        if only_passed and not g["passed"]:
                            continue
                        cfg = spec[g["name"]]["config"]
                        rid = f"{label}-{case['name']}-{arm}-{i + 1}"
                        reports[rid] = g["evidence"]
                        jobs.append({
                            "id": f"{rid}-{g['name']}", "report": rid, "model_run": label,
                            "case": case["name"], "arm": arm, "run": i + 1, "grader": g["name"],
                            "criteria": cfg["criteria"], "focus": cfg.get("focus", "last_message"),
                            "harness_votes": g["judgeVotes"], "harness_verdict": sum(g["judgeVotes"]) > len(g["judgeVotes"]) / 2,
                        })
    if mixed:
        keep = {k for k, (p, f) in seen.items() if p and f}
        jobs = [j for j in jobs if (j["case"], j["grader"]) in keep]
    return jobs, reports


def write_md(out, results, model):
    done = [r for r in results if "verdict" in r]
    agree = sum(r["verdict"] == r["harness_verdict"] for r in done)
    lines = [f"# Judge reasoning\n",
             f"Re-judged with `{model}` (reasoning first, one vote) from the criterion and agent output stored by the harness. "
             f"**Not the harness judge's own thinking**; a reproduction. Agreement with the harness majority verdict: "
             f"**{agree}/{len(done)}**" + (f" ({100 * agree / len(done):.0f}%)" if done else "") + ".\n",
             "Reports the reasoning refers to are in `reports/`. Full data: `judgements.json`.\n"]
    dis = [r for r in done if r["verdict"] != r["harness_verdict"]]
    lines.append(f"## Disagreements with the harness ({len(dis)})\n")
    for r in dis:
        lines.append(f"### {r['id']}\nHarness: {'PASS' if r['harness_verdict'] else 'FAIL'} "
                     f"({''.join('P' if v else 'F' for v in r['harness_votes'])}) · reasoning judge: "
                     f"{'PASS' if r['verdict'] else 'FAIL'} · report: `reports/{r['report']}.md`\n\n{r['reasoning']}\n")
    fails = [r for r in done if not r["harness_verdict"] and r["verdict"] == r["harness_verdict"]]
    lines.append(f"## Failed checks where both agree ({len(fails)})\n")
    cur = None
    for r in sorted(fails, key=lambda r: (r["case"], r["grader"], r["model_run"], r["arm"], r["run"])):
        if (r["case"], r["grader"]) != cur:
            cur = (r["case"], r["grader"])
            lines.append(f"### {r['case']} / {r['grader']}\n")
        lines.append(f"- **{r['model_run']} · {r['arm']} · run {r['run']}** (`reports/{r['report']}.md`): {r['reasoning']}\n")
    errs = [r for r in results if "error" in r]
    if errs:
        lines.append(f"## Errors ({len(errs)})\n")
        lines += [f"- {r['id']}: {r['error']}\n" for r in errs]
    open(os.path.join(out, "JUDGEMENTS.md"), "w").write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results", nargs="+", help="`claude plugin eval --json` result files")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="opus")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--skip", nargs="*", default=[], help="grader names to leave out")
    ap.add_argument("--case")
    ap.add_argument("--arm", choices=["with", "without"])
    ap.add_argument("--only-failed", action="store_true", help="only graders the harness failed (cheapest useful subset)")
    ap.add_argument("--only-passed", action="store_true", help="only graders the harness passed (to look for false passes)")
    ap.add_argument("--mixed", action="store_true", help="only graders that both passed and failed somewhere in the inputs")
    ap.add_argument("--max-cost-usd", type=float, help="stop starting new judgements once this much has been spent")
    ap.add_argument("--limit", type=int, help="only the first N jobs (pilot)")
    a = ap.parse_args()

    jobs, reports = collect(a.results, set(a.skip), a.case, a.arm, a.only_failed, a.only_passed, a.mixed)
    if a.limit:
        jobs = jobs[:a.limit]
    os.makedirs(os.path.join(a.out, "reports"), exist_ok=True)
    for rid, text in reports.items():
        open(os.path.join(a.out, "reports", rid + ".md"), "w").write(text + "\n")

    jpath = os.path.join(a.out, "judgements.json")
    done = {r["id"]: r for r in json.load(open(jpath))["results"] if "verdict" in r} if os.path.exists(jpath) else {}
    todo = [j for j in jobs if j["id"] not in done]
    print(f"{len(jobs)} judgements, {len(done)} already done, {len(todo)} to run", file=sys.stderr)

    lock, results, models = threading.Lock(), dict(done), set()

    def dump():
        ordered = [results[j["id"]] for j in jobs if j["id"] in results]
        json.dump({"judge_model_requested": a.model, "judge_models_used": sorted(models),
                   "total_cost_usd": round(sum(r.get("cost_usd", 0) for r in ordered), 4), "results": ordered},
                  open(jpath, "w"), indent=1)

    def work(job):
        with lock:
            spent = sum(x.get("cost_usd", 0) for x in results.values())
        if a.max_cost_usd is not None and spent >= a.max_cost_usd:
            return  # over budget: left undone, so a rerun with a higher cap resumes here
        try:
            v, reasoning, cost, used = ask(PROMPT.format(criteria=job["criteria"], focus=job["focus"],
                                                          evidence=reports[job["report"]]), a.model)
            r = {**job, "verdict": v, "reasoning": reasoning, "cost_usd": cost}
            with lock:
                models.update(used)
        except Exception as e:  # keep going; failed jobs are retried on resume
            r = {**job, "error": str(e)}
        with lock:
            results[job["id"]] = r
            n = len(results) - len(done)
            if n % 10 == 0:
                dump()
                print(f"  {n}/{len(todo)}", file=sys.stderr)

    with cf.ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(work, todo))
    dump()
    ordered = [results[j["id"]] for j in jobs if j["id"] in results]
    write_md(a.out, ordered, a.model)
    ok = [r for r in ordered if "verdict" in r]
    print(f"done: {len(ok)} judged, {len(ordered) - len(ok)} errors, agreement "
          f"{sum(r['verdict'] == r['harness_verdict'] for r in ok)}/{len(ok)}, "
          f"cost ${sum(r['cost_usd'] for r in ok):.2f}, models {sorted(models)}", file=sys.stderr)


if __name__ == "__main__":
    main()

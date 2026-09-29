# claude-md-audit eval

Scored eval for the `claude-md-improver` skill (from `claude-md-management@claude-plugins-official`), run with `claude plugin eval`.

`claude plugin eval` only reads cases from inside the plugin folder, and `--eval-dir` can't be a dot-dir or absolute path. So this folder is a minimal local plugin: `skills/` holds a **vendored copy of the skill at v1.0.0**, and `evals/` holds the cases. Re-copy `skills/claude-md-improver/` when upstream updates.

Every case runs the same prompt ("Audit the CLAUDE.md files in this repo…") against a fixture repo that `fixture.sh` builds. Each case has llm graders (Opus judge) for known defects, plus these shared graders:
- **no-false-positives** (weight 2): fails a report that asserts something correct is broken.
- **scores-reported**: at least three `/100` scores (regex).
- **no-edit / no-write**: nothing is changed before the user approves (`tool_used`, max 0).
- **skill-fired**: whether the skill ran. It is only an indicator and doesn't count toward the score.

Defect graders require each defect to be *flagged as wrong*. A plain mention doesn't count; the earlier regex graders let a report that only quoted "Go 1.21" pass.

## Cases

**`planted-defects`**: the easy case. A toy Go + SvelteKit repo with six obvious defects: a missing dir, a missing make target, a wrong script name, a root-vs-backend contradiction, a dead link and a wrong Go version.

**`subtle-defects`**: defects that need cross-file reasoning or reading code:

| Grader | Defect |
|---|---|
| s1-port | doc says `/api` proxies to :3000; `vite.config.ts` says :8080 |
| s2-stale-prose-path | `internal/validate/` mentioned in prose; real dir `internal/core/validation/` |
| s3-renamed-constructor | `NewNoteRepo()` vs code's `NewNoteRepository()` |
| s4-script-name | `pnpm run check`; script is `typecheck` |
| s5-env-var | `DB_URL`; code reads `DATABASE_URL` |
| s6-node-version | root "Node 20", frontend "18+", `engines` `>=22` |

It also has traps that look wrong but are correct: `make db-reset` lives in an `include`d `mk/db.mk`, `test:e2e` exists, and the :8080 proxy is right.

**`real-repo-snapshot`**: this repo at pinned commit `276bf24` (`git archive`; project `.claude` hooks, settings and skills are stripped so only the plugin loads). Six defects in the real CLAUDE.md files, each verified against the code (R5, a CORS claim, was dropped: `CORS_ORIGINS` defaults to `*`, so the doc was right — it is now a false-positive trap):

| Grader | Defect |
|---|---|
| r1-missing-component | frontend tree lists `AGGridTest.svelte` (gone) |
| r2-prerender | `+layout.ts` "prerender = true"; it's `false` |
| r3-helpers-path | `adapters/graphql/helpers.go`; real path is under `resolvers/` |
| r4-migrate-contradiction | root forbids `make migrate-up`; backend Setup runs it |
| r6-go-versions | `go 1.25` / `golang:1.26-alpine`; really `go 1.26` / `golang:1.27-alpine` |
| r7-middleware-path | `internal/middleware/`; really `pkg/middleware/` (found by a Sonnet run) |

When the live CLAUDE.md files are fixed, keep the pin; the case measures the skill, not the docs. To refresh it, bump `PIN` in `fixture.sh` and re-verify every grader.

## Run

Prerequisites: in a Linux container, Bash needs the sandbox backend (`apt install bubblewrap socat`). The first run in a terminal asks you to trust this folder; `--trust-plugin` skips that prompt.

```bash
# from repo root; one model, all cases, 3 runs each (default), with the no-plugin baseline arm
claude plugin eval evals/claude-md-audit --model sonnet --judge-model opus \
  --scaffold --trust-plugin --allow-tools Bash Edit Write -j 2 --max-cost-usd 25
```

- `--scaffold` is required, because the fixtures are built by `fixture.sh`.
- `--allow-tools Bash` is required, because the skill's discovery step runs `find`.
- To compare models, run once each with `--model haiku|sonnet|opus`, adding `--output-dir` per model.
- `--case` takes one glob; repeating it keeps only the last.
- Results go to `evals/claude-md-audit/evals/results/` (gitignored).

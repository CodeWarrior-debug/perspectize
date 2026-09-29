# claude-md-audit eval

Scored eval for the `claude-md-improver` skill (from `claude-md-management@claude-plugins-official`), run with `claude plugin eval`.

`claude plugin eval` only reads cases from inside the plugin folder, and `--eval-dir` can't be a dot-dir or absolute path. So this folder is a minimal local plugin: `skills/` holds a **vendored copy of the skill at v1.0.0**, and `evals/` holds the cases. Re-copy `skills/claude-md-improver/` when upstream updates.

## Case: `planted-defects`

`fixture.sh` builds a small Go + SvelteKit monorepo whose three CLAUDE.md files contain six known defects:

| Grader | Defect | Type |
|---|---|---|
| d1-stale-path | `internal/handlers/` doesn't exist | regex |
| d2-missing-make-target | `make seed` not in Makefile | regex |
| d3-wrong-script | `pnpm run test:unit` (real: `test:run`) | regex |
| d4-contradiction | root forbids `make migrate-up`, backend setup runs it | llm |
| d5-dead-link | `.docs/DEPLOYMENT.md` missing | regex |
| d6-go-version | says Go 1.21, go.mod says 1.25 | regex |

Other graders:
- **scores-reported**: at least three `/100` scores (regex).
- **no-edit / no-write**: nothing is changed before the user approves (`tool_used`, max 0).
- **no-false-positives**: weight 2; the llm judge fails a report that calls something correct broken, such as the `make test` control.
- **skill-fired**: whether the skill ran. It is only an indicator and doesn't count toward the score.

Regex graders only check that the defect is *mentioned* in the report. The fixture puts each of those strings only in its defect's location, so a mention almost always means it was flagged.

## Run

Prerequisites: in a Linux container, Bash needs the sandbox backend (`apt install bubblewrap socat`). The first run in a terminal asks you to trust this folder; `--trust-plugin` skips that prompt.

```bash
# from repo root; one model, 3 runs, with the no-plugin baseline arm (default)
claude plugin eval evals/claude-md-audit --model sonnet --judge-model opus \
  --scaffold --trust-plugin --allow-tools Bash Edit Write --max-cost-usd 5
```

- `--scaffold` is required, because the fixture is built by `fixture.sh`.
- `--allow-tools Bash` is required, because the skill's discovery step runs `find`.
- To compare models, run once each with `--model haiku|sonnet|opus`, adding `--output-dir` per model.
- Results go to `evals/claude-md-audit/evals/results/` (gitignored).

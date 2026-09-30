# Test Hardening — Research Spike

**Status:** spike, not a superpowers plan
**Date:** 2026-09-29

> ⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

## Why

AI-generated tests are prone to being weak: they execute code without asserting on its behaviour, mirror the implementation, and use a single happy-path input. Line coverage rewards exactly that — a test with no meaningful assertion still "covers" every line it runs. CI here measures coverage only (`go test -coverprofile`, `vitest --coverage` with 75–80% thresholds), so a green, well-covered suite is weaker evidence than it looks.

Mutation testing is the direct check: change the code in a small way (flip `>` to `>=`, negate a condition, drop a statement) and see whether any test fails. A mutant no test notices ("LIVED" / "survived") marks behaviour that isn't actually verified.

## Done in this change (not spike scope)

- **Backend — Gremlins:** `backend/.gremlins.yaml`, `make mutate` (full, local) and `make mutate-diff` (changed lines vs `origin/main`).
- **Frontend — StrykerJS:** `frontend/stryker.config.json`, `frontend/vitest.config.stryker.ts`, `pnpm run mutate` (full, local) and `pnpm run mutate:incremental`.
- **CI:** `.github/workflows/mutation.yml` — report-only. PRs mutate only changed Go lines (Gremlins `--diff`, via `make mutate-diff`) and changed `src/lib/**/*.ts` files (Stryker `--mutate` + incremental cache). A full Stryker pass is ~3h+, so it is manual-only (`workflow_dispatch` on `main`, to seed the incremental cache) rather than on every push. No thresholds, so it cannot fail a PR yet. **Not yet exercised on GitHub** — the first PR run is the real test of the workflow.

## Baseline results

### Backend (Gremlins v0.6.0, full run, 2026-09-30) — valid

| | |
|---|---|
| Runnable mutants | 858 (+231 not covered by any test) |
| Killed | 749 |
| **Lived** | **100** |
| Timed out | 7 |
| Test efficacy (killed / killed+lived) | **88.2%** |
| Mutator coverage (mutants any test reaches) | 78.6% |
| Wall time | 1h 33m (3 workers, 4 cores) |

Where the 100 survivors are: `graphql/resolvers` 25 (18 in `helpers.go`), `core/services` 21 (`content_service.go` 9, `perspective_service.go` 8), `repositories/postgres` 19 (14 in `gorm_mappers.go`), `wikidata` 11, `realtime` 9, `youtube` 5, `core/domain` 3, `auth` 3, `config` 2, `directives` 2. By kind: 53 boundary (`>` vs `>=`), 38 negation, 4 arithmetic, 4 increment/decrement, 1 negative-inversion. Boundary and mapper survivors are the classic signature of tests that check the happy path but not edges or every mapped field. Six of the seven timeouts are in `realtime/hub.go` (a mutated condition turning a loop into a hang — expected, not a test gap by itself).

Two caveats: (1) `ComputeTag` and the Bible verse-ordinal logic read as under-tested only because their tests are on the `MUTATE_SKIP` list (finding 3b); (2) DB-backed tests were not run, so repository numbers reflect sqlmock tests only.

Spot-check of the verdicts: mutating `resolvers/helpers.go:70` (`len(c.Response) > 0` → `>= 0`) by hand left the full suite green, confirming that survivor is real.

Not covered (231 mutants) is a separate signal: code no test executes at all, e.g. most of `pkg/database` and `pkg/middleware/recovery.go`.

### Frontend (StrykerJS 10) — **no valid score yet**

The full pass (5,987 mutants across 100 files in `src/lib/**/*.ts`) did not finish: at the 2-hour cap of the environment it was running in, Stryker's own progress read ~56% with ~1h 28m remaining, i.e. roughly 3.3 hours on a 4-core machine. Stryker writes its report only at the end, so nothing was saved, and the mid-run counters (1,370 "survived" of 5,301 "tested", 1 timeout) include mutants Stryker resolves without running tests, so they are **not** a score and should not be quoted as one.

To get the baseline: run `pnpm run mutate` in `frontend/` on a dev machine (or a workflow_dispatch run in CI, timeout is 6h) and paste the numbers here. Splitting by directory with `--mutate 'src/lib/utils/**'` etc. is a way to fit shorter windows. What was verified: the setup works end to end (plugins load, the unmutated dry run passes, mutants execute).

## Findings that shape the rest of the work

These were found the hard way while getting the first full runs to produce trustworthy numbers. Two of them silently produced a "100% mutation score", so they are worth knowing before anyone changes the config.

1. **Tests live outside the code they test.** Most backend tests are in `backend/test/...` (external packages), and `internal/core/domain` has no test files of its own. Gremlins by default runs a mutant against only its own package's tests, which would report cross-package-covered mutants as LIVED. `integration: true` (whole suite per mutant) and `coverpkg` are required. Verified by hand: mutating `pkg/graphql/intid.go:35` passes `pkg/graphql`'s own tests and is killed only by `test/graphql`.
2. **`--test-cpu` breaks Gremlins v0.6.0 integration mode.** It passes `-cpu 1` as one argv element, so `go test` fails at setup with exit 1 — which Gremlins maps to KILLED. Result: 858/858 killed, 100% efficacy, in 16 seconds. **A run where nothing lives is a red flag, not a success** — sanity-check the first run with a hand-applied mutant.
3. **The per-mutant timeout is derived from the coverage-gathering run.** With Go's test cache warm that run takes ~1s, so every mutant (which needs the whole suite) TIMED OUT. Set `GOFLAGS=-count=1` (the Make targets do) and `timeout-coefficient: 5`.
3b. **Gremlins runs the suite in a copy of `backend/` only, so any test that reads outside it fails on every mutant.** Eight tests read repo-root files (`data/bible/…`, shared frontend fixtures) via `../../../` paths. In the sandbox copy they fail unmutated, every mutant is "killed" by that unrelated failure, and Gremlins reported 858/858 killed again — this time after a realistic 55-minute run, so timing alone did not give it away. `make mutate` / `make mutate-diff` now (a) run `make mutate-preflight` first — the unmutated suite in an isolated copy, which must be green — and (b) skip those eight tests via `GOFLAGS=-skip=…` (`MUTATE_SKIP` in the Makefile; CI uses the same targets). Cost: mutants only those tests would catch (notably `ComputeTag` and the Bible verse-ordinal logic) show as LIVED. Real fix, listed under options: make those tests hermetic.
4. **Local toolchain quirk:** an auto-downloaded Go toolchain (`toolchain go1.26.0` while the system Go is older) may lack `covdata`, which `-coverpkg` needs (`go: no such tool "covdata"`). Fix: `go build -o "$(go env GOROOT)/pkg/tool/$(go env GOOS)_$(go env GOARCH)/covdata" cmd/covdata`. CI's `setup-go` is unaffected.
5. **Flaky tests inflate the kill rate.** A test that fails for an unrelated reason counts as killing the mutant. The DB-backed tests are not safe to run concurrently (see the `-p 1` note in `ci.yml`), so the mutation runs deliberately have no `DATABASE_URL` and those tests skip. Repository code is therefore measured only through its sqlmock tests; a DB-backed mutation pass is an open question below.
6. **The frontend has no ESLint at all** (`golangci-lint` exists for Go; the frontend relies on `svelte-check` + Prettier). Any lint-based test-quality rule on the frontend means adopting ESLint first — that raises its cost from "enable a rule" to "introduce a linter".
7. **`golangci-lint` currently excludes `gocritic` on `_test.go` files and does not enable `testifylint`.**
8. **Adding Stryker churned `pnpm-lock.yaml`** (peer-dependency suffixes such as `(supports-color@7.2.0)` on `@babel/*` snapshot keys). No existing top-level version changed.
9. **Stryker under pnpm needs `plugins` declared explicitly.** It auto-discovers `@stryker-mutator/*` next to its own install, which pnpm's strict layout hides — symptoms are "Unknown stryker config option vitest" and "Cannot find Checker plugin".
10. **No TypeScript checker.** `@stryker-mutator/typescript-checker` runs plain `tsc`, which cannot resolve type exports from `.svelte` files (TS2614) and trips on existing `tests/browser` type errors; this repo type-checks with `svelte-check`. Without a checker, mutants that are type-invalid but run fine (Vitest strips types) can survive, so survivors are slightly overstated. Revisit if a `svelte-check`-based checker appears.
11. **Vitest's 5s default timeout aborts the Stryker dry run.** One heavy test (Bible verse-ordinal round-trip) passes in ~1s normally but exceeds 5s instrumented and alongside other runners; `vitest.config.stryker.ts` sets `testTimeout: 30_000`.
12. **Stryker's sandbox is a copy of `frontend/`, so tests that read repo-root files fail the dry run** — same class as finding 3b. `bibleVersion.test.ts` and `buildTag.test.ts` are excluded in `vitest.config.stryker.ts`; their mutants read as LIVED. Stryker's dry run is the preflight here (it aborts on any unmutated failure); the hermetic-tests option below removes both exclusion lists.

## Options not yet done

Ordered roughly by value for effort. Each is independent.

### 1. Close the loop with the test-writing agents (highest value)

`.claude/agents/test-writer.md` and `vitest-writer.md` say tests must "assert something meaningful", but nothing checks it. Add a step: after writing tests, run mutation testing scoped to the code under test (`gremlins unleash --diff`/a single path; `stryker run --mutate <file>`) and iterate until surviving mutants are killed or explicitly justified as equivalent. This turns the tool from a report into a repair loop, which is the "fixing" half of the original question.

Open questions: runtime budget per agent invocation (Gremlins ~seconds per mutant on this suite; Stryker `perTest` coverage is faster); whether to require zero LIVED or a threshold.

### 1b. Make the repo-root-reading tests hermetic

The eight Go tests skipped by `MUTATE_SKIP` (finding 3b) and the two frontend tests excluded from Stryker (finding 12) depend on files outside their module. Give them a copy under `backend/…/testdata` (or `go:embed` the JSON) with a test asserting the copy matches the repo-root original, so they run — and count — in mutation runs and in any build that only has `backend/` (the Docker build context is already `backend/`). Removes the skip list.

### 2. Lint rules for test smells

- **Go:** enable `testifylint` in `.golangci.yml` (wrong assertion, swapped expected/actual, `assert` where `require` is needed); reconsider the blanket `gocritic` exclusion for `_test.go`; `thelper`, `tparallel`. Cheap — config only, but expect a cleanup pass on existing tests.
- **Frontend:** `@vitest/eslint-plugin` (`expect-expect`, `no-conditional-expect`, `valid-expect`, `no-focused-tests`, `prefer-strict-equal`). Requires introducing ESLint (finding 6); alternatively a small grep-based check in CI for tests with no `expect(`. Decide whether the cost is worth it against option 1.

### 3. Property-based testing

Fixes "one happy-path input" tests for pure logic: cursor encode/decode round-trips, `IntID` parsing, sort-column whitelisting, `buildTag`/`versionInfo`, colour utilities. Go: `pgregory.net/rapid`; TS: `fast-check` (works under Vitest). Best applied to a handful of pure modules rather than repo-wide.

### 4. Gate CI once a baseline exists

Turn the report-only job into a gate: Gremlins `--threshold-efficacy` (and `--threshold-mcover`), Stryker `thresholds.break`. Recommend gating on **changed lines only** (already how CI runs) with a modest threshold, so legacy weak spots don't block unrelated PRs. Decide separately whether to also track the whole-repo score over time.

### 5. Widen what is mutated

- **Svelte components:** Stryker mutates `.svelte` script blocks but the TypeScript checker cannot check them, and template logic isn't mutated. Currently only `src/lib/**/*.ts` is in scope. Try it on the components with real logic (the `ThemeCustomizePanel`-style ones the coverage config already calls out).
- **DB-backed repositories:** run Gremlins against a throwaway local Postgres with a single worker (never the shared Sevalla database — see `backend/CLAUDE.md`, Migrations). Slow, but the repositories are where sqlmock tests are weakest.
- **Gremlins mutator set:** the default set is conservative. `--invert-logical`, `--invert-loopctrl` and `--remove-self-assignments` are opt-in and catch different weaknesses.
- **Gremlins `--exclude-files`:** revisit the exclusions in `.gremlins.yaml` (`cmd/`, `internal/perf/`) once the baseline is known.

### 6. Review checklist for AI-authored tests

A short checklist for PR review / the `code-reviewer` agent: is the unit under test itself mocked? does the test restate the implementation? is the only assertion "not nil" / "was called"? is there an error-path case? does a bug-fix test fail before the fix? Cheap, and complements the tooling — but subjective, so lower priority than options 1 and 4.

### 7. Other tools to evaluate

- Snapshot-test audit (Vitest snapshots that nobody reviews are a common way for AI tests to "pass" without checking behaviour).
- C# `Stryker.NET` is not relevant to this repo; noted only because the stack overlap came up.
- Go alternatives to Gremlins if it stalls (`go-mutesting`, `ooze`) — Gremlins v0.6.0 has the integration-mode rough edges above, so keep an eye on upstream fixes.

## Suggested order

1 → 4 → 2 (Go half) → 3 (a few modules) → 5 → 2 (frontend half) → 6.

## Open questions

- What is an acceptable mutation score for changed code, and is it the same for backend and frontend?
- Should equivalent mutants (changes with no observable behaviour) be suppressed in config (`// Stryker disable next-line`, Gremlins has no equivalent) or just tolerated?
- Is a scheduled full run (nightly/weekly, uploading the report) worth the CI minutes, given full runs are local-only today?

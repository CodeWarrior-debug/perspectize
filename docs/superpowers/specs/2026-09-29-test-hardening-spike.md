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
- **CI:** `.github/workflows/mutation.yml` — report-only. PRs mutate only changed Go lines (Gremlins `--diff`) and changed `src/lib/**/*.ts` files (Stryker `--mutate` + incremental cache); pushes to `main` refresh Stryker's incremental cache. No thresholds, so it cannot fail a PR yet.

## Baseline results

_Pending — the first valid full local runs (Gremlins, then Stryker) were still in progress when this draft was committed. This section is filled in once they finish._

## Findings that shape the rest of the work

These were found the hard way while getting the first full runs to produce trustworthy numbers. Two of them silently produced a "100% mutation score", so they are worth knowing before anyone changes the config.

1. **Tests live outside the code they test.** Most backend tests are in `backend/test/...` (external packages), and `internal/core/domain` has no test files of its own. Gremlins by default runs a mutant against only its own package's tests, which would report cross-package-covered mutants as LIVED. `integration: true` (whole suite per mutant) and `coverpkg` are required. Verified by hand: mutating `pkg/graphql/intid.go:35` passes `pkg/graphql`'s own tests and is killed only by `test/graphql`.
2. **`--test-cpu` breaks Gremlins v0.6.0 integration mode.** It passes `-cpu 1` as one argv element, so `go test` fails at setup with exit 1 — which Gremlins maps to KILLED. Result: 858/858 killed, 100% efficacy, in 16 seconds. **A run where nothing lives is a red flag, not a success** — sanity-check the first run with a hand-applied mutant.
3. **The per-mutant timeout is derived from the coverage-gathering run.** With Go's test cache warm that run takes ~1s, so every mutant (which needs the whole suite) TIMED OUT. Set `GOFLAGS=-count=1` (the Make targets do) and `timeout-coefficient: 5`.
4. **Local toolchain quirk:** an auto-downloaded Go toolchain (`toolchain go1.26.0` while the system Go is older) may lack `covdata`, which `-coverpkg` needs (`go: no such tool "covdata"`). Fix: `go build -o "$(go env GOROOT)/pkg/tool/$(go env GOOS)_$(go env GOARCH)/covdata" cmd/covdata`. CI's `setup-go` is unaffected.
5. **Flaky tests inflate the kill rate.** A test that fails for an unrelated reason counts as killing the mutant. The DB-backed tests are not safe to run concurrently (see the `-p 1` note in `ci.yml`), so the mutation runs deliberately have no `DATABASE_URL` and those tests skip. Repository code is therefore measured only through its sqlmock tests; a DB-backed mutation pass is an open question below.
6. **The frontend has no ESLint at all** (`golangci-lint` exists for Go; the frontend relies on `svelte-check` + Prettier). Any lint-based test-quality rule on the frontend means adopting ESLint first — that raises its cost from "enable a rule" to "introduce a linter".
7. **`golangci-lint` currently excludes `gocritic` on `_test.go` files and does not enable `testifylint`.**
8. **Adding Stryker churned `pnpm-lock.yaml`** (peer-dependency suffixes such as `(supports-color@7.2.0)` on `@babel/*` snapshot keys). No existing top-level version changed.

## Options not yet done

Ordered roughly by value for effort. Each is independent.

### 1. Close the loop with the test-writing agents (highest value)

`.claude/agents/test-writer.md` and `vitest-writer.md` say tests must "assert something meaningful", but nothing checks it. Add a step: after writing tests, run mutation testing scoped to the code under test (`gremlins unleash --diff`/a single path; `stryker run --mutate <file>`) and iterate until surviving mutants are killed or explicitly justified as equivalent. This turns the tool from a report into a repair loop, which is the "fixing" half of the original question.

Open questions: runtime budget per agent invocation (Gremlins ~seconds per mutant on this suite; Stryker `perTest` coverage is faster); whether to require zero LIVED or a threshold.

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

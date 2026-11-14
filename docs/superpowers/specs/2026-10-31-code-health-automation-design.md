⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

# Automated Code-Health Checks (Spaghetti Code & Folder Structure) — Design

**Date:** 2026-10-31
**Branch:** `chore/code-health-automation-spec` (spec only; implementation gets its own `chore/` branches, one per phase)
**Type:** chore
**Tracking issue:** none
**Status:** draft. Catalogs the available tools, records what the repo has today, and proposes a phased, ratcheted rollout. Decisions needing the owner are under **Open questions**.

## Problem

The repo has two stacks (Go hexagonal backend, SvelteKit frontend) and is largely written by AI agents across many parallel sessions. Nothing mechanical stops complexity, duplication, circular imports, layering violations or stray files from accumulating. Today the only guard is prose in CLAUDE.md files, which agents can miss and reviewers can't be expected to re-check on every PR.

Goal: make "spaghetti code" and "messy structure" **fail CI** for *new* regressions, without forcing a big-bang cleanup of existing code.

## Current state (verified 2026-10-31)

| Area | What exists | Gap |
|---|---|---|
| Go lint | `backend/.golangci.yml` (v2, `default: standard` + gocritic, revive, misspell, prealloc, unconvert, nilerr). `make lint` target. | **Not run in CI** (`.github/workflows/ci.yml` has no golangci step). No complexity, nesting, length, duplication or import-boundary linters. |
| Go duplication | `backend/.jscpd.json`, `make test-duplication` (manual). | Manual only; not in CI. |
| Frontend lint | `svelte-check` (`pnpm run check`), Prettier (`format:check`). | **No ESLint.** No complexity, cycle, dead-code or boundary checks. |
| Frontend duplication | `pnpm run test:duplication` (jscpd, HTML report). | Manual only; report, not a gate. |
| Structure | `frontend/STRUCTURE.md` (prose), CLAUDE.md "Cowork cleanup" note about `_tmp_*` files. | Nothing enforces naming, layering, file size or stray files. |
| Hotspots (informal) | Largest hand-written files: `frontend/src/lib/components/ActivityTable.svelte` (1,598 lines), `frontend/src/lib/utils/formatting.ts` (967), `grid-config.ts` (795), `gridUrlState.ts` (733); Go `resolvers/helpers.go` (930), `user_todo_service.go` (706). `generated.go` (23,468) and `models_gen.go` are generated and **must be excluded from every check**. | — |

## Goals / non-goals

**Goals**
1. A single CI job (or small set) that reports and then gates on complexity, nesting, function/file length, duplication, import cycles, layer violations, dead code and structure rules.
2. **Ratchet, don't big-bang:** existing violations are baselined; only new or worsened ones fail.
3. Architecture rules from `.docs/ARCHITECTURE.md` (hexagonal: domain imports nothing outward) become executable.
4. Every check runnable locally with one command per stack.

**Non-goals**
- Fixing the existing hotspots (separate refactor PRs, each informed by the reports this produces).
- Replacing the mutation-testing or query-budget gates.
- Adopting a hosted SaaS dashboard in the first pass (see Option catalog → deferred).

## Option catalog

Status key: **Adopt** = in the plan · **Adopt (exists)** = already present, just wire into CI · **Evaluate** = try, decide after a trial · **Defer** = documented, not now.

### A. Spaghetti code: Go (`backend/`)

| Tool / linter | Catches | Status |
|---|---|---|
| `golangci-lint` (runner) | Hosts all linters below; already configured | **Adopt (exists)** — wire into CI |
| `gocyclo` / `cyclop` | Cyclomatic complexity per function | **Adopt** (`cyclop`, with package average) |
| `gocognit` | Cognitive complexity (nesting-weighted, closer to "hard to read") | **Adopt** |
| `funlen` | Long functions (lines/statements) | **Adopt** |
| `nestif` | Deeply nested `if` chains | **Adopt** |
| `dupl` | Copy-pasted token sequences | **Evaluate** (overlaps jscpd; pick one) |
| `depguard` | Import allow/deny lists per path — the cheap way to enforce hexagonal layering | **Adopt** |
| `gocritic`, `revive` | General smells / style | **Adopt (exists)** — extend rule sets |
| `go-arch-lint` / `arch-go` | Declarative architecture file (components, allowed deps) with its own report | **Evaluate** (only if `depguard` rules get unwieldy) |
| `staticcheck`, `go vet` | Bugs, dead code (`unused`) | **Adopt (exists)** via `default: standard`; `go vet` already runs for perf tag |
| `godepgraph` / `go mod graph` | Package dependency visualization | **Defer** (one-off, on demand) |

### B. Spaghetti code: TypeScript / Svelte (`frontend/`)

| Tool | Catches | Status |
|---|---|---|
| ESLint (flat config) + `typescript-eslint` + `eslint-plugin-svelte` | Foundation for the rules below; none exists today | **Adopt** |
| Core rules `complexity`, `max-depth`, `max-lines`, `max-lines-per-function`, `max-params` | Size/complexity | **Adopt** |
| `eslint-plugin-sonarjs` (`cognitive-complexity`, `no-duplicate-string`, `no-identical-functions`) | Cognitive complexity, local duplication | **Adopt** |
| `eslint-plugin-boundaries` or `import/no-restricted-paths` | Layer rules inside `src/lib` | **Evaluate** (dependency-cruiser likely covers it) |
| ESLint bulk suppressions (`eslint --suppress-all`, ESLint ≥ 9.24) | Baseline file so only new violations fail | **Adopt** |
| `dependency-cruiser` | Circular imports, orphans, forbidden cross-layer imports, dependency graph | **Adopt** |
| `madge` | Circular imports only | **Defer** (subsumed by dependency-cruiser) |
| `knip` | Unused files, exports, dependencies, types | **Adopt** |
| `jscpd` | Cross-file duplication | **Adopt (exists)** — add threshold + CI gate |
| `svelte-check` | Svelte/TS type errors | **Adopt (exists)** — confirm it runs in CI |

### C. Cross-language and process

| Tool | Catches | Status |
|---|---|---|
| `scc` / `tokei` | LOC and complexity-per-file report; spot oversized files | **Adopt** as a report in the monthly-maintenance skill (it already measures LOC) |
| Churn × complexity hotspot analysis (`code-maat`, or a `git log --numstat` script joined with `scc`) | Files that are both complex and frequently changed — the real refactor priorities | **Evaluate** (one-off script; not a CI gate) |
| SonarCloud / SonarQube / CodeClimate / Codacy | Hosted complexity, duplication and trend dashboards | **Defer** (needs account + secrets; decide after local tooling shows value) |
| CodeQL | Security, not structure | Exists (`codeql.yml`); out of scope |

### D. Folder / file structure

| Mechanism | Catches | Status |
|---|---|---|
| `ls-lint` | File and directory naming conventions per path (e.g. `+page.svelte`, `*.test.ts`, kebab/camel/Pascal by folder) | **Adopt** |
| `dependency-cruiser` / `depguard` rules | "Folder X may not import folder Y" | **Adopt** (same configs as sections A/B) |
| `knip` + `jscpd` | Orphaned and duplicated files | **Adopt** (same as above) |
| Custom `scripts/check-structure.mjs` | Repo-specific rules: no `_tmp_*` / transcript `.txt` files in repo root or `frontend/` (see CLAUDE.md "Cowork session cleanup"), max files per directory, max lines per hand-written file, no committed build artifacts | **Adopt** |

## Design

### Principle: ratchet

1. Turn each check on in **report-only** mode and capture the baseline.
2. Commit the baseline (suppression file / `--ignore-known` file / `new-from-rev`).
3. Gate CI on *new or worsened* violations only.
4. Burn the baseline down opportunistically; never let it grow without a reviewed reason.

Baseline mechanisms per tool:

| Tool | Baseline mechanism |
|---|---|
| golangci-lint | `issues.new-from-rev: origin/main` (verify v2 key name against current docs when implementing) so only code changed in the PR is judged |
| ESLint | `eslint-suppressions.json` via `--suppress-all`; `--prune-suppressions` shrinks it |
| dependency-cruiser | `.dependency-cruiser-known-violations.json` via `--ignore-known` |
| knip | Fix or list in `knip.json` `ignore*`; start with `--no-exit-code` until clean |
| jscpd | Set `threshold` just above current duplication % |
| ls-lint / check-structure | Fix on first run (small surface); no baseline expected |

### Exclusions (all tools)

Generated and vendored code is never linted: `backend/internal/adapters/graphql/generated/**`, `**/models_gen.go`, `frontend/src/lib/**/generated*` (confirm GraphQL codegen output paths), `node_modules`, `ios/`, `android/`, `static/`, build output. Tests get relaxed `funlen`/`dupl` limits (table-driven tests are legitimately long).

### Architecture rules to encode

From `.docs/ARCHITECTURE.md` / `.docs/DOMAIN_GUIDE.md` (confirm exact wording during implementation):

- `internal/core/domain` imports nothing from `ports`, `services`, `adapters`, GORM, gqlgen or HTTP packages.
- `internal/core/ports` imports only `domain`.
- `internal/core/services` imports `domain` and `ports`, never `adapters`.
- `internal/adapters/*` may import `core`, but adapters must not import each other (e.g. `graphql` ↛ `repositories`) except through ports; wiring happens in `cmd/` or `internal/server`.
- Frontend: `lib/utils` and `lib/data` do not import from `lib/components` or `routes`; `lib/components` do not import from `routes`; no import cycles anywhere.

### Initial thresholds (starting point; tune after the baseline run)

| Metric | Go | TS/Svelte |
|---|---|---|
| Cyclomatic complexity / function | 15 | 15 |
| Cognitive complexity / function | 20 | 20 |
| Function length | 80 lines / 50 statements | 100 lines |
| Nesting depth | `nestif` complexity 5 | `max-depth` 4 |
| File length (hand-written) | 600 lines | 500 lines (components), 600 (utils) |
| Params / function | — | 5 |
| Duplication | jscpd threshold = current + 0.5 pt | same |

Thresholds are deliberately set so the baseline run flags the real hotspots (those listed above) rather than hundreds of files.

### CI shape

New workflow `.github/workflows/code-health.yml` (separate from `ci.yml` so it can be non-required at first), with path filters for `backend/**` and `frontend/**`, three jobs: `go-lint`, `frontend-lint`, `structure`. Phase 1 jobs use `continue-on-error: true`; the final phase removes it and adds the jobs to required checks (owner action in branch protection).

### Local entry points

- `backend/`: `make lint` (existing, now expanded), `make test-duplication` (existing).
- `frontend/`: `pnpm run lint`, `pnpm run lint:deps` (dependency-cruiser), `pnpm run lint:unused` (knip), `pnpm run test:duplication` (existing).
- Repo root: `node scripts/check-structure.mjs` and `npx ls-lint`.
- One docs page, `.docs/CODE_HEALTH.md`, lists the commands, thresholds, and how to update a baseline. CLAUDE.md gets a one-line pointer plus the Self-Verification step "run lint for the stack you touched".

## Implementation plan

Each phase is its own PR. Run the stack's tests and build before each (CLAUDE.md Self-Verification). Phases 1–3 are independent after Phase 0 and can run in parallel worktrees.

**Phase 0: Wire up what already exists**

1. Add a `go-lint` job running `golangci-lint` (pin the version and use `golangci/golangci-lint-action`) to the new `code-health.yml`, non-blocking. Record the current number of findings in the PR body.
2. Fix or explicitly suppress anything it reports today so the job starts green.
3. Add `svelte-check` (`pnpm run check`) and `prettier --check` to the `frontend-lint` job if `frontend-test.yml` doesn't already run them (verify first; don't duplicate).

**Phase 1: Go complexity, size and layering**

4. Extend `backend/.golangci.yml`: enable `cyclop`, `gocognit`, `funlen`, `nestif`, `depguard`; set thresholds from the table above. Keep the generated-file and `_test.go` exclusions.
5. Run report-only; list the top offenders in the PR.
6. Write `depguard` rules for the architecture section. Run them; if the codebase already violates a rule, decide per violation (fix, baseline, or amend the rule with the owner).
7. Set `issues.new-from-rev: origin/main` so the job gates on new code only.
8. Decide `dupl` vs `jscpd` for Go (Open question 3); add the winner to CI with a threshold.
9. Flip `go-lint` to blocking in this PR once green.

**Phase 2: Frontend lint foundation**

10. Add ESLint (flat config), `typescript-eslint`, `eslint-plugin-svelte`, `eslint-plugin-sonarjs` as devDependencies; add `pnpm run lint`. Start with the recommended rule sets only; confirm the existing code passes or baseline it.
11. Add the complexity/size rules from the threshold table.
12. Generate the baseline with `eslint --suppress-all`; commit `eslint-suppressions.json`; add `--prune-suppressions` guidance to `.docs/CODE_HEALTH.md`.
13. Add the `frontend-lint` CI job (non-blocking, then blocking in the same PR once the baseline makes it green).

**Phase 3: Frontend dependencies and dead code**

14. Add `dependency-cruiser` with rules: no cycles, no orphans (excluding entry points and route files), and the layer rules from the architecture section. Generate and commit the known-violations baseline. Add `pnpm run lint:deps`.
15. Add `knip` configured for SvelteKit (entry points: routes, hooks, `vite.config.ts`, test files). Run report-only, triage (delete dead code in a separate PR, not in this one), then gate.
16. Raise the existing `jscpd` run to a gate: set `threshold` from current output, keep `--min-lines 3 --min-tokens 25` or tune after review, and exclude generated code.

**Phase 4: Structure checks**

17. Add `ls-lint` config (`.ls-lint.yml`) covering `frontend/src` (route files, components, tests) and `backend` naming (snake_case Go files, `_test.go` suffix); fix the small number of expected violations.
18. Write `scripts/check-structure.mjs` (no `_tmp_*` or transcript `.txt` in repo root or `frontend/`; max hand-written file length per the table, excluding generated; optional max files per directory). Add a unit test (`node --test`, following `.github/scripts/migration-labels.test.js`).
19. Add the `structure` CI job.

**Phase 5: Reporting and hotspot triage**

20. Add `scc` size/complexity output to the monthly-maintenance skill's measurement step.
21. Write a one-off hotspot script (git churn × scc complexity), run it once, and file the ranked list as input for refactor intents (e.g. `ActivityTable.svelte`, `formatting.ts`, `resolvers/helpers.go`). This is analysis only; no refactors in this spec.

**Phase 6: Documentation and enforcement**

22. Write `.docs/CODE_HEALTH.md` (commands, thresholds, baselines, how to ratchet).
23. Add a one-line pointer in root `CLAUDE.md` and a "run the lint for the stack you touched" step to Self-Verification; add stack-specific notes to `backend/CLAUDE.md` and `frontend/CLAUDE.md`. Update `.docs/HOOKS.md` if a pre-commit hook is extended.
24. Ask the owner to mark the new jobs as required in branch protection (cannot be done from a session). Check after one week that no baseline growth slipped in.

## Verification

- Each phase: stack build and tests pass (`go build ./...`, `gofmt -l .`, `go test ./...`, `pnpm run test:run`).
- **Prove each gate fails:** for every new check, introduce one deliberate violation on a scratch branch (a 20-branch `if` ladder, a cross-layer import, a circular import, an unused export, a `_tmp_x.txt` file), confirm CI goes red, then remove it. A gate that was never seen failing is not trusted (same principle as the mutation-testing rule in CLAUDE.md).
- Confirm generated files are not linted (run with `--verbose`/debug and check the file list).
- Record before/after counts (findings, baseline size, duplication %) in each PR body.

## Risks

| Risk | Mitigation |
|---|---|
| Baseline files become a dumping ground | CI check that fails if a baseline file grows without the PR carrying a `baseline-growth-approved` label; prune guidance in the docs |
| Thresholds too tight and agents suppress rather than refactor | Start loose, tighten per quarter; suppressions need a `//nolint:xxx // reason` / `eslint-disable-next-line -- reason` comment (enforce via `nolintlint` and `eslint-comments/require-description`) |
| False positives from Svelte syntax in ESLint / knip | Pin plugin versions; trial on a branch before gating; knip entry-point config reviewed against `svelte.config.js` |
| CI time grows | Path filters; run lint jobs in parallel with tests; cache Go and pnpm |
| `new-from-rev` misses issues in renamed or heavily edited files | Acceptable for ratchet; the monthly report catches whole-repo trends |

## Open questions

1. **Blocking from day one, or non-blocking for a trial period?** Plan assumes a short non-blocking trial per phase, then blocking.
2. **Hosted dashboard (SonarCloud etc.) now or later?** Plan defers it; it adds trend graphs but needs an account and a CI secret.
3. **Go duplication: `dupl` vs the existing `jscpd` config?** Running both is redundant; pick one.
4. **Are the proposed thresholds acceptable?** The first report-only run will show how many files each exceeds; the owner may prefer to start looser.
5. **Test files:** relax limits (proposed) or exempt them entirely from complexity and length checks?
6. **Architecture rules:** is the proposed layering (adapters may not import each other) the intended rule, or are some adapter-to-adapter imports legitimate today? The first `depguard` run will answer this.

# App Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans **in the main session** (teaching mode: the owner is quizzed between tasks; subagents can't talk to the owner). Task 5 dispatches writer/verifier subagents from the main session; every other task runs in the main session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Jeeves's rung-1 knowledge: a task-oriented, code-verified app guide in `ai-tooling/appguide/guide/`, a Go package that loads and lints it, eval seed questions, and CI coverage. It's produced by a closed writer → lint → verifier loop.

**Architecture:** New Go module `ai-tooling/` (sibling to `backend/`, no dependency on it, no LLM SDK yet). Package `appguide` embeds the Markdown guide with `go:embed`, parses it into `Area`/`Entry` structs, and runs deterministic lint rules. A test lints the real guide, so CI fails on any format or source-path problem. Content is written by Sonnet 5 subagents, one area each, and checked by independent Sonnet 5 verifier subagents against the frontend code.

**Tech Stack:** Go 1.26 (match `backend/go.mod` toolchain), stdlib + `github.com/stretchr/testify` (repo test convention), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-26-app-guide-design.md`. Read it alongside this plan; this plan doesn't re-justify its decisions.

## Global Constraints

- Branch: `claude/jeevesbot-plan-overview-i8cdx2` (session-designated).
- No chained shell commands (`&&`); one command per Bash call (root `CLAUDE.md`).
- No `backend/` changes in this plan.
- Guide content describes only what exists in `frontend/` today.
- Each writer and verifier subagent: model `sonnet`, one area, returns a summary of at most about 200 words, stays under about ⅓ of its context window, and returns a split proposal instead of overrunning.
- Round cap: at most 3 writer↔verifier rounds per area, then escalate to the owner.
- **Teaching mode:** after each task, run its `Learn` block with the owner (quiz, comment on answers, update `ai-tooling/LEARNING.md`) before starting the next task. If the owner says "skip teaching", skip for that task only.

---

## File Structure

- Create: `ai-tooling/go.mod`, `ai-tooling/go.sum`
- Create: `ai-tooling/appguide/appguide.go` (types + `Load`/`Parse`)
- Create: `ai-tooling/appguide/lint.go` (`Lint`)
- Create: `ai-tooling/appguide/appguide_test.go` (parser + lint rule unit tests, fixture strings)
- Create: `ai-tooling/appguide/guide_test.go` (lints the real embedded guide)
- Create: `ai-tooling/appguide/guide/README.md` (format/style rules + area index)
- Create: `ai-tooling/appguide/guide/<area>.md` × 9 (Task 4 pilot + Task 5)
- Create: `ai-tooling/appguide/seeds/<area>.json` × 9
- Modify: `.github/workflows/ci.yml` (new `ai-tooling` job)
- Modify: `.hooks/pre-commit` (gofmt glob)
- Modify: `CLAUDE.md` (verification checklist), `ai-tooling/CLAUDE.md` (status line)

---

## Task 1: Module skeleton + `appguide` parser (TDD)

**Files:** `ai-tooling/go.mod`, `ai-tooling/appguide/appguide.go`, `ai-tooling/appguide/appguide_test.go`

- [x] **Step 1: Create the module**

Run from `ai-tooling/`: `go mod init github.com/CodeWarrior-debug/perspectize/ai-tooling`. Then edit `go.mod` so its `go` and `toolchain` lines match `backend/go.mod` (`go 1.26`, `toolchain go1.26.0`).

- [x] **Step 2: Write failing parser tests** in `appguide_test.go` (package `appguide`):

```go
const sampleArea = "# Compare Perspectives\n\n" +
	"**Route:** /compare\n" +
	"**Summary:** Put two perspectives side by side.\n\n" +
	"## compare.pick-two\n" +
	"**Task:** Compare two perspectives\n" +
	"**Where:** Compare page → picker row\n" +
	"**Steps:**\n1. Open **Compare**.\n2. Pick two perspectives.\n" +
	"**Not supported:** More than two at once.\n" +
	"**Sign-in required:** yes\n" +
	"**Source:** `frontend/src/routes/compare/+page.svelte`\n"

func TestParseArea(t *testing.T) {
	a, err := ParseArea("compare", []byte(sampleArea))
	require.NoError(t, err)
	assert.Equal(t, "Compare Perspectives", a.Title)
	assert.Equal(t, "/compare", a.Route)
	require.Len(t, a.Entries, 1)
	e := a.Entries[0]
	assert.Equal(t, "compare.pick-two", e.ID)
	assert.Equal(t, []string{"Open **Compare**.", "Pick two perspectives."}, e.Steps)
	assert.Equal(t, "More than two at once.", e.NotSupported)
	assert.Equal(t, "yes", e.SignIn)
	assert.Equal(t, []string{"frontend/src/routes/compare/+page.svelte"}, e.Sources)
}
```

Add cases for: multiple entries, missing optional fields, a multi-path `Source` line, and CRLF line endings.

- [x] **Step 3: Run the tests, confirm they fail** (`go test ./appguide/...`; expect undefined `ParseArea`). Run `go get github.com/stretchr/testify` first.

- [x] **Step 4: Implement `appguide.go`:**

```go
// Package appguide loads Jeeves's task-oriented app guide and lints it.
package appguide

import "embed"

//go:embed guide/*.md seeds/*.json
var files embed.FS

type Area struct {
	Slug, Title, Route, Summary string
	Entries                     []Entry
}

type Entry struct {
	ID, Task, Where, NotSupported, Notes, SignIn string
	Steps, Sources                                []string
}

type Seed struct {
	Question     string   `json:"question"`
	ExpectIDs    []string `json:"expect_ids"`
	MustNotClaim []string `json:"must_not_claim"`
}

// ParseArea parses one area file. slug is the filename without ".md".
func ParseArea(slug string, src []byte) (Area, error) { /* line scanner: "# " title, "**Route:**", "**Summary:**", "## " starts entry, "**Field:**" lines, numbered steps after "**Steps:**", Source paths = backticked segments */ }

// Load parses every embedded area (all guide/*.md except README.md) and seed file.
func Load() ([]Area, map[string][]Seed, error) { /* ... */ }
```

Keep the parser a simple line scanner: no Markdown library. Unknown `**Field:**` lines are kept for lint to flag.

- [x] **Step 5: Run the tests, confirm they pass. Run `gofmt -l .` and expect no output.**

- [x] **Step 6: Commit:** `feat(ai-tooling): add appguide parser`

**Deviation (recorded during execution):** `go:embed` fails to compile when a glob matches nothing, so the package embeds the `guide` and `seeds` directories (each holds a README that `Load` skips) instead of `guide/*.md seeds/*.json`. Unknown `**Field:**` names are captured in `Entry.Unknown` / `Area.Unknown` for Task 2 lint.

**Learn:**
- *Concepts:* Go modules in a monorepo (why a separate `go.mod`); `go:embed` and why it can't use `..`; parsing a constrained format instead of arbitrary Markdown.
- *Reading (~10 min):* the `embed` package docs at pkg.go.dev/embed. Focus on the pattern rules and what's forbidden.
- *Quiz:* (1) Why does the guide live under `appguide/guide/` rather than `ai-tooling/app-guide/`? (2) What would break if `backend/` tried to import a package under `backend/internal/` from `ai-tooling/`, and how is that different from `backend` importing `ai-tooling`?

---

## Task 2: Lint rules (TDD)

**Files:** `ai-tooling/appguide/lint.go`, `ai-tooling/appguide/appguide_test.go`

- [x] **Step 1: Write failing table-driven tests** for each rule in spec §Deterministic lint. Each case is an input area/seeds plus the expected rule name:

| Case | Expected rule |
|---|---|
| Missing `**Route:**` | `area-header` |
| ID `Compare.PickTwo` | `id-format` |
| ID `activity.x` in `compare.md` | `id-prefix` |
| Duplicate ID across two areas | `id-unique` |
| Entry with no Steps | `required-field` |
| `Sign-in required: maybe` | `sign-in-value` |
| Source path that doesn't exist | `source-exists` |
| Seed `expect_ids` names an unknown ID | `seed-ref` |
| Area with 2 seeds, or no `must_not_claim` seed | `seed-coverage` |
| Unknown `**Field:**` | `unknown-field` |
| Valid area + seeds | no problems |

```go
type Problem struct{ File, EntryID, Rule, Message string }

// Lint checks areas and seeds; repoRoot is used to resolve Source paths.
func Lint(areas []Area, seeds map[string][]Seed, repoRoot string) []Problem
```

For `source-exists` tests, use `t.TempDir()` as `repoRoot` and create the files the test expects.

- [x] **Step 2: Run, confirm failing. Implement `lint.go`. Run, confirm passing. `gofmt -l .` shows no output.**

- [x] **Step 3: Commit:** `feat(ai-tooling): add appguide lint rules`

**Additions (recorded during execution):** rule `seed-orphan` (a seed file with no matching area); `source-exists` also rejects absolute paths and paths escaping the repo root (`../`); `id-prefix` is skipped when `id-format` already failed, so one bad ID yields one problem.

**Learn:**
- *Concepts:* deterministic checks versus model-based checks; why the cheap objective gate runs first in a closed loop.
- *Quiz:* (1) Which lint rule most directly protects future evals, and why? (2) Name one guide error lint can't catch that the verifier can.

---

## Task 3: Guide README, owner's first entry, real-guide test, CI + hook

**Files:** `ai-tooling/appguide/guide/README.md`, `ai-tooling/appguide/guide/settings.md` (one entry), `ai-tooling/appguide/seeds/settings.json` (placeholder seeds), `ai-tooling/appguide/guide_test.go`, `.github/workflows/ci.yml`, `.hooks/pre-commit`, `CLAUDE.md`

- [x] **Step 1: Write `guide/README.md`**: the entry format, field-rule table and style rules copied from the spec, plus an area index table (slug → title → status). This is also the writers' brief.

- [ ] **Step 2: 🧑‍💻 Owner implements** *(deferred: the owner asked to keep building without waiting. `settings.change-theme` is reserved for the owner; tracked in `ai-tooling/LEARNING.md` → Pending)* one entry in `guide/settings.md` (for example, changing the theme). Claude supplies only the area header and points to `SettingsDialog.svelte` / `theme/`. The owner reads the code, writes the entry, and adds 3 seeds to `seeds/settings.json` (including one trap). Claude then reviews it against the format and the code, commenting like a PR reviewer.

- [x] **Step 3: Write `guide_test.go`:**

```go
func TestEmbeddedGuideIsClean(t *testing.T) {
	areas, seeds, err := Load()
	require.NoError(t, err)
	problems := Lint(areas, seeds, filepath.Join("..", ".."))
	for _, p := range problems {
		t.Errorf("%s %s [%s] %s", p.File, p.EntryID, p.Rule, p.Message)
	}
}
```

Run it. It must pass with the owner's single entry.

- [x] **Step 4: CI job.** Add to `.github/workflows/ci.yml`:

```yaml
  ai-tooling:
    name: AI Tooling
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai-tooling
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-go@v7
        with:
          go-version-file: ai-tooling/go.mod
          cache-dependency-path: ai-tooling/go.sum
      - run: go build ./...
      - name: Verify formatting
        run: |
          if [ -n "$(gofmt -l .)" ]; then gofmt -l .; exit 1; fi
      - run: go test ./...
```

The source-path lint needs `frontend/` present; `actions/checkout` provides the whole repo.

- [x] **Step 5: Hook.** In `.hooks/pre-commit`, change `-- 'backend/*.go'` to `-- 'backend/*.go' 'ai-tooling/*.go'`.

- [x] **Step 6: Root `CLAUDE.md`.** In the Self-Verification checklist, add: "**AI tooling**: `go build ./...`, `gofmt -l .`, `go test ./...` in `ai-tooling/`." Update the `ai-tooling/CLAUDE.md` status line to "Phase 25 in progress: app guide."

- [x] **Step 7: Commit:** `feat(ai-tooling): real-guide lint test, CI job, and pre-commit gofmt`

**Deviation:** Task 3 ran before the owner's entry existed, so the real-guide test passes with zero areas. The settings writer (Task 5) must leave `settings.change-theme` for the owner. CI job also runs `go vet` and `-race`. Hooks activated in-session with `git config core.hooksPath .hooks`.

**Learn:**
- *Concepts:* writing for a model reader (exact labels, "Not supported", stable IDs); how a CI gate turns the guide into something enforced rather than a document people hope stays right.
- *Reading (~10 min):* Anthropic docs on reducing hallucinations (docs.claude.com → "Reduce hallucinations" in the prompt-engineering / test-and-evaluate guides). Focus on grounding in provided documents and letting the model say "I don't know".
- *Quiz:* (1) Why include "Not supported" lines at all? What would Jeeves do without them? (2) Review your own entry: which claim would a verifier check first, and against which file?

---

## Task 4: Pilot the closed loop on one area (owner watches)

**Area:** `compare` (small and self-contained). Run this pilot before fanning out.

- [ ] **Step 1: Dispatch a writer.** Agent tool, `subagent_type: general-purpose`, `model: sonnet`. Prompt (template, reused in Task 5):

  > You are writing one area of Perspectize's app guide for an AI assistant. Read `ai-tooling/appguide/guide/README.md` (format and rules; follow them exactly) and `guide/settings.md` (an example). Area: `{slug}`, starting files: `{files from the spec table}`. Read the code and anything it imports that renders UI. Write `ai-tooling/appguide/guide/{slug}.md` covering every user-facing task in this area, and `ai-tooling/appguide/seeds/{slug}.json` (3–5 seeds, at least one trap). Only describe what the code does today. If you can't confirm something from code, leave it out and list it under "unconfirmed" in your reply. If the area is too big (you expect more than ~15 entries or you're getting deep into context), stop and return a split proposal instead. Don't commit. Don't chain shell commands. Reply in 200 words or fewer: entries written (IDs), unconfirmed items, anything surprising.

- [ ] **Step 2: Lint gate.** The controller runs `go test ./appguide/...` in `ai-tooling/`. Any problems go back to the same writer (SendMessage) with the exact problem list.

- [ ] **Step 3: Dispatch an independent verifier.** A fresh agent, `model: sonnet`. Use `subagent_type: gsd-doc-verifier` if its input contract fits (read `.claude/agents/gsd-doc-verifier.md` first); otherwise `general-purpose` with this prompt:

  > Independently verify `ai-tooling/appguide/guide/{slug}.md` and `seeds/{slug}.json` against the Perspectize frontend code. You have not seen how they were written. For every entry, check route, Where, each Step (including **bold** UI labels), Not supported and Sign-in required against the Source files and what they import. For each entry return `pass` with the file:line evidence, or `fail` with the specific wrong or unsupported claim. For seeds, check that the trap really is unsupported and that `expect_ids` are the right entries. Don't edit files. Return JSON: `{"entries":[{"id","verdict","evidence_or_reason"}],"seeds":[{"question","verdict","reason"}]}` followed by at most 100 words of summary.

- [ ] **Step 4: Feedback loop.** Send failures to the writer, then re-lint and re-verify with a *fresh* verifier each round. Stop at all-pass (done) or after 3 rounds (escalate: show the owner the open disagreements and let them decide).

- [ ] **Step 5: Owner review of the pilot.** Show the owner the final `compare.md`, the verifier JSON, and round count. Tune the writer or verifier prompt if the pilot exposed gaps (record the changes in this plan).

- [ ] **Step 6: Commit:** `docs(ai-tooling): app guide — compare area`

**Learn:**
- *Concepts:* closed loop versus open loop versus a loop that never finishes (the owner's shaky spot, see `LEARNING.md`); verifier independence; context discipline in practice (look at how little the controller kept).
- *Quiz:* (1) In this pilot, what exactly was the completion condition, and who decided it was met? (2) Why a *fresh* verifier each round instead of reusing the first? (3) If round 3 still failed, what happens, and why not keep looping?

---

## Task 5: Fan out the remaining areas

> **Paused (tracer bullets, decision 12):** runs after Tracer 1 (`docs/superpowers/plans/2026-09-26-tracer-1-plan.md`) is working end to end, so format lessons from the tracer land before 8 more areas are written.

**Areas:** `getting-started`, `activity`, `adding-content`, `perspectives`, `bible`, `discover`, `messaging`, `settings` (complete the owner's file with its remaining entries; keep the owner's entry intact).

- [ ] **Step 1:** Run the Task 4 loop per area with the tuned prompts. Up to 3 writers at once, with verifiers dispatched as each writer's lint passes.
- [ ] **Step 2:** Keep a status table in the main session (area → rounds → lint → verifier → done/escalated) and show it to the owner after each batch of 3.
- [ ] **Step 3:** Handle split proposals: accept by creating the new slugs (update the README index), or reject with guidance.
- [ ] **Step 4:** Commit per area: `docs(ai-tooling): app guide — {slug} area`.

**Learn (after each batch of 3, rotating concepts):**
- *Quiz examples:* "The `activity` writer returned a split proposal. What problem does that rule prevent?" "Pick one seed trap from this batch. What would a hallucinating Jeeves say, and how would the eval catch it?" "How many API calls would Jeeves make to answer a seed that needs two guide lookups in separate rounds?" (re-quizzes the shaky agent-loop concept).

---

## Task 6: Phase checkpoint

- [ ] **Step 1: Verification** (report actual output): in `ai-tooling/`, run `go build ./...`, `gofmt -l .` (expect empty) and `go test ./...` (all pass, including `TestEmbeddedGuideIsClean`). Also run `grep -rn "app-guide/" --include=*.md .` to find stale path references to the old folder name and fix any.
- [ ] **Step 2: Owner spot-check (local session only).** The owner opens one area in the running app and follows two entries step by step. Cloud sessions skip this and hand it back.
- [ ] **Step 3: `graphify update .`**
- [ ] **Step 4: Phase review quiz** (5 questions spanning Tasks 1–5, weighted to `LEARNING.md` "shaky" rows), then update `LEARNING.md`.
- [ ] **Step 5: Re-plan the rest of Phase 25** (progressive discovery): record what the loop taught (average rounds, common verifier failures, entry count, guide token size) in `ai-tooling/CLAUDE.md` under a "Phase 25 learnings" heading. Those numbers feed the next plan (loader, tools, `botler`, evals).
- [ ] **Step 6: Commit:** `docs(ai-tooling): app guide phase checkpoint`

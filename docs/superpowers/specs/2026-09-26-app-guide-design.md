# App Guide (Jeeves Knowledge, Rung 1) — Design

**Status:** Approved for planning (2026-09-26)
**Milestone:** v1.2 Jeeves AI Assistant — first deliverable of Phase 25
**Plan:** `docs/superpowers/plans/2026-09-26-app-guide-plan.md`
**Context:** `ai-tooling/CLAUDE.md` (locked decisions, teaching mode)

## Problem

Jeeves's first capability is answering how-to questions ("How do I compare two perspectives?"). A model with no grounding will invent features and steps, which is the main risk on this first rung. Jeeves needs a small, accurate, task-oriented description of what the app actually does, written in a form that:

- the model can load in slices (per page or per topic) instead of all at once (token budget)
- evals can point at ("the answer should come from `compare.pick-two`")
- a verifier can check against the frontend code, and can re-check as the UI changes

## Goals

1. A task-oriented app guide covering every user-facing area of the current frontend.
2. Every entry is traceable to source files and verified against the code by an independent agent.
3. A Go package that loads and lints the guide: deterministic checks that CI runs and the writing loop uses.
4. Eval seed questions per area, ready for the eval harness later in Phase 25.

## Non-goals

- Loading the guide into a model, the agent loop, or any Claude API calls (later Phase 25 tasks).
- Documenting planned or unfinished features. Only what ships in `frontend/` today.
- Admin/dev-only tooling, and backend-only behavior with no UI.
- Human-facing help pages. The format keeps that possible later, but it's not built now.

## Learning objectives (teaching mode)

By the end, the owner can explain:

- why grounding knowledge beats relying on model memory, and what "hallucinated features" look like
- why the guide is split into small entries with stable IDs (scoped loading, eval targets)
- what makes the writing loop *closed*: independent verifier, objective ground truth (code), a feedback path, and a round cap with escalation
- why deterministic checks (lint) run before model-based checks (verifier)
- `go:embed` and its "no `..` paths" rule (why the guide lives inside the Go package directory)
- context discipline: one area per fresh subagent, with results summarized back

## Design

### Location and packaging

```
ai-tooling/
  go.mod                      module github.com/CodeWarrior-debug/perspectize/ai-tooling
  appguide/
    appguide.go               Load() parses the embedded guide into Areas/Entries
    lint.go                   Lint() runs the deterministic checks
    appguide_test.go          unit tests for the parser + lint rules
    guide_test.go             lints the real embedded guide (fails CI on any problem)
    guide/
      README.md               format + style rules, area index (not embedded as an area)
      <area>.md               one file per app area
    seeds/
      <area>.json             eval seed questions per area
```

`go:embed` can't reference parent directories, so the Markdown lives *inside* the package directory. This is the first code in the `ai-tooling` module. It has no dependency on `backend/` and no LLM SDK.

### Areas (one file each)

| Slug | Covers (starting point, writer confirms against code) |
|---|---|
| `getting-started` | Guest landing, sign-in, onboarding coach (`onboarding/`, `Header.svelte`) |
| `activity` | Home page table/cards, filters, sort, columns, data mode, details (`routes/+page.svelte`, `ActivityTable`, `ActivityCardList`, `FilterChips`, `SortPickerDialog`, `ColumnPickerDialog`, `DataModeToggle`, `UserActivityView`, `CellPopover`, `ActivityDetailsModal`) |
| `adding-content` | Add a video or Bible passage (`AddContentPopover`, `AddVideoDialog`, `PassagePicker`, `BibleVersionPicker`) |
| `perspectives` | Create/edit a perspective: ratings, feelings, custom fields, categories, privacy (`PerspectiveEditor`, `PerspectivePopover`, `RatingInput`, `FeelWheel`, `AddFieldSearch`, `CategoryTypeahead`, `Thumbs`) |
| `bible` | Reading passages, interlinear view (`PassageText`, `PassageLinks`, `PassagePositionBar`, `interlinear/`) |
| `compare` | Compare perspectives (`routes/compare`, `Compare*.svelte`) |
| `discover` | Discover page search/filter/results (`routes/discover`, `discover/`) |
| `messaging` | Threads, composer, presence, new thread (`routes/messages`, `messaging/`) |
| `settings` | Settings dialog, theme customization, glasses/identity if present (`SettingsDialog`, `theme/`) |

The table is a starting point. Writers may split or merge areas if the code suggests it, and must update the README index.

### Entry format

Each area file:

```markdown
# Compare Perspectives

**Route:** /compare
**Summary:** Two to three sentences: what this area is for and when a user would come here.

## compare.pick-two
**Task:** Compare two perspectives on the same content
**Where:** Compare page → picker row
**Steps:**
1. Open **Compare** from the header.
2. Choose a perspective in each picker.
**Not supported:** Comparing more than two perspectives at once.
**Notes:** Optional short clarifications.
**Sign-in required:** yes
**Source:** `frontend/src/routes/compare/+page.svelte`, `frontend/src/lib/components/ComparePickerRow.svelte`
```

Field rules:

| Field | Required | Rule |
|---|---|---|
| ID heading (`## area.task`) | yes | `^[a-z0-9-]+\.[a-z0-9-]+$`; prefix equals the file's area slug; unique across the guide; never renamed once published (evals reference it) |
| `**Task:**` | yes | One line, user-intent phrasing ("Change…", "Find…") |
| `**Where:**` | yes | UI location using the arrow `→` for navigation |
| `**Steps:**` | yes | Numbered list, 1 or more items; exact UI labels in **bold** |
| `**Not supported:**` | no | Only true limitations visible in code; these reduce hallucinated features |
| `**Notes:**` | no | Short |
| `**Sign-in required:**` | yes | `yes` or `no` |
| `**Source:**` | yes | One or more backticked repo-relative paths that exist |

Style: concise plain English, second person, present tense, no speculation, no marketing. Not caveman-compressed (decided: the savings are negligible with caching and scoped loading, and it costs accuracy and maintainability; an eval A/B test can revisit this later). Every claim must be traceable to a `Source` file. If something can't be confirmed from code, leave it out and flag it to the owner.

### Eval seeds

`seeds/<area>.json`, 3–5 per area:

```json
[
  {
    "question": "How do I compare two takes on a video?",
    "expect_ids": ["compare.pick-two"],
    "must_not_claim": ["compare more than two"]
  }
]
```

Include at least one "trap" question per area about a feature that doesn't exist (expect an answer saying it isn't supported). Lint checks that every `expect_ids` value exists.

### Deterministic lint (`appguide.Lint`)

Returns a list of problems (file, entry ID, rule, message). Rules:

1. Each area file has `# Title`, `**Route:**` and `**Summary:**`.
2. ID format, prefix matches the area slug, IDs are unique.
3. Required fields are present and non-empty; Steps has at least one numbered item.
4. `Sign-in required` is `yes` or `no`.
5. Every `Source` path exists relative to the repo root.
6. Seed files parse; every `expect_ids` entry exists; each area has at least 3 seeds and at least one with `must_not_claim`.

`guide_test.go` runs `Lint` on the embedded guide with repo root `../..`, and any problem fails the test (and CI).

### Closed writing loop

```
writer (Sonnet 5 subagent, one area)
   │ writes guide/<area>.md + seeds/<area>.json
   ▼
lint (go test ./appguide/...)            ← deterministic gate, run by the controller
   │ problems → back to writer
   ▼
verifier (separate Sonnet 5 subagent)    ← independent: sees only the guide file + the code
   │ per-entry verdict: pass / fail + reason
   │ fails → back to writer
   ▼
all entries pass + lint clean → area done
```

- **Independence:** the verifier gets no writer reasoning, only the area file, the seeds and repository access. It checks each entry's route, location, steps, bold labels and "Not supported" claims against the `Source` files (and anything they import), and reports claims with no source support.
- **Completion condition per area:** lint reports zero problems AND the verifier returns pass for every entry AND every seed.
- **Round cap:** at most 3 writer↔verifier rounds per area. After that, the area is escalated to the owner with the open disagreements. It is never marked done silently.
- **Context discipline:** each writer and verifier is a fresh subagent handling one area, and returns a summary of at most about 200 words (entries written, verdict counts, open issues). The controller keeps only those summaries. Hard ceiling: no agent should exceed about ⅓ of its context window. If a writer finds its area too large, it stops and returns a split proposal instead of continuing.
- **Parallelism:** areas are independent files, so up to 3 writers may run at once. Verifiers run after their area's writer finishes.
- **Final gate:** the owner spot-checks one area in the running app (local session; cloud sessions can't sign in with Clerk).

### CI and hooks

- CI: a new `ai-tooling` job running `go build ./...`, `gofmt -l .` and `go test ./...` in `ai-tooling/`.
- `.hooks/pre-commit`: extend the gofmt glob to `ai-tooling/*.go`.
- Root `CLAUDE.md` verification checklist: add the ai-tooling build/format/test step.

### Drift

`Source` paths are the drift hook. Out of scope now, noted for later: a CI check that flags guide entries whose source files changed in a PR.

## Risks

| Risk | Mitigation |
|---|---|
| Writer invents plausible steps | Independent verifier checks against code; "can't confirm → omit and flag" rule |
| Verifier rubber-stamps | It sees only the file and the code; must cite the source line for each pass; owner spot-check |
| Labels in code are i18n keys or dynamic | Verifier resolves them; if a label can't be resolved statically, the writer describes it by position instead of quoting it |
| Guide drifts as the UI changes | `Source` paths plus a future CI drift check; guide lint runs in CI |
| Area too big for one agent | Split-proposal rule; ⅓ context ceiling |

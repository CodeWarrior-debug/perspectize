# App Guide

Task-oriented guide to Perspectize, written for **Jeeves** (the in-app assistant) to answer how-to questions. One file per app area (`<slug>.md`). This README is the writers' brief. It is not loaded as an area.

Spec: `docs/superpowers/specs/2026-09-26-app-guide-design.md`. Lint: `go test ./appguide/...` in `ai-tooling/` (CI runs it).

## Area file format

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
**Notes:** Optional short clarification.
**Sign-in required:** yes
**Source:** `frontend/src/routes/compare/+page.svelte`, `frontend/src/lib/components/ComparePickerRow.svelte`
```

| Field | Required | Rule |
|---|---|---|
| `## area.task` heading | yes | Lowercase kebab-case `area.task`; prefix equals the file's slug; unique across the guide; **never rename once merged** (evals reference IDs) |
| `**Task:**` | yes | One line of user intent ("Change…", "Find…", "Compare…") |
| `**Where:**` | yes | UI location; use `→` for navigation steps |
| `**Steps:**` | yes | Numbered list (`1. …`), one or more; exact UI labels in **bold** |
| `**Not supported:**` | no | Only real limitations visible in code. These stop Jeeves from inventing features. |
| `**Notes:**` | no | Short |
| `**Sign-in required:**` | yes | `yes` or `no` |
| `**Source:**` | yes | One or more backticked repo-relative paths that exist |

Any other `**Field:**` is a lint error.

## Style

- Concise plain English, second person, present tense. No marketing, no speculation.
- **Describe only what the code does today.** Every claim must be traceable to a `Source` file (or a component it renders).
- If you can't confirm something from code, **leave it out** and report it as unconfirmed.
- Quote UI labels exactly as rendered. If a label is dynamic or can't be resolved statically, describe the control by position instead of quoting.
- Skip admin/dev-only UI and backend behavior with no UI.
- **Sign-in:** the root layout (`frontend/src/routes/+layout.svelte`) shows the guest landing page on every route while signed out, so every in-app task is `Sign-in required: yes`. Only the guest landing and sign-in entries are `no`.
- Before writing a `Not supported` line or a trap seed, search the whole frontend (Settings included) for the feature. A feature that "doesn't exist" in one component often lives in another.
- Not caveman-compressed: savings are negligible with caching and scoped loading, and terse fragments hurt accuracy.

## Eval seeds

`../seeds/<slug>.json`: 3–5 questions per area, **at least one trap** (a feature that doesn't exist, answered with "not supported"):

```json
[
  { "question": "How do I compare two takes on a video?", "expect_ids": ["compare.pick-two"], "must_not_claim": [] },
  { "question": "Can I compare five perspectives at once?", "expect_ids": [], "must_not_claim": ["compare more than two"] }
]
```

## Area index

| Slug | Title | Status |
|---|---|---|
| `getting-started` | Getting Started | pending |
| `activity` | Activity | verified (1 round) |
| `adding-content` | Adding Content | verified (2 rounds) |
| `perspectives` | Perspectives | pending |
| `bible` | Bible Passages | pending |
| `compare` | Compare Perspectives | verified (pilot, 3 rounds) |
| `discover` | Discover | pending |
| `messaging` | Messaging | pending |
| `settings` | Settings & Theme | pending (`settings.change-theme` reserved for the owner to write) |

# Project Management

Where the **why** behind Perspectize changes lives, and the index that ties each change's artifacts together.

## The Anthropic 2026 flow (AI-native SDLC)

In August 2026 Anthropic published the [AI-Native SDLC playbook](https://academy.claude.com/courses/ai-native-sdlc-playbook/capture-intent). It describes a loop of six artifacts, each committed to the repo so the chain stays next to the code it produced:

```
intent → spec → plan → diff → pull request → incident record ─┐
  ▲                                                            │
  └────────────────────────────────────────────────────────────┘
```

| # | Artifact | Answers | Stage |
|---|----------|---------|-------|
| 1 | `intent.md` | What do we want to change, and why? | Capture |
| 2 | `spec.md` | What are the requirements, derived from the accepted intent? | Design |
| 3 | `plan.md` | In what steps do we build it? | Build |
| 4 | diff | What changed? | Build |
| 5 | pull request | Does it do what the intent asked? | Verify |
| 6 | incident record | What went wrong in production, and what does it teach us? | Feeds the next intent |

**`intent.md`** covers one proposed change. It has five parts: the problem, the proposed outcome, the affected users and systems, the constraints, and the open questions. Claude drafts it from a conversation, the product owner corrects it, and it is committed only after a human signs off on the *why*. That sign-off is what triggers the design pass. After approval it is a historical record: git history is the evidence (author and timestamp), and it is not rewritten later. Changes after the first spec commit are a signal worth noticing.

**Not the same as CLAUDE.md.** CLAUDE.md is standing guidance (commands, conventions, pitfalls). An intent is per-change and accumulates, so it never goes in CLAUDE.md.

## Our approach: own some, link the rest

We do not move existing docs or duplicate them. This folder **owns** the artifacts that have no other home, and **points to** the rest.

| Artifact | Lives in | How it appears here |
|----------|----------|---------------------|
| Intent | `project-management/intents/<feature>.md` | **Owned here** |
| Spec | `docs/superpowers/specs/` | Hyperlink |
| Plan | `docs/superpowers/plans/` | Hyperlink |
| Diff / PR | GitHub | Hyperlink (PR URL) |
| Incident record | GitHub issue (bug template); private detail in gitignored `.planning/phases/bugs/` | Hyperlink to the issue only |

**Hyperlink vs. symlink**
- **Default to relative hyperlinks** (`../docs/superpowers/specs/2026-09-05-foo-design.md`). They render on GitHub, survive Windows checkouts, and cannot silently dangle into a different file.
- **Use a symlink only** when a tool needs a file to appear at a second path. Symlinks need extra setup on Windows, and GitHub shows them as a bare path instead of rendered content.
- **Never link into `.planning/`.** It is gitignored, so the link is dead for everyone else. Use a GitHub issue URL instead.
- **External links** (PRs, issues, playbook pages) are fine, but record the title beside the URL so the entry still makes sense if the link rots.

## Convention for an intent

One file per change: `intents/<kebab-case-feature>.md`. Put the author and date in git history, not the filename. Suggested skeleton:

```markdown
# <Feature name>

Status: draft | accepted | superseded by <link>

## Problem
## Proposed outcome
## Affected users and systems
## Constraints
## Open questions

## Downstream
- Spec: <link>
- Plan: <link>
- PR(s): <link>
```

The **Downstream** section is how this folder stays an index: fill it in as each later artifact appears.

## Status

The convention is new. No intents exist yet, and the `intents/` folder is created with the first one. The existing specs and plans under `docs/superpowers/` pre-date it and need no backfill.

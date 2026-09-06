# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Perspectize** — Platform for storing, refining, and sharing perspectives on content (initially YouTube videos).

Monorepo with two stacks:
- **Backend:** `backend/` — Go GraphQL API (see `backend/CLAUDE.md`)
- **Frontend:** `frontend/` — SvelteKit web app (see `frontend/CLAUDE.md`)

**CLAUDE.md structure:** Root file (this) contains shared concerns. Package-level files contain stack-specific instructions. Claude loads root + the relevant package file per session.

## Context Lookup (graphify)

qmd is fully retired — see the `## graphify` section near the bottom of this file for the current pre-search step.

## GitHub & Repository Management

**Git branch gotcha:** Local default branch is `master`, remote is `main`. Use `origin/main` (not `main`) for diff/log comparisons: `git diff origin/main...HEAD`.

**Always use `gh` CLI** for GitHub operations. Do not use MCP plugins.

**Note:** In Claude Code web sessions, `gh` CLI may not be authenticated. If `gh` auth fails:
- **Creating a PR:** Push the branch with `git push -u origin <branch>` and let the user create the PR via the GitHub UI button. Prepare the PR title and body as copyable text for the user.
- **Updating a PR:** Output the updated title/body as copyable text so the user can paste it into the GitHub UI.

```bash
# Pull requests
gh pr create --title "Title" --body "..."  # Use PR template (see below)
gh pr list
gh pr view 123
gh pr merge 123

# Edit PR (use API — gh pr edit fails with Projects Classic deprecation)
gh api repos/CodeWarrior-debug/perspectize/pulls/123 -X PATCH -f body="New description"

# Issues (use API — gh issue view fails with Projects Classic deprecation)
gh issue create --title "Title" --body "..."  # Use issue templates (see below)
gh issue list
gh api repos/CodeWarrior-debug/perspectize/issues/123 --jq '.title, .html_url'

# API access
gh api repos/CodeWarrior-debug/perspectize/pulls/123/comments
```

### GitHub Templates

**Always use the repository templates** in `.github/` when creating PRs and issues.

**Pull Requests** — per-type templates in `.github/PULL_REQUEST_TEMPLATE/`, picked by the PR's conventional-commit type:

| Commit type | Template | Sections |
|---|---|---|
| `feat` | `feature.md` | Feature Description, Technical Changes, Demo (before/after screenshots), Test Plan |
| `fix` | `bugfix.md` | Root Cause, Fix, Demo (before/after screenshots), Regression Test |
| `chore`/`build`/`ci` | `chore.md` | Summary, Changes, Verification |
| `docs` | `docs.md` | Summary, Files Changed, Verification |

Because PRs are created via `gh api` (not `gh pr create`), GitHub's template picker never runs — read the matching template file yourself and shape the `-F body=@<file>` content to its sections before creating the PR. Any UI-visible change should fill in the Demo screenshot table (see [.docs/PR_SCREENSHOTS.md](.docs/PR_SCREENSHOTS.md) for the `sv-` upload workflow) rather than leaving it blank.

**Issues** — use templates from `.github/ISSUE_TEMPLATE/` (feature_request.md or bug_report.md).

**Never create a GitHub issue just to have something for a PR to close.** Only put `Closes #N`/link an issue in a PR when that issue already existed before the PR work started (the user filed it, or it was already tracked). If no issue exists, don't manufacture one — just omit the issue reference and drop the `issueNumber` segment from the branch name (see Branch Naming below).

GitHub Projects v2: See [.docs/GITHUB_PROJECTS.md](.docs/GITHUB_PROJECTS.md).

### PR Merge Preferences

```bash
gh pr merge 123 --squash --delete-branch --admin
```

- `--squash` — Single commit (cleaner history)
- `--delete-branch` — Auto-delete branch after merge
- `--admin` — Bypass branch protection when needed

## Branch Naming

**Always branch from updated `main`:** `git checkout main && git pull origin main && git checkout -b <name>`

**Format:** `type/initiativePrefix-issueNumber-description-in-kebab-case`

| Component | Values |
|-----------|--------|
| **type** | `feature`, `bugfix`, `chore` |
| **initiativePrefix** | `INI` (Initialization Phase) — **omit along with issueNumber if no issue already exists** (initiativePrefix and issueNumber are a pair; both or neither) |
| **issueNumber** | GitHub issue number — **omit this segment entirely if no issue already exists.** Do not create one just to fill it in (see GitHub Templates above). |

Example: `feature/INI-16-youtube-post-graphql` (with a pre-existing issue) or `feature/youtube-post-graphql` (no issue — both `INI` and the number drop)

### GitHub Issues with Plans

Include a plan reference and dependencies if present: for new work, the superpowers plan/spec path (`docs/superpowers/plans/{name}-plan.md`); for legacy in-flight work, the GSD plan reference (`.planning/phases/{phase}/{plan}-PLAN.md`) and acceptance criteria from `must_haves.truths`.

## Agent Delegation Strategy

| Task Type | Model | Subagent | Rationale |
|-----------|-------|----------|-----------|
| Architecture decisions | Opus | - | Complex multi-file reasoning |
| Go implementation | Sonnet | `go-backend` | Balanced quality/cost |
| GraphQL schema design | Sonnet | `graphql-designer` | Schema patterns |
| Database migrations | Sonnet | `db-migration` | SQL generation |
| Code review | Haiku | `code-reviewer` | Fast pattern matching |
| Test generation | Haiku | `test-writer` | Boilerplate generation |

## Coding Conventions

**Learning comments:** Mark temporary explanatory comments with `*TEMP*` for easy grep/removal:
```go
// *TEMP* - defer runs after function returns, ensures cleanup
defer db.Close()
```

**No chained bash commands:** Do not use `&&` to chain shell commands. Run each command as a separate Bash tool call. Chained commands don't match permission allow-list patterns and block on approval prompts. This applies to all agents and subagents.

**Migration numbering:** Always check existing migration files before creating new ones. Plan-specified numbers may be stale — use `ls backend/migrations/ | tail -5` to find the next available number.

**Commit messages:** Conventional commit format (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`). One logical change per commit. GSD planning work (PLAN.md, CONTEXT.md, RESEARCH.md, ROADMAP.md) uses the `docs` tag — e.g., `docs(11,13): create execution plans`.

## Planning & Execution Workflow

**Primary workflow: obra/superpowers** (plugin enabled in `.claude/settings.json`). Use `superpowers:writing-plans` (or its brainstorming/spec-writing counterparts) for planning, and `superpowers:executing-plans` / `superpowers:subagent-driven-development` for execution. Plans and specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/` — see `docs/superpowers/plans/2026-08-15-clerk-derived-user-identity-plan.md` for the established format (plan header names the required execution sub-skill, links its spec, checkbox-tracked (`- [ ]`) tasks).

**GSD is legacy — do NOT start new work with it.** Some milestones still have unfinished work tracked under the old workflow in `.planning/phases/` (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, phase `PLAN.md`/`must_haves.truths` files). Finish those specific in-flight phases using their existing GSD plan files/commands rather than replanning them from scratch under superpowers — don't discard partially-done GSD work. All new planning and execution goes through superpowers. Branching for legacy GSD phases: see [.docs/GSD_BRANCHING.md](.docs/GSD_BRANCHING.md).

**Superpowers is the preferred planning + execution orchestrator.** Select GSD commands are kept only for codebase mapping (`gsd:map-codebase`) and roadmap/milestone management (`gsd:new-milestone`, `gsd:add-phase`/`gsd:remove-phase`/`gsd:insert-phase`, `gsd:analyze-dependencies`, `gsd:milestone-summary`, `gsd:complete-milestone`, `gsd:docs-update`).

**Vendored GSD is a frozen legacy subset** (`.claude/get-shit-done/`, curated `.claude/commands/gsd/`). Do not run `npx get-shit-done-cc` against this repo — a full install dumps ~200 unused command/agent/workflow files and bakes absolute paths into the command files. The `VERSION` marker tracks the toolchain maintainers run locally so the update-check hook stays quiet; it is not a claim that every vendored file is on that release. For phase CRUD / dependency analysis on newer GSD, use a personal global install.

## Self-Verification (MANDATORY)

**Before claiming work is complete, pushing, or creating a PR**, you MUST run verification. No exceptions.

### Verification checklist

1. **Build**: `go build ./...` in `backend/` — must compile with zero errors
2. **Backend tests**: `go test ./...` in `backend/` — all must pass
3. **Frontend tests**: `pnpm run test:run` in `frontend/` — all must pass
4. **Stale references**: If renaming/moving files or paths, grep the entire repo for old names
5. **Plan must_haves**: If executing a GSD plan, verify each `must_haves.truths` item

Run the relevant subset (e.g., backend-only changes skip step 3). Report results explicitly — don't just say "tests pass", show the output summary.

**GSD verification is not self-verification.** The GSD verifier checks must_haves against codebase structure. It does NOT run builds or tests. Always run the full checklist (build, backend tests, frontend tests) before creating a PR, even after GSD verification passes.

See [.docs/VERIFICATION.md](.docs/VERIFICATION.md) for evidence capture workflow, and [.docs/PR_SCREENSHOTS.md](.docs/PR_SCREENSHOTS.md) for uploading `sv-` screenshots to a release and linking them in the PR.

**Authenticated self-verify:** `.env*` files (except `.env.example`) are unreadable by design — that's expected, not a broken setup. Logged-in browser verification uses the persistent Chrome profile from `.claude/scripts/sv-chrome.sh`; see [.docs/VERIFICATION.md](.docs/VERIFICATION.md) §0. Never attempt to log in or enter credentials — ask the human to re-run the one-time login if signed out.

## Resources

**Monorepo docs:**
- [Architecture](.docs/ARCHITECTURE.md) — System design and hexagonal architecture
- [Local Development](.docs/LOCAL_DEVELOPMENT.md) — Setup guide
- [Agent Routing](.docs/AGENTS.md) — AI agent navigation guide
- [Domain Guide](.docs/DOMAIN_GUIDE.md) — Domain layer rules and patterns
- [Go Patterns](.docs/GO_PATTERNS.md) — Error handling and DB query patterns
- [Security](.docs/SECURITY.md) — Secret management, rotation procedures, incident response
- [Dependency Security](.docs/DEPENDENCY_SECURITY.md) — Trivy/pnpm-audit scanning, CVE remediation workflow, CI gotchas
- [Worktrees](.docs/WORKTREES.md) — Location convention and the 3 numbered reusable worktrees for isolated Claude Code work

**Frontend docs:**
- [Frontend CLAUDE.md](frontend/CLAUDE.md) — SvelteKit, Svelte 5, TanStack Query patterns
- [Design Spec](frontend/docs/DESIGN_SPEC.md) — Figma design system, color tokens, typography, component specs
- [Figma Reference](frontend/docs/FIGMA.md) — File keys, pages, variables, code↔Figma mapping

**How-to guides:**
- [Adding an AG Grid Column](.claude/docs/ADDING_AG_GRID_COLUMN.md) — Decision checklist for adding columns to the ActivityTable
- [Adding a Content Type](.claude/docs/ADDING_CONTENT_TYPE.md) — End-to-end guide for new content types (backend + frontend)
- [Code to Figma Canvas](.claude/docs/CODE_TO_FIGMA_CANVAS.md) — Capture running app into Figma to keep designs in sync

**Planning & backlog:**
- [Feature Backlog](FEATURE_BACKLOG.md) — Future ideas and enhancements not tied to any milestone. Capture ideas here during development; evaluate when planning new work.
- [Bug Tracking](.docs/BUG_TRACKING.md) — How known bugs are tracked privately (gitignored files, persistent bugs phase)

**Bug logging (MANDATORY):** When you discover a bug during development, review, or testing, log it in `.planning/phases/bugs/BACKLOG.md` with severity and location. Also create a GitHub issue using the bug report template — keep sensitive details (exact paths, line numbers, security specifics) in the backlog only. When a bug is fixed, move it to `.planning/phases/bugs/CLOSED.md` with the PR reference. These files are gitignored — never commit them.

**Native PreToolUse hooks (`.claude/hooks/*.sh`, wired in `.claude/settings.json`; hookify plugin retired):**
- **Secret protection:** `deny-env-read.sh` blocks any Bash command that reads a real `.env` file (deny-by-default; `.env.example` / `.env.test` stay readable). Pairs with `permissions.deny` Read rules. Real secret values are entered by humans only — see [.docs/SECURITY.md](.docs/SECURITY.md).
- **Pre-PR:** `require-session-reflection-before-pr.sh` denies `gh pr create` until the `/revise-claude-md` command (from the `claude-md-management` plugin) has been run. It can't detect completion, so use `gh api` to create the PR after running the command. Example: `gh api repos/CodeWarrior-debug/perspectize/pulls -f title="..." -f body="..." -f head="branch" -f base="main"`
- **Pre-commit tests:** `require-tests.sh` injects a non-blocking reminder on `git commit` to verify test coverage for new/modified frontend `src/` files. Config, styles, docs, and test files are exempt.
- **Pre-commit prettier:** `prettier-precommit.sh` injects a non-blocking reminder on `git commit` to run `pnpm exec prettier --write` on staged frontend files.
- **Matching is anchored on command position** (start of string or after a shell separator), not a raw substring search — a trigger phrase (e.g. `gh pr create`) appearing inside a quoted commit message or PR body elsewhere on the line does not fire the hook.

**Cowork session cleanup:** Claude cowork (claude.ai web) sessions leave `_tmp_*` files and conversation transcript `.txt` files in the repo root and `frontend/`. Delete these before committing.

## Merge Conflict Patterns

**pnpm-lock.yaml conflicts:** Accept either side (`git checkout --theirs frontend/pnpm-lock.yaml`), then regenerate: `pnpm install --dir frontend`. Always use `--dir` instead of `cd` to avoid hook/shell side effects that can switch branches mid-operation.

**External references:**
- [gqlgen](https://gqlgen.com/) | [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) | [Effective Go](https://go.dev/doc/effective_go) | [PostgreSQL 17](https://www.postgresql.org/docs/17/)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

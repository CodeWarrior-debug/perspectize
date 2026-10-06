# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Perspectize** — Platform for storing, refining, and sharing perspectives on content (initially YouTube videos).

Monorepo with two stacks:
- **Backend:** `backend/` — Go GraphQL API (see `backend/CLAUDE.md`)
- **Frontend:** `frontend/` — SvelteKit web app (see `frontend/CLAUDE.md`)

**CLAUDE.md structure:** This root file is loaded in every session, so it holds only repo-wide rules. Stack-specific rules live in `backend/CLAUDE.md` / `frontend/CLAUDE.md` (loaded once you touch files there); long procedures live in `.docs/` and are linked below. A safety rule that must hold before any stack file is read keeps a one-line stub here.

## GitHub & Repository Management

**Git branch gotcha:** Local default branch is `master`, remote is `main`. Use `origin/main` (not `main`) for diff/log comparisons: `git diff origin/main...HEAD`.

**Use `gh` CLI** for GitHub operations locally, not MCP plugins. **Cloud sessions:** `gh` is unavailable — use the GitHub MCP tools (`mcp__github__*`).

**PR autonomy:** In a **cloud** session (Claude Code on the web / managed container), open the PR yourself once the work is complete — **this overrides the harness default of "don't create a PR unless asked"**, so don't ask "want me to open a PR?". Cloud = `CLAUDE_CODE_REMOTE=true` (also: system prompt says "remote execution environment", paths under `/home/user/`). In a **local** session, don't open a PR unless asked — push and hand over the link. If you can't tell after checking those signals, assume local. Either way, never skip the pre-PR steps: Self-Verification below, and `/revise-claude-md`.

**`/revise-claude-md` must not block the PR:** show the proposed CLAUDE.md diffs in chat, put them in the PR body's Session Learnings, open the PR, then ask whether to commit them. Never edit CLAUDE.md files before approval.

**PRs, issues, labels, merging:** follow [.docs/PR_WORKFLOW.md](.docs/PR_WORKFLOW.md) — `gh` commands, per-type PR templates (read the template file yourself; `gh api` skips the picker), QA Acceptance Criteria, the `needs-demo-video` / `ready for review` / `needs-local-session-takeover` labels, the migration labels (kept in sync automatically on open PRs; `migrations-applied` is set by hand after rollout), and `--squash --delete-branch --admin` merges.

**Never create a GitHub issue just to have something for a PR to close.** Only link an issue that existed before the PR work started; otherwise omit it and drop the issue segment from the branch name.

## Branch Naming

**Always branch from updated `main`:** `git checkout main && git pull origin main && git checkout -b <name>`

**Cloud sessions can start on a detached HEAD** (`git status` shows "HEAD detached from refs/heads/main"). Create the branch (`git checkout -b <type>/<name>`) before committing.

**Format:** `type/initiativePrefix-issueNumber-description-in-kebab-case`

| Component | Values |
|-----------|--------|
| **type** | `feature`, `bugfix`, `chore` |
| **initiativePrefix** | `INI` (Initialization Phase) — **omit along with issueNumber if no issue already exists** (initiativePrefix and issueNumber are a pair; both or neither) |
| **issueNumber** | GitHub issue number — **omit this segment entirely if no issue already exists.** Do not create one just to fill it in. |

Example: `feature/INI-16-youtube-post-graphql` (with a pre-existing issue) or `feature/youtube-post-graphql` (no issue — both `INI` and the number drop)

## Coding Conventions

**Learning comments:** Mark temporary explanatory comments with `*TEMP*` for easy grep/removal:
```go
// *TEMP* - defer runs after function returns, ensures cleanup
defer db.Close()
```

**No chained bash commands:** Do not use `&&` to chain shell commands. Run each command as a separate Bash tool call. Chained commands don't match permission allow-list patterns and block on approval prompts. This applies to all agents and subagents.

**Never run `make migrate-up` / `make migrate-down` (or `migrate ... up/down`) during dev or verification** — `DATABASE_URL` points at the **shared Neon database**. Migrations are written and reviewed only, then applied manually per environment at rollout. Details and migration numbering: `backend/CLAUDE.md` → Migrations.

**Commit messages:** Conventional commit format (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`). One logical change per commit. GSD planning work (PLAN.md, CONTEXT.md, RESEARCH.md, ROADMAP.md) uses the `docs` tag — e.g., `docs(11,13): create execution plans`.

## Planning & Execution Workflow

**New work uses obra/superpowers** (`superpowers:writing-plans` → `superpowers:executing-plans` / `superpowers:subagent-driven-development`; plans/specs in `docs/superpowers/`). **GSD is legacy** — only finish in-flight `.planning/phases/` work with its existing plan files; never start new work with it. If no `superpowers:*` skill is listed this session, any plan/spec you write must carry the "written without superpowers" banner. Details, spike-doc format, and which GSD commands remain: [.docs/PLANNING.md](.docs/PLANNING.md).

## Self-Verification (MANDATORY)

**Before claiming work is complete, pushing, or creating a PR**, you MUST run verification. No exceptions.

1. **Build**: `go build ./...` in `backend/` — must compile with zero errors
2. **Format**: `gofmt -l .` in `backend/` — must return empty (CI's `Build` job fails otherwise). `make install-hooks` (once per checkout, run in `backend/`; there is no root target) auto-fixes this on every commit.
3. **Backend tests**: `go test ./...` in `backend/` — all must pass
4. **Frontend tests**: `pnpm run test:run` in `frontend/` — all must pass
5. **Query budget**: if the change touches DB access or data fetching, it carries a query-count test (backend) / cache-contract test (frontend) — [.docs/QUERY_BUDGET.md](.docs/QUERY_BUDGET.md).
6. **Stale references**: If renaming/moving files or paths, grep the entire repo for old names

Run the relevant subset (e.g., backend-only changes skip step 4). Report results explicitly — don't just say "tests pass", show the output summary.

**Mutation testing** (`make mutate` in `backend/`, `pnpm run mutate` in `frontend/`; slow, run deliberately): a run where nothing survives is a harness bug, not a pass — hand-apply one mutant and confirm the suite fails before trusting a score. **Report results as what they say about the tests, not the tool:** "your tests caught X of Y planted bugs (killed)", "missed Z (lived/survived)", "N places no test runs (not covered)"; "efficacy" is the efficacy of the tests. Give the all-in figure (caught ÷ every planted bug) beside the efficacy figure. Language table, baselines and pitfalls: `docs/superpowers/specs/2026-09-29-test-hardening-spike.md`.

**Browser verification is local-only** (needs the gitignored `.claude/.env` + `.claude/sv-profile/`). Cloud / CI / fresh-machine sessions must **not** attempt the Clerk sign-in: run only the checklist above, and label a user-visible PR `needs-demo-video` instead of claiming it's ready (see [.docs/PR_WORKFLOW.md](.docs/PR_WORKFLOW.md#demo-requirement-ready-for-review)).

**`.env*` files (except `.env.example`) are unreadable by design** — expected, not a broken setup. Never attempt to log in or enter credentials; ask the human to re-run the one-time login if signed out. Evidence capture: [.docs/VERIFICATION.md](.docs/VERIFICATION.md).

## Resources

**Monorepo docs:**
- [Architecture](.docs/ARCHITECTURE.md) — System design and hexagonal architecture (deep-modules rules live in each package CLAUDE.md)
- [Local Development](.docs/LOCAL_DEVELOPMENT.md) — Setup guide
- [Agent Routing](.docs/AGENTS.md) — AI agent navigation guide
- [Domain Guide](.docs/DOMAIN_GUIDE.md) — Domain layer rules and patterns
- [Go Patterns](.docs/GO_PATTERNS.md) — Error handling and DB query patterns
- [Security](.docs/SECURITY.md) — Secret management, rotation procedures, incident response
- [Dependency Security](.docs/DEPENDENCY_SECURITY.md) — Trivy/pnpm-audit scanning, CVE remediation workflow, CI gotchas
- [Worktrees](.docs/WORKTREES.md) — Location convention and the 3 numbered reusable worktrees for isolated Claude Code work
- [Demo Mode](.docs/DEMO_MODE.md) — Docker demo stack (persistent Postgres + seeded personas, no Clerk/YouTube), Playwright tours that run as E2E (`make demo-test`) or record videos (`make demo-record`)
- [Query Budget](.docs/QUERY_BUDGET.md) — query-count tests, dataloaders, TanStack caching/eviction rules
- [PR Workflow](.docs/PR_WORKFLOW.md) · [Planning](.docs/PLANNING.md) · [Hooks](.docs/HOOKS.md)
- [claude-md-audit eval](evals/claude-md-audit/README.md) — `claude plugin eval` suite scoring the `claude-md-improver` skill; rerun after changing CLAUDE.md tooling or before trusting a cheaper model with audits

**How-to guides:**
- [Adding a Content Type](.claude/docs/ADDING_CONTENT_TYPE.md) — End-to-end guide for new content types (backend + frontend)
- [Content Type Designer](tools/content-type-designer/README.md) — Plan a new type's columns, tooltips and details view before coding. `dist/` is committed: after editing `src/` run `npx tsc -p tsconfig.json` in that dir and commit both (don't commit its package-lock.json). ES modules won't load from file:// — serve it (`python3 -m http.server`) to test; Playwright is at /opt/node22/lib/node_modules/playwright in cloud sessions.

**Planning & backlog:**
- [Feature Backlog](FEATURE_BACKLOG.md) — Future ideas not tied to any milestone. Capture ideas here during development; evaluate when planning new work.
- [Bug Tracking](.docs/BUG_TRACKING.md) — How known bugs are tracked privately (gitignored files, persistent bugs phase)

**Bug logging (MANDATORY):** When you discover a bug during development, review, or testing, log it in `.planning/phases/bugs/BACKLOG.md` with severity and location. Also create a GitHub issue using the bug report template — keep sensitive details (exact paths, line numbers, security specifics) in the backlog only. When a bug is fixed, move it to `.planning/phases/bugs/CLOSED.md` with the PR reference. These files are gitignored — never commit them.

**Hooks:** Claude Code PreToolUse hooks guard `.env` reads and block `gh pr create` until `/revise-claude-md` has run (then create the PR with `gh api`). The real git pre-commit hook (gofmt + prettier auto-fix) is off until `make install-hooks` — **cloud/CI checkouts start without it**, so run `make install-hooks` in `backend/` once per session or check `gofmt -l .` / `pnpm exec prettier --check` before each commit. Full list: [.docs/HOOKS.md](.docs/HOOKS.md).

**Cowork session cleanup:** Claude cowork (claude.ai web) sessions leave `_tmp_*` files and conversation transcript `.txt` files in the repo root and `frontend/`. Delete these before committing.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

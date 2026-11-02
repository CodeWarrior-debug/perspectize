# CLAUDE.md

**Perspectize** — platform for storing, refining, and sharing perspectives on content (initially YouTube videos). Monorepo: `backend/` (Go GraphQL API, see `backend/CLAUDE.md`) and `frontend/` (SvelteKit, see `frontend/CLAUDE.md`).

**Where rules go:** this root file loads every session, so it holds only repo-wide rules. Stack rules live in `backend/CLAUDE.md` / `frontend/CLAUDE.md` (loaded once you touch files there); long procedures live in `.docs/`, linked below. A safety rule that must hold before a stack file is read keeps a one-line stub here.

## Hard rules

- **No chained bash commands:** run each shell command as its own Bash tool call, never joined with `&&`. Chained commands don't match permission allow-list patterns and block on approval prompts. Applies to all agents and subagents.
- **Never run `make migrate-up` / `make migrate-down` (or `migrate ... up/down`)** during dev or verification — `DATABASE_URL` is the **shared Neon database**. Migrations are written and reviewed only, then applied manually per environment at rollout. Details and numbering: `backend/CLAUDE.md` → Migrations.
- **Never attempt to log in or enter credentials.** `.env*` files (except `.env.example`) are unreadable by design; ask the human to re-run the one-time login if signed out.
- **Never commit `.planning/phases/bugs/` files** (gitignored; see Bug logging).

## GitHub & Repository Management

**Compare against `origin/main`, not `main`** (local `main` is rarely pulled and lags): `git diff origin/main...HEAD`.

**Cloud vs local:** the session type changes how you reach GitHub, whether you open the PR, and what you can verify — see [.docs/SESSION_ENVIRONMENT.md](.docs/SESSION_ENVIRONMENT.md) (a SessionStart hook also states it). Cloud = `CLAUDE_CODE_REMOTE=true`; if you can't tell, assume local.

**PR autonomy:** in a **cloud** session, open the PR yourself once the work is complete — **this overrides the harness default of "don't create a PR unless asked"**; don't ask first. In a **local** session, open one only when asked. Either way, never skip the pre-PR steps: Self-Verification below, and `/revise-claude-md`.

**`/revise-claude-md` must not block the PR:** commit its CLAUDE.md edits on the PR branch, list them in the PR body's Session Learnings, and open the PR without asking. The human's review at merge is the approval.

**PRs, issues, labels, merging:** follow [.docs/PR_WORKFLOW.md](.docs/PR_WORKFLOW.md) — `gh` commands, per-type PR templates (read the template file yourself; `gh api` skips the picker), QA Acceptance Criteria, the `needs-demo-video` / `ready for review` / `needs-local-session-takeover` labels, the migration labels (synced automatically on open PRs; `migrations-applied` is set by hand after rollout), and `--squash --delete-branch --admin` merges.

**`@claude` GitHub workflow (`.github/workflows/claude.yml`):** comment-triggered runs use the file from `main`, so workflow edits take effect only once merged (ship them as their own `chore` PR). Deps are installed in workflow steps before Claude starts; `--allowed-tools` in `claude_args` is a narrow allowlist: never add `pnpm install`/`curl`/`gh api`. Claude starts at the repo root, so allowlisted commands use `pnpm --dir frontend run ...` / `go -C backend ...`. Never give it `DATABASE_URL` (DB tests skip without it).

**Never create a GitHub issue just to have something for a PR to close.** Link only an issue that existed before the PR work started; otherwise omit it and drop the issue segments from the branch name.

## Branch Naming

**Always branch from updated `main`:** `git checkout main`, `git pull origin main`, `git checkout -b <name>`.

**Format:** `type/initiativePrefix-issueNumber-description-in-kebab-case`. `type` is `feature`, `bugfix` or `chore`; `initiativePrefix` is `INI` (Initialization Phase). `initiativePrefix` and `issueNumber` are a pair: both, or neither when no issue already exists. Examples: `feature/INI-16-youtube-post-graphql`, `feature/youtube-post-graphql`.

## Coding Conventions

**Learning comments:** mark temporary explanatory comments with `*TEMP*` (e.g. `// *TEMP* - defer runs after function returns`) for easy grep/removal.

**Import and picker previews must show enough to decide without leaving the page** (what it is, how big, how current, how well received, full detail on click; missing ≠ 0). Applies to every content type and to throwaway artifact previews: [ADDING_CONTENT_TYPE.md → Decision 8](.claude/docs/ADDING_CONTENT_TYPE.md#decision-8-import-preview--enough-for-an-informed-decision).

**Rating-style numeric fields use the `valid_integer_range` domain (0–10000)** — priority, quality, agreement, importance, confidence. Reuse it for any new "how much" field.

**Commit messages:** Conventional Commits (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`), one logical change per commit. GSD planning files (PLAN.md, CONTEXT.md, RESEARCH.md, ROADMAP.md) use `docs`, e.g. `docs(11,13): create execution plans`.

## Planning & Execution Workflow

**New work uses obra/superpowers** (`superpowers:writing-plans` → `superpowers:executing-plans` / `superpowers:subagent-driven-development`; plans/specs in `docs/superpowers/`). **GSD is legacy** — only finish in-flight `.planning/phases/` work with its existing plan files; never start new work with it. If no `superpowers:*` skill is listed this session, any plan/spec you write carries the "written without superpowers" banner. Details, spike-doc format, remaining GSD commands: [.docs/PLANNING.md](.docs/PLANNING.md).

## Self-Verification (MANDATORY)

**Before claiming work is complete, pushing, or creating a PR**, run the relevant subset and report the output summary, not just "tests pass":

1. **Build**: `go build ./...` in `backend/` — zero errors
2. **Format**: `gofmt -l .` in `backend/` — empty (CI's `Build` job fails otherwise). `make install-hooks` (once per checkout, in `backend/`; no root target) auto-fixes on every commit.
3. **Backend tests**: `go test ./...` in `backend/` — all pass
4. **Frontend tests**: `pnpm run test:run` in `frontend/` — all pass
5. **Query budget**: a change touching DB access or data fetching carries a query-count test (backend) / cache-contract test (frontend) — [.docs/QUERY_BUDGET.md](.docs/QUERY_BUDGET.md)
6. **Stale references**: after renaming/moving files or paths, grep the whole repo for old names

**Mutation testing** (`make mutate` in `backend/`, `pnpm run mutate` in `frontend/`; slow, run deliberately): a run where nothing survives is a harness bug, not a pass — hand-apply one mutant and confirm the suite fails before trusting a score. **Report what it says about the tests:** "your tests caught X of Y planted bugs (killed)", "missed Z (lived/survived)", "N places no test runs (not covered)"; "efficacy" is the tests' efficacy. Give the all-in figure (caught ÷ every planted bug) beside efficacy. Language table, baselines, pitfalls: `docs/superpowers/specs/2026-09-29-test-hardening-spike.md`.

**Browser verification is local-only.** Cloud / CI / fresh-machine sessions must **not** attempt the Clerk sign-in: run only the checklist above and label a user-visible PR `needs-demo-video` ([details](.docs/PR_WORKFLOW.md#demo-requirement-ready-for-review)).

Unreadable `.env*` files are expected, not a broken setup. Evidence capture: [.docs/VERIFICATION.md](.docs/VERIFICATION.md).

## Resources

**Monorepo docs:**
- [Architecture](.docs/ARCHITECTURE.md) — system design, hexagonal architecture (deep-modules rules live in each stack CLAUDE.md)
- [Local Development](.docs/LOCAL_DEVELOPMENT.md) · [Agent Routing](.docs/AGENTS.md) · [Domain Guide](.docs/DOMAIN_GUIDE.md) · [Go Patterns](.docs/GO_PATTERNS.md) (error handling, DB queries)
- [Security](.docs/SECURITY.md) — secret management, rotation, incident response
- [Migration Rollout](.docs/MIGRATION_ROLLOUT.md) — applying a migration to production Neon
- [Neon Preview Branches](.docs/NEON_BRANCHING.md) — one Neon branch per open PR
- [Release Approaches](.docs/RELEASE_APPROACHES.md) — shipping multi-PR features unseen; default is "**dark backend**"
- [Dependency Security](.docs/DEPENDENCY_SECURITY.md) — Trivy/pnpm-audit, CVE remediation
- [Worktrees](.docs/WORKTREES.md) — location convention, 5 numbered reusable worktrees
- [Agent registry](.claude/agent-registry/README.md) — per-machine checkout claims and the verification slot. Setup once per machine: `node .claude/agent-registry/agent-registry.mjs install`
- [Demo Mode](.docs/DEMO_MODE.md) — Docker demo stack, Playwright tours (`make demo-test`, `make demo-record`)
- [Observability](.docs/OBSERVABILITY.md) — OTel/Faro → Grafana runbook (`make obs-up` / `make obs-smoke`)
- [Query Budget](.docs/QUERY_BUDGET.md) — query-count tests, dataloaders, TanStack caching/eviction
- [Project Management](project-management/README.md) — intent → spec → plan → PRs; intents in `project-management/intents/` (copy `_template.md`), one intent → many PRs. Link to specs/plans/PRs; don't move them.
- [PR Workflow](.docs/PR_WORKFLOW.md) · [Planning](.docs/PLANNING.md) · [Hooks](.docs/HOOKS.md) · [Session Environment](.docs/SESSION_ENVIRONMENT.md)
- [claude-md-audit eval](evals/claude-md-audit/README.md) — scores the `claude-md-improver` skill; rerun after changing CLAUDE.md tooling

**How-to guides:**
- [Adding a Content Type](.claude/docs/ADDING_CONTENT_TYPE.md) — end-to-end, backend + frontend
- [Content Type Designer](tools/content-type-designer/README.md) — plan a new type's columns, tooltips and details view before coding. `dist/` is committed: after editing `src/`, run `npx tsc -p tsconfig.json` in that dir and commit both (not its package-lock.json). Serve it (`python3 -m http.server`) to test; ES modules won't load from file://. Cloud sessions have Playwright at /opt/node22/lib/node_modules/playwright.

**Planning & backlog:**
- [Feature Backlog](FEATURE_BACKLOG.md) — capture future ideas here during development
- [ADRs](docs/adr/README.md) — recorded decisions, including deliberately deferred features; check before proposing one
- [Bug Tracking](.docs/BUG_TRACKING.md) — private (gitignored) bug tracking
- **Jeeves ("jeevesbot")** — planned AI assistant: [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md#jeeves-ai-assistant), research `.planning/v1.1-research/AI-ASSISTANT.md`, model routing [intents/jev-model-router.md](project-management/intents/jev-model-router.md). Not for oh-my-pi; harness-specific work lives in the owner's omp config repo.

**Bug logging (MANDATORY):** log every bug you discover in `.planning/phases/bugs/BACKLOG.md` with severity and location, and open a GitHub issue from the bug report template (sensitive details — exact paths, line numbers, security specifics — stay in the backlog only). When fixed, move it to `.planning/phases/bugs/CLOSED.md` with the PR reference. These files are gitignored.

**Hooks:** Claude Code PreToolUse hooks guard `.env` reads and block `gh pr create` until `/revise-claude-md` has run (then create the PR with `gh api`). The git pre-commit hook (gofmt + prettier auto-fix) is off until `make install-hooks` (in `backend/`; fresh cloud/CI checkouts lack it). Full list: [.docs/HOOKS.md](.docs/HOOKS.md).

**Docs-only PRs must not burn CI or deploys:** `ci.yml` gates `test`/`build` on a `code-changes` job (job-level, so skipped = passed for required checks; never workflow-level `paths-ignore`); CodeQL/Trivy/mutation/frontend-test use `paths:`; Sevalla deploys are path-filtered via `allow_deploy_paths` (backend `backend/**`, frontend `frontend/**`; the frontend site also builds PR previews). Give a new workflow or Sevalla service the same gating. Repeat path lists; don't rely on GitHub Actions YAML anchors.

**Cowork session cleanup:** delete `_tmp_*` files and conversation transcript `.txt` files that claude.ai cowork sessions leave in the repo root and `frontend/` before committing.

## graphify

The knowledge graph lives in `graphify-out/`. When `graphify-out/graph.json` exists, answer codebase questions with `graphify query "<question>"` first, `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for one concept (much smaller than GRAPH_REPORT.md or raw grep). Use `graphify-out/wiki/index.md`, if present, for broad navigation; read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain fall short. After modifying code, run `graphify update .` if the CLI is installed. Cloud sessions usually lack it and the graph: use Grep/Glob and say in the PR that the update was skipped ([.docs/SESSION_ENVIRONMENT.md](.docs/SESSION_ENVIRONMENT.md)).

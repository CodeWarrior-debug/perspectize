# CLAUDE.md audit report

I audited four files against the tracked code: `CLAUDE.md` (247 lines), `backend/CLAUDE.md` (201), `frontend/CLAUDE.md` (254) and `.claude/CLAUDE.md` (3). I did not run any builds or tests, so these are static checks only.

**Overall:** the content is detailed and much of it is accurate, but the backend file is noticeably stale. The root and frontend files are mostly accurate and only partly bloated.

## Wrong or stale (fix first)

| File | Claim | Reality |
|---|---|---|
| `backend/CLAUDE.md` | `go 1.25` minimum and `golang:1.26-alpine` in the Dockerfile | `go.mod` has `go 1.26` and `toolchain go1.26.0`. `Dockerfile:2` uses `golang:1.27-alpine`. |
| `backend/CLAUDE.md` | Resolvers go in `resolvers/feature_resolver.go` | Files are `<domain>.resolvers.go`, as the same file says elsewhere. |
| `backend/CLAUDE.md` | Repository impl is `postgres/feature_repository.go` | Files are `gorm_<x>_repository.go`. The `.sqlx.bak` files are leftovers. |
| `backend/CLAUDE.md` | Repo ports live in `ports/repositories/` and the tree lists only `domain/`, `ports/`, `services/` | The tree is incomplete. It omits `adapters/auth`, `realtime`, `wikidata`, `web`, `dataloader`, `directives`, `internal/demo`, `internal/perf`, `cmd/seed-*`, and `pkg/logger` and `pkg/middleware`. It lists `internal/middleware/`, which doesn't exist. The middleware is at `adapters/web/middleware/` and `pkg/middleware/`. |
| `backend/CLAUDE.md` | CORS "allows all origins (`*`). Restrict before deploying" | `main.go:302-303` uses `secCfg.CORSOrigins` (a config allowlist). This is a real security misstatement. |
| `backend/CLAUDE.md` | Two config sources, only `DATABASE_URL` required, optional `YOUTUBE_API_KEY` and `DATABASE_PASSWORD` | The code also handles Clerk, rate limits, CORS origins, retention and demo mode. The list is far from complete. |
| `backend/CLAUDE.md` | Commands include `make migrate-version` and `make migrate-force`, with `make docker-up` in setup | The `Makefile` has `migrate-version` and `migrate-force`, but they are missing from `.PHONY`. This is minor. |
| `backend/CLAUDE.md` | `make graphql-gen` leaves a stray `schema.resolvers.go` | `gqlgen.yml` has two schema files (`schema.graphql` and `messaging.graphql`), so the "one schema file" explanation is out of date. It's also inconsistent with the "one file per domain" rule at line 39. Check it before trusting the recovery steps. |
| `backend/CLAUDE.md` | `make migrate-up` in the setup line | The root file says never to run it. The two files contradict each other. |
| `backend/CLAUDE.md` | Testing dirs are `test/services/` and `test/repositories/` | Also present: `test/resolvers`, `realtime`, `messaging`, `youtube`, `domain`. Some tests sit in-package. |
| `frontend/CLAUDE.md` | The architecture tree shows `routes/` with only `+page.svelte`, `components/` with `Header`, `PageWrapper` and `AGGridTest`, and `shadcn/` with only `button/` | The real routes are `compare`, `discover` and `messages`. There are about 40 components. `AGGridTest.svelte` is gone. `shadcn/` has `button`, `dialog`, `drawer`, `input`, `label`, `popover`, `select` and `switch`. Only the `queries/` layout is current. |
| `frontend/CLAUDE.md` | `+layout.ts` has `prerender = true` | It sets `prerender = false`, `ssr = false` and `csr = true`. |
| `frontend/CLAUDE.md` | "One folder per domain … `content` example" | Accurate. The bible, categories, messaging, perspectives and users folders exist. |
| `CLAUDE.md` | "Local default branch is `master`, remote is `main`" | This matches the git state, so it's fine. |
| `CLAUDE.md` | Delegation table names subagents `go-backend`, `graphql-designer`, `db-migration`, `code-reviewer` and `test-writer` | `.claude/agents/` has no tracked content I could see. Verify these exist. |
| `CLAUDE.md` | "Vendored GSD (`.claude/get-shit-done/`, curated `.claude/commands/gsd/`)" | `.claude/get-shit-done/` doesn't exist. `.claude/commands` isn't a directory here. |
| `CLAUDE.md` | Hooks in `.claude/hooks/*.sh` and `settings.json` | No hook scripts are tracked, and the directory is empty from my view. `settings.json` was unreadable in the sandbox. I couldn't verify any of the six hooks described. |
| `CLAUDE.md` | `.planning/phases/bugs/BACKLOG.md` is mandatory, gitignored | It doesn't exist in this checkout. That's plausible, since it's gitignored and hand-created. |
| `CLAUDE.md` | `graphify-out/` and the "graphify" pre-search step | `graphify-out/` isn't present. The step silently does nothing. The "Context Lookup" section is also a stub that says qmd is retired and points to another section. |
| `CLAUDE.md` | "Shared Sevalla dev database" | `docs/superpowers/plans/` has Neon migration plans (2026-09-03). If that migration happened, the "database is remote (Sevalla)" statements in both files are stale. |

## Confirmed accurate

- `.hooks/pre-commit` exists and has the `hex-ok:` allowlist.
- The `make install-hooks` target sets `core.hooksPath` to `.hooks`.
- `go-version-file: backend/go.mod` is used in CI.
- The `lib/queries/{content,...}/index.ts` layout matches.
- The `IntID` scalar at `pkg/graphql/intid.go` exists.
- The `useAuthState`, `$lib/auth` and demo-mode facade files exist.
- `grid-config.ts`, `grid-theme.ts`, `versionWatch.ts` and `theme/store.svelte.ts` exist.
- `gen-preset-css.mjs`, `docs/AG_GRID.md`, `docs/FIGMA.md`, `FEATURE_BACKLOG.md`, the `.docs/*` links and the `.claude/docs/*` how-tos exist.
- `tests/helpers/TestWrapper.svelte`, `tests/browser/`, `vitest.config.browser.ts` and `frontend/tests/` exist.
- The AG Grid pin at 32.3.9 and `ag-grid-svelte5` match.
- Migrations are numbered up to 27, with gaps at 17 and 22. Root's advice to `ls` first is sound.

## Quality and structure

- **Bloat in the frontend file.** About 40% of it is incident narratives, such as the `feature/messaging-frontend` baseline story, the Cloudflare `_headers` write-ups and the descender-clipping note. These belong in `.docs/` or the code comments. They cost context on every session and go stale.
- **Bloat in the root file.** The PR-label, demo-video and cloud-vs-local rules take about 60 lines. They are workflow policy, not repo orientation.
- **Contradictory rules.** Root says "no chained `&&`", but the frontend file recommends `cd frontend && pnpm exec ...`, and the backend setup line chains four commands.
- **Root duplicates the backend and frontend files.** The Self-Verification section appears in all three, and the frontend file adds a Chrome DevTools section that is separate from the root's.
- **`.claude/CLAUDE.md` is a 3-line graphify stub** and is redundant with the root's `graphify` section.
- **Planning workflow is confusing.** There are three overlapping systems: superpowers (primary), GSD (legacy but with vendored commands) and `.planning/`. The root file spends about 15 lines on this.

## Recommended actions

1. Fix the backend facts: the Go and Dockerfile versions, the CORS statement, the directory tree, the feature-checklist filenames and the config list.
2. Fix the frontend architecture tree and the `prerender` value. Better still, replace the tree with a one-line pointer to `frontend/STRUCTURE.md`, which exists.
3. Resolve the `make migrate-up` contradiction between the root and backend files.
4. Remove or verify the references to `.claude/get-shit-done/`, the `gsd` commands, the agents and the hooks.
5. Confirm whether the database is Sevalla or Neon, and update both files.
6. Move incident stories and workflow policy out into `.docs/` and link them.
7. Delete `.claude/CLAUDE.md`, or fold it into the root.

## Limits of this audit

I couldn't read `.claude/settings.json` or see hook and agent contents because of the sandbox. Claims about those are unverified, not confirmed wrong. I checked file and structure claims against the tracked tree, not runtime behavior. Anything about Sevalla, CI job behavior or PR labels needs a person to confirm.

I can apply items 1–4 and 7 as edits if you want. That's a safe, contained change.

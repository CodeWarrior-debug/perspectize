I audited all four CLAUDE.md files against the code. The commands and paths are mostly accurate. The backend file has drifted the most, and the two top-level files contradict each other in one place that could damage shared data.

## Scorecard

| File | Lines | Accuracy | Signal-to-noise | Grade |
|---|---|---|---|---|
| `CLAUDE.md` (root) | 246 | Mostly accurate, but contradicts itself | Low: mostly PR and label process | **C+** |
| `backend/CLAUDE.md` | 201 | Several stale facts (versions, paths, CORS, cursors) | Good | **C** |
| `frontend/CLAUDE.md` | 253 | High: nearly every path and symbol exists | Good, but long and story-heavy | **B+** |
| `.claude/CLAUDE.md` | 3 | Points at a file that isn't in the repo | n/a | **D** |

## Critical: the migration instructions conflict
- **Root** (line 139) says never run `make migrate-up`, because `DATABASE_URL` points at the shared Sevalla dev database.
- **Backend** tells you to do exactly that:
  - line 63: "Setup: `… make docker-up && make migrate-up`"
  - line 75: lists `migrate-up`/`migrate-down` as daily commands
  - line 96: "Migrations run against the remote DB."

  An agent working in `backend/` gets both files loaded and could apply a migration to the shared database.
- The root's reasoning is also a bit off. The Makefile's own default is `localhost:5432/testdb` (`backend/Makefile:10`). What points at Sevalla is `DATABASE_URL` in `.env`, which the Makefile loads.

## Backend: facts that no longer match the code
| Claim | Reality |
|---|---|
| "Go 1.25+", `go 1.25` / `toolchain go1.26.0`, Dockerfile `golang:1.26-alpine` | `go.mod` has `go 1.26`; the Dockerfile uses **`golang:1.27-alpine`**. The Dockerfile and toolchain now disagree, which breaks the file's own rule that the Dockerfile should match. |
| CORS "allows all origins (`*`). Restrict before deploying" | Already restricted: it reads `CORS_ORIGINS` (`internal/config/security.go:57`, `main.go:302`). `*` is only the fallback when the variable is unset. |
| "Required: `DATABASE_URL`. Optional: `YOUTUBE_API_KEY`, `DATABASE_PASSWORD`" | In production the server stops at startup without `JWT_SECRET` (at least 32 bytes) and `CLERK_SECRET_KEY`. `.env.example` has 15 variables. |
| Resolvers live at `adapters/graphql/{…}.resolvers.go`; mapping lives in `adapters/graphql/helpers.go` | Both are under `adapters/graphql/resolvers/`. |
| "one `schema.graphql`… the real fix is to split `schema.graphql` per domain" | The split has started: `messaging.graphql` exists and is listed in `gqlgen.yml:6`. The collision warning still applies to `schema.graphql`. |
| User/Category repos "still use hand-rolled `encodeCursor`/`decodeCursor`" | Those functions exist only in the `*.sqlx.bak` files. The "Cursor pagination… helpers in `helpers.go`" gotcha is stale for the same reason. |
| Tree shows `internal/middleware/` | Doesn't exist. Middleware is in `pkg/middleware` and `internal/adapters/web/middleware`. The tree also leaves out `auth`, `realtime`, `web`, `wikidata`, `dataloader`, `directives`, `demo` and `perf`. |
| "Adding a New Feature": `postgres/feature_repository.go`, `resolvers/feature_resolver.go` | The real naming is `gorm_feature_repository.go` and `feature.resolvers.go`. Following the recipe as written creates misnamed files. |

These backend claims checked out: the `Paginate()` two-error gotcha (the code checks `pageResult.Error`), `extractResourceID`/`fieldByJSONTag`, `clearConfigEnvVars`, `extraFields: PrimaryCategoryID`, `JSON → graphql.Map`, `first: Int = 10`, and `pkg/graphql/intid.go`.

## Frontend: small drift, otherwise very accurate
- **Wrong:** `+layout.ts` is described as `prerender = true`. It's actually `prerender = false; ssr = false`.
- **Wrong:** the tree lists `AGGridTest.svelte`, which no longer exists. The tree also shows 3 components when there are about 40, plus 8 subfolders.
- **Contradicts itself:** line 196 says `_headers` uses `s-maxage=0`. The real file (`static/_headers`) uses `no-cache, must-revalidate`, which is what line 200 correctly describes.
- **Minor:** `npx tsx gen-preset-css.mjs` relies on `tsx`, which isn't a dependency, so `npx` downloads it each time.

Everything else I checked exists and matches:
- **Files:** `store.svelte.ts`, `derive.ts`, `grid-config.ts` (with `COLUMNS` as the single source the others are built from), `grid-theme.ts`, `versionWatch.ts`, `TestWrapper.svelte` (`wrapped.Comp`) and `#stale-chunk-recovery`.
- **Values:** the `pollInterval`, the breakpoints (445/640/900 tiers and the 860px card mode), and `max-w-screen-xl`.
- **Tests and CI:** the `svelte-clerk` stub, `PW_CHROMIUM_EXECUTABLE`, browser tests running in CI, and the `@ag-grid-community/*` imports.

## Root: contradictions and dead references
- **Branch names:** line 21 says the local default is `master` (true), but line 100 says `git checkout main && git pull origin main`.
- **"No chained bash commands" (line 135)** is broken by the file's own examples (line 100), by backend lines 63 and 71, and by frontend line 66 (`cd frontend && pnpm exec`).
- **How to create PRs is inconsistent:**
  - line 42 lists `gh pr create` as normal usage;
  - line 72 says PRs are made via `gh api`, not `gh pr create`;
  - line 218 says a hook blocks `gh pr create`.

  One clear rule would replace about 40 lines.
- **Referenced but not in git:** `.claude/settings.json`, `.claude/hooks/*.sh`, `.claude/agents/` (the `go-backend`, `test-writer` etc. subagents), `.claude/get-shit-done/`, `.claude/commands/gsd/` and `.claude/scripts/sv-chrome.sh`. `.gitignore` doesn't exclude them, so either this checkout is a partial snapshot or a fresh clone lacks everything the hooks and subagents sections describe. Worth confirming which.
- **Dead or empty sections:**
  - The "Context Lookup (graphify)" section (lines 15–17) only says qmd is retired. Delete it.
  - `graphify-out/` is gitignored and missing here, so "This project has a knowledge graph" is conditional at best.
  - The Agent Delegation table depends on untracked subagents.
- **Mostly process, little code guidance:** about 60% of the file is PR, label and cloud-versus-local workflow (demo labels, takeover labels, template tables). Much of it could move to `.docs/` behind one link.
- **Accurate:** the PR template sections, `make install-hooks` (in `backend/Makefile`), the pre-commit behaviour (gofmt, prettier and the hex-colour block), the demo Postgres on 5434, and the linked `.docs/` files.

## `.claude/CLAUDE.md`
Its only content points at `.claude/skills/graphify/SKILL.md`, which isn't in the repo. Delete it or merge it into the root graphify section.

## Suggested fixes, in priority order
1. Make the backend Commands and Configuration sections match the root's no-migrations rule, and fix the root's "Makefile default" wording.
2. Fix the backend Go versions (or bring the Dockerfile back in line with the toolchain), the CORS section, required env vars, resolver and helper paths, the cursor notes, and the Adding a Feature file names.
3. Fix the frontend `+layout.ts` claim, the `s-maxage` sentence and the directory tree. I'd replace the tree with a pointer to `frontend/STRUCTURE.md` rather than keep a snapshot that goes stale.
4. In the root file, settle `master` vs `main`, remove the `&&` examples or the no-chaining rule, pick one PR-creation rule, and delete the qmd stub and `.claude/CLAUDE.md`.
5. Trim the story-style gotchas in the frontend file (e.g. line 253's session history) down to the rule and one reference.

I didn't check the PWA claim that the service worker is never registered; confirming it needs a production build. I haven't edited anything. Want me to apply fixes 1–4?

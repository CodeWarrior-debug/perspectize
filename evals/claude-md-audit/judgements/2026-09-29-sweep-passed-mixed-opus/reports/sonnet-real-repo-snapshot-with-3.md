## CLAUDE.md Quality Report

I checked the four files against the actual code. I did not edit anything.

### Summary
- **Files found:** 4 (`./CLAUDE.md`, `./backend/CLAUDE.md`, `./frontend/CLAUDE.md`, `./.claude/CLAUDE.md`)
- **Average score:** about 65/100
- **Files needing update:** 3, and one is a tiny stub that needs no work
- **Not verifiable:** `.claude/hooks/`, `agents/`, `commands/`, `skills/` and `settings.json` show up as character-special files in this sandbox, so I couldn't read them. Only `.claude/docs/`, `gsd-file-manifest.json`, `package.json` and `.env.example` are tracked in git.

### 1. `./CLAUDE.md` (root, 246 lines) — **68/100 (D+/C-)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 14/20 | Verify checklist and `gh api` recipes are good. There is no root quick-start. |
| Architecture clarity | 12/20 | It defers to the package files. Fine, but there is no repo map (`docs/`, `.docs/`, `.planning/`, `data/`, `tools/`, `testdata/`). |
| Non-obvious patterns | 13/15 | Strong: the `master`/`main` gotcha, `gh pr edit` breaking, `pnpm exec` from the wrong directory, and the cloud-vs-local PR rules. |
| Conciseness | 5/15 | Too long. Hook internals, cloud-session and label rules, and the superpowers/GSD history could move into `.docs/`. |
| Currency | 10/15 | Some claims can't be checked (see below). The rest match the code. |
| Actionability | 12/15 | Mostly concrete. |

**Issues**
- **Contradiction about Postgres.** The "Never run `make migrate-up`" rule says there is no local Postgres and `DATABASE_URL` points at the shared Sevalla dev DB. `backend/CLAUDE.md` tells you to run `make docker-up && make migrate-up` in Setup and says "Migrations run against the remote DB". These need to agree, and the safer root rule should win.
- **Sevalla vs Neon.** `docs/superpowers/plans/2026-09-03-neon-postgres-migration-plan.md` plans a move from Sevalla to Neon, and `.docs/ARCHITECTURE.md` already shows Neon. Every "shared Sevalla dev database" statement should be re-checked against that.
- **Unverifiable or possibly stale references:**
  - `.claude/get-shit-done/`, `.claude/commands/gsd/` and `.claude/scripts/sv-chrome.sh` are not in git and not in the working tree.
  - The `go-backend`, `graphql-designer`, `db-migration`, `code-reviewer` and `test-writer` subagents in the delegation table don't appear in tracked files.
  - `.claude/sv-profile/` and the hook scripts can't be confirmed either.
  - The claim that the plugin is enabled in `.claude/settings.json` can't be confirmed.
- **Missing target.** `.planning/phases/bugs/BACKLOG.md` is mandated for bug logging, but `.planning/phases/bugs/` doesn't exist. It is gitignored, so it may just be absent on this machine. Say "create it if missing".
- **Redundant graphify text.** The "Context Lookup (graphify)" section only points to another section. `graphify-out/` doesn't exist, so the rule is a no-op until generated.
- **Duplicated cloud-session guidance.** The `gh` unavailable/unauthenticated notes appear three times.

**Verified correct:** every linked doc exists (`.docs/*`, `.claude/docs/*`, `frontend/docs/*`, `FEATURE_BACKLOG.md`), the `.gitignore` entries match, `.hooks/pre-commit` and `make install-hooks` exist, the plan file `2026-08-15-clerk-derived-user-identity-plan.md` exists, and the CI `gofmt -l .` check is real.

### 2. `./backend/CLAUDE.md` (201 lines) — **62/100 (C)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 14/20 | The make targets exist, but the setup line is risky (see above). |
| Architecture clarity | 10/20 | The tree is outdated. |
| Non-obvious patterns | 13/15 | The gqlgen and GORM gotchas are excellent. |
| Conciseness | 8/15 | |
| Currency | 6/15 | Several confirmed errors. |
| Actionability | 11/15 | |

**Confirmed errors**
1. **CORS is wrong.** It says CORS "allows all origins (`*`). Restrict … before deploying." `cmd/server/main.go:302` now uses `secCfg.CORSOrigins`. The default is still `["*"]` (`internal/config/security.go:57`), but it is configurable through `CORS_ORIGINS`. Reword it to say so.
2. **Go version is wrong.** The doc says `go 1.25` / `toolchain go1.26.0` and a `golang:1.26-alpine` image. The repo has `go 1.26`, `toolchain go1.26.0` and `golang:1.27-alpine` in `backend/Dockerfile`. The Stack line ("Go 1.25+") is stale too.
3. **The resolver path is wrong.** "Adding a New Feature" says `resolvers/feature_resolver.go`. The real convention is `{domain}.resolvers.go`, as the Deep Modules section itself says. It also says the repository impl is `postgres/feature_repository.go`, but the real names are `gorm_<x>_repository.go`.
4. **The architecture tree is outdated.**
   - `internal/middleware/` doesn't exist. Middleware is in `pkg/middleware/`.
   - The adapters list omits `auth/`, `realtime/`, `web/`, `wikidata/`, `graphql/{dataloader,directives,generated,model}`.
   - It omits `internal/{demo,perf}`, and `pkg/logger`.
   - It says `youtube/` is the API adapter, which is right, but `wikidata` is missing.
5. **Stale `.sqlx.bak` files.** The three `*.sqlx.bak` files in `adapters/repositories/postgres/` may be worth deleting, or at least noting.
6. **The `Makefile` list is incomplete.** `migrate-up-n`, `migrate-down-n`, `build`, `clean` and `test-duplication` are missing from the Commands section. `make fmt && make lint` and the others are fine.
7. **Vague configuration line.** "Sevalla may require `?sslmode=disable`" is unclear given the Neon move.

**Verified correct:** `gqlgen.yml` has `follow-schema`, `dir: …/resolvers`, `{name}.resolvers.go`, `JSON` and `IntID`. `gorm-cursor-paginator v2.7.0` is in `go.mod`. `pkg/graphql/intid.go` exists. `directives/auth.go` exists. The `graphql.Map` claim and the top-level `strconv.Atoi` ID claim hold (`content.resolvers.go:339`).

### 3. `./frontend/CLAUDE.md` (253 lines) — **72/100 (B-)**

| Criterion | Score | Notes |
|---|---|---|
| Commands/workflows | 15/20 | `test:browser`, `test:all`, `test:coverage`, `format` and `build` are missing. |
| Architecture clarity | 11/20 | The tree is badly outdated. |
| Non-obvious patterns | 15/15 | Best in the repo, and specific enough to be useful. |
| Conciseness | 6/15 | Very long. Bug-history anecdotes (PR #366, the `feature/messaging-frontend` baseline story) belong in commit messages. |
| Currency | 12/15 | |
| Actionability | 13/15 | |

**Confirmed errors**
1. **`+layout.ts` is wrong.** The doc says `prerender = true`. The file actually has `prerender = false`, `ssr = false` and `csr = true`. That matters for an SPA, since this file governs how the app builds.
2. **The listed components are stale.** `AGGridTest.svelte` no longer exists. The tree also shows `shadcn/` as containing only `button/`. It actually has `button, dialog, drawer, input, label, popover, select, switch`. The real `components/` has about 40 files plus `auth/`, `discover/`, `interlinear/`, `messaging/`, `onboarding/` and `theme/`.
3. **The `lib/` dirs are incomplete.** `auth/`, `theme/`, `messaging/`, `onboarding/`, `services/`, `stores/`, `data/` and `types/` are not shown. The queries tree omits `bible/`, `messaging/`, `perspectives/`, `users/` and `categories/`, although the Deep Modules text mentions some of them.
4. **The routes are incomplete.** Only `+page.svelte` is listed. `compare/`, `discover/` and `messages/` are missing.
5. **The Tailwind claim is unverified.** It says "Tailwind v4 uses `--color-*`", which is fine, but `tailwind.config.ts` exists next to it. Check whether it is still used.
6. **The AG Grid version wording.** "Bundles AG Grid v32.x" is consistent with `@ag-grid-community/*` 32.3.9.

**Verified correct:** all cited source and test files exist: `grid-config.ts`, `grid-theme.ts`, `theme/derive.ts`, `theme/store.svelte.ts`, `gen-preset-css.mjs`, `css-agreement.test.ts`, `contentTypeFilter.ts` and its test, and `TestWrapper.svelte`. So do `static/_headers`, `static/_redirects` and `vitest.config.browser.ts`. The `VITE_GRAPHQL_URL` default is right. The `versionWatch` 60s focus interval is right. The browser tests do run in CI. `pnpm run test:run` and `check` are real scripts. `src/lib/components/ui/` correctly does not exist.

**Unverified:** "The PWA service worker is built but never registered." I found no `registerSW` reference in `src/`, `vite.config.ts` or `svelte.config.js`, which is consistent with the doc. I didn't check the build output.

### 4. `./.claude/CLAUDE.md` (3 lines) — **35/100 (D)**
It is only an auto-generated graphify stub. That is fine as a stub, but it is redundant with the root `## graphify` section, and `.claude/skills/graphify/SKILL.md` can't be verified here. Consider deleting it or merging it into the root file.

### Recommended changes (highest value first)
1. **Fix the confirmed factual errors:** `+layout.ts` prerender, the CORS note, the Go and Docker versions, the resolver and repository filenames, and the stale `AGGridTest`/`shadcn` tree.
2. **Reconcile the migration and database guidance:** make backend Setup match the root "never run `make migrate-up`" rule, and confirm whether dev is on Sevalla or Neon.
3. **Refresh both architecture trees.** Better still, replace them with a short "see `frontend/STRUCTURE.md`" pointer, since that file exists and doesn't rot as fast in a CLAUDE.md.
4. **Trim the root file** by moving hook, label and cloud-session mechanics into `.docs/`. Target under 150 lines.
5. **Remove or verify** references to `.claude/get-shit-done/`, `.claude/scripts/sv-chrome.sh` and the five named subagents.
6. **Add the missing commands:** `pnpm run test:browser`, `test:coverage` and `format`; `make migrate-up-n` and `migrate-down-n`.

Do you want me to apply items 1–3 and 6? I'd show each diff before writing. Items 4 and 5 need your call, since I can't see the hook and agent files from here.

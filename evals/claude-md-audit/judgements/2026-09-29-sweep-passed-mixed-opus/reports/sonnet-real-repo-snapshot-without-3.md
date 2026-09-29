# CLAUDE.md quality report

I audited all four files against the repo: `CLAUDE.md` (246 lines), `backend/CLAUDE.md` (201), `frontend/CLAUDE.md` (253) and `.claude/CLAUDE.md` (3). I checked referenced paths, Makefile targets, `go.mod`, the Dockerfile, `gqlgen.yml`, `package.json`, the source trees and the gitignore. I changed nothing.

| File | Accuracy vs. code | Verdict |
|---|---|---|
| `backend/CLAUDE.md` | Mixed: a few claims are wrong and one is security-relevant | Fix soon |
| `frontend/CLAUDE.md` | Gotchas are strong; the architecture section is badly stale | Fix the tree, trim the rest |
| `CLAUDE.md` (root) | Process rules are mostly sound, with several dead references and contradictions | Prune |
| `.claude/CLAUDE.md` | Harmless, but it duplicates the root | Merge or delete |

## Backend: claims that contradict the code

1. **CORS is wrong and misleading.** The file says CORS "currently allows all origins (`*`). Restrict … before deploying." In fact `cmd/server/main.go:302` uses `secCfg.CORSOrigins`, config-driven and labelled C-05, and the websocket origin check reuses the same list. Someone following the doc could "fix" a problem that no longer exists.
2. **Go versions are stale.** The doc says `go 1.25`, `toolchain go1.26.0` and a `golang:1.26-alpine` image. `go.mod` says `go 1.26`, and the Dockerfile and `Dockerfile.demo` use `golang:1.27-alpine`. The "Stack" line still says "Go 1.25+".
3. **The architecture tree has wrong paths.**
   - `internal/middleware/` doesn't exist. The real ones are `adapters/web/middleware/` and `pkg/middleware/`.
   - The tree omits `adapters/auth`, `realtime`, `wikidata`, `web`, `internal/demo` and `pkg/logger`.
   - "Pull mapping down" points to `adapters/graphql/helpers.go`. The file is `adapters/graphql/resolvers/helpers.go`.
4. **"Adding a New Feature" uses names that don't match convention.** It says `feature_repository.go` and `feature_resolver.go`. The real patterns are `gorm_<x>_repository.go` and `<x>.resolvers.go`.
5. **The `schema.resolvers.go` collision story is out of date.**
   - The doc says there is "one `schema.graphql`". `gqlgen.yml` now lists `schema.graphql` and `messaging.graphql`, so `follow-schema` generates both `schema.resolvers.go` and `messaging.resolvers.go`.
   - The recovery advice ("delete the stray file") could delete a real file.
   - The "one file per domain" bullet still points at the old layout.
6. **The hand-rolled cursor claim looks stale.** The doc says `GormUserRepository` and `GormCategoryRepository` use `encodeCursor`/`decodeCursor`, but grepping `backend/internal` finds no `encodeCursor`. The "Cursor pagination" gotcha says `cursor:<id>` base64, and I couldn't find that format in `helpers.go`.
7. **The setup instructions contradict themselves and the root file.**
   - The Commands block says `make docker-up && make migrate-up`. Root says never run `migrate-up` because it hits the shared Sevalla database.
   - The Configuration section says no `docker-up` is needed.
   - Its `&&`-chained commands (`make fmt && make lint`) break root's "no chained bash commands" rule.
8. **The config section is incomplete.** It lists only three variables. `config.go` also reads `YOUTUBE_API_KEY_CACHE_TTL_SECONDS`-style TTL, `MESSAGE_RETENTION_*` and the security/CORS settings.

## Backend: verified as accurate

The GORM separation and file names, the `gorm-cursor-paginator` v2.7.0 gotcha, `IntID` plus `contentByID(id: ID!)`, the `extraFields` example, the `SortOrder` binding, and all Makefile targets. CI does use `go-version-file`.

## Frontend

1. **The architecture tree is badly stale.**
   - It lists `AGGridTest.svelte`, which doesn't exist.
   - It shows `shadcn/` as "(button/)" only. There are now button, dialog, drawer, input, label, popover, select and switch.
   - It shows only the `content/` query folder. There are also `bible`, `categories`, `messaging`, `perspectives` and `users`.
   - It omits the `compare`, `discover` and `messages` routes and `lib/{auth,messaging,theme,stores,onboarding,services}`.
   - It says `+layout.ts` has `prerender = true`. The file says `prerender = false; ssr = false`.
2. **The TanStack version is off.** The doc says "v5+" and cites v5 semantics, but `package.json` has `@tanstack/svelte-query ^6.2.4`. Recheck the `isLoading`/`isPending` note against v6.
3. **Some paragraphs are incident write-ups, not instructions.** Examples are the `$effect` bug histories, the ten-dispatch baseline story at the bottom, the Vitest capture list and the long `_headers` and stale-chunk sections. Each has a useful rule in it, but the narrative costs context on every session. Move the narrative to `frontend/docs/` and keep a one-line rule plus a link.
4. **It's accurate on the rest:** the AG Grid `ag-grid-svelte5` and `@ag-grid-community/*` setup, `grid-config.ts`, `grid-theme.ts`, `versionWatch.ts`, `_headers`/`_redirects`, `TestWrapper.svelte`, `test:browser`, `.svelte.ts` and `gen-preset-css.mjs`. The "one place for column metadata" advice matches the code.

## Root

1. **Dead references.**
   - `.claude/get-shit-done/` (the "frozen vendored GSD") doesn't exist.
   - `.claude/scripts/sv-chrome.sh` doesn't exist, though `VERIFICATION.md` §0 reportedly depends on it.
   - `graphify-out/` and `.claude/skills/graphify/SKILL.md` are absent. The graphify rules say to query them first, so a session will just hit errors.
2. **Contradictions.**
   - The "Context Lookup" section only says "qmd is fully retired — see graphify below". Delete it.
   - The file says "Always use `gh`" and shows `gh pr create`, then says PRs must be made via `gh api` because a hook blocks `gh pr create`.
   - The "no `&&`" rule conflicts with `cd frontend && pnpm exec` in the frontend file.
3. **The root is too long and too process-heavy.** About half of it is PR, label and demo-video policy. The cloud-versus-local material is repeated in four places. Move the PR and label policy to `.docs/` and leave a summary.
4. **It omits the root `Makefile`**, which has `start`, `stop`, `restart`, `status`, `logs` and the `demo-*` targets. This is the main dev entry point.
5. **Possibly stale.** Plans dated 2026-09-03 (`neon-postgres-migration`, `neon-performance-tuning`) suggest the database may have moved from Sevalla to Neon. Root and backend both hard-code "shared Sevalla dev database". Confirm with the owner.
6. **Verified as accurate:**
   - All the `.docs/*` and `frontend/docs/*` links exist.
   - The four PR templates match the table.
   - The superpowers plan path exists.
   - `make install-hooks` lives in `backend/Makefile` and sets `core.hooksPath .hooks`.
   - The pre-commit hook does what's described. It enforces the hex-colour block on `frontend/src/lib/components/*.svelte` (top level), whereas the doc says `components/**`.
   - `.planning/phases/bugs/` is gitignored, though the directory doesn't exist yet.
   - The migration-numbering advice is sound. Numbers 17 and 22 are gaps, so it's a real risk.

## `.claude/CLAUDE.md`

It has three lines about `/graphify` and duplicates the root's graphify section. Keep one copy.

## What I could not verify

The sandbox masked `.claude/hooks`, `agents`, `commands` and `skills`, and `settings.json` was unreadable. So I couldn't check:
- the hook script names, or the claim that `require-session-reflection-before-pr.sh` exists;
- the `go-backend`, `graphql-designer`, `db-migration`, `code-reviewer` and `test-writer` subagents in the delegation table;
- the superpowers plugin being enabled.

Run `ls .claude/hooks .claude/agents` on a normal shell to close that gap. I also didn't run any builds or tests.

## Suggested order of fixes

1. Backend CORS paragraph. It's the only one with security implications.
2. Backend Go versions, middleware and helpers paths, feature-naming steps, and the gqlgen collision section.
3. The backend setup commands that contradict the "never migrate" rule.
4. Frontend architecture tree.
5. Delete the dead root references (GSD dir, `sv-chrome.sh`, qmd section) and fix or drop graphify.
6. Move the incident narratives and PR policy out to docs.

I can make these edits if you want. I'd start with items 1–4, since they are all checkable against the code.

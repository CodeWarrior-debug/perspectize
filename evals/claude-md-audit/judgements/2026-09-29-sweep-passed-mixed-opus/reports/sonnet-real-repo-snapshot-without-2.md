# CLAUDE.md quality report

I checked four files against the code: root (246 lines), `backend/` (201), `frontend/` (253) and `.claude/CLAUDE.md` (3).

**Overall:** the content is unusually specific and much of it is verified. The gotchas name real files and real causes. But the backend file has drifted furthest from the code. The root file has some stale or contradictory claims and is too long.

## Verified accurate
- Backend directory layout: `core/{domain,ports,services}`, `adapters/*`, `pkg/*` and `cmd/server`.
- `gorm_*_repository.go`, `gorm_mappers.go` and `helpers.go` all exist.
- One resolvers file per domain exists, and `gqlgen.yml` has `layout: follow-schema` and `extraFields`.
- `directives/auth.go`, `pkg/graphql/intid.go`, `test/config/config_test.go`, and the frontend theme, grid and auth files all exist.
- `frontend/static/_headers` and `_redirects` exist. So do `versionWatch.ts`, `TestWrapper.svelte`, `contentTypeFilter.ts`, `gen-preset-css.mjs` and every doc linked from the root file.
- `.hooks/pre-commit` does what root describes: gofmt, prettier and the hex-colour block. `make install-hooks` sets `core.hooksPath`.
- `ag-grid-svelte5` is bundled with AG Grid v32 (`@ag-grid-community/*` at 32.3.9). `graphify-out/` and `.planning/phases/bugs/` are gitignored, as stated.

## Wrong or stale (fix these)

| File | Claim | Reality |
|---|---|---|
| backend | Postgres 17, and PostgreSQL 17 in root's links | `docker-compose.yml` and the demo compose both use `postgres:18` |
| backend | Dockerfile pins `golang:1.26-alpine` | It is `golang:1.27-alpine`, while `go.mod` has `go 1.26` and `toolchain go1.26.0` |
| backend | "Go 1.25+" and "`go 1.25` — minimum" | `go.mod` says `go 1.26` |
| backend | Pull mapping lives in `adapters/graphql/helpers.go` | It is `adapters/graphql/resolvers/helpers.go`. The file at the stated path doesn't exist |
| backend | Config comes from env vars > `config/config.json` | Only `config.example.json` exists. No code in `internal/config` or `main.go` reads a JSON file, so this looks dead |
| backend | Architecture tree lists `internal/middleware/` | Middleware is at `adapters/web/middleware/` and `pkg/middleware/`. The tree also omits `auth`, `realtime`, `wikidata`, `web`, `demo` and `perf` |
| backend | "Adding a New Feature" paths | Repo impl is `gorm_feature_repository.go`, not `feature_repository.go`. Resolver is `feature.resolvers.go`, not `feature_resolver.go`. Service ports live in `ports/services/`, which the steps skip |
| backend | CORS is in `main.go` and "currently allows all origins (`*`)" | `main.go:303` uses `secCfg.CORSOrigins`, so it is configurable. The "restrict before deploying" note is obsolete |
| backend | "Database is remote (Sevalla)… No `make docker-up` needed", plus a Setup line that runs `make docker-up && make migrate-up` | The two contradict each other. The setup line also breaks the root rule "Never run `make migrate-up`" |
| backend | "Migrations run against the remote DB" | Contradicts root's ban on running them against the shared DB |
| backend | `make test`, `make fmt && make lint` | These exist. But `migrate-up-n`, `migrate-down-n` and `test-duplication` are undocumented, and `docker-compose` (hyphenated) is used by the Makefile |
| frontend | `+layout.ts` is `prerender = true` | It is `prerender = false` with `ssr = false` |
| frontend | Component tree shows `shadcn/(button/)` and `AGGridTest.svelte`; routes show only `+page.svelte` | Actual shadcn has button, dialog, drawer, input, label, popover, select and switch. `AGGridTest` doesn't exist. Routes include `compare`, `discover` and `messages`. About 40 components go unmentioned |
| frontend | `queries/content/` is the only domain, with `client.ts` and `keys.ts` | There are also `bible`, `categories`, `messaging`, `perspectives` and `users` |
| frontend | "TanStack Query v5+" | `package.json` has `^6.2.4`. The pattern is probably still valid, but the version claim is stale |
| frontend | "Tailwind v4 uses `--color-*`" | This is fine. But a `tailwind.config.ts` still exists and contains only `content`, which is a v3 leftover |
| root | `require-session-reflection…` and the other hooks live in `.claude/hooks/*.sh` | Not verifiable here (see below) |
| root | Reference to `qmd` "retired" | Points to a `## graphify` section "near the bottom". That's fine, but the sentence is dead weight |
| root | Agent table lists subagents `go-backend`, `graphql-designer`, `db-migration`, `code-reviewer` and `test-writer` | Can't be confirmed (see below). Model pairings like "Haiku for code review" also read as opinion that may be out of date |
| root | Says `make install-hooks` is run "from `backend/`" | True, since the target lives only in `backend/Makefile`. The root Makefile has no such target, which is easy to miss |

## Could not verify
Several paths named in the root file are missing from this snapshot: `.claude/scripts/sv-chrome.sh`, `.claude/get-shit-done/`, `.claude/hooks/*.sh` and `.planning/phases/bugs/`. `.claude/hooks`, `agents`, `commands` and `skills` show up as character devices, so they are sandbox-masked. `.claude/settings.json` was permission-denied. Treat the hooks, agents, skills and settings claims as unchecked, not wrong. `.docs/VERIFICATION.md` also refers to `sv-chrome.sh`, which isn't in the tracked files. If it is really absent, that's a broken reference in both places.

## Structure and style
- **Too long and mixed:** root is 246 lines. It combines durable rules with one-off incident history (PR #366, "cowork cleanup", the `pnpm-lock` merge recipe). The frontend file has several 100–150-word paragraphs that are really bug post-mortems, such as the descender clipping, the `queryKey` story and the stale `node_modules` baseline. Those belong in `.docs/` or the commit history. Keep the rule and one line of "why".
- **Duplication:** "Deep Modules" is copy-pasted into backend and frontend. Self-verification is described in root, backend and frontend. The `.env` guidance is repeated. Hook behaviour is described three times in root.
- **Contradictions:**
  - Root's "no chained `&&`" rule conflicts with `pnpm ... && ...` and `cd frontend && pnpm exec ...` in the same docs.
  - Root's "Never run `migrate-up`" conflicts with backend.
  - "Always use `gh pr create`" is followed by "PRs are created via `gh api`".
- **`.claude/CLAUDE.md`:** three lines of auto-generated graphify boilerplate that duplicate root's `## graphify` section. Delete one.
- **Good practice worth keeping:** naming the guarding test or file next to each gotcha, and explaining why.

## Suggested priorities
1. Fix the factually wrong lines in backend: versions, helpers path, the config.json claim, CORS, the feature-add paths and the setup/migrate contradiction.
2. Fix the frontend architecture tree and the `prerender` claim, and update the TanStack version.
3. Resolve the migrate-up contradiction and the `&&` rule.
4. Move incident-style paragraphs out to `.docs/`. That could cut root and frontend by about 40%.
5. De-duplicate Deep Modules and self-verification, and delete `.claude/CLAUDE.md`.

I haven't edited anything. I can apply items 1–3 if you'd like.

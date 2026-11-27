# Codebase Structure

**Analysis Date:** 2026-11-26

## Directory Layout

```
perspectize/
├── backend/                 # Go GraphQL API (hexagonal)
│   ├── cmd/                 # server, seed-demo, seed-bible
│   ├── internal/
│   │   ├── core/            # domain, ports, services
│   │   ├── adapters/        # auth, graphql, realtime, repositories, web,
│   │   │                    # youtube, tmdb, openlibrary, webpage, wikidata
│   │   ├── assembly/        # picks real / demo / unconfigured adapters
│   │   ├── config/  demo/  perf/
│   │   └── server/          # api.go, websocket_auth.go
│   ├── pkg/                 # database, telemetry, logger, middleware, graphql, limiter, buildinfo
│   ├── migrations/          # golang-migrate SQL
│   ├── test/                # cross-package tests by area, plus roundtrips/
│   ├── config/  scripts/  perf/  docs/
│   ├── schema.graphql  messaging.graphql  gqlgen.yml
│   └── Makefile
├── frontend/                # SvelteKit SPA (Svelte 5, Tailwind 4)
│   ├── src/                 # routes/, lib/, types/, env.ts, app.html, app.css
│   ├── static/              # manifest, icons, fonts, _headers, _redirects
│   ├── tests/               # unit, components, browser, helpers, utils, setup.ts
│   ├── demo/                # Playwright tours and flows for the demo stack
│   ├── scripts/  perf/  docs/
│   └── vite.config.ts  tailwind.config.ts  vitest.config.*.ts  stryker.config.json
├── .docs/                   # repo-wide engineering docs
├── .claude/                 # docs, skills, hooks, scripts, agent-registry
├── .planning/               # codebase maps and legacy GSD planning
├── docs/                    # adr, glossary, plans, research, superpowers, user-flows
├── project-management/      # intents
├── tools/                   # standalone tools (content-type-designer, ...)
├── data/  testdata/  evals/  ops/
├── docker-compose.demo.yml  docker-compose.observability.yml
└── Makefile  CLAUDE.md  GLOSSARY-MAP.md  README.md  FEATURE_BACKLOG.md
```

## Directory Purposes

**`backend/internal/core/domain/`:** One file per concept; shared rules (privacy, error kinds, validation) live here.
**`backend/internal/core/ports/{repositories,services}/`:** Interfaces and their input types.
**`backend/internal/core/services/`:** `<aggregate>_service.go`, with splits such as `content_service_webpage.go`, `import_service_file.go`.
**`backend/internal/adapters/graphql/resolvers/`:** `<area>.resolvers.go`, `resolver.go`, `helpers.go` (mapping), `content_create.go`, `error_kinds.go`, `perspective_errors.go`.
**`backend/internal/adapters/graphql/generated/`, `model/models_gen.go`:** Generated; never hand-edit. `model/messaging.go` is hand-written.
**`backend/internal/adapters/repositories/postgres/`:** Repositories, models, mappers, and shared SQL (`audience_sql.go`, `content_facts.go`, `paging.go`).
**`backend/migrations/`:** `000001`..`000041` (numbers 17 and 22 are unused). Write and review only; never run against the shared database during development.
**`frontend/src/lib/queries/`:** `bible`, `categories`, `content`, `imports`, `messaging`, `perspectives`, `userTodos`, `users`; each has an `index.ts` and hooks.
**`frontend/src/lib/components/`:** Shared components at the top level, feature subfolders beneath; `shadcn/` holds UI primitives with a barrel `index.ts`.
**`frontend/src/lib/utils/`:** Pure helpers (`grid-config.ts`, formatting, bible, import/export); `libraryColumns/` holds Library column definitions.

## Key File Locations

**Entry Points:**
- `backend/cmd/server/main.go`
- `backend/cmd/seed-demo/main.go`, `backend/cmd/seed-bible/main.go`
- `frontend/src/routes/+layout.svelte`, `+layout.ts`

**Configuration:**
- `backend/internal/config/` (`config.go`, `demo.go`, `security.go`, `validation.go`, `import_limits.go`)
- `backend/gqlgen.yml`
- `frontend/vite.config.ts` (SvelteKit config, adapter, SPA fallback), `frontend/src/env.ts` (declared public env vars), `frontend/package.json` (`#lib` import map), `frontend/components.json`, `frontend/tailwind.config.ts`

**Core Logic:**
- `backend/internal/server/api.go`, `backend/internal/assembly/externals.go`
- `backend/internal/core/services/`
- `frontend/src/lib/queries/client.ts`, `keys.ts`
- `frontend/src/lib/components/library/ContentLibrary.svelte`
- `frontend/src/lib/contentTypes/registry.ts`

**Testing:**
- Backend: co-located `_test.go`, plus `backend/test/<area>/` (`services`, `resolvers`, `repositories`, `domain`, `roundtrips`, ...)
- Frontend: `frontend/tests/{unit,components,browser}/`; helpers such as `tests/helpers/queryBudget.ts`; demo E2E in `frontend/demo/`

## Naming Conventions

**Backend files:** snake_case; `gorm_<name>_repository.go`, `<name>_service.go`, `<area>.resolvers.go`, `*_test.go`; migrations `NNNNNN_description.{up,down}.sql`.
**Frontend files:** PascalCase `.svelte`; camelCase `.ts`; hooks `use<Name>.ts`; modules using runes `*.svelte.ts`. Some utils use kebab-case (`grid-config.ts`).
**Directories:** lowercase; camelCase where compound (`addContent`, `contentTypes`, `userTodos`, `libraryColumns`).
**Imports (frontend):** `#lib/...` with a `.js` extension for TypeScript modules (`#lib/queries/client.js`).

## Where to Add New Code

**New backend feature:**
- Domain: `internal/core/domain/<name>.go`
- Ports: `internal/core/ports/{repositories,services}/`
- Service: `internal/core/services/<name>_service.go`
- Repository: `postgres/gorm_<name>_repository.go` (model in `gorm_models.go`, mapper in `gorm_mappers.go`); reuse `audience_sql.go` and `listPage`
- Schema: edit `schema.graphql` or `messaging.graphql`, run `make graphql-gen` in `backend/`, implement the resolver
- Wiring: `cmd/server/main.go`, `server.Deps` in `internal/server/api.go`, `resolvers/resolver.go`
- Batched field: `graphql/dataloader/dataloader.go`
- Migration: next free number in `backend/migrations/`
- Tests: `backend/test/<area>/`; request-level in `test/roundtrips/`; query-count test for DB access

**New external client:** `internal/adapters/<provider>/` with `client.go` (plus cache or fixture as needed), port in `ports/services/`, selection in `internal/assembly/externals.go`.

**New content type:** follow `.claude/docs/ADDING_CONTENT_TYPE.md`; create via `services/content_pipeline.go`; add a descriptor in `frontend/src/lib/contentTypes/descriptors/` and register it in `registry.ts`.

**New frontend page:** `frontend/src/routes/<name>/+page.svelte`; components in `lib/components/<feature>/`; nav links in `Header.svelte` (one-word labels).
**New query or mutation:** `lib/queries/<domain>/use<Action>.ts` with `graphqlRequest()`, keys in `queries/keys.ts`, cache eviction inside the hook.
**New Library column:** `lib/utils/libraryColumns/`; see `.claude/docs/ADDING_AG_GRID_COLUMN.md`.
**New shadcn component:** `lib/components/shadcn/`, exported from its `index.ts`.
**Utilities:** `frontend/src/lib/utils/<name>.ts`, tested in `frontend/tests/unit/`.

## Special Directories

**`backend/internal/adapters/graphql/generated/`:** Generated, committed.
**`frontend/build`, `frontend/.svelte-kit`, `frontend/node_modules`, coverage output:** Generated, not committed.
**`graphify-out/`, `logs/`:** Generated, gitignored.
**`.planning/phases/bugs/`:** Private bug log, gitignored.
**`.claude/worktrees/`:** Numbered worktree slots (`.docs/WORKTREES.md`).

---

*Structure analysis: 2026-11-26*

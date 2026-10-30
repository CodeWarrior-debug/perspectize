# Codebase Structure

**Analysis Date:** 2026-10-01

## Directory Layout

```
perspectize/
├── backend/                    # Go GraphQL API (hexagonal)
│   ├── cmd/
│   │   ├── server/main.go      # Composition root + HTTP server
│   │   ├── seed-demo/          # Demo persona seeder
│   │   └── seed-bible/         # Bible reference data seeder (+ data/)
│   ├── internal/
│   │   ├── core/
│   │   │   ├── domain/         # Pure models, errors, pagination
│   │   │   ├── ports/{repositories,services}/  # Interfaces
│   │   │   └── services/       # Business logic
│   │   ├── adapters/
│   │   │   ├── graphql/{resolvers,generated,model,directives,dataloader}/
│   │   │   ├── repositories/postgres/   # GORM repos, models, mappers
│   │   │   ├── auth/           # Clerk/demo token verification, webhook
│   │   │   ├── web/{handlers,middleware}/
│   │   │   ├── youtube/  wikidata/  realtime/
│   │   ├── config/             # config.go, security.go, demo.go
│   │   ├── demo/               # Demo fixtures
│   │   └── perf/querycount/    # Query-count test helper (+ perf-tagged harness)
│   ├── pkg/{database,graphql,logger,middleware}/
│   ├── migrations/             # golang-migrate SQL (NNNNNN_name.up/down.sql)
│   ├── test/{config,database,domain,graphql,messaging,realtime,repositories,resolvers,services,youtube}/
│   ├── perf/k6/  docs/perf/    # Load testing
│   ├── schema.graphql  messaging.graphql  gqlgen.yml
│   ├── Dockerfile  Dockerfile.demo  docker-compose.yml  Makefile
│   └── config/                 # config.example.json
├── frontend/                   # SvelteKit 5 SPA
│   ├── src/
│   │   ├── routes/             # +layout.*, +page.svelte, discover/, compare/, messages/
│   │   ├── lib/
│   │   │   ├── components/     # Svelte components + feature folders + shadcn/
│   │   │   ├── queries/        # client.ts, keys.ts, <domain>/ (gql + hooks)
│   │   │   ├── auth/  messaging/  onboarding/  theme/  stores/
│   │   │   ├── utils/  services/  data/  assets/
│   │   ├── types/  app.css  app.html  app.d.ts
│   ├── tests/{unit,components,browser,helpers,fixtures,utils}/
│   ├── demo/{tours,flows}/     # Playwright demo/E2E
│   ├── static/                 # incl. load-bearing _headers, _redirects
│   ├── android/  ios/          # Capacitor shells
│   ├── docs/  perf/
│   └── svelte.config.js  vite.config.ts  vitest.config*.ts  stryker*.{json,mjs}  gen-preset-css.mjs
├── .docs/                      # Repo-wide how-to docs (ARCHITECTURE, QUERY_BUDGET, DEMO_MODE...)
├── .claude/                    # docs/, skills, worktrees (gitignored)
├── .github/workflows/          # ci, frontend-test, mutation, codeql, trivy, migration-labels, tag-main
├── .planning/                  # GSD (legacy) planning + codebase maps (gitignored phases)
├── docs/superpowers/           # Active plans/specs
├── tools/                      # content-type-designer, design-sync, video-capture, ...
├── data/bible/                 # Bible source data
├── evals/                      # claude-md-audit eval
├── graphify-out/               # Knowledge graph output
├── docker-compose.demo.yml     # Isolated demo stack
└── Makefile                    # demo-* and repo-level targets
```

## Directory Purposes

**`backend/internal/core/`:**
- Purpose: Hexagon core; never import `adapters/`
- Key files: `domain/errors.go`, `services/content_service.go`, `ports/repositories/content_repository.go`

**`backend/internal/adapters/graphql/resolvers/`:**
- Purpose: One file per domain, plus root `resolver.go` (holds service deps; `NewResolver`) and `helpers.go` (mapping)
- Do not keep `schema.resolvers.go` (gqlgen regenerates a colliding stub; see `backend/CLAUDE.md`)

**`backend/internal/adapters/repositories/postgres/`:**
- Purpose: GORM implementations; `gorm_models.go` structs, `gorm_mappers.go` conversions

**`backend/test/`:**
- Purpose: Black-box tests by layer (services, resolvers, realtime, messaging e2e). Many unit tests are also co-located as `*_test.go` beside source in `internal/adapters/**`.

**`frontend/src/lib/queries/`:**
- Purpose: Only place that talks to GraphQL; one folder per domain

**`frontend/src/lib/components/shadcn/`:**
- Purpose: shadcn-svelte primitives (not `ui/`), barrel export in `shadcn/index.ts`

**`frontend/static/`:**
- `_headers` and `_redirects` are required for correct SPA caching on Sevalla/Cloudflare

## Key File Locations

**Entry Points:**
- `backend/cmd/server/main.go`: server wiring
- `frontend/src/routes/+layout.svelte`: app providers
- `frontend/src/app.html`: HTML shell

**Configuration:**
- `backend/gqlgen.yml`, `backend/internal/config/*.go`, `backend/config/`
- `frontend/svelte.config.js`, `frontend/vite.config.ts`, `frontend/components.json`, `frontend/tailwind.config.ts`, `frontend/tsconfig.json`
- Env templates: `.env.example` files (never read `.env`)

**Core Logic:**
- `backend/internal/core/services/*.go`
- `frontend/src/lib/queries/**`, `frontend/src/lib/utils/grid-config.ts`

**GraphQL contract:**
- `backend/schema.graphql`, `backend/messaging.graphql`

**Testing:**
- Backend: `backend/test/**`, co-located `*_test.go`, `backend/internal/perf/querycount/`
- Frontend: `frontend/tests/{unit,components,browser}/`, helper `frontend/tests/helpers/queryBudget.ts`, demo E2E `frontend/demo/`

## Naming Conventions

**Backend files:**
- snake_case Go files: `content_service.go`; resolvers `<domain>.resolvers.go`; GORM impls `gorm_<entity>_repository.go`; ports `<entity>_repository.go` / `<entity>_service.go`; tests `*_test.go`
- Migrations: `NNNNNN_description.up.sql` / `.down.sql` (zero-padded sequence; check `ls migrations | tail` for next number)
- Constructors `NewXxx`; GORM-backed types prefixed `Gorm`

**Frontend files:**
- Components: PascalCase `.svelte` (`ActivityTable.svelte`)
- Hooks: `useThing.ts`, or `useThing.svelte.ts` when using runes
- Rune modules: `*.svelte.ts` (required for `$state` outside components)
- Utilities: camelCase `.ts` (`grid-config.ts` and `grid-theme.ts` are kebab exceptions)
- Routes: SvelteKit `+page.svelte`, `+layout.svelte`, `[param]/`
- Tests: `tests/unit/<name>.test.ts`, `tests/components/<Component>.test.ts`

**Directories:**
- Backend lower-case single words; frontend feature folders lower-case (`messaging/`), query domains lower-case plural

## Where to Add New Code

**New backend feature (follow `backend/CLAUDE.md` "Adding a New Feature"):**
- Domain: `backend/internal/core/domain/<feature>.go`
- Port: `backend/internal/core/ports/repositories/<feature>_repository.go` (+ `ports/services/` if resolvers consume it)
- Service: `backend/internal/core/services/<feature>_service.go`
- Repository: `backend/internal/adapters/repositories/postgres/gorm_<feature>_repository.go` plus entries in `gorm_models.go`/`gorm_mappers.go`
- Schema: `backend/schema.graphql` (or `messaging.graphql`), then `make graphql-gen`
- Resolver: `backend/internal/adapters/graphql/resolvers/<domain>.resolvers.go`; mapping in `helpers.go`
- Wiring: `backend/cmd/server/main.go` and `resolvers/resolver.go`
- Migration: `backend/migrations/` (write only; never apply to shared DB)
- Tests: `backend/test/services/`, `backend/test/resolvers/`, query-count test in repository package

**New frontend feature:**
- gql + hooks: `frontend/src/lib/queries/<domain>/index.ts` and `useX.ts`; keys in `frontend/src/lib/queries/keys.ts`
- Components: `frontend/src/lib/components/<Name>.svelte` or a feature folder
- Page: `frontend/src/routes/<route>/+page.svelte`
- Pure logic: `frontend/src/lib/utils/`
- shadcn primitive: `frontend/src/lib/components/shadcn/<name>/` plus barrel export
- Grid column: one `COLUMNS` entry in `frontend/src/lib/utils/grid-config.ts` (see `.claude/docs/ADDING_AG_GRID_COLUMN.md`)
- Tests: `frontend/tests/components/` (mock each `useX` hook) and `frontend/tests/unit/`

**Utilities:**
- Backend shared: `backend/pkg/`; frontend shared: `frontend/src/lib/utils/`

## Special Directories

**`backend/internal/adapters/graphql/generated/` and `model/models_gen.go`:**
- Generated: Yes (`make graphql-gen`); Committed: Yes

**`backend/coverage/`, `backend/coverage.out`, `backend/coverage.html`, `frontend/coverage/`:**
- Generated: Yes; reports and artifacts

**`frontend/build/`, `frontend/demo/out/`:**
- Generated: Yes; build output and demo videos/reports

**`frontend/android/`, `frontend/ios/`:**
- Capacitor native projects; Committed: Yes

**`.claude/worktrees/`, `.planning/phases/`:**
- Local-only (gitignored)

**`graphify-out/`:**
- Generated knowledge graph; refresh via `graphify update .`

**`backend/internal/adapters/repositories/postgres/*.sqlx.bak`:**
- Stale backups of the pre-GORM implementation; not compiled

---

*Structure analysis: 2026-10-01*

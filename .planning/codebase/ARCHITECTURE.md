# Architecture

**Analysis Date:** 2026-10-01

## Pattern Overview

**Overall:** Monorepo with two independently deployed stacks: a Go GraphQL API using Hexagonal Architecture (Ports and Adapters), and a client-only SvelteKit SPA that talks to it over GraphQL (HTTP + WebSocket subscriptions).

**Key Characteristics:**
- Backend is schema-first GraphQL (gqlgen) with `schema.graphql` + `messaging.graphql` as the contract (`backend/gqlgen.yml`)
- Dependencies point inward: `core/domain` has no adapter or GORM imports; services depend only on `core/ports` interfaces
- Manual dependency injection in a single composition root: `backend/cmd/server/main.go`
- Domain models are separate from GORM models; mappers convert between them (`backend/internal/adapters/repositories/postgres/gorm_mappers.go`)
- Frontend is NOT hexagonal: components call domain-scoped `useX` hooks (TanStack Query) that hide GraphQL + cache wiring ("deep modules")
- Frontend is a static SPA (`ssr = false`, `adapter-static`), plus Capacitor shells (`frontend/android`, `frontend/ios`)
- Realtime messaging uses in-process Hub + Postgres LISTEN/NOTIFY fan-out across instances
- Demo mode (`DEMO_MODE=true` backend, `VITE_DEMO_MODE=true` frontend) swaps Clerk and YouTube for fixtures

## Layers

**Domain (core):**
- Purpose: Pure business entities, enums, errors, pagination types
- Location: `backend/internal/core/domain/`
- Contains: `content.go`, `perspective.go`, `user.go`, `category.go`, `messaging.go`, `realtime.go`, `bible_reference.go`, `bible_interlinear.go`, `auth.go`, `claims.go`, `pagination.go`, `buildinfo.go`, `errors.go`
- Depends on: stdlib only
- Used by: services, ports, all adapters

**Ports:**
- Purpose: Interface contracts
- Location: `backend/internal/core/ports/repositories/` (driven: `content_repository.go`, `perspective_repository.go`, `user_repository.go`, `category_repository.go`, `thread_repository.go`, `message_repository.go`, `bible_reference_repository.go`, `build_info_repository.go`) and `backend/internal/core/ports/services/` (`content_service.go`, `perspective_service.go`, `user_service.go`, `category_service.go`, `messaging_service.go`, `auth_service.go`, `token_verifier.go`, `youtube_client.go`, `wikidata_client.go`)
- Depends on: domain
- Used by: services (outbound ports), resolvers/directives (service ports)

**Services:**
- Purpose: Business rules, validation, orchestration
- Location: `backend/internal/core/services/` (`content_service.go`, `perspective_service.go`, `user_service.go`, `category_service.go`, `messaging_service.go`, `auth_service.go`, `build_info_service.go`, `ratelimit.go`, `retention.go`, `sanitize.go`)
- Depends on: domain, ports
- Used by: GraphQL resolvers, dataloaders, directives, realtime hub

**Primary adapter (GraphQL):**
- Purpose: Translate GraphQL operations into service calls
- Location: `backend/internal/adapters/graphql/`
  - `resolvers/` one file per domain: `content.resolvers.go`, `perspective.resolvers.go`, `user.resolvers.go`, `category.resolvers.go`, `messaging.resolvers.go`; `resolver.go` (root), `helpers.go` (model <-> domain mapping)
  - `generated/generated.go` and `model/models_gen.go` are gqlgen output (do not edit); `model/messaging.go` is hand-written
  - `directives/auth.go` implements `@auth` and `@owner`
  - `dataloader/dataloader.go` per-request batching middleware
- Depends on: services, domain
- Used by: `cmd/server/main.go`

**Primary adapter (HTTP/auth/web):**
- Purpose: Non-GraphQL HTTP concerns
- Location: `backend/internal/adapters/auth/` (Clerk JWT middleware `clerk_middleware.go`, `token_verifier.go`, `demo_token_verifier.go`, `webhook_handler.go` for Clerk/Svix webhooks, `context.go` for `WithAuthenticatedUser`/`RequireAuth`), `backend/internal/adapters/web/handlers/version.go` (`/version`), `backend/internal/adapters/web/middleware/` (rate limit, secure headers, content-type CSRF check)

**Secondary adapters (driven):**
- Postgres via GORM: `backend/internal/adapters/repositories/postgres/` (`gorm_*_repository.go`, `gorm_models.go`, `gorm_mappers.go`, `gorm_messaging_mappers.go`, `helpers.go` cursors/sort whitelists, `array_types.go`). `*.sqlx.bak` files are dead backups of a previous sqlx implementation.
- YouTube: `backend/internal/adapters/youtube/` (`client.go`, `cache.go` TTL caching wrapper, `fixture_client.go` for demo, `parser.go`)
- Wikidata: `backend/internal/adapters/wikidata/client.go`
- Realtime: `backend/internal/adapters/realtime/` (`hub.go`, `listener.go` Postgres LISTEN, `notifier.go` pg_notify, `presence.go`, `presence_session.go`)

**Shared infrastructure (`pkg/`):**
- `backend/pkg/database/` (GORM connect, pool config, slow query logger, stats handler), `backend/pkg/graphql/` (`intid.go` IntID scalar, `timing.go` operation timer), `backend/pkg/logger/logger.go` (slog JSON), `backend/pkg/middleware/` (request timer, panic recoverer)

**Config & support:**
- `backend/internal/config/` (`config.go`, `security.go`, `demo.go`, `validation.go`), `backend/internal/demo/fixtures.go`, `backend/internal/perf/querycount/` (GORM statement counter for query-budget tests)

**Frontend layers:**
- Routes: `frontend/src/routes/` (`+layout.svelte` mounts providers; pages `+page.svelte`, `discover/`, `compare/`, `messages/`)
- Components: `frontend/src/lib/components/` (feature folders `auth/`, `discover/`, `interlinear/`, `messaging/`, `onboarding/`, `theme/`, plus `shadcn/` primitives)
- Data access: `frontend/src/lib/queries/` (`client.ts`, `keys.ts`, one folder per domain: `content/`, `perspectives/`, `users/`, `categories/`, `bible/`, `messaging/`, each with `index.ts` gql definitions and `useX` hooks)
- Auth facade: `frontend/src/lib/auth/` (`useAuthState.ts`, `token.ts`, `demo.svelte.ts`, `index.ts`)
- Realtime client: `frontend/src/lib/messaging/` (`ws-client.svelte.ts`, `useInboxStream.svelte.ts`, `useThreadStream.svelte.ts`, caches, optimistic updates)
- Utilities / pure logic: `frontend/src/lib/utils/` (grid-config, formatting, bible, passage parsing, URL state)
- State: `frontend/src/lib/stores/userSelection.svelte.ts`, `frontend/src/lib/theme/store.svelte.ts`, `frontend/src/lib/onboarding/`

## Data Flow

**GraphQL request (query/mutation):**

1. Client component calls a `useX` hook (e.g. `frontend/src/lib/queries/perspectives/useCreatePerspective.ts`), which calls `graphqlRequest()` in `frontend/src/lib/queries/client.ts` (adds `Authorization: Bearer <Clerk or demo token>`)
2. chi router middleware chain in `backend/cmd/server/main.go`: RequestID, RealIP, GlobalRateLimit, CORS, SecureHeaders, ContentTypeValidation, `auth.Middleware` (verifies token, loads user via `userRepo`, puts `AuthenticatedUser` in ctx), dataloader middleware, RequestTimer, Recoverer
3. gqlgen executes at `/graphql`; `@auth`/`@owner` directives (`directives/auth.go`) gate fields
4. Resolver (`resolvers/<domain>.resolvers.go`) maps input via `helpers.go`, re-derives actor with `auth.RequireAuth(ctx)`, calls service port
5. Service applies rules, calls repository ports (and YouTube/Wikidata clients)
6. GORM repository maps GORM model -> domain; resolver maps domain -> `model.*`
7. Hook invalidates exact query keys from `frontend/src/lib/queries/keys.ts`

**Realtime messaging:**

1. Frontend `ws-client.svelte.ts` opens graphql-ws connection with token in `connection_init`
2. `transport.Websocket.InitFunc` in `main.go` verifies token via shared `TokenVerifier`, loads user, starts `realtime.RunPresenceSession`
3. Mutations in `messaging_service.go` persist then publish through the `Hub`; the Hub publishes via `PgNotifier` (pg_notify); each instance's `Listener` receives NOTIFY and feeds its in-process Hub to deliver to subscribers (`Subscription` type in `backend/messaging.graphql`)
4. `useInboxStream` / `useThreadStream` patch TanStack caches

**State Management:**
- Server state: TanStack Query (staleTime 60s default in `+layout.svelte`), keys centralized in `queries/keys.ts`
- Local/UI state: Svelte 5 runes; shared state in `*.svelte.ts` modules
- Grid URL state: `frontend/src/lib/utils/gridUrlState.ts`
- Per-request backend state: ctx values (authenticated user, dataloaders)

## Key Abstractions

**Repository port + GORM adapter:**
- Purpose: Persistence contract hiding SQL
- Examples: `backend/internal/core/ports/repositories/content_repository.go` -> `backend/internal/adapters/repositories/postgres/gorm_content_repository.go`
- Pattern: Domain struct <-> GORM struct via `gorm_mappers.go`; keyset cursor pagination (`gorm-cursor-paginator` or `helpers.go` encode/decode)

**Service ports for external clients:**
- Examples: `YouTubeClient` (`ports/services/youtube_client.go`) with implementations `youtube/client.go` (wrapped by `cache.go`) and `youtube/fixture_client.go`; `TokenVerifier` with Clerk and demo implementations

**Dataloader:**
- `backend/internal/adapters/graphql/dataloader/dataloader.go` batches `Content.primaryCategory`, `perspectiveCount`, `averageRating` per request

**Query budget:**
- `backend/internal/perf/querycount/` asserts SQL statement counts in tests; frontend equivalent `frontend/tests/helpers/queryBudget.ts`

**Domain-folder hook modules (frontend):**
- `frontend/src/lib/queries/<domain>/index.ts` (gql docs) + `useX.ts` hooks hide cache invalidation

**Column metadata:**
- `frontend/src/lib/utils/grid-config.ts` `COLUMNS` is the single source for picker, sort, filter, URL keys

**Theme system:**
- `frontend/src/lib/theme/` (`presets.ts`, `derive.ts`, `store.svelte.ts`) generates CSS variable tokens; `app.css` `[data-theme]` blocks generated by `frontend/gen-preset-css.mjs`

## Entry Points

**Backend server:**
- Location: `backend/cmd/server/main.go`
- Triggers: `make run` / Docker (`backend/Dockerfile`)
- Responsibilities: config, DB connect, wiring repos/services/resolvers, chi router, `/graphql`, `/health`, `/ready`, `/version`, `/webhooks/clerk`, dev-only playground `/` and `/debug/db-stats`, graceful shutdown, optional OTel tracing, retention sweeper, realtime listener

**Seeders:**
- `backend/cmd/seed-demo/main.go` (demo personas), `backend/cmd/seed-bible/main.go` (Bible reference data from `backend/cmd/seed-bible/data`)

**Frontend:**
- `frontend/src/routes/+layout.ts` (SPA config), `frontend/src/routes/+layout.svelte` (QueryClientProvider, ClerkProvider or demo, Header, Toaster, messaging widget, version watch), `frontend/src/app.html` (shell + stale-chunk recovery)

**Demo / E2E:**
- `frontend/demo/` Playwright tours/flows; `docker-compose.demo.yml` + `Makefile` `demo-*` targets

## Error Handling

**Strategy:** Sentinel domain errors translated at the adapter boundary.

**Patterns:**
- `backend/internal/core/domain/errors.go` defines `ErrNotFound`, `ErrForbidden`, etc.; services return/wrap them; resolvers surface as GraphQL errors
- Owner-only mutations guarded at four layers: `@owner` directive, resolver `auth.RequireAuth`, service actor check returning `ErrForbidden`, SQL scoped by `user_id`
- Panics recovered by `backend/pkg/middleware/recovery.go`
- Frontend: hooks surface `isError`; `LazyLoadError.svelte`; stale-chunk recovery in `app.html`

## Cross-Cutting Concerns

**Logging:** `log/slog` JSON (`backend/pkg/logger/logger.go`); request timing in `pkg/middleware/timing.go`; optional OpenTelemetry OTLP traces
**Validation:** go-playground/validator and service rules; input sanitization `services/sanitize.go`; GraphQL complexity limit 500, APQ, introspection off in production
**Authentication:** Clerk JWT verified by `auth.NewClerkTokenVerifier`; demo tokens `Bearer demo.<persona>` via `DemoTokenVerifier`; users created through Clerk webhook (`auth/webhook_handler.go`) and frontend `AuthUserSync.svelte`
**Rate limiting:** global per-IP (`web/middleware/ratelimit.go`) and per-user sliding-window for messages (`services/ratelimit.go`)

---

*Architecture analysis: 2026-10-01*

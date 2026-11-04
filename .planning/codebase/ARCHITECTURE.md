# Architecture

**Analysis Date:** 2026-11-01

## Pattern Overview

**Overall:** Monorepo with a Hexagonal (Ports and Adapters) Go GraphQL backend and a client-only SvelteKit SPA frontend (TanStack Query over GraphQL).

**Key Characteristics:**
- Dependencies point inward: `internal/adapters/*` -> `internal/core/ports` -> `internal/core/domain`. Domain never imports adapters.
- Schema-first GraphQL (gqlgen): `backend/schema.graphql` + `backend/messaging.graphql` generate `backend/internal/adapters/graphql/generated/generated.go` and `.../model/models_gen.go`. Resolvers are thin and live in `backend/internal/adapters/graphql/resolvers/*.resolvers.go` (layout: follow-schema).
- Manual dependency injection in `backend/cmd/server/main.go`; no DI framework. `backend/internal/server/api.go` assembles the HTTP/GraphQL stack from a `Deps` struct so `cmd/server` and request-level tests (`backend/test/roundtrips`) share one stack.
- Decorator-style caching repositories wrap Postgres repositories (`backend/internal/adapters/repositories/cached/`).
- Real-time messaging over GraphQL WebSocket subscriptions, fanned out by an in-process hub fed by Postgres LISTEN/NOTIFY (`backend/internal/adapters/realtime/`).
- Frontend is SPA-only: `frontend/src/routes/+layout.ts` sets `ssr = false`, `prerender = false`; also packaged with Capacitor (`frontend/ios`, `frontend/android`, `frontend/capacitor.config.ts`) and as a PWA.
- Multiple content types (YouTube video, movie via TMDB, Bible passage) are handled in `content_service` and the frontend `queries/content/`; see `.claude/docs/ADDING_CONTENT_TYPE.md`.

## Layers

**Domain (core):**
- Purpose: Pure models, validation, sentinel errors.
- Location: `backend/internal/core/domain/` (`content.go`, `perspective.go`, `user.go`, `category.go`, `messaging.go`, `bible_reference.go`, `bible_interlinear.go`, `user_todo.go`, `trending.go`, `pagination.go`, `auth.go`, `errors.go`, `realtime.go`, `buildinfo.go`)
- Depends on: stdlib only
- Used by: services, ports, adapters

**Ports:**
- Purpose: Interfaces. Driven-side repository contracts and service contracts consumed by resolvers and external-client contracts.
- Location: `backend/internal/core/ports/repositories/` (e.g. `content_repository.go`, `message_repository.go`), `backend/internal/core/ports/services/` (e.g. `content_service.go`, `youtube_client.go`, `movie_client.go`, `wikidata_client.go`, `token_verifier.go`)
- Depends on: domain
- Used by: services, adapters, `internal/server`

**Services (business logic):**
- Purpose: Use cases, owner checks, rate limiting, sanitization.
- Location: `backend/internal/core/services/` (`content_service.go`, `perspective_service.go`, `user_service.go`, `category_service.go`, `user_todo_service.go`, `messaging_service.go`, `build_info_service.go`, `ratelimit.go`, `retention.go`, `sanitize.go`)
- Depends on: ports, domain
- Used by: GraphQL resolvers, directives

**Driving adapters (inbound):**
- GraphQL: `backend/internal/adapters/graphql/` (`resolvers/`, `directives/auth.go` for `@auth`/`@owner`, `dataloader/dataloader.go`, `generated/`, `model/`)
- HTTP: `backend/internal/adapters/web/handlers/version.go`, `backend/internal/adapters/web/middleware/` (`ratelimit.go`, `secureheaders.go`, `contenttype.go`)
- Auth: `backend/internal/adapters/auth/` (Clerk JWT middleware `clerk_middleware.go`, `webhook_handler.go` for Clerk webhooks, `demo_token_verifier.go` for demo mode)

**Driven adapters (outbound):**
- Postgres via GORM + pgx: `backend/internal/adapters/repositories/postgres/` (`gorm_*_repository.go`, `gorm_models.go`, `gorm_mappers.go`). `*.sqlx.bak` files are legacy backups, not compiled.
- Cache decorators: `backend/internal/adapters/repositories/cached/` (user, category, todo action)
- External APIs: `backend/internal/adapters/youtube/`, `tmdb/`, `wikidata/` (each has a caching client and/or `fixture_client.go` used when no API key / demo mode)
- Realtime: `backend/internal/adapters/realtime/` (`hub.go`, `listener.go`, `notifier.go`, `presence.go`)

**Shared infrastructure:**
- `backend/pkg/` : `database` (GORM/pgx setup, tracing, stats), `telemetry` (OTel), `logger`, `middleware` (recovery, timing, clientinfo), `graphql` (intid, operation metrics), `buildinfo`.
- `backend/internal/config/` : env-driven config, demo-mode and security validation.
- `backend/internal/demo/fixtures.go`, `backend/internal/perf/querycount/` : demo personas and query-count test helper.

**Frontend layers:**
- Routes (thin pages): `frontend/src/routes/` (`+page.svelte` home, `discover`, `compare`, `plan`, `messages`, `messages/[threadId]`)
- Components: `frontend/src/lib/components/` (feature subfolders `auth`, `discover`, `plan`, `messaging`, `interlinear`, `onboarding`, `theme`, `shadcn`)
- Data layer: `frontend/src/lib/queries/` (TanStack Query hooks per domain, `client.ts` GraphQL client, `keys.ts` query keys)
- External services: `frontend/src/lib/services/` (`youtubeApi.ts`, `tmdbApi.ts`)
- Realtime: `frontend/src/lib/messaging/` (`ws-client.svelte.ts`, stream hooks, caches)
- State/utility: `frontend/src/lib/stores/`, `frontend/src/lib/auth/`, `frontend/src/lib/theme/`, `frontend/src/lib/utils/`, `frontend/src/lib/onboarding/`

## Data Flow

**GraphQL request (query/mutation):**

1. Browser calls `graphqlRequest()` in `frontend/src/lib/queries/client.ts`, adding `Authorization: Bearer <Clerk or demo token>` and `X-Client-Version`/`X-Client-Platform` headers.
2. chi router (`backend/cmd/server/main.go`) applies middleware from `server.Middleware` in `backend/internal/server/api.go` (CORS, global rate limit before auth, `auth.Middleware` resolving the local user via `UserRepo` with 60 s cache), then `/graphql` -> gqlgen server.
3. gqlgen runs directives (`@auth`, `@owner`) in `backend/internal/adapters/graphql/directives/auth.go`, then a resolver in `resolvers/*.resolvers.go`.
4. Resolver calls a service interface (`ports/services`); service applies rules and calls repository ports.
5. GORM repository (`postgres/gorm_*_repository.go`) hits Postgres; mappers convert GORM models to domain types; resolvers/`helpers.go` map to GraphQL models. Dataloaders (`graphql/dataloader/dataloader.go`) batch nested fields to avoid N+1.
6. Frontend hook (`frontend/src/lib/queries/<domain>/use*.ts`) updates the TanStack cache (keys in `frontend/src/lib/queries/keys.ts`).

**Real-time messaging:**

1. Client opens a graphql-ws connection via `frontend/src/lib/messaging/ws-client.svelte.ts`; `InitFunc` in `internal/server/api.go` verifies the token with the same `TokenVerifier` as HTTP.
2. `services.MessagingService` persists messages, then `realtime.Hub` broadcasts; `PgNotifier` emits NOTIFY and `realtime.Listener` (LISTEN) relays across instances.
3. Subscription resolvers in `resolvers/messaging.resolvers.go` stream to `useInboxStream.svelte.ts` / `useThreadStream.svelte.ts`.

**Content import (video/movie/passage):**
1. Frontend `services/youtubeApi.ts` / `tmdbApi.ts` -> backend GraphQL search/trending queries -> `ContentService` -> `youtube`/`tmdb` clients (caching or fixture variants chosen in `main.go`).
2. `useAddVideo` / `useAddMovie` / `useAddPassage` mutations create content.

**State Management:**
- Server state: TanStack Query. Client state: Svelte 5 runes (`*.svelte.ts` files such as `stores/userSelection.svelte.ts`, `theme/store.svelte.ts`). Grid URL state in `utils/gridUrlState.ts`.

## Key Abstractions

**Repository ports:** `backend/internal/core/ports/repositories/*.go`, implemented by `postgres/gorm_*` and wrapped by `cached/*`.
**Service ports:** `backend/internal/core/ports/services/*.go`, implemented in `backend/internal/core/services/`; options pattern (e.g. `services.WithBibleReference(...)`, `WithYouTubeTrending(...)`) configures `NewContentService`.
**`server.Deps`:** `backend/internal/server/api.go`, the injection bundle for the API handler.
**`TokenVerifier`:** `backend/internal/core/ports/services/token_verifier.go`; Clerk impl and demo wrapper in `internal/adapters/auth/`.
**Rating domain:** Quality/agreement/etc. use Postgres domain `valid_integer_range` (0-10000).

## Entry Points

**Backend server:** `backend/cmd/server/main.go` : loads config, connects DB, builds repos/services, starts realtime listener and retention sweeper, mounts `/graphql`, `/webhooks/clerk`, version handler, playground and `/debug/db-stats` (non-prod), wraps router with `otelhttp`.
**Seeders:** `backend/cmd/seed-demo/main.go` (demo personas), `backend/cmd/seed-bible/main.go` (+ `interlinear.go`, data in `backend/cmd/seed-bible/data`).
**Frontend:** `frontend/src/app.html`, `frontend/src/routes/+layout.svelte`, `frontend/src/routes/+page.svelte`.

## Error Handling

**Strategy:** Sentinel errors in `backend/internal/core/domain/errors.go` returned from services; resolvers translate to GraphQL errors; recovery middleware in `backend/pkg/middleware/recovery.go`.

**Patterns:**
- Wrap with `%w` and compare with `errors.Is` (see `.docs/GO_PATTERNS.md`).
- Frontend: `LazyLoadError.svelte`, toast helper `frontend/src/lib/utils/toast.ts`.

## Cross-Cutting Concerns

**Logging:** `log/slog` (`backend/pkg/logger/logger.go`).
**Observability:** OTel traces/metrics (`backend/pkg/telemetry/`, `otelgqlgen`, `otelhttp`, GORM tracing in `pkg/database/tracing.go`); frontend `frontend/src/lib/telemetry.ts` (Faro).
**Validation:** Hand-written in domain and services; GraphQL complexity limit 500; APQ enabled.
**Authentication:** Clerk JWT (`internal/adapters/auth/`), demo tokens `demo.<persona>` when `DEMO_MODE=true`; frontend `frontend/src/lib/auth/`.
**Rate limiting:** global `httprate` limiter (`RATE_LIMIT_PER_MIN`), per-user sliding window for messages (`services/ratelimit.go`).

---

*Architecture analysis: 2026-11-01*

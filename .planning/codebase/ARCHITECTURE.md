# Architecture

**Analysis Date:** 2026-11-26

## Pattern Overview

**Overall:** Monorepo with a Hexagonal (Ports and Adapters) Go GraphQL backend and a client-only SvelteKit SPA frontend (TanStack Query over GraphQL).

**Key Characteristics:**
- Dependencies point inward: `internal/adapters/*` -> `internal/core/ports` -> `internal/core/domain`. Domain imports no adapters. New service code must not import `internal/adapters/*` or GORM. Exceptions in the code: `content_service.go` imports `adapters/youtube` and `adapters/tmdb`, `content_service_webpage.go` and `import_service_file.go` import `adapters/webpage`, and `retention.go` uses `*gorm.DB`.
- Schema-first GraphQL (gqlgen): `backend/schema.graphql` + `backend/messaging.graphql` generate `internal/adapters/graphql/generated/generated.go` and `model/models_gen.go`. Resolvers live in `resolvers/*.resolvers.go` (follow-schema layout).
- Manual dependency injection: `backend/cmd/server/main.go` builds repos and services, `internal/assembly` picks outside-world adapters, and `internal/server/api.go` assembles the HTTP/GraphQL stack from `server.Deps` (shared with `backend/test/roundtrips`).
- Decorator caching repositories wrap Postgres repositories (`internal/adapters/repositories/cached/`).
- Messaging uses GraphQL WebSocket subscriptions, fanned out by an in-process hub fed by Postgres LISTEN/NOTIFY.
- Frontend is SPA-only (`frontend/src/routes/+layout.ts`: `ssr = false`, `prerender = false`), built with `adapter-static` and installable via `static/manifest.webmanifest` (service worker registration is off).

## Layers

**Domain:** `backend/internal/core/domain/`. Models, validation, sentinel errors, and the shared rules (`audience.go`, `content_errors.go`, `perspective_contract.go`, `content_facts.go`, `pagination.go`).

**Ports:** `backend/internal/core/ports/repositories/` and `ports/services/` (service contracts plus external-client contracts such as `youtube_client.go`, `book_client.go`, `webpage_client.go`, `import_source.go`, `token_verifier.go`, `identity_resolver.go`).

**Services:** `backend/internal/core/services/`. Use cases, owner checks, rate limiting, sanitization, content creation, import staging, identity resolution.

**Assembly:** `backend/internal/assembly/externals.go`. `NewExternals(Settings)` returns real, demo or unconfigured adapters (video, movie, book, web page, Wikidata, import listers, Clerk directory, token verifier). `ContentOptions()` wires optional clients into `ContentService`.

**Driving adapters:**
- GraphQL: `internal/adapters/graphql/` (`resolvers/`, `directives/auth.go` for `@auth`/`@owner`, `dataloader/dataloader.go`)
- HTTP: `internal/adapters/web/handlers/version.go`, `web/middleware/` (rate limit, secure headers, content type)
- Auth: `internal/adapters/auth/` (`clerk_middleware.go`, `webhook_handler.go`, token verifiers, `clerk_directory.go`)

**Driven adapters:**
- Postgres via GORM + pgx: `internal/adapters/repositories/postgres/` (`gorm_*_repository.go`, `gorm_models.go`, `gorm_mappers.go`). `*.sqlx.bak` files are not compiled.
- External sources: `internal/adapters/{youtube,tmdb,openlibrary,webpage,wikidata}/` (`webpage` is the SSRF-safe page reader)
- Realtime: `internal/adapters/realtime/` (`hub.go`, `listener.go`, `notifier.go`, `presence.go`)

**Shared infrastructure:** `backend/pkg/` (`database`, `telemetry`, `logger`, `middleware`, `graphql`, `limiter`, `buildinfo`), `internal/config/`, `internal/demo/`, `internal/perf/querycount/`.

**Frontend layers:**
- Routes (thin pages): `frontend/src/routes/` (`content-library`, `add`, `discover`, `compare`, `declare`, `plan`, `import`, `import/[id]`, `messages`; `/` forwards signed-in visitors to `/content-library`)
- Components: `frontend/src/lib/components/` (feature subfolders such as `library`, `addContent`, `imports`, `discover`, `declare`, `messaging`, `plan`)
- Content type registry: `frontend/src/lib/contentTypes/` (`registry.ts`, one file per type in `descriptors/`)
- Data: `frontend/src/lib/queries/` (per-domain hooks, `client.ts`, `keys.ts`); external search in `lib/services/`
- Realtime: `frontend/src/lib/messaging/`; auth facade: `lib/auth/`; UI state: `lib/stores/`, `lib/theme/`, `lib/fonts/`

## Data Flow

**GraphQL request:**
1. A hook calls `graphqlRequest()` (`frontend/src/lib/queries/client.ts`), which adds the bearer token and client version/platform headers.
2. `server.Middleware` (`internal/server/api.go`) runs CORS, global rate limit, security checks, `auth.Middleware`, per-request dataloaders, timing and recovery.
3. `auth.Middleware` and `server.AuthenticateWebSocket` (`websocket_auth.go`) share one `TokenVerifier` and `services.IdentityResolver` (also used by the Clerk webhook), which maps or provisions the local user.
4. gqlgen runs `@auth`/`@owner`, then a resolver, which calls a service port; the service calls repository ports; mappers convert GORM models to domain types.

**Content creation:** every create goes through `createContent` in `services/content_pipeline.go` (canonical URL, dedupe, build, upsert, already-existed outcome); `resolvers/content_create.go` maps the result and errors.

**Import staging:** `ImportService` (`services/import_service*.go`) lists a source (channel, person, web page/website, file) via `ImportSourceLister` or parsers, stages items through `ImportJobRepository`, and imports selected rows in background goroutines bounded by `pkg/limiter` (`config/import_limits.go`). Progress streams from `latest_hub.go`. `RecoverInterrupted` marks work cut short by a restart; the design assumes a single server instance.

**Library list:** `routes/content-library/+page.ts` and `routes/+page.ts` prefetch anonymously via `prefetchLibraryList`; `libraryListRequest()` (`queries/content/libraryList.ts`) is the one source of key and variables.

**Messaging:** graphql-ws client (`lib/messaging/ws-client.svelte.ts`) -> `MessagingService` persists -> `realtime.Hub` broadcasts, `PgNotifier`/`Listener` relay over Postgres -> `useInboxStream` / `useThreadStream`.

**State Management:** server state in TanStack Query (one module-level `queryClient`); client state in Svelte 5 runes (`*.svelte.ts`); Library URL state in `utils/gridUrlState.ts`.

## Key Abstractions

- **Audience:** `domain/audience.go` is the one read/write/aggregate privacy rule, rendered as SQL only in `postgres/audience_sql.go`. Aggregates are public-only.
- **ErrorKind:** `domain/content_errors.go` (`KindOf`) -> `resolvers/error_kinds.go` (`kindedError` sets `extensions.code`).
- **Pagination:** `domain.ResolvePage` plus `listPage` in `postgres/paging.go`, the one cursor-paginator driver.
- **Content facts:** `domain/content_facts.go` and `postgres/content_facts.go` give sort and filter one SQL expression per fact.
- **Perspective validation:** `domain.ValidatePerspective` serves create and update.
- **Service options:** `NewContentService`, `NewImportService`, `NewPerspectiveService` take `With...` options.
- **Content type descriptor:** `frontend/src/lib/contentTypes/descriptor.ts`; see `.claude/docs/ADDING_CONTENT_TYPE.md`.
- **Library column:** `frontend/src/lib/utils/libraryColumns/definition.ts`.

## Entry Points

- `backend/cmd/server/main.go`: config, DB, wiring, realtime listener, retention sweeper; mounts `/graphql`, `/webhooks/clerk`, `/health`, `/ready`, `/version`, and (non-production) playground and `/debug/db-stats`.
- `backend/cmd/seed-demo/main.go`, `backend/cmd/seed-bible/main.go`: seeders.
- `frontend/src/app.html`, `frontend/src/routes/+layout.svelte` (Clerk gate or demo mode, guest landing, app shell).

## Error Handling

- Sentinel errors in `domain/errors.go` and sibling domain files; wrap with `%w`, compare with `errors.Is` (`.docs/GO_PATTERNS.md`).
- Client-facing resolver messages are matched by clients: keep them stable and attach a kind.
- Panics: `backend/pkg/middleware/recovery.go`. Frontend: `LazyLoadError.svelte`, `lib/utils/toast.ts`.

## Cross-Cutting Concerns

**Logging:** `log/slog` (`backend/pkg/logger/`).
**Observability:** OTel (`pkg/telemetry/`, `otelgqlgen`, `otelhttp`, `pkg/database/tracing.go`); Faro in `frontend/src/lib/telemetry.ts`.
**Validation:** hand-written in domain and services; GraphQL complexity limit and APQ in `server/api.go`.
**Authentication:** Clerk; demo mode accepts `demo.<persona>` tokens and is refused in production.
**Performance:** dataloaders for nested fields; query-count and cache-contract tests (`.docs/QUERY_BUDGET.md`).

---

*Architecture analysis: 2026-11-26*

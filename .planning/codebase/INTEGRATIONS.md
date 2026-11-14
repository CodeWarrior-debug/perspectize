# External Integrations

**Analysis Date:** 2026-11-01

## APIs & External Services

**Content metadata:**
- YouTube Data API v3 (`https://www.googleapis.com/youtube/v3`) - video metadata and Trending chart
  - Client: `backend/internal/adapters/youtube/client.go` (with `cache.go` in-memory TTL cache, `parser.go`); offline `fixture_client.go` used in demo mode
  - Auth: `YOUTUBE_API_KEY`
  - Cache TTLs: `YOUTUBE_API_CACHE_TTL_SECONDS` (default 21600), `YOUTUBE_TRENDING_CACHE_TTL_SECONDS` (default 3600)
- TMDB API (`https://api.themoviedb.org/3`) - movie lookups/trending
  - Client: `backend/internal/adapters/tmdb/client.go` (`cache.go`, `parse.go`, `fixture_client.go`; `unconfigured.go` when token absent)
  - Auth: `TMDB_API_READ_ACCESS_TOKEN` (v4 bearer)
- Wikidata (`https://www.wikidata.org/w/api.php`) and Wikipedia links - entity lookups
  - Client: `backend/internal/adapters/wikidata/client.go` (retry/backoff); no key

## Data Storage

**Databases:**
- Neon Postgres (production; cut over 2026-10-06; old Sevalla DB suspended). Local demo uses `postgres:18` in Docker.
  - Connection: `DATABASE_URL` (must be the DIRECT, non-pooler string because of LISTEN/NOTIFY)
  - Client: GORM + pgx (`backend/internal/adapters/repositories/postgres`), cached wrappers in `backend/internal/adapters/repositories/cached`
  - Migrations: golang-migrate SQL in `backend/migrations` (applied manually per environment; never run against the shared DB during dev)
  - Realtime: Postgres LISTEN/NOTIFY via `backend/internal/adapters/realtime/listener.go`, fanned out by `hub.go` over WebSocket GraphQL subscriptions
  - Preview branches: one Neon branch per PR via `.github/workflows/neon-preview-branch.yml` (`neondatabase/create-branch-action@v6`, `delete-branch-action@v3`)

**File Storage:**
- Local filesystem only (onboarding videos served from `frontend/static/onboarding/` or a CDN URL)

**Caching:**
- In-process memory caches only (YouTube, TMDB, `repositories/cached`); not shared across replicas

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Backend: `backend/internal/adapters/auth/clerk_middleware.go`, `token_verifier.go` (JWT verification via `clerk-sdk-go/v2`); `CLERK_SECRET_KEY` required when `APP_ENV=production` (`backend/internal/config/security.go`)
  - Frontend: `svelte-clerk` with `VITE_CLERK_PUBLISHABLE_KEY` (`frontend/src/lib/auth`)
  - Demo mode: unsigned `Bearer demo.<persona>` tokens via `backend/internal/adapters/auth/demo_token_verifier.go`; refused when `APP_ENV=production` (`backend/internal/config/demo.go`)

## Monitoring & Observability

**Error Tracking / RUM:**
- Grafana Faro (browser errors, web vitals, fetch tracing): `frontend/src/lib/telemetry.ts`, `VITE_FARO_URL`, `VITE_APP_ENV`; sourcemaps via `@grafana/faro-rollup-plugin`

**Traces/Metrics/Logs:**
- OpenTelemetry -> Grafana Cloud over OTLP/HTTP; `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME` (default `perspectize-backend`), `OTEL_TRACES_SAMPLER(_ARG)`; blank endpoint disables export
- Local tracer stack: `docker-compose.observability.yml` (`make obs-up`, otel-lgtm + Alloy)
- Runbook: `.docs/OBSERVABILITY.md`

**Logs:**
- Structured `slog` bridged to OTel (`otelslog`); `/health`, `/ready`, `/version` endpoints in `backend/cmd/server/main.go` (health/ready excluded from tracing)

## CI/CD & Deployment

**Hosting:**
- Sevalla (backend app deploys on `backend/` changes to main; frontend static site deploys on PRs/commits; single DB/environment)

**CI Pipeline:**
- GitHub Actions in `.github/workflows/`: `ci.yml` (build/test, gofmt, frontend checks), `frontend-test.yml`, `codeql.yml`, `trivy.yml`, `mutation.yml`, `migration-labels.yml`, `neon-preview-branch.yml`, `tag-main.yml`
- Dependabot for Go and pnpm dependencies

## Environment Configuration

**Required env vars:**
- Backend: `DATABASE_URL`, `CLERK_SECRET_KEY` (prod), `CLERK_WEBHOOK_SIGNING_SECRET`, `CORS_ORIGINS`
- Frontend: `VITE_GRAPHQL_URL`, `VITE_CLERK_PUBLISHABLE_KEY`

**Secrets location:**
- `backend/.env` and `frontend/.env` locally (present, gitignored, not read); Sevalla dashboard in deployed environments; GitHub Actions secrets for Neon branching. See `.docs/SECURITY.md`.

## Webhooks & Callbacks

**Incoming:**
- `POST /webhooks/clerk` - Clerk user sync, Svix signature verified (`backend/internal/adapters/auth/webhook_handler.go`, route in `backend/cmd/server/main.go`); needs `CLERK_WEBHOOK_SIGNING_SECRET`

**Outgoing:**
- None

---

*Integration audit: 2026-11-01*

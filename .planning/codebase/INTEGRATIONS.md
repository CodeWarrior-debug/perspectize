# External Integrations

**Analysis Date:** 2026-11-26

## APIs & External Services

Real, demo-fixture and unconfigured adapters are chosen in one place: `backend/internal/assembly/externals.go`. Wire new outside-world clients there, behind a port in `backend/internal/core/ports/services`.

**Content metadata (backend):**
- YouTube Data API v3 - video metadata, Trending chart, channel import listing
  - Client: `backend/internal/adapters/youtube/` (`client.go`, `cache.go`, `channel_lister.go`, `fixture_client.go` for demo mode)
  - Auth: `YOUTUBE_API_KEY`; cache TTLs `YOUTUBE_API_CACHE_TTL_SECONDS`, `YOUTUBE_TRENDING_CACHE_TTL_SECONDS`
- TMDB API - movie lookup, search, trending, person import listing
  - Client: `backend/internal/adapters/tmdb/` (`client.go`, `cache.go`, `person_lister.go`, `demo_client.go`, `unconfigured.go`)
  - Auth: `TMDB_API_READ_ACCESS_TOKEN` (v4 bearer); a configured token is used even in demo mode
- Open Library - book search, cached trending, ISBN and work records; no key (`backend/internal/adapters/openlibrary/`)
- Wikidata (with Wikipedia links) - entity lookups; no key (`backend/internal/adapters/wikidata/client.go`)
- Arbitrary web pages - page metadata reader (`backend/internal/adapters/webpage/`): SSRF-guarded (public addresses, ports 80/443), size and redirect caps, identifies as `PerspectizeBot`

**Loaded directly by the browser:**
- YouTube embeds (`youtube-nocookie.com`) and thumbnails (`i.ytimg.com`); TMDB images (`image.tmdb.org`); Open Library covers (`frontend/src/lib/utils/bookFormatting.ts`)
- Google Fonts (`frontend/src/lib/fonts/googleFonts.ts`)
- Bible reference outbound links (e.g. `frontend/src/lib/utils/bibleCommentary.ts`)
- A new browser-side origin must be allowed in the CSP in `frontend/src/app.html`

**Payments:**
- Stripe Payment Links - outbound HTTPS links only, no SDK or API (`frontend/src/lib/contribute/config.ts`, `VITE_SUPPORT_*`, gated by `VITE_FEATURE_CONTRIBUTE_TAB`)

**Reference data (offline seed):**
- Berean Standard Bible and STEP Bible files, pinned in `data/bible/sources.json`, seeded by `backend/cmd/seed-bible` (see `data/bible/README.md`)

## Data Storage

**Databases:**
- Neon Postgres (production); Docker Postgres for the local demo stack
  - Connection: `DATABASE_URL` (must be the DIRECT, non-pooler string because of LISTEN/NOTIFY)
  - Client: GORM + pgx (`backend/internal/adapters/repositories/postgres`), cached wrappers in `repositories/cached`
  - Migrations: golang-migrate SQL in `backend/migrations`; applied manually per environment, never against the shared database during dev
  - Realtime: `pg_notify` and LISTEN (`backend/internal/adapters/realtime/notifier.go`, `listener.go`), fanned out by `hub.go` to WebSocket subscriptions; in-process presence in `presence.go`
  - Preview branches: per PR that changes migrations, `.github/workflows/neon-preview-branch.yml` (see `.docs/NEON_BRANCHING.md`)

**File Storage:**
- No object storage. Onboarding videos come from `frontend/static/onboarding/` or a URL in `VITE_ONBOARDING_VIDEO_*`

**Caching:**
- In-process memory only (YouTube, TMDB trending, Open Library, `repositories/cached`); not shared across replicas
- Static asset cache headers: `frontend/static/_headers`

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Backend: `backend/internal/adapters/auth/` (`clerk_middleware.go`, `token_verifier.go`, `clerk_directory.go`); HTTP, WebSocket (`backend/internal/server/websocket_auth.go`) and webhook share one identity resolver
  - Frontend: `svelte-clerk` (`frontend/src/lib/auth`); `clerk-js` is preloaded from `frontend/src/app.html`
  - `CLERK_SECRET_KEY` is required when `APP_ENV=production` (`backend/internal/config/security.go`)
  - Demo mode: unsigned `Bearer demo.<persona>` tokens (`demo_token_verifier.go`); refused when `APP_ENV=production` (`backend/internal/config/demo.go`)

## Monitoring & Observability

**Error Tracking / RUM:**
- Grafana Faro (browser errors, web vitals, fetch tracing): `frontend/src/lib/telemetry.ts`, `VITE_FARO_URL`, `VITE_APP_ENV`; optional sourcemap upload

**Traces/Metrics/Logs:**
- OpenTelemetry to Grafana Cloud over OTLP/HTTP (`backend/pkg/telemetry`); `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER(_ARG)`; blank endpoint disables export
- Local stack: `docker-compose.observability.yml` + `ops/observability/` (`make obs-up`, `make obs-smoke`); runbook `.docs/OBSERVABILITY.md`

**Logs:**
- Structured `slog` JSON, bridged to OTel when enabled; `/health`, `/ready`, `/version` in `backend/cmd/server/main.go`

## CI/CD & Deployment

**Hosting:**
- Sevalla: backend application and frontend static site, path-filtered deploys (`backend/**`, `frontend/**`); the frontend site also builds PR previews

**CI Pipeline:**
- GitHub Actions (`.github/workflows/`): `ci.yml` (Go build/test/gofmt, demo E2E, Codecov upload), `frontend-test.yml` (svelte-check, unit, browser), `codeql.yml`, `trivy.yml`, `mutation.yml`, `migration-labels.yml`, `neon-preview-branch.yml`, `tag-main.yml`
- `claude.yml` - comment-triggered `anthropics/claude-code-action@v1`
- Dependabot: gomod, npm, github-actions, docker (`.github/dependabot.yml`)

## Environment Configuration

**Required env vars:**
- Backend: `DATABASE_URL`; `CLERK_SECRET_KEY` in production. Set `CORS_ORIGINS` in production (defaults to `*`)
- Frontend: `VITE_GRAPHQL_URL` (falls back to localhost) and a Clerk publishable key (`VITE_` or `PUBLIC_` prefix)
- Optional: a blank `TMDB_API_READ_ACCESS_TOKEN` disables movie lookups; a blank `YOUTUBE_API_KEY` makes YouTube fetches fail

**Secrets location:**
- `backend/.env` and `frontend/.env` locally (gitignored, not read by agents); the Sevalla dashboard when deployed; GitHub Actions secrets for CI. See `.docs/SECURITY.md`

## Webhooks & Callbacks

**Incoming:**
- `POST /webhooks/clerk` - Clerk user sync, Svix signature verified (`backend/internal/adapters/auth/webhook_handler.go`); the route is registered only when `CLERK_WEBHOOK_SIGNING_SECRET` is set

**Outgoing:**
- None

---

*Integration audit: 2026-11-26*

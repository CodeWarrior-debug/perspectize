# External Integrations

**Analysis Date:** 2026-10-01

## APIs & External Services

**Video metadata:**
- YouTube Data API v3 (`https://www.googleapis.com/youtube/v3`) - fetch video metadata for content
  - Backend client: `backend/internal/adapters/youtube/client.go` (+ `parser.go`, in-memory TTL `cache.go`)
  - Offline fixture client for demo mode: `backend/internal/adapters/youtube/fixture_client.go`
  - Auth: `YOUTUBE_API_KEY`; cache TTL `YOUTUBE_API_CACHE_TTL_SECONDS` (default 21600, 0 disables)
  - Client strips key-bearing googleapis URLs from error messages (key sent as query param)
- YouTube Data API v3 (frontend, Discover page search + trending) - Auth: `VITE_YOUTUBE_API_KEY` (browser-exposed; must be referrer-restricted)
- YouTube embeds/thumbnails: `youtube-nocookie.com`, `i.ytimg.com`, `yt3.ggpht.com` (allowed in CSP in `frontend/src/app.html`)

**Knowledge/taxonomy:**
- Wikidata (`https://www.wikidata.org/w/api.php`) - category typeahead/search, with retry/backoff
  - Client: `backend/internal/adapters/wikidata/client.go`
  - Auth: none
- Wikipedia (`en.wikipedia.org`) - category links (migration `000027_add_category_wikipedia_url`)

**Bible content:**
- Interlinear Bible data seeded from local files (`backend/cmd/seed-bible/`, `backend/cmd/seed-bible/data/`); outbound reference links to `biblegateway.com`, `stepbible.org`, `biblehub.com` from the frontend (`frontend/src/lib/queries/bible/`)

**Bot protection:**
- Cloudflare Turnstile (`challenges.cloudflare.com`) - used by Clerk sign-in; allowed in CSP `script-src`/`frame-src`

## Data Storage

**Databases:**
- PostgreSQL (17 in CI; Sevalla-managed in dev/prod; 18 in demo compose)
  - Connection: `DATABASE_URL` (Sevalla may need `?sslmode=disable`), optional `DATABASE_PASSWORD`
  - Client: GORM + pgx/v5 (`backend/pkg/database/postgres.go`, repositories in `backend/internal/adapters/repositories/postgres/`)
  - Migrations: golang-migrate SQL files in `backend/migrations/`, applied manually per environment (no runner in server, CI, or Sevalla hooks)
  - Realtime: Postgres `LISTEN`/`NOTIFY` on channel `thread_events` via a dedicated connection (`backend/internal/adapters/realtime/listener.go`), fanned out to WebSocket subscribers (`hub.go`, `presence.go`)

**File Storage:**
- Local filesystem only (static onboarding videos optional under `frontend/static/onboarding/`)

**Caching:**
- In-process YouTube response cache (`backend/internal/adapters/youtube/cache.go`; not shared across replicas)
- Client-side TanStack Query cache (`frontend/src/lib/queries/`)

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Backend: JWT verification via clerk-sdk-go (`backend/internal/adapters/auth/token_verifier.go`, `clerk_middleware.go`); `CLERK_SECRET_KEY`
  - Frontend: `svelte-clerk` behind the `$lib/auth` facade (`useAuthState`, `getAuthToken`, `components/auth/`); `VITE_CLERK_PUBLISHABLE_KEY`
  - Authorization: `@owner`/auth directives in `backend/internal/adapters/graphql/directives/`, `auth.RequireAuth(ctx)`
- Demo mode: unsigned `Bearer demo.<persona>` tokens (`backend/internal/adapters/auth/demo_token_verifier.go`); `DEMO_MODE=true`/`VITE_DEMO_MODE=true`; no `ClerkProvider` rendered

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry or similar detected)

**Tracing:**
- OpenTelemetry OTLP/HTTP exporter, enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`backend/cmd/server/main.go`)

**Logs:**
- `log/slog` structured logging (`backend/pkg/logger/logger.go`); request timing in `backend/pkg/middleware/timing.go` and `backend/pkg/graphql/timing.go`; DB pool stats at `/debug/db-stats` (non-production)
- Frontend web vitals: `frontend/src/lib/vitals.ts`; Lighthouse CI (`frontend/lighthouserc.cjs`)

## CI/CD & Deployment

**Hosting:**
- Sevalla (backend Dockerfile app, `backend/Dockerfile`, context `backend`; frontend static site behind Cloudflare). Backend deploys when `backend/` changes reach `main`; frontend deploys on PRs/commits
- Backend endpoints: `/graphql` (HTTP + WebSocket), `/webhooks/clerk`, `/health`, `/ready`, `/version`, plus playground and `/debug/db-stats` outside production
- Production API origin referenced: `api.perspectize.com` (CSP in `frontend/src/app.html`)

**CI Pipeline:**
- GitHub Actions in `.github/workflows/`: `ci.yml` (Go test/lint with Postgres 17 service, build, perf-tag vet, gofmt, demo E2E), `frontend-test.yml` (Vitest unit + browser), `codeql.yml` (weekly), `trivy.yml` (lockfile vuln scan), `mutation.yml`, `migration-labels.yml`, `tag-main.yml`
- Coverage: Codecov (`codecov/codecov-action`)
- Dependabot: `.github/dependabot.yml`

## Environment Configuration

**Required env vars:**
- Backend: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `JWT_SECRET` (production); `YOUTUBE_API_KEY` (metadata fetch); `CORS_ORIGINS` (set to frontend origin; defaults to `*`)
- Frontend: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GRAPHQL_URL`, `VITE_YOUTUBE_API_KEY`

**Secrets location:**
- Local `.env` files (gitignored, `backend/.env`, `frontend/.env`); deployed secrets in Sevalla environment settings; CI secrets in GitHub. See `.docs/SECURITY.md`

## Webhooks & Callbacks

**Incoming:**
- `POST /webhooks/clerk` - Clerk user sync, Svix-signature verified (`backend/internal/adapters/auth/webhook_handler.go`); includes update-to-create fallback

**Outgoing:**
- None

---

*Integration audit: 2026-10-01*

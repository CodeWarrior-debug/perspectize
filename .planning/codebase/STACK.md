# Technology Stack

**Analysis Date:** 2026-11-26

## Languages

**Primary:**
- Go 1.27.2 (`backend/go.mod`) - GraphQL API server and seed tools (`backend/cmd/server`, `backend/cmd/seed-demo`, `backend/cmd/seed-bible`)
- TypeScript ^6.0.3 (`frontend/package.json`; `@typescript/native` = `npm:typescript@^7.0.2` for `svelte-check --tsgo`) - frontend in `frontend/src`

**Secondary:**
- Svelte 5 components (`.svelte`) in `frontend/src`
- SQL - Postgres migrations in `backend/migrations` (`0000NN_name.up.sql` / `.down.sql`, latest 000041)
- GraphQL SDL - `backend/schema.graphql`, `backend/messaging.graphql`
- Node scripts (`frontend/scripts`, `frontend/stryker-chunked.mjs`, `.claude/agent-registry`)

## Runtime

**Environment:**
- Go 1.27 (`golang:1.27-alpine` build, `gcr.io/distroless/static-debian12:nonroot` runtime; `backend/Dockerfile`)
- Node 24 in CI (`.github/workflows/ci.yml`, `frontend-test.yml`); `frontend/Dockerfile.demo` builds on `node:22-alpine` and serves with `nginx:1.29-alpine`
- Postgres: Neon in production; `postgres:18` in local compose files; `postgres:17` service in CI

**Package Manager:**
- Go modules (`backend/go.mod`, `backend/go.sum` present)
- pnpm 10 (CI pins major 10; `frontend/pnpm-lock.yaml` present). `frontend/pnpm-workspace.yaml` holds all overrides and `minimumReleaseAge: 1440` (24h). Do NOT add `pnpm.overrides` to `package.json`.

## Frameworks

**Core:**
- gqlgen v0.17.98 - schema-first GraphQL server (`backend/gqlgen.yml`, generated code in `backend/internal/adapters/graphql/generated/`)
- chi v5.5.0 + go-chi/cors + httprate - routing, CORS, rate limiting (middleware stack in `backend/internal/server/api.go`)
- GORM v1.31.2 + `gorm.io/driver/postgres` v1.6.3 on pgx v5.13.0 - data access (`backend/internal/adapters/repositories/postgres`)
- gorm-cursor-paginator v2 (pagination), dataloadgen v0.0.10 (`backend/internal/adapters/graphql/dataloader`)
- coder/websocket v1.8.15 - GraphQL subscriptions
- SvelteKit ~3.4.0 with `@sveltejs/adapter-static` (SPA fallback `index.html`). Kit options live in `sveltekit({...})` in `frontend/vite.config.ts` (there is no `svelte.config.js`); public env vars are declared in `frontend/src/env.ts`
- Svelte ^5.59.1, Tailwind CSS ^4.3.5, bits-ui ^2.22.0, vaul-svelte, tailwind-variants, `@lucide/svelte` ^1.77.0, svelte-sonner
- TanStack Svelte Query ^6.4.7 and Svelte Form ^1.33.5
- AG Grid Community 32.3.9 + `ag-grid-svelte5`
- TipTap ^3.35 (rich text), DOMPurify ^3.5.0, culori + @jaames/iro (color)
- Installable web app via `frontend/static/manifest.webmanifest`; no service worker (`serviceWorker.register: false`)
- Import library code through the `#lib` alias (`imports` field in `frontend/package.json`)

**Testing:**
- Go `testing` + testify v1.12.1 + go-sqlmock v1.5.2; Gremlins mutation testing (`make mutate`, `backend/.gremlins.yaml`)
- Vitest ^4.1.12: `unit` project (jsdom ^31) and `browser` project (`@vitest/browser-playwright`, `frontend/vitest.config.browser.ts`); `@testing-library/svelte`
- Playwright 1.65.1 for demo E2E and recording (`frontend/demo`)
- Stryker ^10 (frontend mutation), Lighthouse CI (`frontend/lighthouserc.cjs`), jscpd

**Build/Dev:**
- Vite ^8.3.8 (`frontend/vite.config.ts`, uses `build.rolldownOptions`), `@grafana/faro-rollup-plugin` (opt-in sourcemap upload, `frontend/scripts/faro-sourcemaps.ts`)
- air and gqlgen run as Go `tool` directives (`go tool air`); golang-migrate CLI; Make (`Makefile`, `backend/Makefile`)
- Prettier ^3.10.1 + prettier-plugin-svelte; gofmt; git hooks in `.hooks/`
- Docker / compose (`docker-compose.demo.yml`, `docker-compose.observability.yml`, `backend/docker-compose.yml`)

## Key Dependencies

**Critical:**
- `github.com/clerk/clerk-sdk-go/v2` v2.10.0 and `svelte-clerk` ^1.3.0 - authentication
- `github.com/svix/svix-webhooks` v1.99.1 - Clerk webhook signature verification
- `graphql-request` ^7.4, `graphql-ws` ^6.4 - frontend queries and subscriptions
- `github.com/microcosm-cc/bluemonday` v1.0.27 - HTML sanitization
- `github.com/unrolled/secure` v1.18.0 - security headers

**Infrastructure:**
- OpenTelemetry Go v1.47 (OTLP HTTP traces/metrics/logs; `otelhttp`, `otelgqlgen`, `otelslog`, runtime metrics)
- `@grafana/faro-web-sdk` / `faro-web-tracing` 2.15.0 - browser RUM (`frontend/src/lib/telemetry.ts`)
- `joho/godotenv` - local `.env` loading

## Configuration

**Environment:**
- Backend: `backend/.env` (gitignored; template `backend/.env.example`). Read in `backend/internal/config/`, `backend/cmd/server/main.go`, `backend/pkg/database`, `pkg/buildinfo`. Optional JSON config via `CONFIG_PATH` (default `config/config.example.json`)
- Backend vars: `DATABASE_URL`, `DATABASE_PASSWORD`, `APP_ENV`, `SERVER_PORT`, `CORS_ORIGINS`, `RATE_LIMIT_PER_MIN`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `YOUTUBE_API_KEY`, `YOUTUBE_API_CACHE_TTL_SECONDS`, `YOUTUBE_TRENDING_CACHE_TTL_SECONDS`, `TMDB_API_READ_ACCESS_TOKEN`, `IMPORT_ROW_CONCURRENCY`, `IMPORT_LISTING_CONCURRENCY`, `MESSAGE_RETENTION_MAX`, `MESSAGE_RETENTION_SWEEP_MINUTES`, `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, `DB_CONN_MAX_IDLE_TIME`, `DB_CONN_MAX_LIFETIME`, `DEMO_MODE`, `DEMO_IMPORT_DELAY_MS`, `BUILD_TAG`, `SVL_DEPLOYMENT_BRANCH`, `SVL_DEPLOYMENT_COMMIT_SHA`, `OTEL_*`
- Frontend: `frontend/.env` (gitignored; template `frontend/.env.example`). Values are fixed at build time: `VITE_GRAPHQL_URL`, `VITE_CLERK_PUBLISHABLE_KEY` (or `PUBLIC_CLERK_PUBLISHABLE_KEY`), `VITE_APP_ENV`, `VITE_DEMO_MODE`, `VITE_FARO_URL`, `VITE_FEATURE_CONTRIBUTE_TAB`, `VITE_SUPPORT_URL`, `VITE_SUPPORT_MONTHLY_URL`, `VITE_SUPPORT_ANNUAL_URL`, `VITE_ONBOARDING_VIDEO_*`
- `vite.config.ts` derives `PUBLIC_CLERK_ORIGIN`, `PUBLIC_CLERK_SCRIPT_URL`, `PUBLIC_GRAPHQL_ORIGIN` for `app.html`
- Sourcemap upload (build only): `FARO_SOURCEMAP_API_KEY`, `FARO_APP_ID`, `FARO_STACK_ID`, `FARO_API_ENDPOINT`

**Build:**
- `backend/gqlgen.yml`, `backend/Makefile` (`graphql-gen`, `migrate-*`, `mutate`), `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/components.json`, `frontend/stryker.config.json`, `frontend/static/_headers`, `frontend/static/_redirects`

## Platform Requirements

**Development:**
- Go 1.27, Node 24 + pnpm, golang-migrate, Docker (demo and observability stacks)
- `make start` runs backend :8080 and frontend :5173 (strict port); `make demo-up` serves the Docker demo at :4173

**Production:**
- Backend: Sevalla application (Docker image) with Neon Postgres
- Frontend: static SPA build (`frontend/build`) on Sevalla static hosting

---

*Stack analysis: 2026-11-26*

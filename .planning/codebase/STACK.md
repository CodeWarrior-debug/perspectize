# Technology Stack

**Analysis Date:** 2026-10-01

## Languages

**Primary:**
- Go 1.26 (`go` directive; `toolchain go1.26.0`) - Backend GraphQL API in `backend/` (`backend/go.mod`)
- TypeScript ^6.0.3 - Frontend app in `frontend/src/` (`frontend/package.json`)
- Svelte ^5.57.1 (runes only) - UI components `frontend/src/**/*.svelte`

**Secondary:**
- SQL - golang-migrate migrations `backend/migrations/` (latest: `000027_add_category_wikipedia_url`)
- GraphQL SDL - `backend/schema.graphql`, `backend/messaging.graphql`
- CSS (Tailwind v4) - `frontend/src/app.css`
- Node ESM scripts (`.mjs`) - `frontend/gen-preset-css.mjs`, `frontend/stryker-chunked.mjs`

## Runtime

**Environment:**
- Backend: static Go binary (CGO disabled) in `gcr.io/distroless/static-debian12:nonroot` (`backend/Dockerfile`; build stage `golang:1.27-alpine`, pinned deliberately above go.mod toolchain)
- Frontend: static SPA (SvelteKit `adapter-static`, `ssr = false`, `prerender = false`, fallback `index.html`); Node 24 in CI (`.github/workflows/ci.yml`, `frontend-test.yml`)
- Mobile shell: Capacitor 8 (`frontend/capacitor.config.ts`, appId `com.perspectize.app`, webDir `build`); native projects `frontend/ios/`, `frontend/android/`

**Package Manager:**
- Go modules (`backend/go.mod`, `backend/go.sum`); gqlgen and air declared via the `tool` block
- pnpm 10.x (`frontend/pnpm-lock.yaml`, `frontend/pnpm-workspace.yaml` holds `overrides`; do not duplicate in package.json); `frontend/.npmrc` sets `engine-strict`
- Lockfiles: present for both

## Frameworks

**Core:**
- gqlgen v0.17.95 - schema-first GraphQL server (`backend/gqlgen.yml`, generated in `backend/internal/adapters/graphql/generated/`)
- go-chi/chi v5.3.2 - HTTP router (`backend/cmd/server/main.go`), with `go-chi/cors`, `go-chi/httprate`, `unrolled/secure`
- GORM v1.31.2 + `gorm.io/driver/postgres` v1.6.3 on pgx/v5 v5.11.0 - persistence (`backend/internal/adapters/repositories/postgres/`)
- `pilagod/gorm-cursor-paginator/v2` v2.7.0 - keyset pagination
- `vikstrous/dataloadgen` v0.0.10 - dataloaders (`backend/internal/adapters/graphql/dataloader/`)
- `coder/websocket` v1.8.15 - GraphQL subscriptions/realtime (`backend/internal/adapters/realtime/`)
- SvelteKit ~2.70.2 + Svelte 5 + Vite ^7.3.6 - frontend
- Tailwind CSS ^4.3.3 (`@tailwindcss/vite`), bits-ui ^2.19.3 (shadcn-svelte in `frontend/src/lib/components/shadcn/`), `tailwind-variants`, `tailwind-merge`, `clsx`, `@lucide/svelte`, `vaul-svelte`, `svelte-sonner`
- TanStack Svelte Query ^6.2.4 (function-wrapper API), TanStack Svelte Form ^1.33.5
- AG Grid Community 32.3.9 via `ag-grid-svelte5` (`@ag-grid-community/*`; never install `ag-grid-community`)
- TipTap ^3.31.3 rich-text editor (starter-kit, link, image, table, underline, placeholder)
- `graphql-request` ^7.4.0, `graphql-ws` ^6.3.0, `graphql` ^16.14.2 - API client + subscriptions

**Testing:**
- Go: `testing` + testify v1.12.1 + go-sqlmock v1.5.2; query counting via `backend/internal/perf/querycount`; gremlins mutation testing (`backend/.gremlins.yaml`)
- Frontend: Vitest ^4.1.11 (`unit` + `browser` projects), jsdom ^30, `@testing-library/svelte`, `vitest-browser-svelte`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, Playwright 1.63.0 (`frontend/demo/playwright.config.ts`), Stryker ^10 (`frontend/stryker.config.json`), jscpd, Lighthouse CI (`frontend/lighthouserc.cjs`)

**Build/Dev:**
- air (hot reload, `backend/.air.toml`), golangci-lint (`backend/.golangci.yml`), gofmt
- golang-migrate (CLI; `migrate/migrate:v4.18.3` image in demo stack)
- Prettier ^3.9.9 + prettier-plugin-svelte (`frontend/.prettierrc`), svelte-check ^4.7.6
- `@vite-pwa/sveltekit` ^1.1.0 (service worker built, not registered; see `frontend/CLAUDE.md`)
- Makefiles: `Makefile` (root, demo targets), `backend/Makefile`

## Key Dependencies

**Critical:**
- `github.com/clerk/clerk-sdk-go/v2` v2.7.0 + `golang-jwt/jwt/v5` - Clerk JWT verification (`backend/internal/adapters/auth/`)
- `github.com/svix/svix-webhooks` v1.99.1 - Clerk webhook signature verification (`webhook_handler.go`)
- `svelte-clerk` ^1.2.0 - frontend auth, accessed only via the `$lib/auth` facade
- `microcosm-cc/bluemonday` v1.0.27 (backend HTML sanitisation), `dompurify` ^3.4.16 (frontend)
- OpenTelemetry v1.46.0 (`otel`, `sdk`, `otlptracehttp`) - optional tracing

**Infrastructure:**
- `joho/godotenv` v1.5.1 - env loading; `log/slog` for logging (`backend/pkg/logger/`)
- `@jaames/iro`, `culori` - theme colour picker/derivation (`frontend/src/lib/theme/`)
- `web-vitals` ^6.2.2 (`frontend/src/lib/vitals.ts`); `@capacitor/core` + `@capacitor/haptics`

## Configuration

**Environment:**
- Backend precedence: env vars > `backend/config/config.json` (example: `backend/config/config.example.json`); loaded by `backend/internal/config/{config,security,demo,validation}.go`
- `backend/.env` and `frontend/.env` exist (gitignored, unreadable by design); variable names documented in `backend/.env.example` and `frontend/.env.example`
- Backend vars: `DATABASE_URL` (required), `DATABASE_PASSWORD`, `JWT_SECRET`, `ACCESS_TOKEN_MINUTES`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `RATE_LIMIT_PER_MIN`, `CORS_ORIGINS`, `YOUTUBE_API_KEY`, `YOUTUBE_API_CACHE_TTL_SECONDS`, `MESSAGE_RETENTION_MAX`, `MESSAGE_RETENTION_SWEEP_MINUTES`, `APP_ENV`, `DEMO_MODE`, `BUILD_TAG`, `SEVALLA_BACKEND_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT` (plus standard `OTEL_*` vars)
- Frontend vars: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_DEMO_MODE`, `VITE_GRAPHQL_URL` (default `http://localhost:8080/graphql`), `VITE_YOUTUBE_API_KEY`, `VITE_ONBOARDING_VIDEO_{GUEST_PRODUCT,HOW_ADD_VIDEO,HOW_PERSPECTIVE}`
- `APP_ENV=production` disables introspection/playground and enables HSTS; server refuses `DEMO_MODE=true` with production

**Build:**
- `backend/gqlgen.yml`, `backend/Dockerfile`, `backend/Dockerfile.demo`, `backend/.air.toml`
- `frontend/vite.config.ts`, `frontend/vitest.config.browser.ts`, `frontend/vitest.config.stryker.ts`, `frontend/svelte.config.js`, `frontend/tailwind.config.ts`, `frontend/tsconfig.json`, `frontend/components.json`
- `frontend/static/_headers` and `_redirects` are load-bearing for Sevalla/Cloudflare hosting

## Platform Requirements

**Development:**
- Go 1.26+, Node 24 + pnpm 10, `golang-migrate` CLI, air
- No local Postgres in normal dev: `DATABASE_URL` points at the shared Sevalla dev DB (never run migrate up/down)
- Docker Desktop only for the isolated demo stack (`docker-compose.demo.yml`, `make demo-up`; Postgres 18 on port 5434)

**Production:**
- Sevalla: backend as Dockerfile app (`backend/Dockerfile`), frontend as static site behind Cloudflare; PostgreSQL (17 in CI, Sevalla-managed)
- Optional iOS/Android builds via Capacitor (`pnpm run mobile:build`)

---

*Stack analysis: 2026-10-01*

# Phase 5: Testing + Deployment - Research (Sevalla Platform)

**Researched:** 2026-02-09
**Domain:** DigitalOcean App Platform static site hosting with SvelteKit
**Confidence:** MEDIUM

## Summary

**CRITICAL CLARIFICATION:** Despite the user referring to "Sevalla," the backend is deployed at `backend-dz3qa.ondigitalocean.app`, which is a **DigitalOcean App Platform** URL. Sevalla is a separate Kinsta product with distinct infrastructure and URLs. The correct platform for this research is **DigitalOcean App Platform**, not Sevalla.

The backend is already deployed on DigitalOcean App Platform. The frontend needs to be deployed as a static site on the same platform to enable proper CORS configuration. DigitalOcean App Platform provides automatic GitHub integration, build pipeline, CDN distribution, and `.ondigitalocean.app` subdomain URLs for deployed apps.

The previous implementation incorrectly targeted GitHub Pages, leaving artifacts in the codebase (base path `/perspectize`, `.nojekyll` file, GitHub Actions workflow). These must be removed/reverted before deploying to DigitalOcean App Platform.

**Key findings:**
- DigitalOcean App Platform auto-detects pnpm from `pnpm-lock.yaml` and uses it for builds
- Static sites get assigned URLs like `app-name-xxxxx.ondigitalocean.app` (randomized subdomain)
- Monorepos supported via Source Directory configuration (set to `frontend/`)
- Environment variables must be scoped `BUILD_TIME` for Vite to embed them in static output
- CORS must be configured on backend with the exact frontend `.ondigitalocean.app` origin URL
- SvelteKit adapter-static requires `base: ''` (root path) for standard hosting

**Primary recommendation:** Deploy frontend to DigitalOcean App Platform as a static site component using monorepo source directory `frontend/`, configure `VITE_GRAPHQL_URL` as build-time environment variable, then update backend `ALLOWED_ORIGINS` with the assigned `.ondigitalocean.app` URL.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sveltejs/adapter-static | 3.0.10 | SvelteKit SSG adapter | Official SvelteKit static site generation adapter |
| DigitalOcean App Platform | N/A | Cloud hosting platform | Already hosting backend, provides unified deployment |
| GitHub | N/A | Source control + CI trigger | Free, integrated with DigitalOcean App Platform auto-deploy |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pnpm | 9 | Package manager | Monorepo workspaces (already in use) |
| Vite | 6.4.1 | Build tool | Bundled with SvelteKit, handles env vars |
| GitHub Actions | N/A | CI for tests | PR checks, coverage verification (NOT deployment) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DigitalOcean App Platform | Sevalla (Kinsta) | Different platform entirely, would require backend migration |
| DigitalOcean App Platform | Vercel/Netlify | Splits backend/frontend across providers, complicates CORS |
| DigitalOcean App Platform | GitHub Pages | No environment variable support at build time, harder CORS setup |

**Installation:**
No additional libraries needed. Uses existing SvelteKit + adapter-static setup.

## Architecture Patterns

### Recommended Deployment Structure

```
DigitalOcean App Platform App: "perspectize"
├── Backend Service (already deployed)
│   ├── URL: https://backend-dz3qa.ondigitalocean.app
│   ├── Source Directory: backend/
│   └── Type: Web Service (Go)
│
└── Frontend Static Site (to be added)
    ├── URL: https://fe-xxxxx.ondigitalocean.app (assigned)
    ├── Source Directory: frontend/
    ├── Build Command: pnpm run build
    ├── Output Directory: build
    └── Environment Variables:
        - VITE_GRAPHQL_URL (BUILD_TIME)
```

### Pattern 1: Monorepo Static Site Deployment

**What:** Configure DigitalOcean App Platform to build from a subdirectory in a monorepo by setting Source Directory.

**When to use:** When frontend and backend live in the same repository but need separate deployment configurations.

**Configuration:**
```yaml
# App Platform configuration (via UI or .do/app.yaml)
name: fe
static_sites:
  - name: fe
    source_dir: frontend/
    github:
      repo: CodeWarrior-debug/perspectize
      branch: main
    build_command: pnpm run build
    output_dir: build
    envs:
      - key: VITE_GRAPHQL_URL
        value: https://backend-dz3qa.ondigitalocean.app/graphql
        scope: BUILD_TIME
```

**How it works:**
- DigitalOcean clones entire repo to `/workspace`
- Sets working directory to `/workspace/frontend/`
- Detects `pnpm-lock.yaml` and uses pnpm automatically
- Runs `pnpm install` then `pnpm run build`
- Serves files from `frontend/build/` via CDN

### Pattern 2: Build-Time Environment Variables for Vite

**What:** Vite embeds environment variables prefixed with `VITE_` at build time into the static output.

**When to use:** Always for static sites that need to configure API endpoints or other runtime values.

**Critical requirement:** Variables MUST be scoped `BUILD_TIME` in DigitalOcean App Platform, not `RUN_TIME`. Static sites have no runtime environment.

**Example:**
```typescript
// frontend/src/lib/queries/client.ts
const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';
export const graphqlClient = new GraphQLClient(GRAPHQL_URL);
```

**App Platform configuration:**
```yaml
envs:
  - key: VITE_GRAPHQL_URL
    value: https://backend-dz3qa.ondigitalocean.app/graphql
    scope: BUILD_TIME  # CRITICAL: Must be BUILD_TIME for static sites
```

**Verification:**
After deployment, inspect bundled JS to confirm URL is embedded:
```bash
curl https://fe-xxxxx.ondigitalocean.app/_app/immutable/chunks/client.xxx.js | grep -o 'https://backend[^"]*'
```

### Pattern 3: CORS Configuration for Same-Platform Cross-Origin Requests

**What:** Backend and frontend on DigitalOcean App Platform have different `.ondigitalocean.app` subdomains, requiring CORS headers.

**When to use:** When frontend is static site and backend is separate service (this scenario).

**Backend configuration:**
```go
// backend/cmd/server/main.go
allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
if allowedOrigins == "" {
    allowedOrigins = "*" // Local development default
}

origins := strings.Split(allowedOrigins, ",")
c := cors.New(cors.Options{
    AllowedOrigins:   origins,
    AllowCredentials: true,
    AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
    AllowedHeaders:   []string{"Content-Type", "Authorization"},
})
```

**Environment variable in App Platform (backend):**
```yaml
envs:
  - key: ALLOWED_ORIGINS
    value: https://fe-xxxxx.ondigitalocean.app
    scope: RUN_TIME  # Backend needs runtime access
```

**Deployment sequence:**
1. Deploy frontend static site first
2. Copy assigned `.ondigitalocean.app` URL
3. Update backend `ALLOWED_ORIGINS` environment variable
4. Redeploy backend (or it may auto-restart with new env var)

### Anti-Patterns to Avoid

- **Base path in svelte.config.js for standard hosting:** Only use `base: '/subpath'` for subdirectory hosting (like GitHub Pages). DigitalOcean App Platform serves from root, so `base: ''` is correct.

- **Runtime environment variables for static sites:** Static sites are pre-built files served from CDN. They have no runtime environment. All configuration must be baked in at build time via `VITE_*` variables with `BUILD_TIME` scope.

- **Wildcard CORS in production:** While `ALLOWED_ORIGINS=*` works for development, production should restrict to the exact frontend origin. However, since both apps use dynamic `.ondigitalocean.app` subdomains, you must configure this AFTER frontend deployment when the URL is known.

- **Using `cd` in build commands for monorepo:** Don't use `cd fe && pnpm build`. Set Source Directory to `frontend/` instead. The Source Directory field sets the working directory automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub auto-deploy | Custom webhooks, CI/CD scripts | DigitalOcean App Platform GitHub integration | Built-in, handles auth, triggers on push, logs visible in dashboard |
| Environment variable injection | Build scripts that replace placeholders | Vite's `import.meta.env.VITE_*` + App Platform env config | Standard Vite pattern, automatically embedded at build time |
| CDN distribution | Manual file upload to S3/Spaces | App Platform static site hosting | Included, serves from DigitalOcean CDN automatically |
| SSL/HTTPS | Let's Encrypt setup, cert renewal | App Platform `.ondigitalocean.app` domain | Automatic HTTPS for all `.ondigitalocean.app` subdomains |
| Monorepo builds | Workspace scripts, manual `cd` commands | App Platform Source Directory setting | Platform handles working directory correctly |

**Key insight:** DigitalOcean App Platform is a full PaaS that handles build orchestration, environment injection, CDN serving, and SSL out of the box. Avoid reimplementing these features with custom scripts.

## Common Pitfalls

### Pitfall 1: Forgetting to Remove GitHub Pages Artifacts

**What goes wrong:** Deploying to DigitalOcean App Platform with `base: '/perspectize'` in svelte.config.js causes all internal links to point to wrong URLs (e.g., `https://app.ondigitalocean.app/perspectize/page` returns 404).

**Why it happens:** GitHub Pages hosts repos at `username.github.io/repo-name`, requiring a base path. DigitalOcean App Platform hosts at root domain.

**How to avoid:**
1. Remove `base: dev ? '' : '/perspectize'` from svelte.config.js, change to `base: ''`
2. Delete `frontend/static/.nojekyll` (GitHub Pages-specific file)
3. Delete or archive `.github/workflows/frontend-deploy.yml` (GitHub Pages deploy workflow)
4. Optionally keep `.github/workflows/frontend-test.yml` (platform-independent PR checks)

**Warning signs:**
- Links work in dev (`pnpm run dev`) but 404 in production
- Browser console shows "Failed to load module" errors with `/perspectize` in paths
- Static assets (CSS, JS) return 404

### Pitfall 2: Wrong Environment Variable Scope

**What goes wrong:** Setting `VITE_GRAPHQL_URL` with `RUN_TIME` scope on a static site component causes the variable to be undefined in the built app. App falls back to localhost URL, can't reach backend.

**Why it happens:** Static sites are pre-rendered files served from CDN. There's no runtime server to inject environment variables. Vite must embed them at build time.

**How to avoid:** Always use `BUILD_TIME` or `RUN_AND_BUILD_TIME` scope for environment variables in static site components. Verify in App Platform UI: component settings > Environment Variables > check Scope dropdown.

**Warning signs:**
- App works in development (`pnpm run dev` with `.env` file)
- Production app makes requests to `http://localhost:8080/graphql` (shows in Network tab)
- CORS errors in production (because it's trying to reach localhost from browser)

### Pitfall 3: CORS Configuration Timing

**What goes wrong:** Deploying backend with `ALLOWED_ORIGINS=https://fe-xxxxx.ondigitalocean.app` BEFORE deploying frontend fails because the frontend URL doesn't exist yet. Or deploying both simultaneously means you don't know the frontend URL to configure.

**Why it happens:** DigitalOcean App Platform assigns random subdomains (the `xxxxx` part) at deployment time. You can't predict the URL beforehand.

**How to avoid:**
1. Deploy frontend static site first WITHOUT CORS configured on backend
2. Copy the assigned `.ondigitalocean.app` URL from deployment output
3. Update backend `ALLOWED_ORIGINS` environment variable with the frontend URL
4. Redeploy backend or wait for auto-restart

**Alternative:** Start with `ALLOWED_ORIGINS=*` (wildcard), verify frontend works, then tighten to specific origin.

**Warning signs:**
- Backend responds with `Access-Control-Allow-Origin` header missing
- Browser console shows CORS policy errors
- GraphQL requests fail with opaque CORS error (not HTTP error)

### Pitfall 4: pnpm Version Mismatch

**What goes wrong:** Build fails with "lockfile version mismatch" or "unsupported lockfile version" errors.

**Why it happens:** DigitalOcean App Platform defaults to a specific pnpm version. If local development uses pnpm 9 but platform uses pnpm 8, lockfile formats may be incompatible.

**How to avoid:** Pin pnpm version in `package.json`:

```json
{
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "pnpm": ">=9.0.0"
  }
}
```

App Platform respects `packageManager` field (Corepack) or `engines.pnpm` to select the correct version.

**Warning signs:**
- Build logs show "lockfile version X does not match pnpm version Y"
- Local `pnpm install` works but App Platform build fails
- Build fails at dependency installation step

### Pitfall 5: Output Directory Auto-Detection Failure

**What goes wrong:** After successful build, deployment shows "No static files found" or serves wrong directory.

**Why it happens:** DigitalOcean App Platform auto-detects output directory by scanning for `_static`, `dist`, `public`, or `build` directories. If your app uses a non-standard name or has multiple matching directories, it may pick the wrong one.

**How to avoid:** Explicitly set Output Directory in App Platform configuration to `build` (SvelteKit adapter-static default).

**Warning signs:**
- Build succeeds but deployment shows "No files to deploy"
- Deployed site shows directory listing instead of app
- Wrong files are served (e.g., source files instead of built files)

### Pitfall 6: Trailing Slash Issues with SvelteKit

**What goes wrong:** Some routes return 404 or infinite redirect loops. Links like `/page` don't resolve to `/page/index.html`.

**Why it happens:** DigitalOcean App Platform's static file server behavior may not match SvelteKit's `trailingSlash` configuration. If `trailingSlash: 'never'` is set but platform serves `/page/` instead of `/page.html`, mismatches occur.

**How to avoid:** Use SvelteKit's default `trailingSlash: 'ignore'` OR set `trailingSlash: 'always'` to generate `page/index.html` structure universally compatible with CDNs.

**Warning signs:**
- Some routes work, others 404
- Browser address bar shows redirect loops
- Direct URL access works but navigation via `<a>` tags fails

## Code Examples

Verified patterns from official sources:

### SvelteKit Config for Standard Root-Path Hosting

**Source:** [SvelteKit adapter-static docs](https://svelte.dev/docs/kit/adapter-static)

```typescript
// frontend/svelte.config.js
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			strict: true
		}),
		paths: {
			base: '' // EMPTY for root path hosting (not '/perspectize')
		}
	}
};

export default config;
```

### Vite Environment Variable Access

**Source:** [Vite env variables docs](https://vite.dev/guide/env-and-mode.html)

```typescript
// frontend/src/lib/queries/client.ts
import { GraphQLClient } from 'graphql-request';

// Vite exposes VITE_* env vars via import.meta.env at build time
const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';

export const graphqlClient = new GraphQLClient(GRAPHQL_URL);
```

### App Platform YAML Configuration (Monorepo Static Site)

**Source:** [DigitalOcean App Platform app spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)

```yaml
# .do/app.yaml (optional, can also configure via UI)
name: perspectize
region: nyc

static_sites:
  - name: fe
    github:
      repo: CodeWarrior-debug/perspectize
      branch: main
      deploy_on_push: true
    source_dir: frontend/
    build_command: pnpm run build
    output_dir: build
    environment_slug: node-js
    envs:
      - key: VITE_GRAPHQL_URL
        value: https://backend-dz3qa.ondigitalocean.app/graphql
        scope: BUILD_TIME
    routes:
      - path: /
```

### Package.json with pnpm Version Pinning

**Source:** [DigitalOcean App Platform Node.js buildpack docs](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/nodejs/)

```json
{
  "name": "fe",
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "vite build"
  }
}
```

### Go Backend CORS Configuration for App Platform

**Source:** Backend already implemented in `backend/cmd/server/main.go`

```go
// Fetch allowed origins from environment variable
allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
if allowedOrigins == "" {
    allowedOrigins = "*" // Default for local dev
}

// Split comma-separated origins
origins := strings.Split(allowedOrigins, ",")

// Configure CORS middleware
c := cors.New(cors.Options{
    AllowedOrigins:   origins,
    AllowCredentials: true,
    AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
    AllowedHeaders:   []string{"Content-Type", "Authorization"},
})

handler := c.Handler(graphqlHandler)
```

**App Platform environment variable (backend service):**
```yaml
# After frontend deployment, update backend env var:
envs:
  - key: ALLOWED_ORIGINS
    value: https://fe-xxxxx.ondigitalocean.app
    scope: RUN_TIME
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub Pages deployment | DigitalOcean App Platform static sites | 2026-02 (this research) | Unified platform for backend + frontend, simpler CORS, build-time env vars |
| npm | pnpm with workspaces | 2025 | Faster installs, better monorepo support, App Platform auto-detects |
| adapter-static with base path | adapter-static with root path | 2026-02 (this fix) | Links work correctly, no /perspectize prefix needed |
| Static env vars in code | Vite VITE_* environment variables | Standard Vite pattern | Build-time configuration, different values per environment |

**Deprecated/outdated:**
- **GitHub Pages deployment for this project:** Removed in Phase 5 replanning. Base path configuration and `.nojekyll` file are artifacts to be cleaned up.
- **Wildcard CORS (`*`) in production:** Works but should be tightened to specific origin once frontend URL is known.
- **Manual lockfile version changes:** Use `packageManager` field in package.json instead of editing pnpm-lock.yaml version manually.

## Open Questions

Things that couldn't be fully resolved:

1. **Exact frontend URL format after deployment**
   - What we know: Will be `https://fe-xxxxx.ondigitalocean.app` where `xxxxx` is a random hash assigned at deployment
   - What's unclear: The exact hash value (can't predict before deployment)
   - Recommendation: Deploy frontend first, copy URL from deployment output, then configure CORS

2. **Custom domain configuration**
   - What we know: App Platform supports custom domains with CNAME records
   - What's unclear: Whether user wants custom domain (not mentioned in requirements)
   - Recommendation: Use default `.ondigitalocean.app` domain for Phase 5, add custom domain in future phase if needed

3. **Whether to keep GitHub Actions test workflow**
   - What we know: `frontend-test.yml` runs tests on PRs, independent of deployment platform
   - What's unclear: User preference for CI location (GitHub Actions vs App Platform build logs)
   - Recommendation: Keep the test workflow for PR checks, as it provides coverage reports and doesn't conflict with App Platform deployment

4. **App Platform app structure**
   - What we know: Backend is deployed, frontend needs to be added as static site component
   - What's unclear: Whether backend is part of an existing "perspectize" app or standalone service
   - Recommendation: If possible, add frontend as a component to the same App Platform app as backend. If backend is standalone, create new app for frontend. Check App Platform dashboard to confirm.

## Platform Clarification: Sevalla vs DigitalOcean App Platform

**CRITICAL FINDING:** The user referred to "Sevalla" as the deployment platform, but research reveals that Sevalla and DigitalOcean App Platform are **separate, unrelated platforms**:

### Sevalla (Kinsta PaaS)
- **Ownership:** Kinsta (managed WordPress hosting company)
- **Launch:** 2024-2025 as Kinsta's PaaS offering
- **URL format:** Uses `sevalla.app` domains (not `.ondigitalocean.app`)
- **Migration status:** Kinsta moved app/database/static site hosting from MyKinsta to Sevalla on February 2, 2026
- **Relationship to DigitalOcean:** None - competing PaaS platforms

### DigitalOcean App Platform
- **Ownership:** DigitalOcean (cloud infrastructure company)
- **Launch:** ~2020 as DigitalOcean's PaaS offering
- **URL format:** Uses `*.ondigitalocean.app` domains
- **Current deployment:** Backend is at `backend-dz3qa.ondigitalocean.app` (CONFIRMED DigitalOcean)
- **Relationship to Sevalla:** None - competing PaaS platforms

### Conclusion
The backend URL `backend-dz3qa.ondigitalocean.app` **definitively proves** the deployment is on **DigitalOcean App Platform**, not Sevalla. All research and recommendations in this document are for DigitalOcean App Platform.

**Recommendation:** Confirm with user whether there's a planned migration to Sevalla, or if "Sevalla" was used interchangeably with "DigitalOcean App Platform" due to platform confusion. For Phase 5, proceed with DigitalOcean App Platform to match existing backend deployment.

## Sources

### Primary (HIGH confidence)
- [DigitalOcean App Platform - How to Manage Static Sites](https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/) - Static site configuration and build settings
- [DigitalOcean App Platform - Deploy from Monorepo](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-monorepo/) - Source Directory configuration for monorepos
- [DigitalOcean App Platform - Node.js Buildpack](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/nodejs/) - pnpm detection and version configuration
- [DigitalOcean App Platform - Environment Variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/) - BUILD_TIME vs RUN_TIME scopes
- [SvelteKit - adapter-static documentation](https://svelte.dev/docs/kit/adapter-static) - Official adapter configuration

### Secondary (MEDIUM confidence)
- [DigitalOcean Community: pnpm monorepo setup](https://www.digitalocean.com/community/questions/how-to-setup-do-app-platform-with-pnpm-monorepo) - Community-verified pnpm configuration
- [DigitalOcean Community: Static site environment variables](https://www.digitalocean.com/community/questions/environment-variables-not-working-for-static-site-on-digitalocean-app-platform) - BUILD_TIME scope requirement clarification
- [Kinsta Docs: Sevalla Overview](https://kinsta.com/docs/service-information/sevalla-overview/) - Platform clarification (Sevalla is Kinsta, not DigitalOcean)
- [Kinsta Changelog: PaaS moving to Sevalla](https://kinsta.com/changelog/paas-moving-to-sevalla/) - Migration timeline and platform distinction

### Tertiary (LOW confidence)
- [SvelteKit GitHub Issues: Base path problems](https://github.com/sveltejs/kit/discussions/11554) - Community-reported base path issues (not official docs)
- [SvelteKit GitHub Issues: Trailing slash behavior](https://github.com/sveltejs/kit/issues/11382) - Community-reported trailing slash edge cases
- [GetDeploying: DigitalOcean vs Sevalla comparison](https://getdeploying.com/digitalocean-vs-sevalla) - Third-party platform comparison

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - DigitalOcean App Platform is confirmed via backend URL, but official SvelteKit deployment docs don't specifically cover DigitalOcean (generic static hosting guidance applies)
- Architecture: MEDIUM - Monorepo patterns verified in official docs, but specific to DigitalOcean App Platform (not SvelteKit-specific)
- Pitfalls: MEDIUM - Base path and environment variable issues verified in community reports and official docs, but some are extrapolated from similar platforms
- Platform clarification: HIGH - URL format definitively identifies DigitalOcean App Platform

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days) - DigitalOcean App Platform is stable, but platform features may be added

**Limitations:**
- Could not access Sevalla documentation (404 errors) - confirms platform is distinct from DigitalOcean
- pnpm version compatibility tested via community reports, not official DigitalOcean docs
- CORS configuration patterns based on existing backend code + DigitalOcean docs, not verified in production deployment
- Frontend URL format confirmed via DigitalOcean docs + community examples, but exact hash cannot be predicted pre-deployment

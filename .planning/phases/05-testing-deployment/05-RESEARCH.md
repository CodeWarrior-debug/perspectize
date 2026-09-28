# Phase 5: Testing + Deployment - Research

**Researched:** 2026-02-07
**Domain:** Frontend testing coverage, static site deployment, CI/CD for monorepos, CORS configuration
**Confidence:** HIGH

## Summary

Phase 5 focuses on achieving 80%+ test coverage, deploying the SvelteKit frontend to a free static hosting provider, automating deployments via CI/CD, and configuring production-ready CORS on the Go backend.

**Current state:** The project has a solid foundation with Vitest configured, 65 tests across 10 files, but only 36-40% coverage (target: 80%+). The frontend uses `adapter-static` for SSG, making it compatible with any static hosting provider. The backend has permissive CORS (`*`) suitable only for development.

**Standard approach:** GitHub Pages is the most cost-effective option (truly free, unlimited bandwidth) for static hosting. GitHub Actions with path filters enables efficient monorepo CI/CD. Vitest v8 provider with HTML reports identifies coverage gaps. Production CORS requires environment-based origin validation using `AllowOriginFunc`.

**Primary recommendation:** Use GitHub Pages with GitHub Actions for deployment, implement coverage gap analysis via HTML reports to reach 80%, and replace wildcard CORS with environment-based origin validation.

## Standard Stack

The established tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 4.0.18+ | Test framework with coverage | Official Vite/SvelteKit testing tool, fastest Svelte 5 support |
| @vitest/coverage-v8 | 4.0.18+ | Coverage reporting | Default provider, faster than Istanbul, accurate since 3.2.0 |
| GitHub Actions | - | CI/CD platform | Free for public repos, native GitHub integration |
| GitHub Pages | - | Static hosting | Truly free, unlimited bandwidth, zero config for static sites |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dorny/paths-filter | v3 | Monorepo change detection | Required for efficient monorepo CI/CD |
| actions/configure-pages | v3 | GitHub Pages setup | Simplifies Pages deployment, auto-configures base path |
| actions/upload-pages-artifact | v3 | Artifact upload | Required for Pages deployment workflow |
| actions/deploy-pages | v4 | Pages deployment | Final deployment step |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Pages | Vercel | 125 GB/month bandwidth limit, faster builds, better DX |
| GitHub Pages | Cloudflare Pages | 500 build minutes/month (vs unlimited), better performance |
| GitHub Pages | Netlify | 100 GB bandwidth, 300 build minutes/month |
| v8 coverage | Istanbul | Works on any runtime, but slower and higher memory usage |

**Installation:**
```bash
# Already installed in frontend/package.json
# GitHub Actions requires no installation (cloud-hosted)
```

## Architecture Patterns

### Recommended Project Structure
```
.github/
├── workflows/
│   ├── frontend-deploy.yml     # Frontend build + deploy to Pages
│   ├── backend-test.yml         # Backend Go tests
│   └── frontend-test.yml        # Frontend coverage enforcement
.planning/phases/05-testing-deployment/
├── 05-RESEARCH.md               # This file
├── 05-01-PLAN.md                # Coverage gap filling
├── 05-02-PLAN.md                # CI/CD + deployment
└── 05-03-PLAN.md                # CORS + production config
```

### Pattern 1: Monorepo Path-Based CI/CD
**What:** Use `dorny/paths-filter@v3` to detect changes in `frontend/` vs `backend/` and only run relevant jobs.
**When to use:** All workflows in monorepos to avoid wasting CI minutes on unchanged packages.
**Example:**
```yaml
# .github/workflows/frontend-deploy.yml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'frontend/**'

  build-deploy:
    needs: detect-changes
    if: needs.detect-changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - name: Install dependencies
        run: cd fe && pnpm install --frozen-lockfile
      - name: Build
        run: cd fe && pnpm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'frontend/build/'
      - uses: actions/deploy-pages@v4
```

### Pattern 2: Coverage Gap Analysis Workflow
**What:** Run coverage locally, generate HTML report, identify untested files/lines, write tests.
**When to use:** When coverage is below threshold and you need to reach 80%.
**Example:**
```bash
# Generate coverage report
cd fe
pnpm run test:coverage

# Open HTML report in browser
open coverage/index.html

# Identify gaps (in output):
# - UserSelector.svelte: 0% (17-49) — completely untested
# - ActivityTable.svelte: 32.5% (65-118,125,132) — event handlers untested
# - userSelection.svelte.ts: 40% (18,27-32,41-49) — store methods untested

# Write tests for untested lines
# Focus on:
# 1. Component event handlers (onclick, onchange)
# 2. Store methods (setUser, clearUser)
# 3. Error states and edge cases
```

### Pattern 3: Environment-Based CORS Configuration
**What:** Replace wildcard CORS (`*`) with environment-based origin validation using `AllowOriginFunc`.
**When to use:** Always in production. Development can use wildcard for convenience.
**Example:**
```go
// cmd/server/main.go
import (
    "os"
    "strings"
    "github.com/rs/cors"
)

func main() {
    // ... existing setup ...

    // Environment-based CORS
    allowedOrigins := getAllowedOrigins()
    c := cors.New(cors.Options{
        AllowedOrigins:   allowedOrigins,
        AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
        AllowedHeaders:   []string{"Content-Type"},
        AllowCredentials: false, // No cookies needed
        MaxAge:           3600,  // Cache preflight for 1 hour
        Debug:            false,
    })

    http.Handle("/graphql", c.Handler(srv))
    // ...
}

func getAllowedOrigins() []string {
    // Check for ALLOWED_ORIGINS env var (comma-separated)
    if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
        return strings.Split(origins, ",")
    }
    // Default to localhost for development
    return []string{"http://localhost:5173", "http://localhost:4173"}
}
```

### Pattern 4: GitHub Pages Base Path Configuration
**What:** Configure SvelteKit to use repository name as base path when deploying to GitHub Pages (not user.github.io).
**When to use:** When deploying to `username.github.io/repo-name` instead of custom domain.
**Example:**
```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

const dev = process.env.NODE_ENV !== 'production';

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
			base: dev ? '' : '/perspectize'
		}
	}
};

export default config;
```

### Anti-Patterns to Avoid
- **Building all packages on every commit:** Use path filters to avoid wasting CI minutes on unchanged packages.
- **Manual coverage verification:** Vitest thresholds fail builds automatically when coverage drops.
- **Wildcard CORS in production:** Security risk, allows any origin to access your API.
- **Hardcoding production URLs:** Use environment variables for CORS origins, GraphQL endpoints, etc.
- **Ignoring base path:** GitHub Pages subpath deploys require `paths.base` configuration in SvelteKit.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monorepo change detection | Custom git diff parsing | dorny/paths-filter@v3 | Handles edge cases (force push, merge commits, initial commit) |
| CORS middleware | Custom http.HandlerFunc | github.com/rs/cors | Secure defaults, preflight caching, credential handling |
| Coverage reporting | Custom V8/Istanbul parser | Vitest built-in coverage | Supports thresholds, excludes, multiple reporters |
| Static site deployment | Custom FTP/rsync scripts | GitHub Actions + Pages | Free, automatic, zero config for static sites |
| Base path handling | Custom env var injection | SvelteKit paths.base | Handles all internal links, assets, preloading |

**Key insight:** CI/CD and deployment tooling is complex with many edge cases. Use battle-tested actions and libraries instead of custom scripts.

## Common Pitfalls

### Pitfall 1: Coverage Threshold Enforcement Not Running in CI
**What goes wrong:** Tests pass locally, but CI doesn't enforce coverage thresholds, so coverage degrades over time.
**Why it happens:** `vitest run --coverage` must be used in CI (not `vitest` watch mode). Thresholds in `vite.config.ts` only fail builds when coverage runs.
**How to avoid:** Add dedicated test workflow that runs `pnpm run test:coverage` and fails on threshold violations.
**Warning signs:** Coverage drops below 80% on main branch, PRs merge with untested code.

### Pitfall 2: GitHub Pages 404 on Subpaths
**What goes wrong:** Frontend loads at `username.github.io/repo-name` but all navigation/links result in 404.
**Why it happens:** SvelteKit generates absolute paths (`/about`) but Pages serves from subpath (`/repo-name/about`). Base path must be configured.
**How to avoid:** Set `kit.paths.base` in `svelte.config.js` to match repository name. Add `.nojekyll` file to `static/` folder to bypass Jekyll processing.
**Warning signs:** Homepage loads but clicking links causes 404, assets fail to load (CSS, JS).

### Pitfall 3: Wildcard CORS in Production
**What goes wrong:** Backend accepts requests from any origin, enabling CSRF attacks and unauthorized API access.
**Why it happens:** Developers copy development CORS config (`Access-Control-Allow-Origin: *`) to production.
**How to avoid:** Use environment variable for allowed origins, validate against allowlist in production. Never deploy with `*` origin.
**Warning signs:** Security audit flags open CORS, unauthorized API usage, CSRF vulnerabilities.

### Pitfall 4: Monorepo Workflows Running on Every Commit
**What goes wrong:** CI runs frontend and backend tests/builds on every commit, even when only one package changed. Wastes CI minutes and slows down feedback.
**Why it happens:** Default GitHub Actions workflows trigger on `push:` without path filters or change detection.
**How to avoid:** Use `dorny/paths-filter@v3` to detect changes and conditionally run jobs. Cache dependencies (node_modules, Go modules) across runs.
**Warning signs:** Slow CI runs, high GitHub Actions usage, unchanged packages rebuilding constantly.

### Pitfall 5: Testing Svelte 5 Components Without Browser Environment
**What goes wrong:** Tests fail with cryptic errors about runes or reactivity not working. Components don't render properly in tests.
**Why it happens:** Svelte 5 runes require browser/component environment (jsdom or real browser). Node.js environment doesn't support Svelte 5 reactivity.
**How to avoid:** Use Vitest with `jsdom` environment (already configured in `vite.config.ts`). For advanced cases, use Vitest browser mode with Playwright.
**Warning signs:** Tests fail with "runes only work in browser environment", component state doesn't update in tests.

### Pitfall 6: Missing GitHub Pages Permissions
**What goes wrong:** Deployment workflow runs successfully but GitHub Pages doesn't update. Shows "Pages build and deployment" but no changes visible.
**Why it happens:** Workflow requires `pages: write` and `id-token: write` permissions. Default `GITHUB_TOKEN` has read-only access.
**How to avoid:** Add permissions block to deployment job:
```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```
**Warning signs:** Workflow shows success but site doesn't update, "Permission denied" errors in logs.

## Code Examples

Verified patterns from official sources:

### Complete Frontend Deployment Workflow
```yaml
# .github/workflows/frontend-deploy.yml
# Source: https://www.captaincodeman.com/deploy-a-sveltekit-app-to-github-pages
name: Deploy Frontend to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'frontend/**'

  build:
    needs: detect-changes
    if: needs.detect-changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install dependencies
        run: cd fe && pnpm install --frozen-lockfile

      - name: Setup Pages
        uses: actions/configure-pages@v3
        with:
          static_site_generator: sveltekit

      - name: Build
        run: cd fe && pnpm run build

      - name: Upload Artifacts
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'frontend/build/'

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

### Coverage Enforcement Workflow
```yaml
# .github/workflows/frontend-test.yml
name: Frontend Tests

on:
  pull_request:
    paths:
      - 'frontend/**'
  push:
    branches: [main]
    paths:
      - 'frontend/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install dependencies
        run: cd fe && pnpm install --frozen-lockfile

      - name: Run tests with coverage
        run: cd fe && pnpm run test:coverage

      - name: Upload coverage reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: frontend/coverage/
```

### Production CORS Configuration
```go
// cmd/server/main.go
// Source: https://github.com/rs/cors
package main

import (
	"os"
	"strings"
	"github.com/rs/cors"
)

func getCORSHandler() *cors.Cors {
	allowedOrigins := getAllowedOrigins()

	return cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: false,
		MaxAge:           3600, // Cache preflight for 1 hour
		Debug:            false, // Never enable in production
	})
}

func getAllowedOrigins() []string {
	// Production: Set ALLOWED_ORIGINS="https://codewarrior-debug.github.io,https://app.perspectize.com"
	// Development: Defaults to localhost
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		// Trim whitespace from each origin
		parts := strings.Split(origins, ",")
		result := make([]string, len(parts))
		for i, origin := range parts {
			result[i] = strings.TrimSpace(origin)
		}
		return result
	}

	// Default to localhost for development
	return []string{
		"http://localhost:5173", // Vite dev server
		"http://localhost:4173", // Vite preview server
	}
}

func main() {
	// ... existing setup ...

	// Replace existing CORS handler with production-ready version
	corsHandler := getCORSHandler()
	http.Handle("/graphql", corsHandler.Handler(srv))

	// ...
}
```

### Identifying Coverage Gaps
```bash
# Source: https://vitest.dev/guide/coverage
# Generate HTML coverage report
cd fe
pnpm run test:coverage

# Open in browser
open coverage/index.html

# Example output showing gaps:
# ✗ ERROR: Coverage for lines (40.74%) does not meet threshold (80%)
#
# File: src/lib/components/UserSelector.svelte
# Lines: 0% coverage (17-49 uncovered)
# Missing: All component logic untested
#
# File: src/lib/components/ActivityTable.svelte
# Lines: 32.5% coverage (65-118, 125, 132 uncovered)
# Missing: Event handlers (onclick, filter changes)
#
# File: src/lib/stores/userSelection.svelte.ts
# Lines: 40% coverage (18, 27-32, 41-49 uncovered)
# Missing: setUser, clearUser, session sync

# Strategy to reach 80%:
# 1. Start with 0% files (UserSelector) — biggest impact
# 2. Test event handlers and user interactions
# 3. Test store methods and side effects
# 4. Test error states and edge cases
# 5. Re-run coverage to verify improvement
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest | Vitest | 2021 | 5-10x faster, native ESM, Vite integration |
| Istanbul only | V8 provider (default) | Vitest 3.2.0 (2023) | Faster, lower memory, accurate AST remapping |
| @testing-library/svelte | Vitest browser mode | 2024 | Real browser testing, Svelte 5 runes support |
| Manual GitHub Pages | Actions workflow | ~2020 | Zero-config deployment, auto base path |
| Wildcard CORS | Environment-based allowlist | Always | Security: prevents CSRF, unauthorized access |
| Monorepo: run all tests | Path-based filtering | ~2022 | 80%+ CI time savings, faster feedback |

**Deprecated/outdated:**
- **Jest for Vite projects:** Vitest is faster and has native Vite integration. Jest requires complex config for ESM.
- **adapter-auto for static sites:** Use `adapter-static` explicitly for better control and clarity.
- **Hardcoded CORS origins:** Use environment variables for deployment flexibility.
- **FTP/rsync deployment:** GitHub Actions + Pages is free, automatic, and more reliable.

## Open Questions

Things that couldn't be fully resolved:

1. **Should we use a custom domain for GitHub Pages?**
   - What we know: GitHub Pages supports custom domains (CNAME), free SSL with Let's Encrypt
   - What's unclear: Does the project need a custom domain (e.g., app.perspectize.com) or is `codewarrior-debug.github.io/perspectize` sufficient?
   - Recommendation: Start with default subdomain, add custom domain in v1.1+ if needed

2. **Should coverage be enforced for backend Go code?**
   - What we know: Backend has 78+ tests, no coverage reporting configured yet
   - What's unclear: Phase 5 requirements only mention frontend coverage (TEST-06)
   - Recommendation: Focus on frontend 80%+ for Phase 5, add backend coverage in future phase if desired

3. **Should we use Vitest browser mode instead of jsdom?**
   - What we know: Browser mode provides real browser testing, better for Svelte 5 runes
   - What's unclear: Current jsdom setup works, browser mode adds complexity (Playwright dependency)
   - Recommendation: Continue with jsdom for Phase 5, evaluate browser mode if tests become flaky

4. **How to handle VITE_GRAPHQL_URL in production?**
   - What we know: Frontend currently defaults to `http://localhost:8080/graphql` via `VITE_GRAPHQL_URL`
   - What's unclear: Should this be a build-time env var or runtime config?
   - Recommendation: Use build-time env var in GitHub Actions, set to Sevalla backend URL

## Sources

### Primary (HIGH confidence)
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage) - Coverage providers, thresholds, reporting
- [SvelteKit Static Adapter Docs](https://svelte.dev/docs/kit/adapter-static) - SSG configuration, base path
- [GitHub Pages Deployment Guide](https://www.captaincodeman.com/deploy-a-sveltekit-app-to-github-pages) - Complete workflow example
- [dorny/paths-filter Action](https://github.com/dorny/paths-filter) - Monorepo change detection
- [rs/cors Library](https://github.com/rs/cors) - Production CORS configuration

### Secondary (MEDIUM confidence)
- [Monorepo Path Filters Guide](https://oneuptime.com/blog/post/2025-12-20-monorepo-path-filters-github-actions/view) - Practical monorepo patterns
- [GitHub Actions Monorepo Guide 2026](https://dev.to/pockit_tools/github-actions-in-2026-the-complete-guide-to-monorepo-cicd-and-self-hosted-runners-1jop) - Best practices, caching
- [Go CORS Production Guide](https://www.stackhawk.com/blog/golang-cors-guide-what-it-is-and-how-to-enable-it/) - Security considerations
- [Free Hosting Comparison 2026](https://github.com/iSoumyaDey/Awesome-Web-Hosting-2026) - GitHub Pages vs alternatives

### Tertiary (LOW confidence)
- [Vitest Coverage with GitHub Actions](https://medium.com/@alvarado.david/vitest-code-coverage-with-github-actions-report-compare-and-block-prs-on-low-coverage-67fceaa79a47) - Community guide (paywalled)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest, GitHub Actions, GitHub Pages are industry standard for this use case
- Architecture: HIGH - Patterns verified from official docs and battle-tested repositories
- Pitfalls: HIGH - Based on common issues documented in official GitHub issues and community guides
- CORS configuration: HIGH - Based on rs/cors official docs and security best practices
- Coverage strategies: MEDIUM - HTML report approach is standard but specific gap-filling strategies vary by project

**Research date:** 2026-02-07
**Valid until:** ~30 days (stable ecosystem, minor version updates expected)

**Key findings:**
1. **Current coverage gap:** 36-40% vs 80% target. UserSelector (0%), ActivityTable (32.5%), userSelection store (40%) are primary gaps.
2. **GitHub Pages is optimal:** Truly free (no bandwidth limits), native GitHub integration, zero config for static sites.
3. **Path filters are essential:** Monorepo deployments waste CI minutes without change detection. `dorny/paths-filter@v3` is standard.
4. **CORS must be environment-based:** Wildcard (`*`) is development-only. Production requires `AllowOriginFunc` with env var validation.
5. **Base path required for subpath deploys:** GitHub Pages serves from `/repo-name/`, SvelteKit must configure `paths.base` to match.

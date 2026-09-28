# Pitfalls Research: SvelteKit + TanStack + AG Grid Stack

**Project:** Perspectize Frontend
**Stack:** SvelteKit (static), TanStack Query, TanStack Form, AG Grid, shadcn-svelte, Tailwind
**Researched:** 2026-02-04
**Overall Confidence:** MEDIUM (verified with official docs and community sources)

---

## SvelteKit Static Adapter (SSG)

### Critical: SSR Must Be Enabled for Prerendering

**What goes wrong:** Developers assume SSG means disable SSR, but SvelteKit requires `ssr: true` for `prerender: true` to actually generate HTML content. Disabling SSR results in empty HTML shells.

**Why it happens:** Other frameworks (Next.js, Gatsby) treat SSG and SSR as mutually exclusive. SvelteKit's mental model is different - SSR runs at build time for prerendered pages.

**Warning signs:**
- Prerendered pages have no content in HTML source
- SEO crawlers see empty pages
- Flash of unstyled/empty content on load

**Prevention:**
```javascript
// +layout.js - CORRECT for SSG
export const prerender = true;
export const ssr = true; // This is the default, but be explicit

// DON'T do this for content pages
export const ssr = false; // This breaks prerendering
```

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via SvelteKit docs and GitHub issue #14471](https://github.com/sveltejs/kit/issues/14471)

---

### Critical: GitHub Pages Base Path Configuration

**What goes wrong:** Assets (JS, CSS) return 404 errors after deployment because paths don't include the repository name.

**Why it happens:** GitHub Project Pages serve from `username.github.io/repo-name/`, not from root. All asset paths must be prefixed.

**Warning signs:**
- Site works locally but not on GitHub Pages
- JavaScript chunks show 404 in network tab
- CSS doesn't load, page is unstyled

**Prevention:**
```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

const dev = process.argv.includes('dev');

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html', // SPA fallback
      precompress: false,
      strict: true
    }),
    paths: {
      base: dev ? '' : '/fe', // Match your repo name
      relative: false
    }
  }
};
```

Also create `static/.nojekyll` to prevent GitHub from processing files.

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via SvelteKit GitHub discussions](https://github.com/orgs/community/discussions/52062)

---

### Moderate: Trailing Slash Mismatch

**What goes wrong:** Routes work during development but 404 in production because GitHub Pages expects different URL formats.

**Why it happens:** GitHub Pages serves `/page/` as `/page/index.html`, but SvelteKit might generate `/page.html`.

**Prevention:**
```javascript
// +layout.js
export const trailingSlash = 'always';
```

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via SvelteKit official docs](https://svelte.dev/docs/kit/adapter-static)

---

### Moderate: Fallback Page Conflicts

**What goes wrong:** Using `index.html` as fallback conflicts with prerendered homepage, causing routing issues.

**Prevention:**
```javascript
// svelte.config.js
adapter({
  fallback: '404.html', // Not 'index.html'
})
```

GitHub Pages will serve 404.html for unknown routes, enabling SPA routing.

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via SvelteKit adapter-static docs](https://svelte.dev/docs/kit/adapter-static)

---

## TanStack Query + GraphQL

### Critical: Svelte 5 Requires v6 with Runes Syntax

**What goes wrong:** Using TanStack Query v5 with Svelte 5 causes buggy behavior because legacy store compatibility is unreliable.

**Why it happens:** Svelte 5's store compatibility layer has issues with TanStack Query v5. The v6 adapter uses native runes.

**Warning signs:**
- Queries don't update reactively
- Type errors with store syntax
- Console warnings about reactivity

**Prevention:**
```bash
# Install v6 explicitly
npm install @tanstack/svelte-query@^6
```

```svelte
<script>
  import { createQuery } from '@tanstack/svelte-query';

  // v6 syntax - options as thunk for reactivity
  const query = createQuery(() => ({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  }));

  // Access directly, no $ prefix needed
  {#if query.isLoading}
    Loading...
  {/if}
</script>
```

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via TanStack migration guide](https://tanstack.com/query/latest/docs/framework/svelte/migrate-from-v5-to-v6)

---

### Critical: Options Must Be a Thunk (Arrow Function)

**What goes wrong:** TypeScript errors and non-reactive queries when passing plain objects.

**Why it happens:** v6 requires options as `() => options` for Svelte 5 reactivity.

**Prevention:**
```svelte
<script>
  // WRONG - v5 syntax, breaks in v6
  const query = createQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });

  // CORRECT - v6 syntax
  const query = createQuery(() => ({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  }));
</script>
```

**Phase to address:** Phase 2 (API Integration)

**Confidence:** HIGH - [Verified via TanStack docs](https://tanstack.com/query/latest/docs/framework/svelte/migrate-from-v5-to-v6)

---

### Moderate: SSG Build-Time vs Runtime Fetching

**What goes wrong:** Queries execute during build, caching stale data in static HTML. Users see outdated content.

**Why it happens:** With `prerender: true`, load functions run at build time, not when users visit.

**Warning signs:**
- Data is frozen at build time
- Updates to backend don't appear on frontend
- No loading states (data is pre-baked)

**Prevention for dynamic content:**
```svelte
<script>
  import { browser } from '$app/environment';
  import { createQuery } from '@tanstack/svelte-query';

  // Only fetch in browser, not during prerender
  const perspectives = createQuery(() => ({
    queryKey: ['perspectives'],
    queryFn: fetchPerspectives,
    enabled: browser, // Disable during SSG build
  }));
</script>
```

For truly dynamic data (user perspectives), use client-side fetching only. Static adapter is for the shell, not user data.

**Phase to address:** Phase 2 (API Integration)

**Confidence:** HIGH - [Verified via SvelteKit rendering docs](https://www.thisdot.co/blog/a-deep-dive-into-sveltekits-rendering-techniques)

---

### Moderate: GraphQL Lacks Normalized Caching

**What goes wrong:** Related entities become stale because TanStack Query doesn't normalize GraphQL responses like Apollo Client.

**Why it happens:** TanStack Query caches by query key, not by entity ID. Updating one entity doesn't update it elsewhere.

**Prevention:**
- Use fine-grained query keys: `['perspective', id]` not just `['perspectives']`
- Invalidate related queries after mutations
- Consider this tradeoff vs. simpler mental model

```typescript
// After mutation, invalidate related queries
const mutation = createMutation(() => ({
  mutationFn: updatePerspective,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['perspectives'] });
    queryClient.invalidateQueries({ queryKey: ['content'] });
  },
}));
```

**Phase to address:** Phase 2 (API Integration)

**Confidence:** MEDIUM - [Noted in TanStack Query overview](https://tanstack.com/query/v4/docs/framework/svelte/overview)

---

## TanStack Form + Svelte 5

### Critical: Svelte Adapter May Have Limited Runes Support

**What goes wrong:** TanStack Form's Svelte adapter may not fully support Svelte 5 runes, causing reactivity issues.

**Why it happens:** TanStack libraries are migrating to Svelte 5 support at different rates. Form may lag behind Query.

**Warning signs:**
- Form state doesn't update reactively
- Type mismatches between form values and $state
- Component mode warnings

**Prevention:**
1. Check current adapter version supports Svelte 5 before adopting
2. Test form reactivity early in development
3. Have fallback plan (native Svelte forms with validation library like Zod)

```svelte
<script>
  // If TanStack Form has issues, fallback approach:
  import { z } from 'zod';

  const schema = z.object({
    claim: z.string().min(1),
    quality: z.number().min(0).max(100).optional(),
  });

  let formData = $state({ claim: '', quality: undefined });
  let errors = $state({});

  function validate() {
    const result = schema.safeParse(formData);
    errors = result.success ? {} : result.error.flatten().fieldErrors;
    return result.success;
  }
</script>
```

**Phase to address:** Phase 2 (Form Implementation) - verify compatibility first

**Confidence:** LOW - Unable to verify current Svelte 5 runes support status. [Related TanStack Form Svelte docs](https://tanstack.com/form/v1/docs/framework/svelte)

---

## AG Grid + Svelte 5

### Critical: No Official AG Grid Svelte Adapter

**What goes wrong:** You depend on community-maintained wrappers that may break with AG Grid updates.

**Why it happens:** AG Grid officially supports React, Angular, Vue - not Svelte. Community fills the gap.

**Warning signs:**
- Wrapper library not updated for months
- AG Grid update breaks Svelte integration
- Missing features compared to React version

**Prevention:**
- Use actively maintained wrapper: [ag-grid-svelte5-extended](https://github.com/bn-l/ag-grid-svelte5-extended)
- Pin AG Grid version to tested version
- Have fallback plan (TanStack Table for simpler cases)

```bash
# Install community wrapper
npm install ag-grid-svelte5-extended ag-grid-community
```

**Phase to address:** Phase 3 (Data Tables)

**Confidence:** HIGH - [Verified via AG Grid community tools page](https://www.ag-grid.com/community/tools-extensions/)

---

### Moderate: Custom Cell Renderers Require Special Handling

**What goes wrong:** Svelte components as cell renderers don't work out of the box.

**Why it happens:** AG Grid uses its own component lifecycle, not Svelte's. Wrappers bridge this gap.

**Prevention:**
Use wrapper's cell renderer pattern:

```svelte
<script>
  import { AgGridSvelte } from 'ag-grid-svelte5-extended';
  import ActionCell from './ActionCell.svelte';

  const columnDefs = [
    { field: 'claim' },
    {
      headerName: 'Actions',
      cellRenderer: AgGridSvelteRendererComp,
      cellRendererParams: {
        component: ActionCell,
        componentProps: { onEdit: handleEdit }
      }
    }
  ];
</script>
```

**Phase to address:** Phase 3 (Data Tables)

**Confidence:** HIGH - [Verified via ag-grid-svelte5-extended docs](https://github.com/bn-l/ag-grid-svelte5-extended)

---

### Minor: Slow Custom Renderers Block Main Thread

**What goes wrong:** Complex cell renderers cause grid to appear unresponsive.

**Prevention:**
- Keep cell renderers simple
- Use AG Grid's `deferRender` option for complex components
- Virtualize aggressively

**Phase to address:** Phase 3 (Data Tables) - optimization pass

**Confidence:** MEDIUM - General AG Grid performance guidance

---

## shadcn-svelte Theming

### Critical: Tailwind v4 Dark Mode Requires Custom Variant

**What goes wrong:** Dark mode toggle doesn't work after upgrading to Tailwind v4.

**Why it happens:** Tailwind v4 changed how dark mode class detection works.

**Warning signs:**
- `dark:` classes have no effect
- Theme toggle updates state but UI doesn't change

**Prevention:**
```css
/* app.css - Required for Tailwind v4 */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via shadcn-svelte GitHub issue #2044](https://github.com/huntabyte/shadcn-svelte/issues/2044)

---

### Moderate: Theme Generator Doesn't Accept Custom Colors

**What goes wrong:** Can't use Figma design tokens directly in shadcn-svelte theme generator.

**Why it happens:** The generator provides presets but doesn't let you input arbitrary hex values.

**Prevention:**
Manually create CSS variables matching your design tokens:

```css
/* app.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: /* Your Figma primary color in HSL */;
    --primary-foreground: /* Calculated contrast color */;
    /* ... other tokens */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode overrides */
  }
}
```

Use a tool to convert Figma hex colors to HSL format.

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via shadcn-svelte theming docs](https://www.shadcn-svelte.com/docs/theming)

---

### Moderate: Component Updates Override Custom Themes

**What goes wrong:** Re-running `npx shadcn-svelte add` or updates overwrite your theme customizations.

**Why it happens:** shadcn copies component source into your project. Updates replace files.

**Prevention:**
- Keep theme CSS separate from component files
- Document which components have custom modifications
- Consider theming via CSS variables only, not component modifications

**Phase to address:** Ongoing maintenance consideration

**Confidence:** MEDIUM - [Noted in shadcn-svelte community discussions](https://medium.com/@sureshdotariya/customizing-shadcn-ui-themes-without-breaking-updates-a3140726ca1e)

---

## Mobile Data Tables (AG Grid)

### Critical: AG Grid Is Not Mobile-First

**What goes wrong:** Data grids on mobile require excessive scrolling and look cramped.

**Why it happens:** AG Grid is designed for desktop data-dense applications. Mobile is an afterthought.

**Warning signs:**
- Horizontal scroll on mobile
- Columns too narrow to read
- Touch interactions feel clunky

**Prevention strategies:**

1. **Responsive column hiding:**
```javascript
const columnDefs = [
  { field: 'claim', pinned: 'left' }, // Always visible
  { field: 'quality', hide: isMobile },
  { field: 'agreement', hide: isMobile },
  { field: 'createdAt', hide: true }, // Desktop only
];
```

2. **Mobile-specific view:**
```svelte
<script>
  import { browser } from '$app/environment';
  let isMobile = $state(false);

  $effect(() => {
    if (browser) {
      const mq = window.matchMedia('(max-width: 768px)');
      isMobile = mq.matches;
      mq.addEventListener('change', (e) => isMobile = e.matches);
    }
  });
</script>

{#if isMobile}
  <MobileCardList data={perspectives} />
{:else}
  <AgGridSvelte {columnDefs} {rowData} />
{/if}
```

3. **Consider TanStack Table for simpler grids** - more control over mobile layout

**Phase to address:** Phase 3 (Data Tables) - design mobile view first

**Confidence:** HIGH - [Verified via AG Grid GitHub issues #220, #8913](https://github.com/ag-grid/ag-grid/issues/220)

---

### Moderate: Nested Divs Limit Responsive Capabilities

**What goes wrong:** AG Grid uses nested divs, not semantic tables, limiting CSS-based responsive transformations.

**Prevention:**
- Accept AG Grid's limitations for complex grids
- Use alternative component (card list, stacked layout) for mobile
- Don't fight the grid - work with its strengths on desktop

**Phase to address:** Phase 3 (Data Tables)

**Confidence:** MEDIUM - Architectural observation

---

## External GraphQL API (CORS, Auth, Static Hosting)

### Critical: Static Sites Can't Hide API Credentials

**What goes wrong:** API keys or secrets are exposed in client-side JavaScript.

**Why it happens:** Static sites have no server-side rendering at runtime. Everything is client-side.

**Warning signs:**
- Secrets in `$env/static/public` (visible in source)
- API calls include sensitive headers visible in DevTools

**Prevention:**
- **Never put secrets in frontend** - Go backend should handle auth
- Use public API endpoints only
- If auth needed, use OAuth flow where tokens are user-specific

```javascript
// svelte.config.js - ONLY public, non-secret values
// This is fine:
PUBLIC_GRAPHQL_URL=https://api.perspectize.app/graphql

// NEVER do this (visible to users):
PUBLIC_API_SECRET=secret123
```

**Phase to address:** Phase 2 (API Integration)

**Confidence:** HIGH - [Verified via SvelteKit env docs](https://svelte.dev/docs/kit/$env-static-private)

---

### Critical: CORS Must Be Configured on Go Backend

**What goes wrong:** Browser blocks GraphQL requests with CORS errors.

**Why it happens:** Frontend (GitHub Pages) and backend (Sevalla) are different origins. Browser enforces same-origin policy.

**Warning signs:**
- "Access-Control-Allow-Origin" errors in console
- Requests work in Postman but fail in browser
- Preflight OPTIONS requests fail

**Prevention on Go backend:**
```go
// main.go - Configure CORS for gqlgen
import "github.com/rs/cors"

func main() {
    c := cors.New(cors.Options{
        AllowedOrigins:   []string{"https://yourusername.github.io"},
        AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
        AllowedHeaders:   []string{"Content-Type", "Authorization"},
        AllowCredentials: true,
    })

    handler := c.Handler(srv)
    http.ListenAndServe(":8080", handler)
}
```

**Phase to address:** Phase 2 (API Integration) - backend task

**Confidence:** HIGH - [Verified via Apollo CORS docs](https://www.apollographql.com/docs/apollo-server/security/cors)

---

### Moderate: Credentials Require Specific CORS Headers

**What goes wrong:** Auth tokens/cookies not sent because of CORS credentials policy.

**Why it happens:** Browsers don't send credentials unless both client and server opt in.

**Prevention:**

Backend:
```go
cors.Options{
    AllowCredentials: true,
    // AllowedOrigins can't be "*" with credentials
    AllowedOrigins: []string{"https://yourusername.github.io"},
}
```

Frontend:
```typescript
// GraphQL client configuration
const client = new GraphQLClient(PUBLIC_GRAPHQL_URL, {
  credentials: 'include', // Send cookies
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

**Phase to address:** Phase 2 (API Integration)

**Confidence:** HIGH - [Verified via Apollo authentication docs](https://www.apollographql.com/docs/react/networking/authentication)

---

### Moderate: Environment Variables for API URL

**What goes wrong:** Hardcoded API URLs break when deploying to different environments.

**Prevention:**
```javascript
// Use $env/static/public for build-time values
// .env
PUBLIC_GRAPHQL_URL=https://api.perspectize.app/graphql

// lib/graphql.ts
import { PUBLIC_GRAPHQL_URL } from '$env/static/public';

export const client = new GraphQLClient(PUBLIC_GRAPHQL_URL);
```

Note: Static builds bake in the value at build time. Can't change without rebuild.

**Phase to address:** Phase 1 (Project Setup)

**Confidence:** HIGH - [Verified via SvelteKit env docs](https://svelte.dev/docs/kit/page-options)

---

## Summary: Critical Watch Items

### Top 5 Things That Will Break Your Project

| Priority | Pitfall | Phase | Prevention |
|----------|---------|-------|------------|
| 1 | **SSR must be enabled for prerendering** | Phase 1 | Keep `ssr: true` (default), only set `prerender: true` |
| 2 | **GitHub Pages base path** | Phase 1 | Configure `paths.base` to repo name |
| 3 | **TanStack Query v6 thunk syntax** | Phase 2 | Use `createQuery(() => ({...}))` not `createQuery({...})` |
| 4 | **CORS on Go backend** | Phase 2 | Configure CORS with specific GitHub Pages origin |
| 5 | **AG Grid mobile UX** | Phase 3 | Design mobile-first, use card layout for mobile |

### Phase-Specific Research Flags

| Phase | Needs Deeper Research? | Reason |
|-------|----------------------|--------|
| Phase 1: Setup | LOW | Patterns well-documented |
| Phase 2: API | MEDIUM | TanStack Form Svelte 5 status unclear |
| Phase 3: Tables | HIGH | AG Grid Svelte 5 wrappers are community-maintained |
| Phase 4: Theming | LOW | shadcn-svelte well-documented |

### Fallback Options

If blocked by any integration, have these alternatives ready:

| Primary | Fallback | When to Switch |
|---------|----------|----------------|
| TanStack Form | Native Svelte + Zod | If runes compatibility issues |
| AG Grid | TanStack Table | If wrapper breaks or mobile too hard |
| TanStack Query | Svelte 5 native fetch + $state | If v6 has issues |

---

## Sources

### Official Documentation (HIGH confidence)
- [SvelteKit adapter-static docs](https://svelte.dev/docs/kit/adapter-static)
- [SvelteKit environment variables](https://svelte.dev/docs/kit/$env-static-private)
- [TanStack Query Svelte v5 to v6 migration](https://tanstack.com/query/latest/docs/framework/svelte/migrate-from-v5-to-v6)
- [shadcn-svelte theming](https://www.shadcn-svelte.com/docs/theming)
- [Apollo CORS configuration](https://www.apollographql.com/docs/apollo-server/security/cors)

### GitHub Issues (HIGH confidence)
- [SvelteKit SSR required for prerendering](https://github.com/sveltejs/kit/issues/14471)
- [GitHub Pages CSS/JS 404](https://github.com/orgs/community/discussions/52062)
- [TanStack Query Svelte 5 support](https://github.com/TanStack/query/discussions/7413)
- [shadcn-svelte Tailwind v4 dark mode](https://github.com/huntabyte/shadcn-svelte/issues/2044)
- [AG Grid responsiveness](https://github.com/ag-grid/ag-grid/issues/220)

### Community Resources (MEDIUM confidence)
- [Missing guide to adapter-static](https://khromov.se/the-missing-guide-to-understanding-adapter-static-in-sveltekit/)
- [ag-grid-svelte5-extended](https://github.com/bn-l/ag-grid-svelte5-extended)
- [SvelteKit rendering deep dive](https://www.thisdot.co/blog/a-deep-dive-into-sveltekits-rendering-techniques)

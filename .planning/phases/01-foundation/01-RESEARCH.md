# Phase 1: Foundation - Research

**Researched:** 2026-02-05
**Domain:** SvelteKit frontend scaffolding with Svelte 5, shadcn-svelte design system, TanStack ecosystem, and AG Grid data tables
**Confidence:** HIGH (core stack), MEDIUM (AG Grid Svelte 5 compatibility)

## Summary

Phase 1 establishes a SvelteKit frontend project using the latest Svelte 5 runes API, Tailwind CSS v4, and shadcn-svelte component library. The technical foundation integrates TanStack Query for GraphQL data fetching, TanStack Form for form management, and includes AG Grid validation to derisk the community Svelte wrapper early in development.

The standard approach in 2026 is to use SvelteKit's built-in tooling (sv CLI, Vite) with adapter-static for SSG deployment. shadcn-svelte has mature Tailwind v4 support with Svelte 5 compatibility. TanStack Query v5 provides SSR-aware caching with explicit server-side query disabling patterns. The primary risk area is AG Grid's community Svelte 5 wrapper (ag-grid-svelte5 v0.0.x), which shows active development but limited production validation.

Key architectural decisions align with modern Svelte 5 best practices: explicit reactivity via runes ($state, $derived, $effect), type-based folder structure (lib/components/, lib/queries/, lib/utils/), and mobile-first responsive design using Tailwind's default breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px).

**Primary recommendation:** Follow official SvelteKit/shadcn-svelte installation paths, use TanStack Query's SSR patterns with browser-aware QueryClient, and implement AG Grid validation checkpoint before committing to the wrapper (fallback to TanStack Table if features fail).

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit | 2.0+ | Full-stack framework | Official Svelte framework, first-class SSR/SSG support, built-in Vite integration |
| Svelte | 5.0+ | Reactive UI framework | Runes API (explicit reactivity), compiler optimization, minimal runtime overhead |
| @sveltejs/adapter-static | 3.0+ | Static site generation | Official adapter for prerendering, zero-config for most platforms |
| Tailwind CSS | 4.0+ | Utility-first CSS | CSS-native configuration (@theme), Vite plugin, industry standard |
| shadcn-svelte | @latest | Component library | Unstyled primitives (bits-ui), full Tailwind v4 support, Svelte 5 runes compatible |
| TanStack Query | v5 | Data fetching/caching | Framework-agnostic, SSR-aware, GraphQL compatible, battle-tested |
| TanStack Form | v1 | Form state management | Type-safe, validation agnostic, Svelte 5 runes support |
| Vitest | latest | Testing framework | SvelteKit default, Vite-native, fast, supports Svelte component testing |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| svelte-sonner | latest | Toast notifications | Accessible, customizable position/duration, shadcn-svelte integrated |
| graphql-request | 6.x+ | GraphQL client | Lightweight client for TanStack Query, simpler than Apollo/URQL for basic needs |
| @testing-library/svelte | latest | Component testing | DOM testing utilities, accessibility-focused, Vitest integration |
| jsdom | latest | DOM environment for tests | Required for Vitest component tests, simulates browser APIs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ag-grid-svelte5 | TanStack Table | AG Grid: More features, mature, complex styling; TanStack Table: Headless, full control, manual feature implementation |
| graphql-request | URQL / Apollo Client | graphql-request: Lightweight, simple; URQL/Apollo: Built-in caching (but TanStack Query handles this), normalized cache, more complex |
| svelte-sonner | Custom toast | svelte-sonner: Proven, accessible; Custom: Full control, more maintenance burden |

**Installation:**
```bash
# Create SvelteKit project with Svelte 5 and TypeScript
npx sv create fe --template minimal --types typescript --no-add-ons

cd fe

# Add Tailwind CSS v4
npx sv add tailwindcss

# Add shadcn-svelte
npx shadcn-svelte@latest init

# Add TanStack ecosystem
npm install @tanstack/svelte-query @tanstack/svelte-form graphql-request graphql

# Add AG Grid (community Svelte 5 wrapper)
npm install ag-grid-svelte5 ag-grid-community

# Add toast notifications
npm install svelte-sonner

# Add testing dependencies
npm install -D @testing-library/svelte jsdom vitest-svelte
```

## Architecture Patterns

### Recommended Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── components/        # All reusable UI components (flat structure)
│   │   │   ├── Button.svelte
│   │   │   ├── DataTable.svelte
│   │   │   ├── Header.svelte
│   │   │   ├── Toast.svelte
│   │   │   └── UserSelector.svelte
│   │   ├── queries/           # GraphQL queries and mutations (centralized)
│   │   │   ├── content.ts     # Content-related queries
│   │   │   ├── perspective.ts # Perspective queries/mutations
│   │   │   └── client.ts      # GraphQL client configuration
│   │   ├── utils/             # Utility functions and helpers
│   │   │   ├── cn.ts          # Class name utility (shadcn standard)
│   │   │   ├── formatters.ts  # Date, number formatters
│   │   │   └── validators.ts  # Validation helpers
│   │   └── server/            # Server-only code (uses $lib/server alias)
│   ├── routes/
│   │   ├── +layout.svelte     # Root layout (prerender = true for SSG)
│   │   ├── +page.svelte       # Home/Activity page
│   │   └── add-video/
│   │       └── +page.svelte   # Add video page
│   └── app.css                # Global styles, Tailwind imports, custom CSS variables
├── static/                    # Static assets (fonts, images)
│   └── fonts/
├── tests/                     # Test files (mirrors src structure)
│   ├── unit/
│   └── fixtures/
├── svelte.config.js           # SvelteKit config (adapter-static)
├── vite.config.ts             # Vite config (Vitest setup)
└── tailwind.config.ts         # Tailwind config (or use @theme in app.css)
```

**Key structure principles:**
- **Type-based organization**: Group by file type (components, queries, utils) rather than feature
- **Flat component hierarchy**: All components in `lib/components/` at top level (no nested folders)
- **PascalCase components**: `Button.svelte`, `DataTable.svelte` (distinguishes from pages)
- **Centralized queries**: All GraphQL in `lib/queries/` for easy discovery and reuse
- **lib/server isolation**: SvelteKit prevents client imports via $lib/server alias

### Pattern 1: Mobile-First Responsive Layout

**What:** Tailwind's mobile-first breakpoint system where base styles target mobile (375px+), then progressively enhance for larger screens using sm/md/lg/xl/2xl prefixes.

**When to use:** All layouts and components requiring responsive behavior.

**Example:**
```svelte
<!-- Mobile: single column, tablet: 2-column, desktop: 3-column -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card>Content 1</Card>
  <Card>Content 2</Card>
  <Card>Content 3</Card>
</div>

<!-- Mobile: full width, desktop: constrained with padding -->
<div class="w-full px-4 md:px-8 lg:max-w-screen-xl lg:mx-auto">
  <Header />
</div>

<!-- Hide on mobile, show on desktop -->
<aside class="hidden lg:block">
  Sidebar content
</aside>
```

**Tailwind Breakpoints:**
- Base (no prefix): 0px - 639px (mobile)
- `sm:`: 640px+ (large phone, small tablet)
- `md:`: 768px+ (tablet)
- `lg:`: 1024px+ (desktop)
- `xl:`: 1280px+ (large desktop)
- `2xl:`: 1536px+ (extra large screens)

**iPhone SE minimum:** 375px width is below `sm:` breakpoint, so base styles apply.

### Pattern 2: shadcn-svelte Theme Customization

**What:** Override shadcn's CSS variables to apply custom brand colors (navy primary) while maintaining component consistency.

**When to use:** During initial setup to establish brand identity across all shadcn components.

**Example:**
```css
/* src/app.css */
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  /* Custom color palette */
  --color-navy: oklch(0.216 0.006 56.043);
  --color-navy-foreground: oklch(0.985 0.001 106.423);

  /* Override default sans font */
  --default-font-family: 'Inter', var(--font-sans);
}

@layer base {
  :root {
    /* Light mode */
    --primary: var(--color-navy);
    --primary-foreground: var(--color-navy-foreground);
    --secondary: oklch(0.955 0 0);
    --secondary-foreground: oklch(0.216 0.006 56.043);
    --background: oklch(1 0 0);
    --foreground: oklch(0.216 0.006 56.043);
    /* ... other shadcn variables */
  }

  .dark {
    /* Dark mode - prepared but not implemented in Phase 1 */
    --primary: var(--color-navy);
    --primary-foreground: var(--color-navy-foreground);
    /* ... dark mode variables */
  }
}
```

**OKLCH color format:** shadcn-svelte uses OKLCH (Lightness, Chroma, Hue) instead of HSL for perceptual uniformity. Convert hex colors using online tools or CSS color tools.

### Pattern 3: TanStack Query SSR Setup

**What:** Configure QueryClient to disable queries on server (SvelteKit SSR) while allowing prefetch, preventing background query execution after HTML is sent.

**When to use:** Root layout setup for TanStack Query.

**Example:**
```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

  // Disable queries on server using browser flag
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser, // Only run queries in browser
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
      },
    },
  });

  export const prerender = true; // Enable SSG for adapter-static
</script>

<QueryClientProvider client={queryClient}>
  <slot />
</QueryClientProvider>
```

```typescript
// src/routes/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  // Server-side data fetching using SvelteKit's load function
  // TanStack Query will hydrate this on client
  const data = await fetch('/api/content').then(r => r.json());

  return {
    content: data,
  };
};
```

### Pattern 4: GraphQL Client with TanStack Query

**What:** Lightweight graphql-request client wrapped by TanStack Query for caching, providing best of both worlds (simple GraphQL + powerful caching).

**When to use:** All GraphQL operations requiring caching and reactive updates.

**Example:**
```typescript
// src/lib/queries/client.ts
import { GraphQLClient } from 'graphql-request';

export const graphqlClient = new GraphQLClient('http://localhost:8080/graphql', {
  headers: {
    // Add auth headers when implemented
  },
});
```

```typescript
// src/lib/queries/content.ts
import { gql } from 'graphql-request';

export const GET_CONTENT = gql`
  query GetContent($id: IntID!) {
    content(id: $id) {
      id
      title
      url
      contentType
    }
  }
`;

export const LIST_CONTENT = gql`
  query ListContent($first: Int, $after: String) {
    content(first: $first, after: $after) {
      edges {
        node {
          id
          title
          url
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
```

```svelte
<!-- Usage in component -->
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { graphqlClient } from '$lib/queries/client';
  import { GET_CONTENT } from '$lib/queries/content';

  let contentId = $state(1);

  const query = createQuery({
    queryKey: ['content', contentId],
    queryFn: () => graphqlClient.request(GET_CONTENT, { id: contentId }),
  });
</script>

{#if $query.isPending}
  <p>Loading...</p>
{:else if $query.isError}
  <p>Error: {$query.error.message}</p>
{:else}
  <div>
    <h1>{$query.data.content.title}</h1>
    <a href={$query.data.content.url}>{$query.data.content.url}</a>
  </div>
{/if}
```

### Pattern 5: AG Grid Svelte 5 Integration

**What:** Use ag-grid-svelte5 wrapper with reactive $state runes for row data and grid options.

**When to use:** Data table components requiring advanced features (sorting, filtering, pagination, column resize).

**Example:**
```svelte
<!-- src/lib/components/DataTable.svelte -->
<script lang="ts">
  import AgGridSvelte from 'ag-grid-svelte5';
  import 'ag-grid-community/styles/ag-grid.css';
  import 'ag-grid-community/styles/ag-theme-quartz.css'; // Or custom theme

  let { data = [], columns = [] } = $props();

  // Reactive grid options using $state
  let gridOptions = $state({
    columnDefs: columns,
    rowData: data,
    pagination: true,
    paginationPageSize: 10,
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
    },
    // CRITICAL: Always provide getRowId for reactivity
    getRowId: (params) => params.data.id,
  });

  // Update row data when prop changes
  $effect(() => {
    gridOptions.rowData = data;
  });
</script>

<div class="ag-theme-quartz" style="height: 500px; width: 100%;">
  <AgGridSvelte initialOptions={gridOptions} />
</div>
```

**Styling to match shadcn:**
```css
/* Custom AG Grid theme variables */
.ag-theme-quartz {
  --ag-foreground-color: var(--foreground);
  --ag-background-color: var(--background);
  --ag-header-background-color: var(--secondary);
  --ag-odd-row-background-color: var(--secondary);
  --ag-border-color: var(--border);
  --ag-font-family: 'Inter', sans-serif;
  --ag-font-size: 14px;
}
```

### Pattern 6: svelte-sonner Toast Configuration

**What:** Global toast provider with custom position (top-right) and duration (2s).

**When to use:** Root layout to enable toasts throughout the app.

**Example:**
```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { Toaster } from 'svelte-sonner';
</script>

<Toaster position="top-right" duration={2000} />

<slot />
```

```typescript
// Usage anywhere in the app
import { toast } from 'svelte-sonner';

toast.success('Video added successfully!');
toast.error('Failed to fetch content');
toast.info('Processing video...');
```

### Anti-Patterns to Avoid

- **Using .js files for reactive code**: Runes ($state, $derived) only work in .svelte.js files, not regular .js files
- **Implicit reactivity assumptions**: In Svelte 5, variables are NOT reactive by default - must use $state rune
- **Nested component folders**: Avoid deep component hierarchies (lib/components/forms/inputs/Button.svelte) - keep flat
- **Feature-based folders**: Avoid organizing by feature (lib/perspectives/, lib/content/) - use type-based structure
- **SSR queries without browser check**: TanStack Query will continue executing on server after HTML is sent if not disabled
- **AG Grid without getRowId**: Reactive updates may not work correctly without unique row identification
- **shadcn component overrides without checking bits-ui version**: Installing shadcn components can auto-upgrade bits-ui to incompatible versions
- **Manual enum mapping in GraphQL**: Always use gqlgen model binding (as per CLAUDE.md) instead of switch statements

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic per form | TanStack Form with Zod/Yup | Standard Schema spec, type-safe, async validation, field-level validation, form-level validation |
| Toast notifications | Custom toast component | svelte-sonner | Accessibility (ARIA, focus management), position management, stacking, animation timing, promise toasts |
| Data tables | Custom table with sorting/filtering | AG Grid or TanStack Table | Column resize, virtualization, cell editing, complex filters, Excel export, accessibility |
| GraphQL caching | Manual cache management | TanStack Query | Background refetching, stale-while-revalidate, optimistic updates, request deduplication, SSR hydration |
| Responsive breakpoints | Custom media query hooks | Tailwind breakpoint system | Consistent across team, design tokens, mobile-first by default, purged unused CSS |
| CSS utilities | Custom utility classes | Tailwind CSS | Industry standard, JIT compilation, IntelliSense, plugins, design constraints |
| Component primitives | Custom dropdown/dialog/popover | shadcn-svelte (bits-ui) | Accessibility (keyboard nav, focus trap, ARIA), positioning (floating-ui), animations |

**Key insight:** Frontend infrastructure has matured significantly. Custom solutions for these problems lead to accessibility issues, browser inconsistencies, maintenance burden, and missing edge cases. Use battle-tested libraries and focus on business logic.

## Common Pitfalls

### Pitfall 1: AG Grid Svelte 5 Wrapper Immaturity

**What goes wrong:** ag-grid-svelte5 is early-stage (v0.0.x) with limited production usage. Features may not work, styling may be broken, or wrapper may have Svelte 5 reactivity bugs.

**Why it happens:** AG Grid doesn't officially support Svelte, so community wrappers lag behind framework updates. Svelte 5 runes API is new (released late 2024), wrapper maintainers are volunteers.

**How to avoid:**
1. Implement feature validation checkpoint in Phase 1 (sorting, filtering, pagination, column resize, row selection)
2. Test custom styling matches shadcn design before committing
3. Have fallback plan ready: TanStack Table (headless, more control but more work) or vanilla AG Grid JS wrapper
4. Document what works/fails in validation task

**Warning signs:**
- Features don't work despite correct configuration
- Reactivity breaks when updating row data
- Styles don't apply or conflict with Tailwind
- Console errors related to Svelte component lifecycle

### Pitfall 2: SSR Query Execution After HTML Sent

**What goes wrong:** TanStack Query continues executing queries on server after SvelteKit sends HTML to client, wasting server resources and potentially causing errors.

**Why it happens:** SvelteKit renders components on server (SSR), but queries are asynchronous. By default, TanStack Query doesn't know to stop executing when rendering completes.

**How to avoid:**
1. ALWAYS set `enabled: browser` in QueryClient defaultOptions
2. Use SvelteKit's load functions for initial data fetching
3. Use prefetchQuery in load functions instead of createQuery for SSR data
4. Never call createQuery at the root level without browser check

**Warning signs:**
- Server logs show query execution after page render
- Duplicate queries (one on server, one on client)
- Errors in server logs about queries running in wrong context

**Correct pattern:**
```typescript
// ✅ Correct: Queries disabled on server
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      enabled: browser, // Import from '$app/environment'
    },
  },
});

// ✅ Correct: Use load function for SSR data
export const load: PageLoad = async ({ fetch }) => {
  return {
    content: await fetch('/api/content').then(r => r.json()),
  };
};

// ❌ Wrong: Query runs on server indefinitely
const query = createQuery({
  queryKey: ['content'],
  queryFn: () => fetchContent(),
});
```

### Pitfall 3: Svelte 5 Runes in Regular .js Files

**What goes wrong:** Attempting to use $state, $derived, or $effect in .js files results in syntax errors or runtime failures.

**Why it happens:** Svelte's compiler only processes runes in .svelte and .svelte.js files. Regular .js/.ts files bypass Svelte's compiler.

**How to avoid:**
1. Use .svelte.js or .svelte.ts for reactive utilities that need runes
2. Keep .js/.ts files for non-reactive logic (formatters, validators, constants)
3. Pass reactive values as function parameters rather than creating reactivity in utils

**Warning signs:**
- Syntax errors with $ prefix in .js files
- Utility functions don't react to changes
- TypeScript complains about unknown identifiers

**Correct pattern:**
```typescript
// ❌ Wrong: utils/store.js
export let count = $state(0); // Syntax error!

// ✅ Correct: utils/store.svelte.js
export let count = $state(0);

// ✅ Correct: utils/formatters.ts (non-reactive)
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}
```

### Pitfall 4: shadcn Component Installation Breaking App

**What goes wrong:** Running `npx shadcn-svelte@latest add <component>` auto-upgrades bits-ui to a version incompatible with your Svelte version, breaking existing components.

**Why it happens:** shadcn CLI doesn't check current bits-ui version compatibility before upgrading. Different shadcn components may depend on different bits-ui versions.

**How to avoid:**
1. Install all needed shadcn components at once during initial setup
2. Pin bits-ui version in package.json after initial setup
3. Review package.json changes after each `shadcn-svelte add` command
4. Test app after adding each component before continuing

**Warning signs:**
- App breaks after adding a shadcn component
- Console errors about missing bits-ui exports
- Components that worked before suddenly fail

**Recovery:**
```bash
# Check bits-ui version before adding component
npm list bits-ui

# If app breaks, rollback package.json and package-lock.json
git checkout package.json package-lock.json
npm install
```

### Pitfall 5: Mobile-First Misunderstanding

**What goes wrong:** Using `sm:` prefix for mobile styles, assuming it means "small screens", but it actually means "640px and up", excluding iPhone SE (375px).

**Why it happens:** Tailwind's naming is counterintuitive - `sm:` sounds like "small" but is actually a min-width breakpoint.

**How to avoid:**
1. Base styles (no prefix) = mobile (0-639px)
2. `sm:` = large phone/small tablet (640px+)
3. Test on actual iPhone SE (375px) or Chrome DevTools device emulation
4. Use `max-sm:` for mobile-only styles if needed

**Warning signs:**
- Layout breaks on iPhone SE but works on larger phones
- Styles don't apply until screen is wider than expected

**Correct pattern:**
```svelte
<!-- ❌ Wrong: This applies 640px+, not mobile -->
<div class="sm:flex sm:flex-col">
  Mobile content
</div>

<!-- ✅ Correct: Base styles apply to mobile -->
<div class="flex flex-col md:flex-row">
  Mobile column, desktop row
</div>
```

### Pitfall 6: Forgetting adapter-static Prerender Config

**What goes wrong:** Project configured with adapter-static but pages don't prerender, resulting in empty build directory or runtime errors.

**Why it happens:** adapter-static requires explicit `export const prerender = true` in root layout. SvelteKit defaults to SSR mode, not SSG mode.

**How to avoid:**
1. ALWAYS add `export const prerender = true` to `src/routes/+layout.svelte` or `+layout.ts`
2. Verify build output includes HTML files in `build/` directory
3. Check svelte.config.js includes adapter-static

**Warning signs:**
- `npm run build` creates empty or minimal build directory
- Deployed site shows blank pages or 404 errors
- Console warning: "Could not prerender pages"

**Correct pattern:**
```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  export const prerender = true; // Required for adapter-static
</script>

<slot />
```

## Code Examples

Verified patterns from official sources:

### SvelteKit Project Initialization

```bash
# Source: https://svelte.dev/docs/kit/project-structure
npx sv create my-app --template minimal --types typescript
cd my-app

# Install adapter-static
# Source: https://svelte.dev/docs/kit/adapter-static
npm i -D @sveltejs/adapter-static
```

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      precompress: false,
      strict: true,
    }),
  },
};

export default config;
```

### shadcn-svelte with Tailwind v4 Setup

```bash
# Source: https://www.shadcn-svelte.com/docs/migration/tailwind-v4
# Initialize shadcn-svelte (interactive CLI)
npx shadcn-svelte@latest init

# Follow prompts:
# - TypeScript: Yes
# - Tailwind v4: Yes
# - Theme: Default (or custom)
```

```css
/* src/app.css */
/* Source: https://www.shadcn-svelte.com/docs/theming */
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  --default-font-family: 'Inter', var(--font-sans);
}

@layer base {
  :root {
    --primary: oklch(0.216 0.006 56.043); /* Navy #1a365d */
    --primary-foreground: oklch(0.985 0.001 106.423);
    --secondary: oklch(0.955 0 0);
    --secondary-foreground: oklch(0.216 0.006 56.043);
    --background: oklch(1 0 0);
    --foreground: oklch(0.216 0.006 56.043);
    --muted: oklch(0.955 0 0);
    --muted-foreground: oklch(0.478 0.006 56.043);
    --border: oklch(0.898 0 0);
    --input: oklch(0.898 0 0);
    --ring: oklch(0.216 0.006 56.043);
  }
}
```

### Inter Font Setup

```css
/* src/app.css */
/* Source: https://github.com/spences10/sveltekit-local-fonts */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

@theme {
  --default-font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
```

```html
<!-- src/app.html -->
<head>
  <!-- Preload font for performance -->
  <link rel="preload" href="/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin>
  <title>%sveltekit.head.title%</title>
</head>
```

### TanStack Query SSR Configuration

```svelte
<!-- src/routes/+layout.svelte -->
<!-- Source: https://tanstack.com/query/v5/docs/framework/svelte/ssr -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';

  export const prerender = true; // Enable SSG

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser, // Disable queries on server
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
      },
    },
  });
</script>

<QueryClientProvider client={queryClient}>
  <Toaster position="top-right" duration={2000} />
  <slot />
</QueryClientProvider>
```

### Vitest Configuration

```typescript
// vite.config.ts
// Source: https://vitest.dev/guide/
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        '.svelte-kit/',
      ],
    },
  },
});
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

### AG Grid Validation Checklist

```svelte
<!-- Test component for AG Grid feature validation -->
<script lang="ts">
  import AgGridSvelte from 'ag-grid-svelte5';
  import 'ag-grid-community/styles/ag-grid.css';
  import 'ag-grid-community/styles/ag-theme-quartz.css';

  // Test data
  let rowData = $state([
    { id: 1, title: 'Video 1', rating: 85, published: '2026-01-15' },
    { id: 2, title: 'Video 2', rating: 72, published: '2026-02-01' },
    { id: 3, title: 'Video 3', rating: 91, published: '2026-01-20' },
  ]);

  let gridOptions = $state({
    columnDefs: [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'title', headerName: 'Title', filter: 'agTextColumnFilter' },
      { field: 'rating', headerName: 'Rating', filter: 'agNumberColumnFilter' },
      { field: 'published', headerName: 'Published', filter: 'agDateColumnFilter' },
    ],
    rowData,
    pagination: true,
    paginationPageSize: 10,
    rowSelection: 'multiple',
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
    },
    getRowId: (params) => params.data.id,
  });

  // Validation checklist:
  // ✓ Sorting: Click column headers
  // ✓ Filtering: Click filter icons, enter filter values
  // ✓ Pagination: Check page controls appear and work
  // ✓ Column resize: Drag column borders
  // ✓ Row selection: Click rows, verify selection state
  // ✓ Reactivity: Update rowData, verify grid updates
</script>

<div class="ag-theme-quartz" style="height: 400px;">
  <AgGridSvelte initialOptions={gridOptions} />
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Svelte 4 implicit reactivity (let) | Svelte 5 explicit reactivity ($state, $derived, $effect) | Late 2024 | More predictable, universal reactivity, works outside components |
| Tailwind v3 (tailwind.config.js) | Tailwind v4 (@theme in CSS) | 2025 | Simpler config, better IDE support, CSS-native |
| shadcn HSL colors | shadcn OKLCH colors | 2025 | Perceptual uniformity, better color matching |
| TanStack Query v4 | TanStack Query v5 | 2024 | Improved TypeScript, better defaults, simplified API |
| SvelteKit v1 | SvelteKit v2 | 2024 | Vite 5, improved type safety, better error messages |
| Manual GraphQL client setup | TanStack Query + graphql-request | 2023-2024 | Unified caching strategy, simpler than Apollo/URQL for basic needs |

**Deprecated/outdated:**
- **Svelte stores for local state**: Use $state rune instead (stores still valid for global state)
- **TanStack Query v4 SSR patterns**: v5 has different hydration API
- **Tailwind JIT mode**: Now default in v3+, removed from config
- **@sveltejs/adapter-node for static sites**: Use adapter-static instead
- **svelte-preprocess for TypeScript**: Built into SvelteKit now
- **Manual Svelte component testing**: Use Vitest + @testing-library/svelte

## Open Questions

Things that couldn't be fully resolved:

1. **AG Grid Svelte 5 Production Readiness**
   - What we know: ag-grid-svelte5 v0.0.x exists, supports runes, basic features work in demos
   - What's unclear: Production stability, edge case handling, performance at scale, long-term maintenance
   - Recommendation: Implement validation checkpoint in Phase 1, have TanStack Table fallback plan ready

2. **Custom AG Grid Styling Complexity**
   - What we know: AG Grid has theming API and CSS variable support
   - What's unclear: Effort required to match shadcn-svelte design system, potential conflicts with Tailwind purge
   - Recommendation: Budget 2-3 hours for custom styling, document CSS variables in codebase

3. **GraphQL Client Choice: graphql-request vs URQL**
   - What we know: graphql-request is lightweight, URQL has normalized cache and more features
   - What's unclear: Whether normalized cache is needed for this application's data patterns
   - Recommendation: Start with graphql-request (simpler), migrate to URQL if caching issues arise

4. **Folder Structure Scalability**
   - What we know: Flat component structure works for small-medium apps
   - What's unclear: At what scale flat structure becomes unwieldy (50+ components? 100+?)
   - Recommendation: Start flat as decided, reorganize if pain points emerge (unlikely in v1 scope)

## Sources

### Primary (HIGH confidence)

- [Static site generation • SvelteKit Docs](https://svelte.dev/docs/kit/adapter-static) - adapter-static setup and configuration
- [@sveltejs/adapter-static - npm](https://www.npmjs.com/package/@sveltejs/adapter-static) - Current version 3.0.10
- [Manual Installation - shadcn-svelte](https://www.shadcn-svelte.com/docs/installation/manual) - Setup steps
- [Tailwind v4 - shadcn-svelte](https://www.shadcn-svelte.com/docs/migration/tailwind-v4) - Tailwind v4 migration guide
- [SSR and SvelteKit | TanStack Query Svelte Docs](https://tanstack.com/query/v5/docs/framework/svelte/ssr) - SSR patterns, browser flag
- [Form and Field Validation | TanStack Form Svelte Docs](https://tanstack.com/form/v1/docs/framework/svelte/guides/validation) - Validation setup
- [GitHub - wobsoriano/svelte-sonner](https://github.com/wobsoriano/svelte-sonner) - Toast library setup and API
- [Configuring Vitest | Vitest](https://vitest.dev/config/) - Vitest configuration
- [Responsive design - Core concepts - Tailwind CSS](https://tailwindcss.com/docs/responsive-design) - Breakpoint system
- [Theming - shadcn-svelte](https://www.shadcn-svelte.com/docs/theming) - CSS variables, OKLCH colors
- [GitHub - bn-l/ag-grid-svelte5-extended](https://github.com/bn-l/ag-grid-svelte5-extended) - AG Grid Svelte 5 wrapper docs
- [GitHub - JohnMaher1/ag-grid-svelte5](https://github.com/JohnMaher1/ag-grid-svelte5) - AG Grid Svelte 5 wrapper docs
- [Project structure • SvelteKit Docs](https://svelte.dev/docs/kit/project-structure) - Official folder structure

### Secondary (MEDIUM confidence)

- [The Guide to Svelte Runes](https://sveltekit.io/blog/runes) - Svelte 5 runes overview
- [Svelte 5 migration guide • Svelte Docs](https://svelte.dev/docs/svelte/v5-migration-guide) - Migration patterns
- [GraphQL | TanStack Query React Docs](https://tanstack.com/query/v5/docs/framework/react/graphql) - GraphQL integration (React, but applicable to Svelte)
- [Use URQL with SvelteKit - Scott Spence](https://scottspence.com/posts/use-urql-with-sveltekit) - URQL comparison
- [JavaScript Grid: Theming | AG Grid](https://www.ag-grid.com/javascript-data-grid/theming/) - AG Grid theming API
- [Building New Themes for AG Grid with our Figma Design System](https://blog.ag-grid.com/building-a-new-theme-for-ag-grid-with-the-figma-design-system/) - Design system integration
- [How to add a custom font in Tailwind 4](https://github.com/tailwindlabs/tailwindcss/discussions/13890) - Tailwind v4 font setup
- [Self-hosting a font with Tailwind (JIT) and SvelteKit](https://jeffpohlmeyer.com/self-hosting-a-font-with-tailwind-jit-and-sveltekit) - Font preloading

### Tertiary (LOW confidence - WebSearch only)

- [Responsive Web Design in Svelte: Techniques for Mobile-First Projects](https://zxce3.net/posts/responsive-web-design-in-svelte-techniques-for-mobile-first-projects/) - Mobile-first patterns (not official docs)
- [Structuring larger sveltekit apps - best practices](https://github.com/sveltejs/kit/discussions/7579) - Community discussion on folder structure
- [Best Practices for Organizing and Structuring Svelte Applications](https://kim-jangwook.medium.com/best-practices-for-organizing-and-structuring-svelte-applications-5f85a3d5a6f5) - Community opinions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official docs, stable versions, proven in production
- Architecture patterns: HIGH - Based on official SvelteKit/Tailwind/TanStack docs
- AG Grid Svelte 5: MEDIUM - Wrapper exists and works, but v0.0.x version indicates early-stage
- Custom styling: MEDIUM - AG Grid theming API documented, but integration with shadcn not validated
- Pitfalls: HIGH - Based on official migration guides and known SSR issues

**Research date:** 2026-02-05
**Valid until:** ~2026-03-05 (30 days - relatively stable ecosystem, but fast-moving frontend tools)
**Revalidate for:** AG Grid wrapper updates, Svelte 5 ecosystem maturity, Tailwind v4 final release changes

# Stack Research: Perspectize Frontend

**Project:** SvelteKit frontend for Perspectize (YouTube video perspectives platform)
**Researched:** 2026-02-04
**Overall Confidence:** HIGH (versions verified via web search against official sources)

## Executive Summary

This stack research covers the SvelteKit + TanStack + AG Grid + shadcn-svelte combination for the Perspectize frontend. The ecosystem has matured significantly with Svelte 5's runes system now stable and widely adopted. All recommended packages have Svelte 5 support, though TanStack Form's Svelte adapter lags behind TanStack Query in runes adoption.

**Key finding:** Consider sveltekit-superforms as an alternative to TanStack Form for better Svelte-native integration, unless cross-framework consistency with TanStack ecosystem is a priority.

---

## Core Framework

### SvelteKit + Svelte 5

| Package | Version | Purpose |
|---------|---------|---------|
| `svelte` | ^5.46.0 | UI framework with runes reactivity |
| `@sveltejs/kit` | ^2.50.2 | Full-stack web framework |
| `@sveltejs/adapter-static` | ^3.0.10 | Static site generation |

**Why SvelteKit:**
- Svelte 5 runes (`$state`, `$derived`, `$effect`) provide cleaner reactivity than stores
- SvelteKit 2.x is stable and production-ready
- Static adapter enables pre-rendering for fast initial load + SPA routing
- Native TypeScript support without additional configuration
- File-based routing reduces boilerplate

**Static Adapter Configuration:**

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',  // SPA fallback for client-side routing
      precompress: true,
      strict: true
    }),
    prerender: {
      handleHttpError: 'warn'
    }
  },
  preprocess: vitePreprocess()
};
```

**Sources:**
- [SvelteKit Releases](https://github.com/sveltejs/kit/releases)
- [What's New in Svelte: January 2026](https://svelte.dev/blog/whats-new-in-svelte-january-2026)
- [SvelteKit Static Adapter Docs](https://svelte.dev/docs/kit/adapter-static)

---

## Data Layer

### TanStack Query for GraphQL

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/svelte-query` | ^6.0.16 | Async state management |
| `graphql-request` | ^7.4.0 | Minimal GraphQL client |
| `graphql` | ^16.x | GraphQL core types |

**Why TanStack Query v6:**
- Full Svelte 5 runes support (migrated from stores to signals)
- Framework-agnostic data fetching patterns
- Built-in caching, background refetching, stale-while-revalidate
- Devtools for debugging query state
- Works with any Promise-based fetcher (graphql-request)

**v6 Runes Syntax (Breaking Change from v5):**

```typescript
// Options MUST be passed as a thunk for reactivity
import { createQuery } from '@tanstack/svelte-query';

const query = createQuery(() => ({
  queryKey: ['perspectives', contentId],
  queryFn: () => graphQLClient.request(GetPerspectivesDocument, { contentId }),
  staleTime: 5 * 60 * 1000,  // 5 minutes
}));

// Access in template
{#if query.isLoading}
  <Loading />
{:else if query.isError}
  <Error message={query.error.message} />
{:else}
  {#each query.data.perspectives as perspective}
    <PerspectiveCard {perspective} />
  {/each}
{/if}
```

**GraphQL Integration Pattern:**

```typescript
// lib/graphql/client.ts
import { GraphQLClient } from 'graphql-request';

export const graphQLClient = new GraphQLClient(
  import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/graphql',
  {
    headers: () => {
      // Dynamic headers for auth
      const token = getAuthToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
  }
);
```

**SvelteKit Provider Setup:**

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,       // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  });
</script>

<QueryClientProvider client={queryClient}>
  <slot />
</QueryClientProvider>
```

**Important:** TanStack Query does NOT provide normalized caching (unlike Apollo/Relay). Each query caches independently by queryKey. This is acceptable for Perspectize since:
1. Perspective data is user-specific and updates aren't frequent
2. Simpler mental model than normalized cache
3. `invalidateQueries` handles cache busting after mutations

**Sources:**
- [TanStack Query Svelte v6 Migration](https://tanstack.com/query/latest/docs/framework/svelte/migrate-from-v5-to-v6)
- [TanStack Query Svelte Overview](https://tanstack.com/query/latest/docs/framework/svelte/overview)
- [graphql-request npm](https://www.npmjs.com/package/graphql-request)

---

## Forms

### TanStack Form (Confirmed for Svelte 5)

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/svelte-form` | ^1.26.0 | Headless form management |

**Status:** ✅ CONFIRMED working with Svelte 5 via Context7 documentation. Uses Svelte 5 snippet syntax for field rendering.

**Capabilities:**
- Synchronous and asynchronous validation
- Field-level and form-level validation
- **Dynamic field arrays** (`pushValue`, `removeValue`) - fully supported
- Multi-step form support via modular field structure
- Type-safe with TypeScript generics

**Dynamic Array Fields (Verified Pattern):**

```svelte
<script lang="ts">
  import { createForm } from '@tanstack/svelte-form';

  const form = createForm(() => ({
    defaultValues: {
      people: [] as Array<{ name: string; age: number }>,
    },
    onSubmit: ({ value }) => alert(JSON.stringify(value)),
  }));
</script>

<form
  id="form"
  onsubmit={(e) => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit();
  }}
>
  <form.Field name="people">
    {#snippet children(field)}
      <div>
        {#each field.state.value as person, i}
          <form.Field name={`people[${i}].name`}>
            {#snippet children(subField)}
              <div>
                <label>
                  <div>Name for person {i}</div>
                  <input
                    value={person.name}
                    oninput={(e: Event) => {
                      const target = e.target as HTMLInputElement;
                      subField.handleChange(target.value);
                    }}
                  />
                </label>
              </div>
            {/snippet}
          </form.Field>
        {/each}

        <button
          onclick={() => field.pushValue({ name: '', age: 0 })}
          type="button"
        >
          Add person
        </button>
      </div>
    {/snippet}
  </form.Field>

  <button type="submit">Submit</button>
</form>
```

**Why TanStack Form for Perspectize:**
- **Dynamic fields** - User needs to add/remove perspective fields at runtime
- **Multi-step wizards** - Supports complex perspective forms
- **Data-type picker** - Headless approach allows custom field type rendering
- **Validation** - Field-level async validation for complex rules
- **Type safety** - Full TypeScript support for form values

### Alternative: sveltekit-superforms

| Package | Version | Purpose |
|---------|---------|---------|
| `sveltekit-superforms` | ^2.x | SvelteKit-native form handling |
| `zod` | ^3.x | Schema validation |

**When to prefer Superforms:**
- Server + client validation with SvelteKit form actions
- Simpler forms without dynamic field requirements
- Progressive enhancement needs

**For Perspectize:** TanStack Form is the better choice because:
1. Dynamic field arrays are first-class (`pushValue`/`removeValue`)
2. User requested TanStack ecosystem consistency
3. Multi-step form patterns well-documented
4. Data-type picker requires headless field rendering

**Sources:**
- [TanStack Form Svelte Arrays Guide](https://tanstack.com/form/latest/docs/framework/svelte/guides/arrays) (verified via Context7)
- [TanStack Form Svelte Basic Concepts](https://tanstack.com/form/latest/docs/framework/svelte/guides/basic-concepts)
- [Superforms Documentation](https://superforms.rocks/)

---

## Data Table

### AG Grid with Svelte 5 Wrapper

| Package | Version | Purpose |
|---------|---------|---------|
| `ag-grid-community` | ^34.3.x | Data grid core (MIT license) |
| `ag-grid-svelte5-extended` | ^0.0.15 | Svelte 5 runes wrapper |

**Important:** AG Grid does NOT have official Svelte support. Community wrappers are required.

**AG Grid 34 Features (Released 2025):**
- New Filters Tool Panel
- Cell Editor Validation
- Batch Cell Editing
- AI Toolkit (Enterprise only)
- React 19.2 support (indicates active maintenance)

**Community vs Enterprise:**

| Feature | Community (MIT) | Enterprise |
|---------|-----------------|------------|
| Sorting, Filtering, Pagination | Yes | Yes |
| Custom Cell Renderers | Yes | Yes |
| Column Virtualization | Yes | Yes |
| ARIA/Keyboard Navigation | Yes | Yes |
| Row Grouping | No | Yes |
| Aggregation/Pivoting | No | Yes |
| Excel Export | No | Yes |
| Master/Detail | No | Yes |
| Server-Side Row Model | No | Yes |

**For Perspectize:** Community edition is sufficient. We need:
- Sortable/filterable perspective tables
- Custom cell renderers for ratings/claims
- Pagination for large datasets

**Installation:**

```bash
npm install ag-grid-community ag-grid-svelte5-extended
```

**Usage with Svelte 5:**

```svelte
<script lang="ts">
  import { AgGridSvelte } from 'ag-grid-svelte5-extended';
  import { makeSvelteCellRenderer } from 'ag-grid-svelte5-extended';
  import RatingCell from './RatingCell.svelte';
  import type { ColDef } from 'ag-grid-community';

  const columnDefs: ColDef[] = [
    { field: 'claim', headerName: 'Claim', flex: 2 },
    {
      field: 'quality',
      headerName: 'Quality',
      cellRenderer: makeSvelteCellRenderer(RatingCell),
    },
    { field: 'createdAt', headerName: 'Date', sort: 'desc' },
  ];

  let rowData = $state<Perspective[]>([]);
</script>

<AgGridSvelte
  {columnDefs}
  {rowData}
  domLayout="autoHeight"
  pagination={true}
  paginationPageSize={20}
/>
```

**Wrapper Limitations:**
- Community-maintained (not official AG Grid)
- Version 0.0.15 indicates early maturity
- May lag behind AG Grid releases
- Test thoroughly before production use

**Alternative:** If AG Grid wrapper proves unstable, consider:
- **TanStack Table** (`@tanstack/svelte-table`) - Headless, more flexible, but requires building UI
- **Svelte-table** - Simpler but less powerful

**Sources:**
- [ag-grid-svelte5-extended GitHub](https://github.com/bn-l/ag-grid-svelte5-extended)
- [AG Grid 34 Release](https://blog.ag-grid.com/whats-new-in-ag-grid-34/)
- [AG Grid Community vs Enterprise](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/)

---

## UI Components

### shadcn-svelte + Tailwind CSS v4

| Package | Version | Purpose |
|---------|---------|---------|
| `shadcn-svelte` | ^1.1.0 | Component CLI/library |
| `bits-ui` | latest | Headless primitives |
| `tailwindcss` | ^4.x | Utility CSS |
| `@tailwindcss/vite` | ^4.x | Vite integration |
| `@lucide/svelte` | latest | Icons |
| `mode-watcher` | latest | Dark mode support |

**Why shadcn-svelte:**
- Components are copied into your project (not a dependency)
- Full control and customization
- Built on accessible bits-ui primitives
- Tailwind CSS v4 compatible
- Svelte 5 runes syntax

**Installation (SvelteKit):**

```bash
# Initialize project with Tailwind v4
npx sv@latest create my-app
# Select: SvelteKit minimal, TypeScript, Tailwind

# Add shadcn-svelte
npx shadcn-svelte@latest init

# Add components as needed
npx shadcn-svelte@latest add button
npx shadcn-svelte@latest add card
npx shadcn-svelte@latest add dialog
npx shadcn-svelte@latest add form
```

**Tailwind v4 Vite Configuration:**

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),  // Must come before sveltekit()
    sveltekit(),
  ],
});
```

**CSS Setup (Tailwind v4):**

```css
/* src/app.css */
@import 'tailwindcss';

/* shadcn-svelte CSS variables for theming */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    /* ... other variables */
  }
  .dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
  }
}
```

**Key Dependencies for Svelte 5:**

```bash
npm i bits-ui@latest svelte-sonner@latest @lucide/svelte@latest paneforge@next vaul-svelte@next mode-watcher@latest -D
```

**Sources:**
- [shadcn-svelte Installation](https://www.shadcn-svelte.com/docs/installation/sveltekit)
- [shadcn-svelte Svelte 5 Migration](https://www.shadcn-svelte.com/docs/migration/svelte-5)
- [Tailwind CSS SvelteKit Guide](https://tailwindcss.com/docs/guides/sveltekit)

---

## Integration Matrix

| Component | Integrates With | Pattern |
|-----------|-----------------|---------|
| TanStack Query | GraphQL API | `graphql-request` in `queryFn` |
| TanStack Query | shadcn-svelte | Loading/error states in components |
| Superforms | shadcn-svelte | Form components with validation |
| AG Grid | TanStack Query | `rowData` from `query.data` |
| AG Grid | shadcn-svelte | Styled wrapper, custom cell renderers |
| shadcn-svelte | Tailwind v4 | CSS variables, utility classes |

**Data Flow:**

```
GraphQL Backend (Go/gqlgen)
        |
        v
graphql-request (fetch layer)
        |
        v
TanStack Query (caching, state)
        |
        v
Svelte Components (UI rendering)
    |       |
    v       v
AG Grid   shadcn-svelte
(tables)  (forms, dialogs)
```

---

## Version Compatibility Matrix

| Package | Version | Svelte 5 | Runes | Notes |
|---------|---------|----------|-------|-------|
| `svelte` | 5.46.0 | Yes | Native | Current stable |
| `@sveltejs/kit` | 2.50.2 | Yes | Compatible | Current stable |
| `@tanstack/svelte-query` | 6.0.16 | Yes | Yes | Requires thunk syntax |
| `@tanstack/svelte-form` | 1.26.0 | Partial | Limited | Consider Superforms |
| `sveltekit-superforms` | 2.x | Yes | Yes | Recommended for forms |
| `ag-grid-community` | 34.3.x | N/A | N/A | Core grid |
| `ag-grid-svelte5-extended` | 0.0.15 | Yes | Yes | Community wrapper |
| `shadcn-svelte` | 1.1.0 | Yes | Yes | Requires bits-ui update |
| `bits-ui` | latest | Yes | Yes | Headless primitives |
| `tailwindcss` | 4.x | Yes | N/A | Use @tailwindcss/vite |
| `graphql-request` | 7.4.0 | N/A | N/A | Framework agnostic |

---

## Complete Installation

```bash
# Create SvelteKit project with Svelte 5 + TypeScript + Tailwind v4
npx sv@latest create fe
cd fe

# Core data layer
npm install @tanstack/svelte-query graphql-request graphql

# Forms (choose one)
npm install sveltekit-superforms zod  # Recommended
# OR
npm install @tanstack/svelte-form

# AG Grid
npm install ag-grid-community ag-grid-svelte5-extended

# shadcn-svelte (run init, then add components)
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button card dialog form input select slider toast

# Additional shadcn-svelte Svelte 5 dependencies
npm install -D bits-ui@latest svelte-sonner@latest @lucide/svelte@latest paneforge@next vaul-svelte@next mode-watcher@latest
```

---

## What NOT to Include

| Library | Reason |
|---------|--------|
| **Apollo Client** | Overkill for our needs; TanStack Query + graphql-request is lighter and sufficient |
| **urql** | Good alternative, but graphql-request is simpler for basic queries |
| **Formik/React Hook Form** | React-specific, use TanStack Form or Superforms for Svelte |
| **AG Grid Enterprise** | Community edition covers all Perspectize requirements; Enterprise adds cost without benefit |
| **PostCSS** | Tailwind v4 uses Vite plugin directly, no PostCSS config needed |
| **Svelte stores** | Replaced by Svelte 5 runes ($state, $derived); avoid mixing paradigms |
| **@sveltejs/adapter-auto** | Use adapter-static explicitly for static site deployment |
| **Styled-components/Emotion** | Tailwind provides better utility-first approach |

---

## Environment Variables

```env
# .env
VITE_GRAPHQL_ENDPOINT=http://localhost:8080/graphql

# Production (set in deployment platform)
VITE_GRAPHQL_ENDPOINT=https://api.perspectize.com/graphql
```

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| SvelteKit/Svelte 5 | HIGH | Official docs, recent releases verified |
| TanStack Query v6 | HIGH | Migration docs confirm runes support |
| TanStack Form | HIGH | Context7 confirms Svelte 5 support with snippet syntax, dynamic arrays work |
| AG Grid wrapper | MEDIUM | Community-maintained, v0.0.15 indicates early stage |
| shadcn-svelte | HIGH | Official migration guide for Svelte 5 exists |
| Tailwind v4 | HIGH | Official SvelteKit guide available |

---

## Recommendations Summary

1. **Use SvelteKit 2.50+ with Svelte 5.46+** - Stable, well-documented
2. **Use TanStack Query v6 for data fetching** - Excellent Svelte 5 runes support
3. **Use TanStack Form for forms** - Dynamic fields, multi-step, data-type picker support confirmed
4. **Use AG Grid Community with ag-grid-svelte5-extended** - Test wrapper stability early
5. **Use shadcn-svelte + Tailwind v4** - Modern, accessible component foundation
6. **Use graphql-request** - Minimal, works perfectly with TanStack Query

**Risk Areas:**
- AG Grid Svelte wrapper is community-maintained; have TanStack Table as backup

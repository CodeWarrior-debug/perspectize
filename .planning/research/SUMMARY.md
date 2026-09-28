# Research Summary: Perspectize Frontend

**Synthesized:** 2026-02-05
**Milestone:** v1.0 Frontend MVP

---

## Stack Decisions (Final)

| Layer | Package | Version | Confidence |
|-------|---------|---------|------------|
| Framework | SvelteKit | ^2.50.2 | HIGH |
| UI Framework | Svelte 5 | ^5.46.0 | HIGH |
| Data Fetching | @tanstack/svelte-query | ^6.0.16 | HIGH |
| Forms | @tanstack/svelte-form | ^1.26.0 | HIGH |
| Data Table | ag-grid-community + ag-grid-svelte5-extended | ^34.3 / ^0.0.15 | MEDIUM |
| Components | shadcn-svelte | ^1.1.0 | HIGH |
| Styling | Tailwind CSS | ^4.x | HIGH |
| GraphQL Client | graphql-request | ^7.4.0 | HIGH |
| Deployment | @sveltejs/adapter-static | ^3.0.10 | HIGH |

**Key Confirmations (via Context7):**
- TanStack Form works with Svelte 5 — uses snippet syntax, dynamic arrays supported
- TanStack Query v6 requires thunk syntax: `createQuery(() => ({ ... }))`
- shadcn-svelte theming via CSS variables in `app.css`

---

## Key Integration Patterns

### Data Flow
```
Go GraphQL Backend (Sevalla)
        ↓
graphql-request (fetch layer)
        ↓
TanStack Query (caching, state management)
        ↓
Svelte 5 Components
    ↓           ↓
AG Grid    shadcn-svelte
(tables)   (forms, UI)
```

### TanStack Query + GraphQL
```typescript
import { createQuery } from '@tanstack/svelte-query';
import { graphQLClient } from '$lib/graphql/client';

const query = createQuery(() => ({
  queryKey: ['content', contentId],
  queryFn: () => graphQLClient.request(GetContentDocument, { id: contentId }),
}));
```

### TanStack Form Dynamic Fields
```svelte
<form.Field name="ratings" mode="array">
  {#snippet children(field)}
    {#each field.state.value as _, i}
      <!-- Render dynamic field -->
    {/each}
    <button onclick={() => field.pushValue({ type: '', value: 0 })}>
      Add Rating
    </button>
  {/snippet}
</form.Field>
```

### shadcn-svelte Theming (Figma tokens)
```css
:root {
  --primary: 217 33% 23%;        /* #1a365d navy */
  --primary-foreground: 0 0% 98%;
  --destructive: 0 84% 60%;      /* #dc2626 */
  /* ... map all Figma tokens */
}
```

---

## Critical Watch Items

### 1. AG Grid Svelte Wrapper (MEDIUM RISK)
- `ag-grid-svelte5-extended` is community-maintained, v0.0.15
- **Mitigation:** Validate with proof-of-concept in Phase 1; have TanStack Table as fallback

### 2. SvelteKit Static Adapter + External API
- Static sites can't proxy API calls
- **Mitigation:** Configure CORS on Go backend to allow GitHub Pages origin

### 3. TanStack Query Thunk Syntax
- v6 REQUIRES `() => ({ ... })` wrapper for reactivity
- **Mitigation:** Enforce pattern in code review; TypeScript will error if forgotten

### 4. Tailwind v4 Dark Mode
- Default `dark:` variant doesn't work; need custom variant
- **Mitigation:** Add `@custom-variant dark (&:is(.dark *));` to app.css

### 5. Environment Variables in Static Build
- `VITE_*` vars are baked in at build time
- **Mitigation:** Use `VITE_GRAPHQL_ENDPOINT` with production URL in CI/CD

---

## Build Order Recommendation

### Phase 1: Foundation
- SvelteKit project setup with static adapter
- Tailwind v4 + shadcn-svelte initialization
- GraphQL client setup (graphql-request)
- Basic layout with navigation
- **AG Grid proof-of-concept** (validate wrapper early)

### Phase 2: Data Layer
- TanStack Query provider setup
- GraphQL codegen for typed operations
- Content list query (discover page data)
- User list query (user selector)

### Phase 3: Discover Page
- AG Grid integration with content data
- Search, filter, sort implementation
- Pagination (cursor-based from backend)
- Mobile card layout transformation

### Phase 4: Add Video Flow
- URL paste form (simple, single field)
- Content creation mutation
- Success/error feedback with toast

### Phase 5: Add Perspective Flow
- TanStack Form multi-step wizard
- Dynamic field arrays for ratings
- Data-type picker component
- Form validation
- Perspective creation mutation

### Phase 6: Polish & Deploy
- User selector dropdown
- Responsive refinements
- GitHub Pages deployment
- CORS configuration on backend

---

## Open Questions

1. **AG Grid vs TanStack Table** — Validate AG Grid wrapper stability in Phase 1 before committing
2. **Mobile data table UX** — Card layout transformation specifics (which fields to prioritize)
3. **Stepped slider increment** — 50 vs 100 for 0-1000 quality ratings (recommend user testing)

---

## Anti-Patterns to Avoid (from Features Research)

| Pattern | Why Avoid | Instead |
|---------|-----------|---------|
| Infinite scroll | Removes stopping points, enables mindless consumption | Pagination with clear page boundaries |
| Notification badges | Creates anxiety, constant checking | On-demand refresh |
| Streak mechanics | Gamification against "calm browsing" goal | No engagement metrics |
| Auto-playing content | Loss of control | User-initiated playback only |
| Variable reinforcement | Addictive pattern | Predictable, consistent UI |

---

## Files Created

| File | Purpose |
|------|---------|
| `STACK.md` | Package versions, configurations, integration patterns |
| `FEATURES.md` | UX patterns, table stakes, differentiators, anti-features |
| `ARCHITECTURE.md` | Project structure, data flow, component hierarchy |
| `PITFALLS.md` | Common mistakes and prevention strategies |
| `SUMMARY.md` | This synthesis document |

---

*Research complete. Ready for requirements definition.*

# Frontend: Perspectize SvelteKit

SvelteKit web app with Svelte 5, TanStack Query, AG Grid, shadcn-svelte, and Tailwind v4.

## Architecture

```
frontend/src/
├── routes/              # SvelteKit file-based routing
│   ├── +layout.svelte   # Root layout (QueryClientProvider, Header, Toaster)
│   ├── +layout.ts       # Layout config (prerender = true)
│   └── +page.svelte     # Home page
├── lib/
│   ├── components/      # Svelte 5 components
│   │   ├── shadcn/      # shadcn-svelte primitives (button/)
│   │   ├── Header.svelte
│   │   ├── PageWrapper.svelte
│   │   └── AGGridTest.svelte
│   ├── queries/         # TanStack Query + graphql-request
│   │   ├── client.ts    # GraphQLClient (VITE_GRAPHQL_URL)
│   │   └── content.ts   # Content query definitions (gql)
│   ├── assets/          # Static assets (favicon)
│   └── utils/           # Utility functions
├── app.css              # Global styles (Tailwind v4)
└── app.html             # HTML shell
```

## shadcn-svelte Components

Components live in `src/lib/components/shadcn/` (not `ui/`). The `components.json` alias is configured correctly, but the CLI sometimes ignores it. After installing a new component, verify it landed in `shadcn/` — if it went to `ui/`, move it and remove the empty `ui/` directory. Always add new components to the barrel export in `shadcn/index.ts`.

```bash
# Install from frontend/ directory
npx shadcn-svelte@latest add <component> --yes
# Verify location
ls src/lib/components/shadcn/<component>/
```

## Tailwind v4

Tailwind v4 uses `--color-*` prefix for theme variables (e.g., `--color-primary`), not bare `--primary` from v3/shadcn conventions.

## Commands

```bash
pnpm run dev          # Dev server (http://localhost:5173)
pnpm run check        # Type-check (svelte-check + TypeScript)
pnpm run test:run     # Tests once (CI/verification)
pnpm run test         # Tests in watch mode
```

**`pnpm exec` must run from `frontend/`** — running from repo root fails with `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`. Use `cd frontend && pnpm exec ...` or `pnpm --dir frontend exec ...`.

**Env vars:** `.env.example` lists every `VITE_*` variable by name (values blank on purpose). Copy it to `frontend/.env` and fill in real values by hand — the agent cannot read `.env` (see [../.docs/SECURITY.md](../.docs/SECURITY.md)).

## Svelte 5 Patterns

This project uses **Svelte 5 runes** exclusively. Do not use Svelte 4 syntax.

| Svelte 5 (use this)                 | Svelte 4 (do NOT use)         |
| ----------------------------------- | ----------------------------- |
| `let count = $state(0)`             | `let count = 0` with `$:`     |
| `let doubled = $derived(count * 2)` | `$: doubled = count * 2`      |
| `let { data, children } = $props()` | `export let data`             |
| `$effect(() => { ... })`            | `onMount` / `$:` side effects |
| `{@render children()}`              | `<slot />`                    |
| `onclick={handler}`                 | `on:click={handler}`          |

**Additional rules:** Never use `$effect` for derivation (use `$derived`). Render children via `{@render children()}` with `let { children } = $props()`.

## TanStack Query + GraphQL

Queries use `graphql-request` with TanStack Svelte Query.

1. Define queries in `lib/queries/` using `gql` tagged templates
2. Client in `lib/queries/client.ts` — uses `VITE_GRAPHQL_URL` (defaults to `http://localhost:8080/graphql`)
3. QueryClientProvider wraps app in `+layout.svelte` with `enabled: browser` to prevent SSR queries

**Svelte 5 API (CRITICAL):** TanStack Query v5+ with Svelte 5 uses a **function wrapper** pattern. Query results are reactive objects, NOT stores (no `$` prefix).

```svelte
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlClient } from '$lib/queries/client';
	import { LIST_CONTENT } from '$lib/queries/content';

	// Function wrapper pattern — pass a function returning options
	const query = createQuery(() => ({
		queryKey: ['content'],
		queryFn: () => graphqlClient.request(LIST_CONTENT),
	}));
</script>

<!-- Access as reactive object properties (NO $ prefix) -->
{#if query.isLoading}Loading...{/if}
{#if query.data}{JSON.stringify(query.data)}{/if}
```

**Do NOT:** Use `$query.data` (stores syntax) · Pass options object directly to `createQuery({...})` (must be function wrapper)

**`queryKey` must mirror every variable `queryFn` actually sends.** If `queryFn` conditionally builds request variables (e.g. `mode === 'all' ? filter : undefined`), the `queryKey` object needs the *same* conditional — not a shortcut that hardcodes a fixed value for one branch. A `queryKey` field that doesn't change when the real request variable does means TanStack Query never sees a reason to refetch: the UI silently keeps serving stale cached data for that branch, no matter how the input changes (including back to empty/cleared). Caught in `ActivityTable.svelte`'s search box, which hardcoded `search: ''`/`filter: undefined` in the key for "Loaded" mode while `queryFn` unconditionally sent the real filter — so typing or clearing the search input never refetched.

## Icons (Lucide)

Per-icon imports from `@lucide/svelte` for tree-shaking:

```svelte
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import PlusIcon from '@lucide/svelte/icons/plus';
</script>

<XIcon class="size-4" />
```

- Import path: `@lucide/svelte/icons/{kebab-case-name}`
- Default size in buttons: `size-4` (applied via button base). Override with explicit `size-*` class.

## Design Tokens

All tokens defined in `src/app.css` under `@theme`. Full set: primary, secondary, muted, accent, destructive, card, popover, border, input, ring, rating colors, brand.

- **Fonts:** Geist (UI/headings) + Charter (body/reading text)
- **Colors:** Hex values in `--color-*` custom properties (Tailwind v4 convention)
- **No external token pipeline** — tokens defined directly in CSS, consumed via Tailwind utilities

## AG Grid Svelte 5 Setup (CRITICAL)

Uses `ag-grid-svelte5` wrapper (bundles AG Grid v32.x). **Do NOT install `ag-grid-community` separately.** Import from `@ag-grid-community/*`, use `AgGridSvelte5Component`, style via `themeQuartz.withParams()`.

Full setup and examples: [docs/AG_GRID.md](docs/AG_GRID.md)

**Column visibility gotcha:** `ActivityTable.svelte` controls visibility in TWO places that must stay in sync: `hide: true` in colDef (initial default) and `$effect` with `setColumnsVisible()` (responsive override — runs on gridReady, always wins). When adding/changing columns, update BOTH. The responsive system uses 4 tiers: xs (<445px), sm (445-639px), md (640-899px), lg (900px+) — decide which tier(s) should show the new column. See [ADDING_AG_GRID_COLUMN.md](../.claude/docs/ADDING_AG_GRID_COLUMN.md) Decision 7.

**Grid remount gotcha:** the `cardMode` breakpoint (<860px) and the error state unmount `AgGridSvelte5Component` entirely — a new Grid API is created on the way back, so any imperative column state (`setColumnsVisible`, `applyColumnState`, the session column-picker override) MUST be re-applied from an `$effect` that reruns on `gridReady`, not just at the moment the user changes it.

## Figma Design Workflow

- **[docs/FIGMA.md](docs/FIGMA.md)** — Figma file reference (file keys, pages, variables, code↔Figma mapping)
- **[docs/FIGMA_VERIFICATION.md](docs/FIGMA_VERIFICATION.md)** — Verification guide for Figma Make outputs
- **[Code to Figma Canvas](../.claude/docs/CODE_TO_FIGMA_CANVAS.md)** — Capture running app into Figma to keep designs in sync

**Code-to-Figma capture gotchas:**
- CSP in `app.html` blocks `mcp.figma.com` — temporarily add to `script-src` and `connect-src`, revert after capture
- AG Grid canvas-rendered cells (thumbnails) don't serialize into Figma captures
- SPA hash navigation may not re-trigger auto-capture — reload or click "Send to Figma" manually

## Deployment (Sevalla / Cloudflare edge)

**`static/_headers` and `static/_redirects` are load-bearing, not cosmetic.** adapter-static builds a pure static site with content-hashed `_app/immutable/*` chunks; Sevalla serves it behind Cloudflare. Two gotchas compound if either file is missing or edited carelessly:

- **`_redirects`** (`/* /index.html 200`) makes client-side routing survive a hard refresh — but it also means *any* missing path, including a previous deploy's now-deleted hashed chunk, resolves to a 200 `text/html` response instead of a 404.
- **`_headers`** caps `index.html`/the SPA fallback at `Cache-Control: ... s-maxage=0` (always revalidate), while `_app/immutable/*` keeps a long, immutable cache. Without the `s-maxage=0` override, Cloudflare's edge can keep serving a deploy-old `index.html` for up to 30 days — that stale HTML references the *previous* deploy's chunk filenames, which the new deploy no longer has, and the missing-chunk request then hits the `_redirects` catch-all and comes back as `text/html` instead of JS.

Symptom in the browser: `Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"` on the deployed site (not reproducible locally, since there's no CDN layer). **This is a caching/hosting-config issue, not a service worker issue** — check for it (`curl -I` the failing chunk URL, or a live `fetch()` from the deployed page) before assuming a PWA/SW root cause; a registered SW isn't even required to hit it. Verify after touching either file: `pnpm run build` then confirm both `build/_headers` and `build/_redirects` exist.

**`_headers` block overlap MERGES `Cache-Control`, it doesn't override.** Cloudflare Pages/Sevalla applies every `_headers` block whose path pattern matches a request — if two blocks both match (e.g. `/_app/immutable/*` and a `/*` catch-all, for any chunk that currently exists), their `Cache-Control` values are concatenated with a comma into one nonsensical header, not resolved by specificity. Confirmed live against the deployed site. Only one splat (`*`) is allowed per rule and there's no exclusion/negation syntax, so a broad catch-all can never be scoped to exclude a narrower pattern underneath it. Design around this by making the catch-all's value safe to merge: include a bare `no-cache` token (forces revalidation unconditionally, regardless of what other directives — like a long `max-age` — end up concatenated alongside it) rather than relying on directive order or assuming the more specific rule wins.

## Self-Verification (Chrome DevTools MCP)

| Step       | Tool                                          | Purpose                        |
| ---------- | --------------------------------------------- | ------------------------------ |
| Navigate   | `mcp__chrome-devtools__navigate_page`         | Load frontend URL              |
| Screenshot | `mcp__chrome-devtools__take_screenshot`       | Visual verification            |
| Snapshot   | `mcp__chrome-devtools__take_snapshot`         | DOM structure                  |
| Resize     | `mcp__chrome-devtools__resize_page`           | Desktop breakpoints (768+)     |
| Emulate    | `mcp__chrome-devtools__emulate`               | Mobile/tablet device emulation |
| Console    | `mcp__chrome-devtools__list_console_messages` | JS errors                      |
| Interact   | `mcp__chrome-devtools__click`                 | Buttons, navigation            |

**Mobile screenshots:** Use `emulate` (NOT `resize_page`) for mobile/tablet. AG Grid and CSS media queries only respond to viewport changes when `isMobile: true` is set. `resize_page` alone doesn't trigger responsive column hiding. Example: `emulate({ viewport: { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true } })`. Reset with `emulate({ viewport: null, userAgent: null })` after. Use `resize_page` for desktop breakpoint comparisons (768px+).

## Testing Gotchas

**`tests/helpers/TestWrapper.svelte` dynamic-component syntax:** Pass the component as `<wrapped.Comp {...props} />` (a dotted member expression), not `<component {...props} />` or `<component.default {...props} />`. Svelte 5 only treats dotted-member tags as dynamic components — a bare lowercase identifier renders as a literal `<component>` HTML element, and `.default` is wrong because the `component` prop passed in is already the `.svelte` file's default export, not a module namespace object. Either mistake silently renders nothing (empty comment placeholders), which can make a whole test file's assertions pass vacuously (see `tests/components/ActivityTable.test.ts` history) without ever exercising real component output.

**AG Grid custom cell renderers inherit `white-space: nowrap`:** AG Grid's `.ag-cell` sets `white-space: nowrap`, which is inherited by any child elements a custom `cellRenderer` builds. A `line-clamp-*`/wrapping title inside a cell renderer needs an explicit `whitespace-normal` (or equivalent) to override it, or the text silently stays on one line and overflows instead of wrapping/clamping.

**AG Grid `rowHeight` too tight clips descenders on a `line-clamp-2` cell title, even though line-clamp itself only ever cuts whole lines, not glyphs.** The row's own `overflow: hidden` — not the title element's — clips letters like g/y/p/q/j on the last visible line when the vertically-centered content's natural height (line-count × line-height, plus the cell's own padding) is only marginally smaller than `rowHeight`. Give real margin: for a 2-line `text-[13px] leading-[1.5]` title that's roughly 39px of text, a 64px `rowHeight` (not something closer to 45-50px) leaves enough slack. Verify visually (zoom into a rendered row) after changing `rowHeight` or the title's font-size/line-height/line-clamp count — this doesn't show up from reading the CSS alone.

**Date formatting timezone:** `formatDate`/`formatDateCompact` use `toLocaleDateString` (local timezone). In tests, use midday UTC times (`T12:00:00Z`) not midnight (`T00:00:00Z`) to avoid dates shifting to previous day in US timezones.

**AG Grid testing strategy:** AG Grid doesn't render in jsdom — no lifecycle hooks, no Grid API, no cell rendering. Test AG Grid logic by extracting pure functions into `$lib/utils/grid-config.ts` (sort mapping, pagination bounds, responsive tiers, comparators, column metadata). Test renderers/formatters via `$lib/utils/formatting.ts`. For grid integration (filter UI, sort clicks, responsive `$effect` blocks), use Playwright E2E or Vitest Browser Mode (future). See [ADDING_AG_GRID_COLUMN.md](../.claude/docs/ADDING_AG_GRID_COLUMN.md) testing section.

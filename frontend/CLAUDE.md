# Frontend: Perspectize SvelteKit

SvelteKit SPA (`ssr = false`, `prerender = false`), Svelte 5 runes only.

## Deep Modules

Small interface, lots of work hidden behind it (Ousterhout). The frontend isn't hexagonal; deep modules is about boundary quality, not dependency direction.

- **One folder per domain** — `lib/queries/{content,perspectives,users,categories,…}/` holds the `gql` defs (`index.ts`) _and_ that domain's hooks (`useCreatePerspective.ts`). Only `client.ts`/`keys.ts` are top-level.
- **Import the domain, not its guts** — `import { LIST_CONTENT } from '$lib/queries/content'`; components call a hook, never `graphqlClient.request` + cache invalidation inline.
- **Hide cache wiring in the hook** — query keys, `invalidateQueries`, optimistic updates live inside `useX`; callers get `{ mutate, isPending }` and nothing else.
- **No pass-through components** — a wrapper that only forwards props/snippets to one child: inline it or give it state/logic.

## Docs

- [Design Spec](docs/DESIGN_SPEC.md) — Figma design system, color tokens, typography, component specs
- [Adding an AG Grid Column](../.claude/docs/ADDING_AG_GRID_COLUMN.md) — decision checklist for ActivityTable columns
- [AG Grid setup](docs/AG_GRID.md)
- Figma: see [Figma Design Workflow](#figma-design-workflow) below
- [Frontend deployment](../.docs/FRONTEND_DEPLOYMENT.md) — read before editing `static/_headers`, `static/_redirects`, stale-chunk recovery (`app.html`, `versionWatch.ts`, `kit.version`) or PWA/service-worker config, or when a deployed page fails to load a JS chunk
- [Vitest Browser Mode capture](../.docs/VITEST_BROWSER_CAPTURE.md) — read before taking screenshots or recording video from `tests/browser/`

## shadcn-svelte Components

Components live in `src/lib/components/shadcn/` (not `ui/`). Install from `frontend/` with `npx shadcn-svelte@latest add <component> --yes`; the CLI sometimes ignores the `components.json` alias, so if it lands in `ui/`, move it to `shadcn/` and delete the empty `ui/`. Add every new component to the barrel `shadcn/index.ts`.

## Tooling gotchas

**TypeScript 7 runs as `@typescript/native` (npm alias of `typescript@7`); `typescript` stays on 6.x.** `svelte-check` and `@sveltejs/kit` only declare TS ^5/^6 peers, and svelte-check refuses TS 7 unless 6.x is installed and `--tsgo` is passed. Keep both. Type-check with `pnpm run check` (passes `--tsgo`), not raw `node_modules/@typescript/native/bin/tsc` (16 false errors on `*.svelte` imports).

**`pnpm exec` must run from `frontend/`** (repo root fails with `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`). Use `pnpm --dir frontend exec ...`.

**Cloud/CI sandboxes start with no `frontend/node_modules`**, and `check`/`test:run` then fail with confusing module-resolution errors. Run `pnpm install --frozen-lockfile --config.engine-strict=false` once in `frontend/` (cloud Node 22.22.0 fails jsdom's ^22.22.2 engine check otherwise; easy to miss when output is redirected).

**Run `pnpm install` right after checking out a branch with dependency changes**, before trusting any baseline. Stale `node_modules` makes a missing package look like "pre-existing" `check` errors and test failures (one effort carried a wrong 7-errors/8-failures baseline that was entirely a missing `graphql-ws`).

**`pnpm-lock.yaml` merge conflicts:** take either side (`git checkout --theirs frontend/pnpm-lock.yaml`), then `pnpm install --dir frontend`. Use `--dir`, not `cd`, to avoid hook/shell side effects that can switch branches mid-operation.

## Svelte 5 Patterns

Runes only: `$state`, `$derived`, `$props` (`let { data, children } = $props()`), `$effect`, `{@render children()}`, `onclick={…}`. No Svelte 4 syntax (`$:`, `export let`, `<slot />`, `on:click`). Derive with `$derived`, never in `$effect`.

**Runes in a plain module need the `.svelte.ts` extension.** A rune in a bare `.ts` file fails at build/type-check with no error pointing at the cause. Name shared reactive modules `foo.svelte.ts` (see `lib/theme/store.svelte.ts`).

**`$effect` tracks only state read _synchronously_ in its body.** A value read solely inside a `setTimeout`/`Promise`/`await` callback is not a dependency, so the effect never re-runs. For a debounce, copy the value to a local first (`const term = searchTerm;`) and use the local in the timer (see `CategoryTypeahead.svelte`).

**An `$effect` that writes a `$state` var and then reads it back loops** (`effect_update_depth_exceeded`), even when the value is unchanged. Read from a local `const` derived off the source prop instead (see `PerspectivePopover.svelte`'s `existingPerspective` reset effect).

**An Escape handler inside a bits-ui dialog must run in the capture phase, or the dialog closes on the same keypress.** bits-ui listens on `document` in the bubble phase and registered first, so a bubble-phase listener (including `<svelte:document onkeydown>`) is too late for `stopPropagation`, and `onEscapeKeydown` gets a cloned event (`defaultPrevented` lost). Register `document.addEventListener('keydown', h, { capture: true })` in an `$effect` with cleanup, and `stopPropagation()` only while your inner element (popover, pin) is showing, so a second Escape still closes the dialog. See `interlinear/InterlinearPassage.svelte` and its bubble-phase `document` spy test.

## Auth (Clerk + demo mode)

**Use the auth facade, not `svelte-clerk`, in components:** `useAuthState()` (`$lib/auth/useAuthState`), `getAuthToken()` (`$lib/auth`), and `components/auth/{AuthShow,SignInTrigger,UserMenu}.svelte`. With `VITE_DEMO_MODE=true` there is no `ClerkProvider`, so a direct `useClerkContext()`/`<Show>` crashes demo mode (and the `demo-e2e` CI job). Keep `$lib/auth` free of `svelte-clerk` imports: under Vitest `$env/dynamic/public` is undefined and unit tests that load it break. See [../.docs/DEMO_MODE.md](../.docs/DEMO_MODE.md).

## First-load performance (Clerk gate)

**Outside demo mode the root layout renders nothing until `ClerkLoaded`**, so anything a page lazy-loads from its template (e.g. `ActivityTable`/AG Grid) only starts after Clerk's ~370KB script finishes: a serial chain on the LCP path. Start such imports from a `<script module>` (see `routes/+page.svelte`) so they run alongside Clerk. Trade-off: signed-out visitors also download the chunk (tracked in #642).

- **The ~244KB-gzipped AG Grid chunk is "needed", not waste.** Lighthouse's ~81% unused figure is how little of its code the page calls; don't chase it. The lever is *when* it loads.
- **Check request order locally without a Clerk key:** a build with no `VITE_CLERK_PUBLISHABLE_KEY` stays at "Loading..." (the Clerk gate), so a chunk requested in that state is loading in parallel with Clerk. Serve `build/` with an SPA-fallback static server and log `/_app/immutable/*.js` request times from Playwright (`channel: 'chrome'`).
- **Local Lighthouse is signed out**, so it renders `GuestLanding`, not the Activity grid: it can't measure Activity changes. Use a signed-in session or the demo stack.

## TanStack Query + GraphQL

**Svelte 5 API (CRITICAL):** pass a function to `createQuery(() => ({ queryKey, queryFn }))`, never an options object, and read results as reactive properties (`query.data`, `query.isPending`), never store syntax (`$query.data`).

**Adding a `useX` hook to a component means mocking it in that component's tests.** Component tests (e.g. `tests/components/PerspectivePopover.test.ts`) `vi.mock` each mutation hook and render without a QueryClient provider; an unmocked hook calls the real `useQueryClient()` and throws.

**`queryKey` must mirror every variable `queryFn` actually sends, including conditionals.** If `queryFn` sends `mode === 'all' ? filter : undefined`, the key needs the same conditional. A key field that doesn't change when the request variable does means TanStack never refetches and silently serves stale data (bug: `ActivityTable.svelte`'s search hardcoded `search: ''` in the "Loaded" key, so typing or clearing never refetched).

**Branch on `isPending`, not `isLoading`, for the loading state.** `isLoading = isPending && isFetching`; an offline first fetch is paused (`isPending: true`, `isFetching: false`), so an `isLoading`/`isError`/`data` chain renders nothing. See `interlinear/OriginalLanguage.svelte` and its test.

## Query caching & call budget (REQUIRED for data-fetching changes)

Target: one network call per distinct piece of data, deliberate freshness, exact eviction. Test with a **real** `QueryClient` via `tests/helpers/queryBudget.ts` (examples: `tests/unit/query-cache-contract.test.ts`).

- **One hook, one key per piece of data.** Components needing the same data call the same `useX`, never a second hand-rolled `createQuery`. Test: `mountConsumers(client, opts, 3)` → `fetches() === 1`.
- **Choose `staleTime` on purpose** (default `0` refetches every mount). Immutable → `Infinity`; user-scoped → minutes; lists → ~30–60s. Test: a second mount inside `staleTime` costs 0 calls.
- **Keys come from `queryKeys` (`lib/queries/keys.ts`)** and follow the `queryKey` rule above. Test: `hashKey` changes when each variable changes.
- **Mutations evict exactly what changed** — affected lists/details/aggregates, never a root key (`queryKeys.all`, `content.all()`) "to be safe". Patch optimistically only caches of the _same row shape_, and roll back in `onError`. Test: `seed` affected + unrelated keys, run `onSuccess`, assert both `invalidationOutcome(...).invalidated` and `.untouched`.
- **Mocked `invalidateQueries` assertions pass even when the key matches no cache entry.** Keep them for branch coverage; add a real-client eviction test.
- Debounce fetches driven by keystrokes, and keep fetches out of `$effect`s that can loop.

Full table: [../.docs/QUERY_BUDGET.md](../.docs/QUERY_BUDGET.md).

## UI conventions

- **Nav labels are one word** (`Header.svelte` `navLinks`: Activity, Discover, Compare); name new top-level pages with a one-word verb.
- **Toasts:** svelte-sonner, configured once in `TOASTER_PROPS` (`lib/utils/toast.ts`, spread into both `<Toaster>`s in `+layout.svelte`): 2s default, `expand: true` so simultaneous toasts don't overlap. A toast with an action button uses `toastWithAction` (`ACTION_TOAST_DURATION_MS` = 4s); its `secondary` option adds a second choice.
- **User-supplied HTML:** sanitize with `sanitizeHtml` (`lib/utils/sanitize.ts`, DOMPurify) and render through `SafeHtml.svelte`; the backend mirrors the same tag set with bluemonday (`services/sanitize.go`). Change both together. See [.docs/SECURITY.md](../.docs/SECURITY.md#user-supplied-html).
- **Icons:** per-icon imports, `import XIcon from '@lucide/svelte/icons/x'` (kebab-case name). Buttons size icons `size-4`; override with an explicit `size-*`.

## Theme tokens and colour

Tokens live in `src/app.css` under `@theme` (no external pipeline), consumed via Tailwind utilities. Tailwind v4 names them `--color-*` (e.g. `--color-primary`), not bare `--primary` (v3/shadcn).

**Pre-commit colour guard:** the git pre-commit hook (`make install-hooks`; [.docs/HOOKS.md](../.docs/HOOKS.md)) blocks new raw hex/rgb literals in `src/lib/components/**` and `formatting.ts`. Use theme tokens (`.docs/UI_THOROUGHNESS_CHECKLIST.md` §3.3); allowlist an intentional literal inline with a `hex-ok: <reason>` comment.

**A bare `border` class is `currentColor` under Tailwind v4.** Pair it with `border-border` (or `border-b border-border` etc.), or the frame renders in the text colour.

**Theme preset names must be unique across all of `THEME_PRESETS`, not just ids** (`tests/components/theme-customize-panel.test.ts` uses `getByText` per name). After editing `presets.ts`, regenerate `app.css`'s `[data-theme]` blocks with `npx tsx gen-preset-css.mjs` and splice its output in place of the existing preset blocks (between the `Reading Room (default) needs no block` comment and the next unrelated CSS section); never hand-edit hex values.

## AG Grid Svelte 5 Setup (CRITICAL)

Uses `ag-grid-svelte5` (bundles AG Grid v32.x). **Do NOT install `ag-grid-community` separately.** Import from `@ag-grid-community/*`, use `AgGridSvelte5Component`, style via `themeQuartz.withParams()`. Setup: [docs/AG_GRID.md](docs/AG_GRID.md).

**Column visibility gotcha:** `ActivityTable.svelte` sets visibility in TWO places; update BOTH: `hide: true` in the colDef (initial default) and the `$effect` with `setColumnsVisible()` (responsive override, runs on gridReady, always wins). Tiers: xs (<445px), sm (445-639px), md (640-899px), lg (900px+); choose which show the new column. See [ADDING_AG_GRID_COLUMN.md](../.claude/docs/ADDING_AG_GRID_COLUMN.md) Decision 7.

**Column metadata lives in one place:** `src/lib/utils/grid-config.ts`'s `COLUMNS: readonly ColumnMeta[]` derives the column picker, sort picker, server/client sort maps, URL filter keys and filter-chip labels. Add a column as one `COLUMNS` entry; never edit `DATA_COLUMNS`/`SORTABLE_COLUMNS`/`COL_TO_SORT`/`COL_TO_FILTER_KEY`/`COLUMN_LABELS` individually.

**Grid remount gotcha:** the `cardMode` breakpoint (<860px) and the error state unmount `AgGridSvelte5Component`, creating a new Grid API on return. Re-apply imperative column state (`setColumnsVisible`, `applyColumnState`, the session column-picker override) from an `$effect` that reruns on `gridReady`, not only when the user changes it.

**Grid column APIs can't run from `onGridReady`:** `setColumnsVisible`/`applyColumnState` called from `onGridReady` (or an effect it triggers) throws `Cannot read properties of undefined (reading 'setColumnMovingCss')` (body controller not ready). Defer one frame with `requestAnimationFrame` and check `isDestroyed()` first, as `ActivityTable` does. The throw also kills the Plan grid's `onRowDragEnd`, so drag-reorder silently stops saving.

**Grid colours come from theme tokens, not hex.** `src/lib/utils/grid-theme.ts` (`GRID_THEME_PARAMS`, unit-tested to contain no raw colours) feeds `themeQuartz.withParams`, so the grid follows the theme picker. Zebra/hover use `--color-row-alt` / `--color-row-hover` / `--color-row-accent`, derived in `src/lib/theme/derive.ts` (so custom themes get them too). Adding a derived token means: `DerivedTokens` + `toCssVarMap` + `clearInlineThemeVars` in `store.svelte.ts`, the default `@theme` block in `app.css`, and the four `[data-theme]` blocks (regenerate with `npx tsx gen-preset-css.mjs`; for a new token `git diff` must show only additions). Changing how an existing token is _derived_ changes every preset block and the default block's values; `tests/unit/theme/css-agreement.test.ts` fails until `app.css` is regenerated. Row hover is a foreground wash (not primary-driven) so dimming the primary never erodes hover-vs-zebra; an authored neutral with chroma >= 0.004 keeps its own hue.

**AG Grid paints row hover on `.ag-row-hover::before`**, above the row background and below cell content. So an opaque hover colour is safe and keeps hover identical on odd and even rows (an alpha hover composites differently over the zebra). The left hover bar is an `inset` box-shadow on that same `::before` (`app.css`).

**Column minimum widths must fit the page container.** The Activity page is capped at `max-w-screen-xl` (1280px), leaving a 1212px grid; `headerMinWidth` (`formatting.ts`) sums to just under that. Extra header room (an icon slot, a divider) silently overflows and clips the last column on wide screens. The `?f.type=youtube` URL filter goes through the grid's filter model, so the mobile card list (grid unmounted) ignores it.

## Figma Design Workflow

- **[docs/FIGMA.md](docs/FIGMA.md)** — Figma file reference (file keys, pages, variables, code↔Figma mapping)
- **[docs/FIGMA_VERIFICATION.md](docs/FIGMA_VERIFICATION.md)** — Verification guide for Figma Make outputs
- **[Code to Figma Canvas](../.claude/docs/CODE_TO_FIGMA_CANVAS.md)** — Capture running app into Figma to keep designs in sync

**Code-to-Figma capture gotchas:**

- CSP in `app.html` blocks `mcp.figma.com` — temporarily add to `script-src` and `connect-src`, revert after capture
- AG Grid canvas-rendered cells (thumbnails) don't serialize into Figma captures
- SPA hash navigation may not re-trigger auto-capture — reload or click "Send to Figma" manually

## Self-Verification (Chrome DevTools MCP)

**Mobile/tablet screenshots: use `emulate`, not `resize_page`.** AG Grid and CSS media queries respond only with `isMobile: true`, so `resize_page` alone doesn't trigger responsive column hiding. Example: `emulate({ viewport: { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true } })`; reset with `emulate({ viewport: null, userAgent: null })`. Use `resize_page` for desktop breakpoints (768px+).

## Testing Gotchas

**In `tests/helpers/TestWrapper.svelte`, render the component as `<wrapped.Comp {...props} />`** (dotted member). Svelte 5 treats only dotted-member tags as dynamic; `<component …/>` and `<component.default …/>` render nothing, so assertions pass vacuously.

**AG Grid custom cell renderers inherit `white-space: nowrap`** from `.ag-cell`. A wrapping or `line-clamp-*` title in a renderer needs explicit `whitespace-normal`, or it stays on one line and overflows.

**A tight AG Grid `rowHeight` clips descenders** (g/y/p/q/j) on a `line-clamp-2` title: the row's `overflow: hidden` cuts the last line when content height is marginally under `rowHeight`. A 2-line `text-[13px] leading-[1.5]` title (~39px) needs ~64px, not 45-50px. After changing `rowHeight` or the title's font-size/line-height/clamp count, zoom into a rendered row to verify.

**Date formatting timezone:** `formatDate`/`formatDateCompact` use local time (`toLocaleDateString`). Test with midday UTC (`T12:00:00Z`), not midnight, or dates shift a day in US timezones.

**AG Grid doesn't render in jsdom** (no lifecycle, Grid API or cells). Extract grid logic into pure functions in `$lib/utils/grid-config.ts` (sort mapping, pagination bounds, responsive tiers, comparators, column metadata) and renderers/formatters into `$lib/utils/formatting.ts`, and unit-test those. Test grid integration (filter UI, sort clicks, responsive `$effect`s) with Playwright E2E or Vitest Browser Mode. See [ADDING_AG_GRID_COLUMN.md](../.claude/docs/ADDING_AG_GRID_COLUMN.md) testing section.

**Custom AG Grid filter/cell components (vanilla `IFilterComp` classes) _are_ jsdom-testable:** instantiate, call `init()` with a stub `filterChangedCallback`, assert on `getGui()`. Mount the GUI first (`document.body.replaceChildren(filter.getGui())`): `.click()` on a detached checkbox fires no `change` event (see `tests/unit/contentTypeFilter.test.ts`).

**No Set Filter in AG Grid Community.** For a small fixed value set, use a custom checkbox filter like `ContentTypeFilter` (`$lib/utils/contentTypeFilter.ts`, `{ filterType: 'set', values }` model) plus `filterSet: true` on its `ColumnMeta` (ADDING_AG_GRID_COLUMN.md Decision 6).

**A test with heavy render work gets its own timeout, not a rerun** (e.g. `SettingsDialog.test.ts` theme section, 28 presets): `it(name, fn, 15000)`.

**Vitest Browser Mode (`tests/browser/`, `vitest.config.browser.ts`) runs in CI** (`frontend-test.yml`, Playwright Chromium); a red browser step is a real failure. Run it locally first with `pnpm run test:browser --browser.headless=true` (flags go directly, no `--`: after `--` they parse as a file-name filter). Tests needing demo mode (no Clerk) call `vi.hoisted(() => vi.stubEnv('VITE_DEMO_MODE', 'true'))` at the top of the file; a config-level `define` leaks into the unit project and breaks every Clerk-auth unit test. `svelte-clerk` is aliased to a stub in the browser config (the real package needs SvelteKit virtual modules). macOS needs no Playwright download: the config drives the installed Google Chrome (override with `PW_CHROMIUM_EXECUTABLE`).

**Browser tests: wait for cells, not rows.** AG Grid creates `.ag-row` before cell renderers draw, so a count right after `waitForGridReady()` can see 0 cells. Poll: `await expect.poll(() => document.querySelectorAll(sel).length).toBe(n)`.

**Mutation testing (Stryker):** `pnpm run mutate:chunked` runs `src/lib` in size-balanced chunks, one report each; `pnpm run mutate` reports only at the end. Both use `vitest.config.stryker.ts`, a unit-only copy of the `unit` project: keep them in sync. Exclude tests that read outside `frontend/` (they fail the sandbox dry run). No TypeScript checker, on purpose (it can't resolve `.svelte` exports). Fix survivors: `pnpm exec stryker run --mutate <file>,<file> --reporters json,clear-text`, list `Survived`/`NoCoverage` from `reports/mutation/mutation.json`, add tests, rerun. Ignore equivalent survivors (`x > undefined` is always false; a guard a callee repeats) and say why in the PR.

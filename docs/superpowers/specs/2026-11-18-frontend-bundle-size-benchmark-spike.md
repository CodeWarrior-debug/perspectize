# Spike: frontend bundle size vs. well-regarded Svelte apps (#508)

**Status:** spike, not a superpowers plan. Research record for issue #508 ("Investigate frontend bundle size vs. well-regarded Svelte apps"). Nothing here changes code. It builds on the AG Grid measurements in PR #779 (`docs/superpowers/specs/2026-11-18-ag-grid-eager-load-signed-out-spike.md`, open at the time of writing) and on #429 (AG Grid and Tiptap already split out of the critical bundle).

**Demo:** not applicable, docs-only research.

## 1. Question

Is the current frontend payload reasonable for a data-grid, authenticated SvelteKit app, and where do its bytes go? The issue asks for three things: comparison data from well-regarded Svelte apps, a breakdown of the initial load, and a recommendation with a possible budget.

## 2. Method

- **Our build:** one production build of `frontend/` on `origin/main` (`pnpm --dir frontend run build`, no Clerk key). Chunk sizes and gzip are Vite's own report, which uses gzip level 6. Initial-load totals are computed from the `modulepreload` list in the built `index.html` with a local gzip level 9 pass, so they are a few percent lower than level 6 would give.
- **Attribution:** no bundle visualizer was run (the build was limited to one run, and the build output is stripped of source maps). Packages are attributed by counting distinctive strings in the minified chunks. This is a heuristic, not a per-module byte count.
- **Comparison:** searched for published bundle sizes of well-regarded Svelte or SvelteKit apps, using primary sources first. Access date 2026-11-18.
- **Not re-measured:** Lighthouse, LCP, and network waterfalls. Those are covered by the issue and by PR #779.

## 3. Our bundle (measured)

### 3.1 Initial load (what `index.html` preloads)

| Item | Value |
|---|---|
| Files in the `modulepreload` list | 50 |
| Raw | 753 KB |
| Gzip (level 9, local) | **262 KB** |

The issue quotes 676 KB raw and 222 KB gzip for the same list. Our gzip figure is about 40 KB higher. The issue's method is not recorded, so the gap is unexplained (possibly a different build, or Brotli or a different file list). Treat 262 KB as the figure for this build and re-check the method before comparing with the 222 KB number.

Largest preloaded chunks (Vite gzip):

| Chunk | Raw | Gzip | What it is (heuristic) |
|---|---|---|---|
| `nodes/0` (root layout) | 178 KB | 62.4 KB | App shell, header, `svelte-sonner` (12 marker hits), TanStack Query use (10 `queryKey` hits), GraphQL client |
| `chunks/C7RzkugE` | 122 KB | 44.8 KB | Clerk glue (94 `lerk` hits in the chunk), `tailwind-merge` (13 hits), some `lucide` icons (5 hits) |
| `chunks/flb6rDWV` | 89 KB | 25.2 KB | TanStack Query core (24 `queryKey` hits) and GraphQL (5 hits) |
| 47 smaller chunks | ~290 KB | ~110 KB | Svelte and SvelteKit runtime, route nodes, shared components |

### 3.2 Lazy chunks (not in the initial load)

| Chunk | Raw | Gzip | What it is (heuristic) | Evidence |
|---|---|---|---|---|
| `chunks/ByzTrjh5` | 1,017 KB | **250 KB** | AG Grid (153 `ag-grid` hits) | Not preloaded. Loaded by the grid routes. Matches #779 (about 244 KB gzip for AG Grid alone). |
| `chunks/Csk6l1ZV` | 446 KB | **141 KB** | Tiptap and ProseMirror (7 `prosemirror` hits, 29 `tiptap` hits) | Not preloaded. The issue's 436 KB and 138 KB are the same chunk at 1024-byte KB and gzip level 9. |
| `chunks/BKm1EZx7` | 96 KB | 30 KB | The `/` route's dynamic import: the Activity table module, own bytes | Matches #779's 94 KB raw and 29 KB gzip. |
| `chunks/CXqNM00T`, `Bb0KerW5`, `BBc8W5ua` | 174 / 123 / 5 KB | 49 / 42 / 2 KB | Grafana Faro and tracing (`grafana` or `faro` strings present) | Not preloaded. Whether they load at boot is not verified. |

### 3.3 Third-party script (not in our bundle)

Clerk's `clerk-js` is loaded from Clerk's CDN, preloaded from `app.html`, and is not counted above. I fetched the public `@clerk/clerk-js@6` build from jsDelivr (generic package URL, no project identifiers): **85.6 KB transferred with gzip, 328 KB raw** (access 2026-11-18). This is a different version from the one the app pins, so treat it as indicative. The repo's `frontend/CLAUDE.md` says "~370KB"; that figure matches the raw size more than the compressed size, so it is probably uncompressed. The `CLAUDE.md` figure should be checked before anyone relies on it.

## 4. Where our bytes go

Approximate split of the 262 KB gzip initial load, using the heuristic attribution above:

- **Framework (Svelte and SvelteKit runtime, router, route nodes):** the largest share, roughly 90 to 110 KB gzip. Not separable with the current evidence.
- **Clerk glue and auth wiring:** about 40 KB gzip (within `C7RzkugE`). The Clerk script itself (about 86 KB gzip) is extra and is not part of the 262 KB.
- **TanStack Query and GraphQL client:** roughly 30 KB gzip.
- **Other (`svelte-sonner`, `tailwind-merge`, icons, app code):** the rest.
- **AG Grid:** 250 KB gzip, loaded only on grid routes. It is the largest single dependency, but it is not in the initial load.
- **Tiptap and ProseMirror:** 141 KB gzip, lazy. Not in the initial load.
- **Faro:** lazy in build terms, boot-time loading not verified.

The split between framework and app code within the 262 KB is not verified. A bundle visualizer run would settle it, and the issue already asks for one.

## 5. Comparison data

**What we could find is thin, and most of it is secondary.** Specifically:

- **js-framework-benchmark (krausest):** the repository README gives no bundle-size numbers (checked 2026-11-18). The interactive results page is rendered client-side and the fetch did not expose a bundle-size column. Not usable as a source here.
- **A third-party mirror of the benchmark results** (`framework-benchmarks.as93.net/svelte/`) shows "Bundle Size 37.4 KB, gzipped" for the benchmark app, with no Svelte version or date. The same page says the app "compiles down to around 15 KB", and it does not explain the difference. Low trust; not used for conclusions.
- **Svelte 5 announcement** (`svelte.dev/blog/svelte-5-is-alive`) gives no size figures. Only qualitative claims.
- **Blog and comparison pages** (dev.to, tech-insider, pkgpulse and similar) give runtime and hello-world sizes that disagree with each other (SvelteKit hello-world from about 12 KB to 26 KB gzip). Some cite internal audits that cannot be checked. One reports a large Svelte 5 dashboard going from 1.2 MB to 660 KB gzip after an upgrade, with no method. These are anecdotes, not benchmarks.
- **Published bundle sizes of named, data-heavy Svelte apps:** none found from the app's own repo or a primary source.

**Conclusion for the comparison:** no trustworthy, like-for-like comparison exists in primary sources, so this spike does not produce a "our app vs. theirs" number. It also means the "commonly cited 150 to 200 KB" initial-load budget in the issue is still unsourced. The issue's acceptance criterion "comparison data from at least a few Svelte apps, with sources noted" is not met by primary sources. Measuring a handful of live apps' JS payloads with the same Lighthouse setup, as the issue suggests in its second option, is the way to get that data.

## 6. What is reasonable for a data-grid app

No sourced benchmark sets a threshold, so this is a judgment:

- **AG Grid alone is about 250 KB gzip** in this build. Any app that uses a full-featured grid pays a cost of this order. The lever is when it loads (already handled by #429 and the `<script module>` prefetch), not its size.
- **The initial load (262 KB gzip) is mostly shared framework, auth, and data-layer code.** For an app that is authenticated and client-rendered, that is defensible, but it leaves little room. The reasonable target is "do not grow it", not "cut it sharply".
- **The better budget is relative to our own history:** a gzip ceiling on the initial-load list (for example, the current 262 KB plus about 10%), plus a lazy-chunk ceiling for AG Grid and Tiptap. This is what the monthly routine can check, and it does not need an external reference we cannot source.

## 7. Ranked reduction options

Estimates come from this build's chunk sizes. None of them has been prototyped, so each saving is the size of the code moved or removed, not a measured page-load gain.

1. **Keep AG Grid off the `/` path for signed-out visitors** (from #779). Saves about **294 KB gzip** for every guest landing on `/` (table code plus AG Grid). Cost: signed-in visitors on `/` may pay the grid fetch later, after Clerk. Decision belongs to the owner after the signed-in measurement that #779 lists as missing. Cheapest form: remove the `/` module import and keep the `/content-library` one.
2. **Check whether Faro loads at boot, and defer it** if it does. Up to about **50 KB gzip** (`CXqNM00T` plus the other Faro chunks) if it currently starts in the initial path. Savings are zero if it is already deferred, so this is a check first.
3. **Trim the initial shell:** audit what `nodes/0` (62 KB gzip) and `svelte-sonner` (inside it) pull in, and mount `Toaster` lazily on first toast. Estimate **5 to 10 KB gzip**, unverified. Lower priority because the saving is small and it needs a visual check.

Not recommended: lazy-loading the initial Clerk glue or TanStack Query. Both are on the auth and data path for nearly every page, so moving them adds a waterfall step without a clear byte saving.

## 8. Not verified

- The per-package byte split inside the 262 KB initial load. The attribution above is a string-count heuristic, not a module-level measurement. A bundle visualizer run would verify it.
- The issue's 222 KB gzip figure. Our 262 KB figure uses a different method and is not reconciled with it.
- Whether Faro chunks load at boot.
- Whether the Clerk "~370 KB" figure in `frontend/CLAUDE.md` is raw size. The jsDelivr check suggests it is, but the version differs from the pinned one.
- Any comparison number for well-regarded Svelte apps from a primary source. None was found.
- Production Brotli sizes. All gzip figures are local or Vite's gzip, not what a CDN serves.
- Real-network LCP and TBT effects of any option above. Those need the browser measurements from the issue and #779, which this spike did not run.

## 9. Next step

1. Add `rollup-plugin-visualizer` (or equivalent) to the monthly routine's bundle step, as the issue proposes, and record the per-package split here.
2. Measure the payloads of two or three public Svelte apps with the same Lighthouse setup, and record the method alongside the numbers.
3. Owner decides option 1 after the signed-in measurement from #779.
4. Add an initial-load gzip ceiling and an AG Grid and Tiptap lazy-chunk ceiling to the monthly routine.

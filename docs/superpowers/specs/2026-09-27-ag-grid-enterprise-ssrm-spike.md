# Spike: AG Grid Enterprise Server-Side Row Model (SSRM) for ActivityTable

**Status:** Not started — pre-planning spike doc only. This is **not** a superpowers plan (no `executing-plans` sub-skill header, no checkbox task list meant for autonomous execution). It exists to be linked from `.planning/ROADMAP.md` so the idea and its context aren't lost, and to give whoever picks this up (human or a future planning session) enough to write a real plan without re-deriving it.

**⚠️ Written without superpowers loaded** — no `superpowers:*` skill was available in this session (plugin not connected/loaded in this Claude Code cloud environment). A superpowers-enabled session should review this via `writing-plans` (or its brainstorming/spec-writing counterparts) before treating it as vetted, and before turning it into an actual execution plan.

**Roadmap link:** `.planning/ROADMAP.md` → Phase 14.1 (inserted after Phase 14: AG Grid Power Features).

**Origin:** Conversation on 2026-09-27 (Claude Code cloud session) that started as a licensing/cost question about AG Grid Enterprise and AdapTable, and turned into "where would Enterprise actually help this codebase, and what would a spike to find out look like." Full transcript of that conversation is reproduced verbatim in the Appendix below, per request.

---

## 1. Why this spike exists

`FEATURE_BACKLOG.md` (as of this writing) lists three related, still-open gaps in `ActivityTable.svelte`, all stemming from the same root cause — **AG Grid Community's client-side row model only operates on the page of rows currently loaded**, while the backend already paginates with `limit`/`offset`:

1. **"Server-Side Sorting and Filtering for Activity Table"** — sort/filter only affects the visible page, not the full dataset, because `onSortChanged`/`onFilterChanged` aren't wired to re-fetch with server parameters.
2. Sort events don't reliably trigger a server re-fetch even where partial wiring exists (a "wire this up" gap tracked in the backlog's Phase 18 write-up).
3. `ListContent` fetches `first: 100` while the grid only shows 10 rows/page — fetch size isn't tied to page size, and total count isn't exposed to the grid.

Phase 18 (`Server-Side Pagination & Filtering with Data Mode Toggle`, already planned/executed per `.planning/phases/18-server-side-pagination-filtering-with-data-mode-toggle/`) solved this **without** AG Grid Enterprise, by hand-rolling a "Data Mode" toggle (`All Items` vs `Loaded X Items`) with `gridUrlState.ts` managing sort/filter/page state in the URL and calling the GraphQL `contents` query directly. That's shipped and works.

**What this spike is for:** AG Grid Enterprise's **Server-Side Row Model (SSRM)** is the vendor-native version of exactly that problem — a single `IServerSideDatasource.getRows(params)` callback that AG Grid calls with the current sort model, filter model, and row block range, and you return `{ rowData, rowCount }`. If it can replace the hand-rolled `gridUrlState.ts` + Data Mode toggle machinery with less custom code and more robustness (infinite scroll, block loading, automatic re-fetch on sort/filter/group changes), it may be worth the license cost. If it can't cleanly slot in given the existing GraphQL shape and Svelte 5 wrapper, better to find that out in a 1-2 day spike than mid-migration.

This is explicitly a **cost/benefit spike**, not a commitment to buy Enterprise. Exit criteria below produce a go/no-go, not an assumption of "go."

---

## 2. Current architecture (what SSRM would sit on top of / replace)

- `frontend/src/lib/components/ActivityTable.svelte` — ~1,200 lines. Uses `ag-grid-svelte5` (third-party Svelte 5 wrapper, `^1.0.3`) wrapping `@ag-grid-community/client-side-row-model`, `@ag-grid-community/core`, `@ag-grid-community/theming`, all pinned at **v32.3.9** (pre-v33 modular package structure).
- Data mode toggle (`DataModeToggle.svelte`) switches between:
  - **"Loaded Items"** (default): client-side sort/filter/search over the currently-fetched page.
  - **"All Items"**: server-side sort/filter via `sortsToGraphQL` / filter-to-GraphQL conversion, hitting the `contents` GraphQL query with `orderBy`/`filter` args, re-fetched via `@tanstack/svelte-query`.
- `frontend/src/lib/utils/gridUrlState.ts` — hand-written URL state serialization: `GridParams`, `DataMode`, `SortSpec`, converters `sortsToGraphQL`, `filterToUrlParams`, `filtersEqual`.
- `ColumnPickerDialog.svelte` / `SortPickerDialog.svelte` — custom UI replacing what AG Grid's own Columns Tool Panel and multi-sort UI would otherwise provide (both are Community-available for basic use, but the polished tool-panel UX is an Enterprise feature).
- No grouping, no master/detail, no server-side infinite scroll today — perspectives are shown via a popover (`CellPopover.svelte`) triggered from a cell, not nested rows.

## 3. What SSRM would need, concretely

1. **Package/version work first.** v32.3.9's modular `@ag-grid-community/*` packages are pre-v33 packaging. AG Grid v33+ collapses Community into a single `ag-grid-community` package and Enterprise into `ag-grid-enterprise`, registered via `ModuleRegistry`. Confirm `ag-grid-svelte5` (`^1.0.3`) supports whatever version we'd land on — it's a small third-party wrapper, not an official AG Grid Svelte binding, so this is the single biggest unknown and should be checked **before** spending a licensing dollar.
2. **A `getRows(params)` datasource** that:
   - Reads `params.request.startRow`/`endRow`, `sortModel`, `filterModel`, `groupKeys`.
   - Maps `sortModel` → the existing `sortsToGraphQL` shape (or a variant of it) → `contents(orderBy: ...)`.
   - Maps `filterModel` → the existing filter-to-GraphQL conversion → `contents(filter: ...)`.
   - Calls `graphqlRequest` directly (bypassing `@tanstack/svelte-query`'s `createQuery` — SSRM manages its own request lifecycle, so the existing TanStack Query caching layer for this one query would be sidelined; other queries on the page are unaffected).
   - Returns `params.success({ rowData, rowCount })` (rowCount from the backend's total-count field, if `contents` exposes one — verify).
3. **Backend readiness check:** does `contents` already expose a total count alongside `first`/`offset`? If not, that's a backend change needed regardless of SSRM, and one Phase 18 may have already solved for "All Items" mode — confirm before assuming new backend work.
4. **Decide what happens to "Loaded Items" mode.** SSRM effectively **is** the server-side mode; the client-side "Loaded Items" toggle would either be dropped (simplifying the UI, but a UX regression if anyone relies on pure-offline/no-refetch browsing of an already-loaded page) or kept as a second, separate `ClientSideRowModel` grid instance — messier, probably not worth it.
5. **License key wiring:** `LicenseManager.setLicenseKey(...)` at app bootstrap (see open question in main chat about contributor/dev-seat access — Section 5 below).

## 4. Where else Enterprise licensing would pay for itself (secondary candidates, not part of this spike's exit criteria but worth having someone's eyes on later)

- **Columns Tool Panel** — could replace `ColumnPickerDialog.svelte` (currently session-only state) with the built-in panel, which also supports the multi-sort UI `SortPickerDialog.svelte` reimplements by hand.
- **Set Filter** — for Category / content-type / channel columns, replacing custom filter UI in `FilterChips.svelte`.
- **Master/Detail** — nesting perspectives under a content row is the actual domain relationship (`Content` has many `Perspective`s); this is arguably a better long-term home for what `CellPopover.svelte` / `ActivityDetailsModal.svelte` do today than a popover is.
- **Row grouping + aggregation** — group by category/channel with counts (Phase 13, Content Categories, is a prerequisite here).
- **Excel export / clipboard** — mentioned in original Phase 14 backlog text ("Advanced table features, column grouping, export") but Phase 14 was ultimately implemented Community-only (`GridToolbar.svelte` + `gridStateManager.ts`, per `.planning/phases/14-ag-grid-power-features/14-CONTEXT.md`) — Enterprise export/grouping was consciously deferred, not forgotten.
- **Integrated Charts** — only relevant if the Grid+Charts bundle is purchased; a possible fit for future perspective analytics, out of scope here.

None of these are SSRM-dependent — they could be adopted independently, at a lower cost. They're listed here so a future decision-maker sees the fuller shape of "what does $999/dev buy us" without re-doing that research.

## 5. Licensing facts pinned down during this conversation (see Appendix for full detail/sourcing)

- **AG Grid Enterprise:** $999/developer, list price. Grid+Charts bundle: $1,498/developer. **Perpetual by default** if the quote says so (confirm explicitly when requesting a quote — the EULA allows either perpetual or subscription per-quote, and a subscription requires deleting the software on non-renewal). The "1 year" in the price is 1 year of updates/support only; after that, on a perpetual license, you keep using whatever version you're on, indefinitely, with no further payment, but stop getting new versions/support unless you renew. Renewal pricing isn't published; EULA caps annual fee increases at 5% + CPI.
- **Deployment license** (separate, required because Perspectize is customer-facing/SaaS): capped by whatever the quote specifies (e.g. number of production environments) — get this itemized in the same quote, and clarify how staging vs. production environments are counted for a Sevalla-hosted app.
- **No published startup / revenue-share / profit-participation program** from AG Grid. AdapTable (separate product, an AG Grid extension/companion, not required to use AG Grid Enterprise) does list a "Startup" licence tier by name but doesn't publish its terms — would need to ask `sales@adaptabletools.com` directly if a revenue-linked deal is wanted.
- **Contributor / no-license-key behavior (this was a direct question in the conversation):** AG Grid Enterprise doesn't gate at build/compile time or prevent the app from loading. Without a valid license key, Enterprise modules still load; Enterprise-only features render with a **watermark** and a console warning, and can partially/fully stop functioning after a grace period. Community features (current app behavior) are entirely unaffected — no key needed for those at all. So: a contributor without a key can still clone, install, and run the app; only whichever specific Enterprise feature the app has adopted (post-SSRM-adoption, that would be the activity table) would show degraded/watermarked behavior for them locally. Practical implication: either issue trial/dev-seat keys to anyone touching grid code, or accept watermarked local dev screens for unlicensed contributors (never ship a screenshot/demo from an unlicensed environment). Per-developer license counting technically expects anyone working with the Enterprise source to be licensed regardless of whether their personal environment has a key entered — stricter than what's technically enforced, so this is a policy question for whoever owns the AG Grid contract if the repo gains outside contributors.

## 6. Spike scope (what to actually go build, if/when picked up)

**Timebox: 1–2 days.** Branch off a throwaway spike branch, not `main` — this is exploratory, not a plan to merge.

1. Register for AG Grid's 30-day Enterprise trial (no watermark, full features).
2. On the spike branch, resolve the version question first (Section 3.1) — try dropping in `ag-grid-enterprise` alongside current `@ag-grid-community/*` v32.3.9, or upgrade to v33+ if the Svelte wrapper requires it. This alone may kill the spike early if `ag-grid-svelte5` can't cope — that's a valid, useful spike outcome.
3. Implement a minimal `IServerSideDatasource` against the existing `contents` GraphQL query, wired into a **copy** of `ActivityTable.svelte` (don't touch the real component yet).
4. Verify: sort, single-column filter, and scroll-driven block loading all correctly hit the backend and return correct rows, without duplicating what `gridUrlState.ts` already does for URL shareability (does SSRM's internal state model compose with URL-driven restore, or fight it?).
5. Rough out how much of `gridUrlState.ts`, `DataModeToggle.svelte`, `sortsToGraphQL`, and the filter-conversion utilities could be deleted vs. kept.

### Exit criteria (go/no-go)

- **Go** if: the Svelte wrapper (or a version bump) supports SSRM cleanly, the datasource maps onto the existing `contents` query with no backend changes beyond exposing total row count (if not already exposed), and the resulting code is materially smaller/simpler than the current Data Mode toggle + `gridUrlState.ts` combination.
- **No-go / defer** if: the Svelte wrapper can't support SSRM without a rewrite of the wrapper itself, or v33+ migration drags in unrelated breakage, or the URL-shareability requirement (Phase 18 success criterion: "Sharing a URL with params restores the exact view") can't be preserved cleanly under SSRM's request/response model.
- Either outcome: write up findings back into this doc (append a "Spike Results" section) and update the ROADMAP checkbox accordingly, rather than leaving this file to silently rot.

---

## Appendix: Full conversation transcript (verbatim outputs, summarized user inputs)

*Reproduced per explicit request, so this doc stands alone as the record of how the spike idea originated, without needing to dig up the original chat session.*

### Turn 1 — User asked (summarized)
What cost options exist for AG Grid Enterprise and AdapTable (e.g. profit participation?), and from a code perspective, where would they help current and likely future concerns in this codebase?

### Turn 1 — Assistant response (verbatim)

> ## Short answer
>
> Neither vendor publishes a profit-participation or revenue-share licence. What each does offer:
>
> | | **AG Grid Enterprise** | **AdapTable** |
> |---|---|---|
> | Model | Per developer, perpetual, includes 1 year of updates | Annual, per application. The price doesn't change with the number of developers or users |
> | List price | Grid $999/dev. Grid + Charts bundle $1,498/dev | Not published. You have to ask sales@adaptabletools.com |
> | Customer-facing SaaS | You also need a **deployment licence** for a customer-facing app, which Perspectize is | AdapTable licence doesn't include AG Grid. You buy that separately |
> | Startup or special deals | No published startup programme. Volume discounts only | There is a **Startup licence** ("for start-ups and young businesses on their path to growth"). The terms aren't published, so this is where to ask about deferred or revenue-linked pricing |
> | Trial | 30 days, full features, no watermark | Free trial, plus PoC and Integration licences |
>
> If you want something like profit participation, the realistic route is AdapTable's Startup licence, and you'd have to ask them directly. For AG Grid, the thing to pin down with sales is the deployment licence for a public SaaS: is it one per production environment, and does it cover staging? Also worth knowing: the "subscription" figures ($995–$1,995/dev/yr) come from third-party sites (Vendr, SpendHound), not from AG Grid's own pricing page.
>
> ## Where it would help in this codebase
>
> What you have now: `@ag-grid-community/*` **v32.3.9** (the old modular packages) and the third-party `ag-grid-svelte5` wrapper. `src/lib/components/ActivityTable.svelte` is about 1,200 lines, and a lot of it rebuilds things Enterprise already ships.
>
> **AG Grid Enterprise: good fit, mostly for things you've already hit**
> 1. **Server-Side Row Model (Enterprise-only).** This is the main one. `FEATURE_BACKLOG.md` lists three related items: sort/filter only covering the visible page, sort events not reliably triggering a re-fetch, and the `first: 100` fetch not being tied to page size. You've partly worked around these with `sortsToGraphQL` and `gridUrlState`. SSRM gives you a single `getRows(request)` datasource that maps straight onto your GraphQL `contents` query, including sort model, filter model, block loading and infinite scroll.
> 2. **Columns Tool Panel** could replace `ColumnPickerDialog.svelte` (session-only today), and the built-in multi-sort UI would cover most of `SortPickerDialog.svelte`.
> 3. **Set Filter** for Category, content type and channel. `FilterChips.svelte` could read and write its filter model.
> 4. **Master/Detail** would show perspectives nested under each content row. That's the core domain relationship, and it could replace some of `ActivityDetailsModal`.
> 5. **Row grouping and aggregation** (group by category or channel, with counts), **Excel export**, **clipboard**, and the **Rich Select editor** (a possible replacement for `CategoryTypeahead` inside cells).
> 6. **Integrated Charts** if you buy the bundle. Useful later for perspective analytics.
>
> **AdapTable: weaker fit right now**
> - **What it does well:** saved named **Layouts** (column, sort, filter and grouping state), which could persist per user through your GraphQL backend instead of session or URL state. Also an expression query language, calculated and formatted columns, alerts, and shareable team state. "Share a saved view of content plus perspectives" fits the product's direction.
> - **Why it doesn't fit yet:**
>   - **No Svelte wrapper.** AdapTable supports vanilla JS, React, Angular and Vue, and it wants to create and own the grid instance. That clashes with `ag-grid-svelte5`, so you'd probably drop the wrapper and mount everything through vanilla `Adaptable.init()`.
>   - **You'd need an AG Grid upgrade first.** Current AdapTable releases target newer AG Grid versions than 32.3.9. I'm inferring that; check it against their compatibility matrix. Separately, AG Grid v33+ moves you onto the single `ag-grid-enterprise` package, so migrate off the modular imports at the same time.
>   - **Its UI would clash with your Figma design system**, and it duplicates work you've already built: the pickers, `FilterChips` and URL state.
>   - **It's aimed at internal power users** (finance and ops dashboards), not a consumer-facing app.
>
> ## Recommendation
> 1. **Now:** stay on Community. The open backlog items can be done with Community plus your server-side GraphQL sorting.
> 2. **When you're ready for real pagination, grouping, or perspectives nested under content:** buy AG Grid Enterprise. It's a one-off $999/dev plus the deployment licence, and SSRM and Master/Detail alone would remove a lot of custom code. Use the 30-day trial to spike SSRM against `contents` first.
> 3. **AdapTable:** revisit only if saved, shareable, per-user views become a product feature. When you do, ask them about the Startup licence and whether they'd link pricing to revenue.
>
> I haven't changed any code. If you want, I can write up the SSRM + Enterprise migration spike as a superpowers plan.
>
> Sources:
> - [AG Grid: Licence and Pricing](https://www.ag-grid.com/license-pricing/)
> - [AG Grid Enterprise – License Purchase](https://www.ag-grid.com/ecommerce/)
> - [AG Grid Community vs. Enterprise](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/)
> - [AG Grid Enterprise License Cost 2026 (Simple Table)](https://www.simple-table.com/blog/ag-grid-pricing-license-breakdown-2026)
> - [Vendr – AG Grid pricing](https://www.vendr.com/marketplace/ag-grid)
> - [SpendHound – AG Grid pricing](https://www.spendhound.com/marketplace/ag-grid-pricing)
> - [AdapTable for AG Grid Licences](https://www.adaptabletools.com/buy/buying-adaptable-licensing)
> - [AdapTable – Buy](https://www.adaptabletools.com/buy)
> - [AdapTable for AG Grid](https://www.adaptabletools.com/)

### Turn 2 — User asked (verbatim)
> Per year? ….When you're ready for real pagination, grouping, or perspectives nested under content: buy AG Grid Enterprise. It's a one-off $999/dev plus the deployment licence, and SSRM and Master/Detail alone would remove a lot of custom code. Use the 30-day trial to spike SSRM against contents first…. Or lifetime?

### Turn 2 — Assistant response (verbatim)

> **It's a lifetime (perpetual) licence, not a yearly fee.** That's the default on the $999/dev list price. The "1 year" part only covers updates and support:
>
> - **Year 1:** you get every new AG Grid release and vendor support.
> - **After year 1, if you don't renew:** you can keep using and shipping the versions released during your paid year indefinitely. You just stop getting newer versions and support.
> - **Renewing:** this buys another year of updates. The EULA doesn't publish a renewal price. It only says fees are "subject to annual review", with increases capped at 5% plus CPI.
>
> Two things to check before you buy:
>
> 1. **The quote decides it, not the website.** The EULA says each quote sets whether the licence is perpetual or a subscription. If you choose a subscription and later cancel, you have to stop using the software and delete it. So ask for a perpetual quote.
> 2. **The deployment licence is quoted separately.** It's capped by whatever the quote specifies, such as the number of customers or production environments, and you must buy more before you go over that. Ask sales how they count staging versus production on Sevalla.
>
> **What this means for Perspectize:** if you bought Enterprise now on v33/v34, you could stay on that version forever for a one-off cost. You'd only pay again if you want later AG Grid upgrades, for example to keep `ag-grid-svelte5` or a future Svelte version compatible.
>
> **AdapTable works differently:** it is a genuinely annual, per-application subscription. Stop paying and you lose the right to use it.
>
> Sources:
> - [AG Grid Enterprise EULA](https://www.ag-grid.com/eula/AG-Grid-Enterprise-License-Latest.html)
> - [AG Grid: Licence and Pricing](https://www.ag-grid.com/license-pricing/)
> - [AdapTable – Buy](https://www.adaptabletools.com/buy)

### Turn 3 — User asked (verbatim)
> write up the SSRM spike plan, also copy every word of your output and summaries of my input into this… I want this linked to roadmap… but not full superpowers plan yet…. If I added contributors to app… would they just not be able to develop enterprise features, or would the project not even be able to load for them?

*(Note: the assistant's first attempt at responding to this turn was interrupted by a safety classifier mid-response before any file was written or pushed — nothing from that interrupted attempt was produced or is reflected anywhere in this repo. The response below is the completed, re-done answer.)*

### Turn 3 — Assistant response (this document + inline chat reply, verbatim as produced)

Inline chat reply on the contributor question:

> **They'd just not have the enterprise features — the project still loads fine.** AG Grid (and AdapTable) enforce license keys at the JS module level, not at build/compile time:
>
> - No license key set → AG Grid Enterprise modules **still load and render**, but each Enterprise feature (Server-Side Row Model, Master/Detail, Row Grouping, etc.) shows a **watermark** and a **console warning**, and after a grace period some Enterprise features stop functioning or show "no license" banners in the grid itself. Community features (what you use today: client-side row model, basic sort/filter, theming) are completely unaffected — no key needed at all.
> - This means: a contributor without a license key can `pnpm install`, run the dev server, and the app boots. If you've adopted an Enterprise feature (say SSRM for the activity table), *that specific feature* degrades — watermarked or partially broken — but nothing else breaks and there's no hard crash.
> - The license key is typically set via an env var or a call like `LicenseManager.setLicenseKey(...)` early in app bootstrap. If you want contributors to have a working dev experience, you'd give them a **trial key** (30-day) or a **dev/internal seat** under your paid license, not withhold it entirely.
> - **AdapTable works the same way** — no key means a watermark/nag banner in the AdapTable toolbar, not a load failure.
>
> So: budget for either (a) enough license seats to cover every contributor who touches grid code, or (b) accept that contributor branches touching Enterprise features will show watermarks locally until they get a key, which is fine for local dev but means you shouldn't ship a screenshot/demo with a missing key.
>
> One nuance worth flagging: **per-developer licensing** technically means anyone who has the Enterprise source in their editor/repo and works with it is supposed to be licensed, regardless of whether their personal build has a key entered — so "contributors without a key just get watermarks" is the practical/technical behavior, but the EULA's seat-counting is stricter than the technical enforcement. Worth a sentence to whoever owns the AG Grid contract if you open this repo to outside contributors.

The SSRM spike write-up is the rest of this document (Sections 1–6 above).

---

*End of appendix. This file will be updated in place with a "Spike Results" section if/when the spike is actually run.*

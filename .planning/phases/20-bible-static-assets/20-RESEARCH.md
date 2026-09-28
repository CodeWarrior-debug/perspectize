# Phases 20–24: Local-First Data Strategy - Research

**Researched:** 2026-09-26
**Domain:** Client-side data locality: static reference assets, query-cache persistence, TanStack DB, sync engines, local Postgres (PGlite), desktop shells
**Confidence:** HIGH (static assets, query persistence), MEDIUM (TanStack DB on Svelte), MEDIUM (Electric/PGlite), LOW (desktop/Tauri need)

---

## Summary

The goal is to answer "can user data and the Bible tables run on the user's machine to improve performance and save hosting $?" and rank the options by value for money.

**Where the money goes.** Perspectize runs on flat-tier hosting (Sevalla app + static site + Postgres, with a Neon migration planned). Moving reads to the client does **not** reduce a flat bill. It only delays the next tier upgrade, or reduces compute-seconds on a scale-to-zero DB like Neon. So the near-term win is **UX** (instant reads, offline tolerance, no spinners). Cost savings are a scaling hedge, and we will **measure** them rather than assume them (see Phase 20's plan).

**Two kinds of data, two strategies:**

| Data | Mutates? | Needs sync? | Strategy | Phase |
|---|---|---|---|---|
| Bible verse text (`bible_verse_text`, BSB) | Never (versioned) | **No** | Static, content-hashed asset per book | 20 |
| Interlinear (`bible_word`, `bible_lexicon`) | Never (manifest-versioned) | **No** | Static asset per book, loaded lazily | 20 (plan 02) |
| Book structure (`bible_book`) | Never | No | **Already shipped** as `frontend/src/lib/data/bible-books.json` | — |
| User perspectives / content adds | Yes, per user | Yes (writes go to the server) | Query persistence → TanStack DB → (maybe) sync engine | 21–23 |

**Key insight:** immutable reference data never needs a sync engine. It only needs to be downloaded once and cached. That's the cheapest, lowest-risk and highest-value move, so it goes first.

**Primary recommendation:** Do Phase 20 now, Phase 21 alongside it, and Phase 22 as a one-entity pilot. Phases 23–24 are **gated**: don't start them until evidence exists (offline requests, real-time collaboration, or measured growth in read-driven cost).

---

## Measured facts (this repo, 2026-09-26)

| Fact | Value | Source |
|---|---|---|
| BSB verse text, raw | 4.06 MB, 31,102 verses | `data/bible/bsb.tsv` |
| BSB verse text, gzip -9, one file | 1.30 MB | `gzip -9` |
| Split per book as compact JSON, gzip | 66 chunks, **1.37 MB total** | script in the Phase 20 plan |
| Per-book chunk, median | **11 KB** gz (Zechariah) | same |
| Per-book chunk, max | **79 KB** gz (Psalms, 237 KB raw) | same |
| Per-book chunk, min | 0.8 KB gz (2 John) | same |
| Interlinear word rows | 442,312 (`bible_word`) + 22,717 lexicon | `data/bible/sources.json` |
| Current client caching | `staleTime: Infinity` on passage/interlinear queries | `PassageText.svelte`, `OriginalLanguage.svelte` |
| Current API cap | 2,500 verses per `passageText` call | `MaxPassageTextVerses` |
| Existing perf telemetry | gqlgen op timing (slog), HTTP timing middleware, web-vitals | Phase 7.4 |

**Implication:** today each passage costs one GraphQL round-trip + Postgres query **per session** (the in-memory cache is lost on reload). A median book chunk is smaller than many single images, and once fetched it's served from the browser's HTTP cache, with zero origin or DB load, for as long as the content hash is unchanged.

---

## TanStack DB: Svelte adapter status (the "lag" check)

| Package | Latest version | Published |
|---|---|---|
| `@tanstack/react-db` | 0.1.95 | ~2026-09-21 |
| `@tanstack/svelte-db` | 0.1.63 | ~2026-09-22 |

**Findings:**
- **Both are pre-1.0 (0.1.x).** TanStack DB as a whole is still beta, so expect API churn whichever framework you use.
- **The Svelte adapter trails React by about 32 releases.** It's actively maintained (published within the same week as React), but React gets features first.
- **Svelte 5 native.** `useLiveQuery` returns reactive getters built on runes. You read `query.data` / `query.isLoading` directly with no `$` prefix, which matches this repo's TanStack Query convention.
- **Documented Svelte exports:** `useLiveQuery`, `useLiveInfiniteQuery`, `DbClient`/`DbProvider`. Recent releases moved all five framework adapters onto a shared internal live-query observer, which narrows how far each adapter can drift behaviourally.
- **Not confirmed on Svelte** (docs don't mention them either way): suspense-style hooks and newer mutation helpers that appear in the React docs. **Before Phase 22 starts, check that every API the pilot needs exists in `@tanstack/svelte-db`.**
- The core (`@tanstack/db`, collections, `queryCollectionOptions`, Electric collection) is framework-agnostic. Only the binding layer lags, so a missing Svelte hook can usually be replaced with a thin wrapper around `collection.subscribeChanges` inside a `.svelte.ts` module.

**Verdict:** usable for a **pilot** on one entity (Phase 22) with a pinned version. Don't make it the foundation for all data until both the core and the Svelte adapter reach 1.0.

Sources: [TanStack DB Svelte adapter docs](https://tanstack.com/db/latest/docs/framework/svelte/overview), [@tanstack/svelte-db on npm](https://www.npmjs.com/package/@tanstack/svelte-db), [@tanstack/react-db on npm](https://www.npmjs.com/package/@tanstack/react-db), [svelte-db 0.2.0 release notes](https://newreleases.io/project/github/TanStack/db/release/@tanstack/svelte-db@0.2.0), [TanStack/db releases](https://github.com/TanStack/db/releases)

---

## Options ranked by value for money

### Tier 1: Static, versioned Bible assets (Phase 20). HIGHEST value.
- Build one JSON chunk per book at build time from `data/bible/bsb.tsv`. Import it through Vite's `import.meta.glob` so each chunk lands in `_app/immutable/` with a content hash.
- Why Vite and not `static/`: `static/_headers` has a catch-all `/*` `no-cache` rule that Cloudflare **merges** into any overlapping path (see `frontend/CLAUDE.md`). Chunks in `_app/immutable/` get the year-long immutable rule. A new file under `static/bible/` would get forced revalidation.
- Keep the GraphQL `passageText` resolver as a fallback for chunk-load failures and for server-side consumers.
- Effort: 2–3 days including measurement. Risk: very low. No infrastructure change.

### Tier 2: Persist the TanStack Query cache + optimistic mutations (Phase 21)
- `@tanstack/svelte-query-persist-client` with an IndexedDB persister, so reloads show the last known data instantly and revalidate in the background.
- Optimistic updates on the most-used mutations: create/update perspective, add content.
- Watch the per-user boundary: with Clerk, **clear the persisted cache on sign-out or user switch**. Never persist another user's private perspectives (see the perspective-privacy spec).
- Effort: 1–2 days. Covers roughly 60–70% of the "feels local" effect.

### Tier 3: TanStack DB pilot on existing GraphQL (Phase 22)
- `queryCollectionOptions` over the existing `graphqlRequest` fetchers, so the backend doesn't change.
- Adds: client-side live queries and joins across collections; consistent optimistic writes across every view; less manual `invalidateQueries` code.
- Does **not** add: offline writes, conflict merging, or less server traffic than Tier 2.
- Pilot entity: **perspectives** (they show up in the Activity grid, the details modal and the compare page, which is where cross-view consistency pays off).
- Exit criteria: adopt more widely only if the pilot deletes net code or invalidation bugs. Otherwise revert.

### Tier 4: Sync engine: ElectricSQL + TanStack DB Electric collection (Phase 23). GATED.
- Electric streams Postgres logical replication to clients as "shapes" (subsets of rows). Writes still go through Go/GraphQL.
- Costs: an extra service to host; `wal_level=logical` on Postgres (check support on Sevalla/Neon); an auth proxy that validates Clerk JWTs and scopes each shape to the user; more operational load.
- Only worth it for real-time collaboration or measured read-driven cost.

### Tier 5: Full local database / desktop (Phase 24). GATED.
- **PGlite** (Postgres compiled to WASM, ~3 MB gz): the best "local Postgres". Runs in the browser, Node or a Tauri webview; persists to IndexedDB or OPFS (the browser's private file storage); supports pgvector; pairs with Electric. Single user, single connection.
- **Embedded Postgres binaries** (`postgresql_embedded`, `embedded-postgres`): real Postgres, 30–100 MB, awkward on end-user machines. Not recommended.
- **Docker Postgres:** dev-only. Separately worth doing, since dev currently points at the shared Sevalla DB.
- **SQLite-WASM:** lighter and more mature client-side, but loses SQL-dialect parity with the server.
- **Desktop shell:** Tauri (small, Rust) or Electron (mature). Capacitor/PWA were already assessed for mobile in Phase 16. A desktop shell adds nothing for performance over a PWA with Phases 20–22. Justify it only on distribution or OS-integration grounds.

---

## Common pitfalls

- **Sync engine for immutable data.** Don't. Version it and cache it.
- **Persisting the query cache across users.** With a shared browser and Clerk sign-out, the cache must be keyed by user ID and wiped on sign-out.
- **Licensing.** BSB text is public domain. STEPBible glosses are CC BY 4.0, so the attribution must stay visible wherever the interlinear data is rendered from local assets (same as today).
- **Browser storage eviction.** IndexedDB/OPFS can be evicted under storage pressure. Call `navigator.storage.persist()` only if Tier 5 happens, and always keep a network fallback.
- **Claiming savings without a baseline.** Phase 20's plan captures the baseline *before* changing behaviour.

## Open questions
1. Is the Neon migration going ahead? Neon's compute-seconds billing is where fewer DB reads actually turn into money; Sevalla's flat tier isn't.
2. Should `passageText` stay public for third-party/server consumers once the web client no longer uses it? Current recommendation: yes, keep it as the fallback.

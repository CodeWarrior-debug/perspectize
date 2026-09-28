# Bible Static Assets (Phase 20-01): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve Bible verse text from content-hashed per-book static chunks, built at build time from `data/bible/bsb.tsv`, instead of a `passageText` GraphQL round-trip plus a Postgres query. Measure latency, API/DB load and hosting cost **before and after** using the same instrumentation.

**Architecture:**
- A build script writes one compact JSON file per book (66 files) into `frontend/src/lib/data/bible/bsb/`, which is gitignored.
- `import.meta.glob` makes Vite emit each file as a lazily loaded, content-hashed chunk under `_app/immutable/`. That path already gets `Cache-Control: immutable` from `static/_headers`, so the chunks don't hit the catch-all `no-cache` rule a new `static/` path would.
- A loader (`bibleText.ts`) turns a verse-ordinal range into the same shape `PassageText.svelte` already consumes, and falls back to the GraphQL `passageText` query if a chunk fails to load.
- The backend is unchanged. No migration.

**Tech stack:** SvelteKit (adapter-static), Svelte 5 runes, TanStack Svelte Query, Vite `import.meta.glob`, Vitest, Node script run with `tsx`. Existing telemetry: `frontend/src/lib/vitals.ts` (web-vitals) and the Phase 7.4 gqlgen operation-timing slog lines.

**Research / roadmap:** `.planning/phases/20-bible-static-assets/20-RESEARCH.md`; `.planning/ROADMAP.md` → Phase 20.

## Measured inputs (2026-09-26)

| | Value |
|---|---|
| `bsb.tsv` | 4.06 MB raw, 31,102 verses |
| All books as compact JSON, gzip | 1.37 MB total |
| Per-book chunk, gzip | median 11 KB (Zechariah), max 79 KB (Psalms), min 0.8 KB (2 John) |
| Current client cache | `staleTime: Infinity`, but in memory only, so lost on every reload |
| Current server path | `passageText` → `ContentService` → `bible_verse_text` (cap of 2,500 verses) |

## Global constraints

- **No chained bash commands (`&&`)**: one command per Bash call (repo rule).
- **No backend or schema change and no migration.** `passageText` stays as the fallback and for any non-web consumer.
- **The copyright string must stay identical** to `domain.BibleTranslationBSBCopyright` (`"Berean Standard Bible, public domain (CC0)"`). A test enforces this against the Go source, following the existing `books.json` parity-test pattern.
- **Don't add a new `static/_headers` rule.** Chunks must go through Vite so they land in `_app/immutable/` (see `frontend/CLAUDE.md` → "`_headers` block overlap MERGES").
- **Build-context risk:** the Sevalla static-site build must be able to read `../data/bible/bsb.tsv` from `frontend/`. Task 2 verifies this first. If it can't, commit the generated chunks instead (≈4.3 MB raw) and drop the `prebuild` hook.
- **The baseline must be captured before the behaviour changes.** Task 1 ships alone and collects data for ≥ 7 days before Task 4 merges.
- UI checks need a browser, which is local only (`CLAUDE.md` → Self-Verification). Cloud sessions run the headless checklist and hand the lab benchmark (Task 1, Step 4) back to a local session.

**Branch:** `feature/bible-static-assets` (from updated `main`). Split into two PRs: **PR 1** = Task 1 (instrumentation only); **PR 2** = Tasks 2–5.

---

## Task 1: Instrumentation and baseline (PR 1, ship first)

**Files:**
- Create: `frontend/src/lib/utils/passagePerf.ts`
- Create: `frontend/tests/unit/utils/passagePerf.test.ts`
- Modify: `frontend/src/lib/components/PassageText.svelte`
- Modify: `frontend/src/lib/vitals.ts` (report the new measure through the same sink as web-vitals)
- Create: `frontend/tests/perf/passage-render.bench.ts` (Playwright lab script; local only)

**Interfaces:**
- `startPassageTimer(startId, endId): () => void`: calls `performance.mark('passage:start:<s>-<e>')`. The returned function calls `performance.measure('passage-render', …)` and reports `{ name: 'passage-render', value: ms, source, verses }`.
- `source`: `'network'` (GraphQL), `'chunk'` (static chunk, first load), `'memory'` (TanStack cache hit), or `'fallback'` (chunk failed, so GraphQL). Before Phase 20 only `network` and `memory` occur.

- [ ] **Step 1:** Write a failing test: the timer reports exactly one measure, with the right `source` and verse count, and a second call is a no-op.
- [ ] **Step 2:** Implement `passagePerf.ts`. In `PassageText.svelte`, start the timer when the query becomes enabled and stop it the first time `query.data` is set. Set `source` from `query.isFetchedAfterMount` (`network`, otherwise `memory`).
- [ ] **Step 3:** Route the report through `vitals.ts` so it goes wherever LCP/INP go today. If that's console only, also append it to `window.__perf` so the lab script can read it.
- [ ] **Step 4 (lab, local only):** In `passage-render.bench.ts`, open a public passage in the Activity details modal under these conditions:
  - **cold** (fresh browser context), **reload** (same context, page reloaded) and **warm** (open, close, reopen);
  - network unthrottled and throttled to "Fast 4G" (CDP `Network.emulateNetworkConditions`);
  - three passages: John 3:16 (1 verse), Romans 8 (39), Psalm 119 (176, above `HARD_CAP`, so it tests the no-fetch path).

  Run 20 times per cell and record p50/p95 of `passage-render`, plus the bytes transferred for Bible requests.
- [ ] **Step 5:** Verify: `pnpm run test:run` and `pnpm run check` in `frontend/`. Open PR 1 (chore template) and merge.
- [ ] **Step 6 (baseline, 7 days after deploy):** Record these in `.planning/phases/20-bible-static-assets/20-01-BASELINE.md`:
  - **API load:** from Sevalla app logs (use the `sevalla-mcp-ops` agent), the count, p50/p95 `duration_ms` and response bytes of the gqlgen operations `PassageText` and `PassageInterlinear`, and their share of all GraphQL operations.
  - **DB load:** `pg_stat_statements` calls and total time for the `bible_verse_text` select, if the extension is available. Read-only query, no migration.
  - **Field latency:** p50/p95 of `passage-render` split by `source`, from the vitals sink.
  - **Lab latency:** the Step 4 table.
  - **Cost:** the current monthly Sevalla bill split into app, static site, DB and bandwidth; app CPU/RAM utilisation; DB plan. If the Neon migration has landed, also DB compute-hours and the share of active time attributable to Bible queries.

## Task 2: Chunk build script

**Files:**
- Create: `frontend/scripts/build-bible-chunks.ts`
- Create: `frontend/tests/unit/data/bibleChunks.test.ts`
- Modify: `frontend/package.json`: add `"bible:chunks": "tsx scripts/build-bible-chunks.ts"` and `predev`/`prebuild`/`pretest:run`/`precheck` hooks that call it
- Modify: `frontend/.gitignore`: add `src/lib/data/bible/bsb/`

**Interfaces:**
- Output `src/lib/data/bible/bsb/<bookId>.json`: `{ "v": 1, "translation": "BSB", "first": <first verse ordinal of book>, "text": string[] }`, where `text[i]` is the text of verse `first + i`. Verse IDs aren't stored; they're dense and derived. Empty verses (omitted in BSB) are `""`.

- [ ] **Step 0 (risk check):** Confirm the Sevalla static-site build can read `../data/bible/bsb.tsv` from `frontend/`. Check the build settings with `sevalla-mcp-ops`, or push a throwaway branch that runs `ls ../data/bible` in `prebuild`. If it can't, switch to committed chunks (see Global constraints).
- [ ] **Step 1:** Write failing tests. Loading all 66 generated files should show that:
  - the number of books is 66;
  - for each book, `text.length === sum(versesPerChapter)` from `bible-books.json`;
  - `first` values are contiguous;
  - the total is 31,102 (matching `TOTAL_VERSES`, not a literal constant);
  - Genesis 1:1 and Revelation 22:21 match `bsb.tsv`.
- [ ] **Step 2:** Implement the script: parse `bsb.tsv` (header row, then `verse_id<TAB>text`, normalising `\r\n` the same way the Go `parseBSB` does); bucket rows by book using the cumulative `versesPerChapter`; write compact JSON (no whitespace). Fail loudly on a verse ID outside the book ranges.
- [ ] **Step 3:** Run it, run the tests, and confirm `pnpm run build` emits about 66 `_app/immutable/**/*.js` chunks for the Bible data. Record the gz size of the largest one; it should be ≤ 80 KB.

## Task 3: Loader with GraphQL fallback

**Files:**
- Create: `frontend/src/lib/data/bibleText.ts`
- Create: `frontend/tests/unit/data/bibleText.test.ts`

**Interfaces:**
- `loadPassageText(startId: number, endId: number): Promise<{ passageText: PassageTextResponse['passageText']; source: 'chunk' | 'fallback' }>`
- It uses `import.meta.glob('./bible/bsb/*.json')` (lazy, not eager), `verseFromOrdinal` from `$lib/utils/bible.ts`, and `BSB_COPYRIGHT`.
- `BSB_COPYRIGHT` is a new constant in `bibleText.ts`.

- [ ] **Step 1:** Write failing tests:
  - single verse (John 3:16);
  - within one chapter;
  - across a chapter boundary;
  - **across a book boundary** (Malachi 4:6 to Matthew 1:1 loads two chunks);
  - an empty verse is omitted, matching how the server leaves it out of `verses`;
  - the `chapter`/`verse` fields match `verseFromOrdinal`;
  - when a chunk import rejects, the loader calls `graphqlRequest(PASSAGE_TEXT_QUERY, …)` and returns `source: 'fallback'`;
  - a parity test reads `backend/internal/core/domain/bible_reference.go` and checks `BSB_COPYRIGHT` equals `BibleTranslationBSBCopyright`.
- [ ] **Step 2:** Implement it. Load the books the range spans in parallel, then slice by `verseId - first`.
- [ ] **Step 3:** Parity test against the server: with a local backend available (skip otherwise, the same way backend integration tests auto-skip), compare `loadPassageText` with GraphQL `passageText` for 50 random ranges and require deep equality.

## Task 4: Swap `PassageText.svelte` to the loader

**Files:**
- Modify: `frontend/src/lib/components/PassageText.svelte`
- Modify: the existing `PassageText` component tests (they mock the query function)

- [ ] **Step 1:** Update the tests so the component calls `loadPassageText`, not `graphqlRequest`, and renders the same output; keep the over-cap no-fetch test; add a test that the fallback path still renders.
- [ ] **Step 2:** Change `queryFn` to `() => loadPassageText(startVerseId, endVerseId)` and adapt `query.data` access. Keep `queryKey` (`queryKeys.bible.passageText`) and `staleTime: Infinity`. Pass the returned `source` to the perf timer, reporting `memory` when the data wasn't fetched after mount.
- [ ] **Step 3:** Leave `OriginalLanguage.svelte` (interlinear) on GraphQL. That moves in plan 20-02.
- [ ] **Step 4:** Verify:
  - `pnpm run test:run`, `pnpm run check` and `pnpm run build` pass;
  - `pnpm exec prettier --check` passes on the changed files;
  - `grep -rn "PASSAGE_TEXT_QUERY" frontend/src` now finds only `bibleText.ts` (the fallback) and `queries/bible/index.ts`.
- [ ] **Step 5:** Open PR 2 using the feature template. Put the Task 1 lab table in the Demo section as the "before".

## Task 5: After-measurement and write-up

- [ ] **Step 1 (lab, local only):** Rerun the Task 1 Step 4 benchmark against the deployed PR 2 build with the same passages, conditions and N.
- [ ] **Step 2 (field, 7 days after deploy):** Rerun every Task 1 Step 6 query over the same window length.
- [ ] **Step 3:** Write `.planning/phases/20-bible-static-assets/20-01-SUMMARY.md` with the before/after table below filled in, then tick the Phase 20 `must_haves.truths` in `ROADMAP.md`.

### Before/after table (fill in)

| Metric | Before | After | Target |
|---|---|---|---|
| `PassageText` ops / 7 days | | | ≥ 90% drop (the remainder is fallback plus non-web callers) |
| `PassageText` share of all GraphQL ops | | | |
| `bible_verse_text` DB calls / total ms (pg_stat_statements) | | | ≥ 90% drop |
| Lab: cold p50/p95, unthrottled (John 3:16) | | | no regression beyond +1 chunk fetch |
| Lab: cold p50/p95, Fast 4G (Romans 8) | | | ≤ before |
| Lab: **reload** p50/p95 (Romans 8) | | | **< 50 ms** (HTTP-cache hit; previously a network round-trip) |
| Lab: warm (reopen) p50 | | | unchanged (TanStack memory cache) |
| Field `passage-render` p50/p95 split by `source` | | | |
| Bytes per first view of a book (gz) | | | ≤ 80 KB |
| `fallback` rate | n/a | | < 0.5% of renders |
| Monthly hosting $ (split: app, static, DB, bandwidth) | | | see cost model |

### Cost model (how to read the result honestly)

- **Sevalla flat tier:** there are **no direct savings** unless app or DB utilisation was close to a tier boundary. Report the utilisation change (CPU%, DB connections, response bytes) as "headroom gained" and convert it to money only when it avoids a planned upgrade (for example: "defers the move from plan X to plan Y, $Δ/mo").
- **Neon (if migrated):** savings ≈ (drop in compute-active hours attributable to Bible queries) × the compute-hour rate. This is only real if Bible reads were keeping the DB awake during otherwise idle periods; check with the active-time graph.
- **Static-site bandwidth:** each unique visitor downloads each book they read at most once per content hash, 11 KB median. Estimate: monthly unique readers × average books read × 11 KB. Compare with the GraphQL response bytes removed from the app service.
- **Per-1,000-reads view:** app $ per 1k GraphQL ops before vs. after = (monthly app $ × Bible share of ops) / (ops / 1,000). This is the figure that grows with traffic and the one that justifies the change long term.

## Rollback

Revert PR 2 and nothing else. The GraphQL path is untouched, the backend doesn't change and there's no migration. The instrumentation from PR 1 stays.

# Book Content Type — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can add a book from Discover (Search / Trending / ISBN tabs) or by pasting an Open Library work link into Add Content, see it in the Activity table (cover, Author, Published, Pages, Rating, Tags), open a details view with its description, and write perspectives on it.

**Architecture:** Mirror the Movie frontend slice-for-slice (`tmdbApi.ts` → `openLibraryApi.ts`, `useAddMovie` → `useAddBook`, `MovieCard/SearchPanel/TrendingFeed` → `Book*`, `MovieTiles/Body` → `BookTiles/Body`, Movie column view → Book column view). Book rows read their data from the `book` JSON on list rows (and `response` on the details query), parsed by one `bookResponse()` reader. Pure logic lives in two new util modules so the Svelte files stay thin.

**Tech Stack:** SvelteKit (Svelte 5 runes), TanStack Query, graphql-request, AG Grid Community, shadcn-svelte, Vitest (`tests/unit`, `tests/components`).

**Spec:** `docs/superpowers/specs/2026-11-09-book-content-type-discover-design.md` **as revised on `origin/feature/book-content-type-intent`** (settled 2026-11-11: all authors kept as a list, description fetched eagerly at add time, pasted work links in scope). Intent: `project-management/intents/book-content-type.md`. Backend already built in PR #670.

## Prerequisite: backend payload delta (not part of this plan)

Backend PR #670 emits `response.authorName: string[]` only, and `cmd/server/main.go` never wires the Open Library clients, so a running server answers every Book operation with "unavailable". This plan reads the **settled** payload, so the backend delta in `docs/superpowers/plans/2026-11-11-book-content-type-backend-delta.md` (wiring plus every row below) must land, or be stacked under this work, before the UI can be verified against real data. Unit tests here use fixtures and do not wait on it.

| Needed from backend | Why the frontend needs it |
|---|---|
| `response.authors: { name: string; openLibraryKey?: string }[]` (ordered) | Author cell shows first author, `+N` for the rest |
| `response.description?: string`, `response.relatedWorks?: { title: string; url: string }[]` | Details view reads them with no network (fetched at add time) |
| `response.resolvedFromISBN?: string` | Stored only; no v1 reader |
| `ContentSortBy.AUTHOR` sorts by first author's name (exists; today reads `authorName[0]`, must read `authors[0].name`) | Author column server sort |
| `ContentFilter.authorContains: String` (case-insensitive contains on the first author) | Author column filter in server mode |
| `createContentFromBook` resolves an `openlibrary.org/books/OL…M` edition link to its work | Pasted edition links |
| `updateContentSourceData` supports BOOK | Details-view "Update source data" |

## Global Constraints

- Identity/URL is `https://openlibrary.org/works/<OLxxxW>` (work key, not ISBN).
- Cover URL: `https://covers.openlibrary.org/b/id/<coverId>-<S|M|L>.jpg`; S in the grid, M on cards, L in details. Display with `object-contain` (books vary in aspect), never a fixed poster box.
- Unknown is empty (`EMPTY_VALUE`), never `0`.
- **Published** renders as a plain 4-digit string, never through `num`/`toLocaleString` ("1952", not "1,952").
- **Rating** is `ratingsAverage` out of 5, one decimal; muted when `ratingsCount < 5`.
- Tags column reuses the shared `tags` column; book tags are `subjects`.
- Default Book columns: ◎ · Book (cover + title, author sub-line) · Author · Published · Pages · Rating · Tags. Picker-only: Editions, Date Added. **Language is dropped** (no source field in the payload). **No word count anywhere.**
- Trending note under the Trending tab, verbatim: "What's being looked up on Open Library right now — skews toward current nonfiction".
- Attribution footer, verbatim: "Data: Open Library (archive.org), community-contributed; may be incomplete."
- ISBN: strip hyphens/spaces, validate ISBN-10 / ISBN-13 **checksum** client-side before any call (a checksum-invalid `9999999999999` resolves to an unrelated real book on Open Library).
- Descriptions are external markdown: render only as plain text (no `{@html}`).
- Mutation hooks use the authenticated `graphqlRequest()` wrapper, never `graphqlClient`.
- No chained shell commands; one command per Bash call. Run only the affected tests while iterating (`pnpm --dir frontend exec vitest run --project unit <file>`).
- Label every PR of this work `new-content-type`; PR bodies need demo video evidence (user-visible behaviour).

## Review Focus

1. A book with no cover, no rating, no subjects and no author (the *Brainscan* / *Make a zine!* cases): grid cell, card, mobile card and details must render without broken images, `0`, `NaN`, or "undefined".
2. A year must never get a thousands separator; a missing year is empty, not `0`.
3. A 13- or 10-digit ISBN with a bad checksum, or with hyphens/spaces, must be rejected/normalised client-side and never reach the API.
4. A description containing HTML, `javascript:` links or markdown must never reach the DOM as markup; a related-works link not on `openlibrary.org` must not render as a link.
5. Zero, one and many authors: empty cell, plain name, `Name +N`; rating `null` vs `0` vs count under 5.

---

### Task 1: GraphQL plumbing and type labels

**Files:**
- Modify: `frontend/src/lib/queries/content/index.ts` (the `ContentType` union at line 14; `ContentItem` at ~line 44; the two `movie` selections at ~lines 126 and 267; add the new mutation after `CREATE_CONTENT_FROM_MOVIE`)
- Modify: `frontend/src/lib/queries/userTodos/index.ts` (field at line 65, selection at line 277)
- Modify: `frontend/src/lib/utils/planItemCellRenderer.ts:45` (pass `book`)
- Modify: `frontend/src/lib/utils/grid-config.ts:37-42` (`CONTENT_TYPE_LABELS`)
- Test: `frontend/tests/unit/queries-content.test.ts`, `frontend/tests/unit/grid-config.test.ts`, `frontend/tests/unit/planItemCellRenderer.test.ts`

**Interfaces:**
- Produces: `ContentType` includes `'BOOK'`; `ContentItem.book?: Record<string, unknown> | null`; `CREATE_CONTENT_FROM_BOOK` (gql) and `CreateContentFromBookResponse = { createContentFromBook: { id: string; name: string; url: string | null; contentType: string } }`; `CONTENT_TYPE_OPTIONS` contains `{ value: 'book', label: 'Book' }`.

- [ ] **Step 1: Write failing tests.** `queries-content.test.ts`: `LIST_CONTENT` and the details query text contain `book`; `CREATE_CONTENT_FROM_BOOK` text contains `createContentFromBook(input: $input)`. `grid-config.test.ts`: `CONTENT_TYPE_OPTIONS` includes `{ value: 'book', label: 'Book' }`. `planItemCellRenderer.test.ts`: a todo content with `book` data passes it through to the item cell renderer.
- [ ] **Step 2: Run them; expect FAIL.** `pnpm --dir frontend exec vitest run --project unit tests/unit/queries-content.test.ts tests/unit/grid-config.test.ts tests/unit/planItemCellRenderer.test.ts`
- [ ] **Step 3: Implement** the union member, `ContentItem.book`, both `book` selections (next to `movie`), the mutation + response type, the todo query/type field, `book: content.book` in `planItemCellRenderer`, and `BOOK: 'Book'` in `CONTENT_TYPE_LABELS`.
- [ ] **Step 4: Run the same command; expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend): add BOOK content type to queries and type filter`

### Task 2: Pure helpers — ISBN, book input, description text

**Files:**
- Create: `frontend/src/lib/utils/isbn.ts`
- Create: `frontend/src/lib/utils/book.ts`
- Test: `frontend/tests/unit/isbn.test.ts`, `frontend/tests/unit/book.test.ts`

**Interfaces:**
- Produces (`isbn.ts`): `normalizeIsbn(raw: string): string` (strips spaces and hyphens, uppercases a trailing `x`); `isValidIsbn(raw: string): boolean` (normalises, then checks ISBN-10 or ISBN-13 checksum); `type IsbnCheck = 'empty' | 'incomplete' | 'invalid' | 'valid'`; `checkIsbn(raw: string): IsbnCheck` (`empty` = nothing typed; `incomplete` = fewer than 10 chars after normalising, or 11–12; `invalid` = right length, bad checksum or non-digits; `valid`).
- Produces (`book.ts`): `validateBookInput(raw: string): boolean` — true for `openlibrary.org/works/OL<digits>W` and `openlibrary.org/books/OL<digits>M` (scheme optional, slug/query/hash allowed, front unanchored like `validateMovieInput`); `descriptionText(markdown: string): string`; `safeRelatedWorks(works: { title: string; url: string }[] | undefined): { title: string; url: string }[]` (keeps only `https://openlibrary.org/…` URLs). `contentNotAllowedMessage` is **reused** from `utils/movie.ts`, do not copy it.

- [ ] **Step 1: Write failing tests.**
  - `isbn.test.ts`: `isValidIsbn('978-0-434-74002-4')` true (East of Eden 1970 edition `9780434740024`); a hyphenated ISBN-10 with a valid checksum true; ISBN-10 ending in `X` valid; `isValidIsbn('9999999999999')` false; `isValidIsbn('9780434740025')` false (off-by-one checksum); `checkIsbn('')` `'empty'`, `checkIsbn('97804')` `'incomplete'`, `checkIsbn('9780434740025')` `'invalid'`, `checkIsbn('9780434740024')` `'valid'`; letters in a 13-char string → `'invalid'`.
  - `book.test.ts`: `validateBookInput` true for `https://openlibrary.org/works/OL23166W`, `openlibrary.org/works/OL23166W/East_of_Eden?edition=x`, `https://openlibrary.org/books/OL22640535M`; false for `https://openlibrary.org/authors/OL26320A`, `https://example.com/works/OL23166W`, `OL23166W`, empty. `descriptionText('<script>alert(1)</script>**Bold** [link](javascript:alert(1)) text')` contains no `<`, no `**`, no `javascript:`, and still contains `Bold`, `link`, `text`; horizontal-rule lines and `[1]: https://…` reference lines are removed; `descriptionText('')` is `''`. `safeRelatedWorks` drops `https://evil.example/x` and `javascript:alert(1)`, keeps `https://openlibrary.org/works/OL1W`, tolerates `undefined`.
- [ ] **Step 2: Run both; expect FAIL** (modules missing).
- [ ] **Step 3: Implement** the signatures above. ISBN-13 checksum: weights 1,3 alternating, sum mod 10 = 0. ISBN-10: weights 10…1 with `X` = 10, sum mod 11 = 0. `descriptionText` strips tags, images, link syntax (keep the label), emphasis markers, rule lines and reference-definition lines, then collapses 3+ newlines to 2 and trims.
- [ ] **Step 4: Run both; expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend): add ISBN validation, book link detection and description text helpers`

### Task 3: Open Library service, cover URL, CSP

**Files:**
- Create: `frontend/src/lib/services/openLibraryApi.ts`
- Modify: `frontend/src/app.html:8` (add `https://covers.openlibrary.org` to `img-src`, beside `https://image.tmdb.org`)
- Test: `frontend/tests/unit/openLibraryApi.test.ts`, `frontend/tests/unit/openlibrary-query-cache-contract.test.ts` (copy the structure of `tmdb-query-cache-contract.test.ts`)

**Interfaces:**
- Produces: `interface BookSearchResult { workKey: string; title: string; authorName: string[]; coverId: number | null; firstPublishYear: number | null; pageCountMedian: number | null; subjects: string[]; ratingsAverage: number | null; ratingsCount: number | null; editionCount: number | null; url: string }`; `interface BookSearchPage { items: BookSearchResult[]; page: number; totalPages: number; totalResults: number }`; gql `BOOK_SEARCH`, `BOOK_TRENDING`, `BOOK_BY_ISBN` selecting every field above; `searchBooks(query: string, page?: number): Promise<BookSearchPage>`; `fetchTrendingBooks(window?: TrendingWindow, page?: number): Promise<BookSearchPage>`; `lookupBookByIsbn(isbn: string): Promise<BookSearchResult | null>`; constants `BOOK_SEARCH_MIN_LENGTH = 2`, `BOOK_SEARCH_MAX_LENGTH = 100`, `BOOK_SEARCH_DEBOUNCE_MS = 350`, `BOOK_SEARCH_STALE_TIME = 10 * 60 * 1000`, `BOOK_TRENDING_STALE_TIME = 30 * 60 * 1000`; `type CoverSize = 'S' | 'M' | 'L'`; `openLibraryCoverUrl(coverId: number | null | undefined, size?: CoverSize): string | null`; `openLibraryKeys = { all, search(query, page), trending(window, page), isbn(isbn) }`. `TrendingWindow` is imported from `tmdbApi.ts`, not redeclared.

- [ ] **Step 1: Write failing tests.** `openLibraryApi.test.ts`: each fetcher calls `graphqlRequest` (mocked) with the right document and variables and unwraps `bookSearch` / `bookTrending` / `bookByISBN`; `lookupBookByIsbn` returns `null` when the server returns `null`; `openLibraryCoverUrl(11386937, 'M')` → `https://covers.openlibrary.org/b/id/11386937-M.jpg`, `openLibraryCoverUrl(null)` and `(undefined)` → `null`, default size `'M'`; `openLibraryKeys` are distinct per argument. The cache-contract test mirrors the TMDB one for the three keys and stale times.
- [ ] **Step 2: Run both; expect FAIL.**
- [ ] **Step 3: Implement** the service per the Interfaces block (selection sets mirror `schema.graphql` `BookSearchResult`).
- [ ] **Step 4: Run both; expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend): add Open Library discover service and cover CSP`

### Task 4: `useAddBook` mutation hook

**Files:**
- Create: `frontend/src/lib/queries/content/useAddBook.ts`
- Test: `frontend/tests/unit/hooks-useAddBook.test.ts` (copy the structure of `hooks-useAddMovie.test.ts`)

**Interfaces:**
- Consumes: `CREATE_CONTENT_FROM_BOOK`, `CreateContentFromBookResponse` (Task 1); `contentNotAllowedMessage` from `utils/movie.ts`.
- Produces: `useAddBook()` returning the TanStack mutation; `mutationFn(url: string)` — `url` is a work URL or a raw ISBN.

- [ ] **Step 1: Write failing tests** (same cases as the Movie hook test): sends `{ input: { url } }` through `graphqlRequest`; success toast `Added: East of Eden` with action label `Go to book` that calls `goto('/?open=42')`; success invalidates `queryKeys.content.lists()`; errors: network ("Cannot reach the server…"), not-found / invalid ("Invalid book link or book not found"), auth ("Please sign in to add a book"), CONTENT_NOT_ALLOWED message verbatim, anything else "Failed to add book. Please try again."
- [ ] **Step 2: Run; expect FAIL.** `pnpm --dir frontend exec vitest run --project unit tests/unit/hooks-useAddBook.test.ts`
- [ ] **Step 3: Implement** `useAddBook()` mirroring `useAddMovie.ts`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend): add useAddBook mutation`

### Task 5: Book readers, cell formatters, type icon

**Files:**
- Create: `frontend/src/lib/utils/bookFormatting.ts`
- Modify: `frontend/src/lib/utils/formatting.ts` (`MovieRow` gains `book?: unknown`; `contentTags` at ~line 958 falls back to book subjects; `typeCellRenderer` at ~line 453 gets a BOOK branch with a book glyph, `title`/sr-only text `Book`)
- Test: `frontend/tests/unit/bookFormatting.test.ts`; extend `frontend/tests/unit/formatting.test.ts` (contentTags, typeCellRenderer)

**Interfaces:**
- Produces (`bookFormatting.ts`, imports only `EMPTY_VALUE` from `formatting.ts`): `interface BookAuthor { name: string; openLibraryKey?: string }`; `interface BookResponse { workKey?: string; title?: string; authors?: BookAuthor[]; coverId?: number | null; firstPublishYear?: number | null; pageCountMedian?: number | null; subjects?: string[]; ratingsAverage?: number | null; ratingsCount?: number | null; editionCount?: number | null; description?: string; relatedWorks?: { title: string; url: string }[]; resolvedFromISBN?: string }`; `interface BookRow { contentType?: string; book?: unknown; response?: unknown }`; `bookResponse(row: BookRow | null | undefined): BookResponse | null` (null unless `contentType === 'BOOK'`; reads `book` then `response`; parses a JSON string); `bookAuthors(row): BookAuthor[]`; `authorValueGetter(p: { data?: BookRow }): string | null` (first author's name); `authorCellText(row): string` (`""` none, `"Name"`, `"Name +2"`); `authorCellRenderer(p): HTMLElement | string`; `publishedValueGetter(p): string | null` (4-digit string, never formatted with a separator); `pagesValueGetter(p): number | null`; `ratingValueGetter(p): number | null`; `formatBookRating(v: number | null): string` (`"4.1"` or `EMPTY_VALUE`); `hasLowRatingCount(p): boolean` (`ratingsCount < 5`; true when the count is missing but a rating exists); `ratingTooltip(p): string` (`"4.1 out of 5 · 100 ratings"`, `"No ratings yet"`); `editionsValueGetter(p): number | null`; `bookSubjects(row): string[] | null`.

- [ ] **Step 1: Write failing tests**, using fixtures for the four real cases (East of Eden with a two-author variant, year 1952, 611 pages, 4.1 / 100; Atomic Habits; *Brainscan*: no cover, no rating, 3 subjects, 30 pages; *Make a zine!*: no author, no year). Assertions: `publishedValueGetter` → `'1952'`, and `null` when absent or `0`; `authorCellText` for 0/1/3 authors → `''`, `'John Steinbeck'`, `'A +2'`; `formatBookRating(null)` is `EMPTY_VALUE`; `hasLowRatingCount` true for count 4, false for 5; `bookResponse` returns `null` for a MOVIE row and for a BOOK row with a malformed JSON string; `contentTags` returns book subjects for a BOOK row with no real tags and still prefers real tags; `typeCellRenderer({ data: { contentType: 'BOOK' } })` has sr-only text `Book`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** per the Interfaces block; treat `null`/`0` as unknown for pages, year and counts.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend): add Book readers, cell formatters and type icon`

### Task 6: Book column set and view plumbing (pure config)

**Files:**
- Modify: `frontend/src/lib/utils/grid-config.ts` (`COLUMNS`: add `author`, `published`, `pages`, `rating`, `editions`; add `export type ColumnView = 'movie' | 'book' | 'general'`; `columnViewFor`; `defaultColumnVisibility(tier, view)`; `isBookOnlyTypeFilter`; item header "Book" at ~line 810)
- Modify: `frontend/src/lib/utils/columnLayouts.ts` (re-export `ColumnView` from `grid-config`, add `book: 'Book columns'` label, `columnViewFor` returns `'book'`)
- Modify: `frontend/src/lib/utils/gridUrlState.ts` (`authorContains?: string` on the filter type; `case 'author'`)
- Modify callers of `defaultColumnVisibility` (`columnLayouts.ts:82`, `ActivityTable.svelte`) and the boolean call sites in `tests/unit/movieColumns.test.ts`, `grid-config.test.ts`, `columnLayouts.test.ts`
- Test: `frontend/tests/unit/bookColumns.test.ts` (new), plus the updated tests above

**Interfaces:**
- Consumes: Task 5 getters.
- Produces: `defaultColumnVisibility(tier: ResponsiveTier, view: ColumnView): { visible: string[]; hidden: string[] }`; `isBookOnlyTypeFilter(typeFilter: string | undefined): boolean`; Book visible sets: base `['perspectize','item','type']`; `sm` adds `author`; `md` adds `published`, `pages`; `lg` adds `rating`, `tags`. `author`: `sortable: true`, `serverSort: 'AUTHOR'`, `filterKey: 'author'`, `filterValue` = lowercased first author; `published`, `rating`, `pages`: client-side sort only (the backend has no other Book sort), `editions`: picker data column, never in a default set.

- [ ] **Step 1: Write failing tests** in `bookColumns.test.ts`: `isBookOnlyTypeFilter('book')` true, `'book,movie'` false, `undefined` false; `defaultColumnVisibility` per tier for `'book'` returns exactly the sets above, with Movie/YouTube-only columns in `hidden`; the `movie` and `general` results are exactly what they were (copy the existing expectations); `COL_TO_SORT.author === 'AUTHOR'`; `DATA_COLUMNS` includes `Author`, `Published`, `Pages`, `Rating`, `Editions` and no `Language`; the item header is `'Book'` for a book-only filter; `urlParamsToGraphQLFilter` maps `f.author=steinbeck` to `{ authorContains: 'steinbeck' }`; `columnViewFor('book')` is `'book'`; the Book `lg` set's minimum widths fit the 1212px grid (reuse the Movie test's width helper).
- [ ] **Step 2: Run; expect FAIL.** `pnpm --dir frontend exec vitest run --project unit tests/unit/bookColumns.test.ts tests/unit/movieColumns.test.ts tests/unit/columnLayouts.test.ts tests/unit/grid-config.test.ts`
- [ ] **Step 3: Implement.** `defaultColumnVisibility`'s `managed` list gains the Book columns so they are hidden in the other views. Client-side sort of `published` / `rating` / `pages` uses `unknownLastComparator`.
- [ ] **Step 4: Run the Step 2 command; expect PASS.**
- [ ] **Step 5: Commit** `feat(frontend): add Book column set and per-view column defaults`

### Task 7: Activity table, Item cell and card list

**Files:**
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (column defs near the Movie block at ~lines 661–960: `author` using `authorCellRenderer`, `published`, `pages`, `rating` muted via `hasLowRatingCount`, `editions`; header tooltips: "Author(s) from Open Library", "First published year", "Median page count across editions", "Open Library community rating out of 5. Muted when fewer than 5 ratings.", "Number of editions"; Item header reads "Book" via the Task 6 helper)
- Modify: `frontend/src/lib/utils/activityTooltipSpecs.ts` (author/rating specs if the Movie columns have equivalents)
- Modify: `frontend/src/lib/utils/activityItemCellRenderer.ts` (`renderBookCell` beside `renderMovieCell`, dispatch at ~line 194)
- Modify: `frontend/src/lib/components/ActivityCardList.svelte` (book facts line, cover at `-M`)
- Test: extend `frontend/tests/unit/activityItemCellRenderer.test.ts`, `frontend/tests/components/ActivityTable.test.ts`, `frontend/tests/components/ActivityCardList.test.ts`; `column-registry-parity.test.ts` and `column-label-parity.test.ts` must keep passing

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces: Item cell for BOOK rows — cover (`-S`, 28×42, `object-contain`, `onerror` removes the img) beside the title, with the author text (`authorCellText`) as `item-subtitle`; thumb click opens the Open Library URL, cell click opens details. States to cover: cover + author; no cover; no author (no subtitle element); `book` and `response` both absent (plain tile).

- [ ] **Step 1: Write failing tests**, one per state above for the Item cell. `ActivityTable`: with `f.type=book` the visible columns at `lg` are `item, type, perspectize, author, published, pages, rating, tags` and the Item header reads "Book"; the Published cell text is `'1952'` (not `'1,952'`); a rating cell with 3 ratings carries the muted class; a no-rating cell shows `EMPTY_VALUE`. Card list: `1952 · 611 pages · ★ 4.1` for East of Eden, unknown parts omitted for *Brainscan*.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the cells, tooltips and card facts per the Interfaces block.
- [ ] **Step 4: Run the new/extended tests and both parity tests; expect PASS.** `pnpm --dir frontend exec vitest run --project unit tests/unit/activityItemCellRenderer.test.ts tests/unit/column-registry-parity.test.ts tests/unit/column-label-parity.test.ts`
- [ ] **Step 5: Commit** `feat(frontend): show Book rows in the Activity table and card list`

### Task 8: Details view

**Files:**
- Create: `frontend/src/lib/components/BookTiles.svelte`, `frontend/src/lib/components/BookBody.svelte`
- Modify: `frontend/src/lib/components/ActivityDetailsModal.svelte` (`isBook` derived beside `isMovie`; cover at `-L` with `object-contain`; author line under the title; tiles; body; attribution; the description and tags guards at ~lines 363/372 (`!isPassage && !isMovie`) also exclude books, because Book renders its own; the "Update source data" button and its cooldown note at ~lines 341/355 stay visible for books, since the backend refreshes BOOK rows)
- Test: `frontend/tests/components/BookTiles.test.ts`, `frontend/tests/components/BookBody.test.ts`, extend `frontend/tests/components/ActivityDetailsModal.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 5.
- Produces: `BookTiles` props `{ row: BookRow }` — tiles Rating, Rating count, Pages, Published, Editions (each `EMPTY_VALUE` when unknown; the shared Perspectives / Avg. Rating tiles stay in the modal). `BookBody` props `{ row: BookRow }` — sections, each shown only when it has content: Tags chips (subjects), Description (`descriptionText`, `whitespace-pre-wrap`, text interpolation only), Related works (links from `safeRelatedWorks`, `target="_blank" rel="noopener noreferrer"`); footer line is the verbatim attribution string.

- [ ] **Step 1: Write failing tests.** States: tiles with full data; tiles for *Brainscan* (no rating → dash, not `0`) and *Make a zine!* (Published dash); body with description + related works + tags (East of Eden); body with description only (*Atomic Habits*); body with nothing (no Description, Related works or Tags headings render; attribution still does); a description containing `<img src=x onerror=alert(1)>` renders as visible text and `container.querySelector('img')` is null; a related work with a non-Open-Library URL renders nothing for that item. Modal: BOOK content shows the attribution, no TMDB text, no YouTube Views/Likes tiles, the "Update source data" button (and not for MOVIE), and the cover has `object-contain`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the two components and the modal wiring.
- [ ] **Step 4: Run; expect PASS.** `pnpm --dir frontend exec vitest run --project unit tests/components/BookTiles.test.ts tests/components/BookBody.test.ts tests/components/ActivityDetailsModal.test.ts`
- [ ] **Step 5: Commit** `feat(frontend): add Book details view`

### Task 9: Add Content — detection and form

**Files:**
- Modify: `frontend/src/lib/utils/detectContentType.ts` (new `{ type: 'BOOK'; url: string }` result; precedence YouTube > movie > **book** > Bible Gateway URL; update the doc comment)
- Modify: `frontend/src/lib/components/AddContentPopover.svelte` (`ChosenType` gains `'BOOK'` at line 19; `useAddBook`; label `'Book'`; select option; error text "Please enter a valid Open Library book link"; submit branch; description text mentions Open Library; footer with the attribution string, Book only)
- Test: extend `frontend/tests/unit/detectContentType.test.ts`, `frontend/tests/components/AddContentPopover.detection.test.ts`; create `frontend/tests/components/AddContentPopover.realBookMutation.test.ts` (copy the Movie variant's structure)

**Interfaces:**
- Consumes: `validateBookInput` (Task 2), `useAddBook` (Task 4).

- [ ] **Step 1: Write failing tests.** Detection: pasted `https://openlibrary.org/works/OL23166W` → `{ type: 'BOOK', url }`; an edition link → BOOK; an Open Library author link → `{ type: null }` (never a claim, never guessed); free text still yields CLAIM; movie and YouTube links unchanged. Popover states: BOOK detected → type chip/select shows Book and submit calls `mutate(url)`; manual Book type with garbage input → the validation error and no mutation; pending → disabled submit; mutation error → "Could not add this book. Check the link and try again."; the attribution footer shows only for Book.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** `pnpm --dir frontend exec vitest run --project unit tests/unit/detectContentType.test.ts tests/components/AddContentPopover.detection.test.ts tests/components/AddContentPopover.realBookMutation.test.ts`
- [ ] **Step 5: Commit** `feat(frontend): add books from pasted Open Library links`

### Task 10: Discover — Books source with Search, Trending and ISBN tabs

**Files:**
- Create: `frontend/src/lib/components/discover/BookCard.svelte`, `BookSearchPanel.svelte`, `BookTrendingFeed.svelte`, `BookISBNPanel.svelte`
- Modify: `frontend/src/routes/discover/+page.svelte` (source `'books'` beside `'movies'`: tab button "Books", `?source=books`, sub-tab in `?tab=search|trending|isbn` defaulting to `search`; the page owns the add mutation, `pendingBookUrl`, `bookQuery` and `bookInputRef` for Cmd/Ctrl+K and Escape, exactly like Movies; subtitle "Search Open Library, browse trending books or add one by ISBN")
- Test: `frontend/tests/components/BookCard.test.ts`, `BookSearchPanel.test.ts`, `BookTrendingFeed.test.ts`, `BookISBNPanel.test.ts`; extend `frontend/tests/components/DiscoverPage.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `BookCard` props `{ result: BookSearchResult; isInLibrary?: boolean; isPending?: boolean; onAdd: (url: string) => void }` — enough to decide without leaving the page (Decision 8): cover (`-M`, `object-contain`, book-icon placeholder when none), title linking to `result.url`, authors joined, year (or "Year unknown"), pages, rating with count (`★ 4.1 (100)`, muted under 5, "No ratings" when none), edition count, first ~4 subjects as chips; missing is empty, never 0. `BookSearchPanel` props `{ value: $bindable; inputRef: $bindable; libraryUrls: Set<string>; pendingUrl: string | null; onAdd }` — debounced search with the Movie panel's states (idle hint under 2 chars, debouncing, loading skeleton, error + Retry, empty "No books found for '…'", results, Load More with its own error). `BookTrendingFeed` props `{ timeWindow: $bindable<TrendingWindow>; libraryUrls; pendingUrl; onAdd }` — DAY/WEEK toggle, the verbatim trending note, same states. `BookISBNPanel` props `{ libraryUrls: Set<string>; pendingUrl: string | null; onAdd: (url: string) => void }` — input state machine `idle | invalid | incomplete | resolving | found | notFound | error`, driven by `checkIsbn` and a `createQuery` on `lookupBookByIsbn` enabled only when valid; `found` shows a `BookCard` whose Add calls `onAdd(result.url)`; `notFound` says "No book found for that ISBN"; `invalid` says "That ISBN's check digit doesn't match. Check for a typo." and makes no request.

- [ ] **Step 1: Write failing tests.** `BookCard`: link has `target="_blank"` + `rel="noopener noreferrer"`; full data (East of Eden); sparse data (*Brainscan* — no cover → placeholder, no rating → "No ratings"); in-library → disabled "In Library", no Add button; pending → disabled "Adding…"; Add calls `onAdd(result.url)`. `BookSearchPanel` / `BookTrendingFeed`: mirror every case in `MovieSearchPanel.test.ts` (and the Movie trending coverage) against the Book service mocks, plus the trending note text. `BookISBNPanel`, one test per state: `idle`; typing `97804` → incomplete, no request; `9780434740025` → invalid, `lookupBookByIsbn` not called; `978-0-434-74002-4` → request made with `9780434740024`; resolving skeleton; found card + Add; `null` result → notFound; thrown error → error with Retry. `DiscoverPage`: `?source=books` selects the Books tab and defaults to Search; `?source=books&tab=isbn` selects ISBN; `?source=movies` and the default YouTube source are unchanged.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the four components and the page wiring; reuse `libraryUrls` and the `useAddBook` mutation, no new add path.
- [ ] **Step 4: Run; expect PASS.** `pnpm --dir frontend exec vitest run --project unit tests/components/BookCard.test.ts tests/components/BookSearchPanel.test.ts tests/components/BookTrendingFeed.test.ts tests/components/BookISBNPanel.test.ts tests/components/DiscoverPage.test.ts`
- [ ] **Step 5: Commit** `feat(frontend): add Books source to Discover (search, trending, ISBN)`

### Task 11: Verify, document, record

**Files:**
- Modify: `.claude/docs/ADDING_CONTENT_TYPE.md` only if this work found a step the guide lacks; `project-management/intents/book-content-type.md` (tick the frontend PR line)

- [ ] **Step 1: Type-check.** `pnpm --dir frontend run check` — expect 0 errors.
- [ ] **Step 2: Lint/format.** `pnpm --dir frontend run lint` — expect clean (prettier is not auto-run on commit in this checkout).
- [ ] **Step 3: Full frontend suite once before pushing.** `pnpm --dir frontend run test:run` — expect all pass; report the summary line. (`AddVideoDialog` success-state is a known flake: rerun it alone before treating it as a regression.)
- [ ] **Step 4: Stale references.** `grep -rn "isMovieOnlyTypeFilter\|defaultColumnVisibility(" frontend/src frontend/tests` — expect no caller still passing a boolean.
- [ ] **Step 5: Demo evidence** (take the verification slot via the `pr-verification` skill first): a clip of Discover → Books → add *East of Eden* from Search, an ISBN add (`9780434740024`), and the Activity grid with `f.type=book` plus the details view; upload per the PR-evidence rules.
- [ ] **Step 6: `graphify update .`**, then commit the intent checklist tick: `docs(book): tick frontend PR in the Book intent`

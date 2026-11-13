# Book content type + Discover Books source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `BOOK` content type, backed by Open Library, reachable only through a new Books source on the Discover page with three tabs: Search, Trending, and ISBN entry.

**Architecture:** Mirrors the existing Movie/TMDB integration end to end — a `backend/internal/adapters/openlibrary/` client behind two ports (search+trending, ISBN resolution), a `ContentService.CreateFromBook` that re-fetches by work key at add time, three new GraphQL operations, and three new Discover-page Svelte components reusing the Movie components' structure. No API key, no migration.

**Tech Stack:** Go (gqlgen, GORM/pgx, hexagonal architecture) · SvelteKit (Svelte 5 runes, TanStack Query, shadcn-svelte)

**Spec:** `docs/superpowers/specs/2026-11-09-book-content-type-discover-design.md`

## Global Constraints

- Identity/dedupe key is the Open Library **work key**, stored as `https://openlibrary.org/works/<id>` in `content.url` (spec §2) — never an ISBN.
- `search.json` and `trending/{daily,weekly}.json` are called with `fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject,ratings_average,ratings_count,edition_count` (spec §1) — every backend call to either endpoint uses exactly this field list.
- Trending reuses the existing `domain.TrendingWindow` enum (`DAY`/`WEEK`) — no new trending-window enum (spec §3).
- `createContentFromBook` always re-fetches the work via `search.json` scoped to the resolved work key at add time — never trusts a client-supplied snapshot (spec §4).
- The ISBN tab resolves via `GET /isbn/{isbn}.json` → `works[0].key`, then the *same* work-key resolution as Search/Trending, then the *same* `createContentFromBook` mutation — it is not a separate add path (spec §5).
- Rating cells are muted when `ratingsCount < 5` (spec §7, §7a) — not Movie's `< 50`.
- Published renders as a plain year string; it must never pass through a formatter that adds a thousands separator (spec §7).
- Word count is out of scope — no field, column, or UI for it anywhere (spec, "Resolved: word count").
- No API key, no config variable, no migration (spec, Rollout).
- No CSP change is needed: `img-src` already includes a bare `https:` scheme-source (`frontend/src/app.html`), which already covers `covers.openlibrary.org`, and the frontend never calls Open Library directly (everything is proxied through the backend) — the spec's CSP line is superseded by this finding; do not add a CSP entry.

## Review Focus

- **A search query with zero results.** The spec's happy-path examples all return at least one work; nothing says what the panel shows for a real miss (Movie's analog: "No movies found for '{term}'"). Task 11's panel must have an explicit empty state and a test for it.
- **An ISBN that is well-formed but assigned to an unrelated, mis-cataloged record** (spec §5's live finding: `9999999999999` resolved to *Rómulo Maccio*, not a 404). The ISBN panel cannot assume "resolved successfully" means "resolved to something sensible" — Task 13 shows whatever title/author comes back, not a silent assumption of correctness, and its test covers a resolution landing on an unexpected title without crashing.
- **A work with no author at all** (`author_name` absent — the design doc's own Postman collection flags this as possible). Author is now a primary grid column (spec §7, revised); Task 6's sort rule and Task 15's column must both treat a missing author as sorting/filtering last, not as an empty-string crash.
- **Two different Open Library works that both describe editions of "the same" book in casual terms** (spec §2's dedupe note: the 1970 Heinemann *East of Eden* edition and the *East of Eden and The Wayward Bus* omnibus are different works and must NOT merge into one row). Task 5's `CreateFromBook` test suite needs a case proving two distinct work keys never collide, alongside the existing "same work key twice → `ErrAlreadyExists`" case.
- **A rating or page count of exactly the dimming/display boundary** (`ratingsCount == 5` exactly — not muted; `ratingsCount == 4` — muted). Off-by-one on a `<` boundary is the classic way this kind of threshold ships wrong. Task 15's formatter test table includes both.

---

## Task 1: Domain constants

**Files:**
- Modify: `backend/internal/core/domain/content.go`
- Modify: `backend/internal/core/domain/pagination.go`
- Test: `backend/test/domain/content_test.go` (or the existing domain test file covering `ContentType`/`ContentSortBy` constants — follow whatever file already asserts `ContentTypeMovie`/`ContentSortByAgeRating`)

**Interfaces:**
- Produces: `domain.ContentTypeBook ContentType = "BOOK"`, `domain.ContentSortByAuthor ContentSortBy = "AUTHOR"`

- [ ] **Step 1: Write the failing test** asserting `domain.ContentTypeBook == "BOOK"` and `domain.ContentSortByAuthor == "AUTHOR"`, in whatever existing test function already table-tests the sibling Movie constants.
- [ ] **Step 2: Run it, confirm it fails** (undefined identifiers).
- [ ] **Step 3: Add `ContentTypeBook` to the `ContentType` const block** in `content.go` (alongside `ContentTypeMovie`), and `ContentSortByAuthor` to the `ContentSortBy` const block in `pagination.go` (alongside `ContentSortByAgeRating`).
- [ ] **Step 4: Run it, confirm it passes.**
- [ ] **Step 5: Commit.**

---

## Task 2: GraphQL schema

**Files:**
- Modify: `backend/schema.graphql`
- Modify: `backend/gqlgen.yml` (model bindings for any new enum)
- Generated: `backend/internal/adapters/graphql/generated/generated.go`, `backend/internal/adapters/graphql/model/models_gen.go` (via `make graphql-gen`)

**Interfaces:**
- Produces (for Tasks 5, 7, 8): GraphQL types `BookSearchResult`, `BookSearchPage`, `CreateContentFromBookInput`; mutation `createContentFromBook(input: CreateContentFromBookInput!): Content! @auth`; queries `bookSearch(query: String!, page: Int): BookSearchPage!`, `bookTrending(window: TrendingWindow = WEEK, page: Int): BookSearchPage!`, `bookByISBN(isbn: String!): BookSearchResult`; `ContentType.BOOK`; `ContentSortBy.AUTHOR`; `Content.book: JSON` (mirrors `Content.movie: JSON` — the shaped payload, null for non-Book rows).

- [ ] **Step 1: Add to `schema.graphql`**, mirroring the exact Movie blocks (`MovieSearchResult`/`MovieSearchPage` at the `# One movie from TMDB search` comment, `CreateContentFromMovieInput`, the `createContentFromMovie` mutation line, the `movieSearch`/`movieTrending` query lines, `ContentType.MOVIE`, `Content.movie: JSON`):
  ```graphql
  # One book from Open Library search or trending (Discover page Books source).
  type BookSearchResult {
    workKey: String!
    title: String!
    authorName: [String!]!
    # Open Library cover id; build the URL as https://covers.openlibrary.org/b/id/<id>-<size>.jpg
    coverId: Int
    firstPublishYear: Int
    pageCountMedian: Int
    subjects: [String!]!
    ratingsAverage: Float
    ratingsCount: Int
    editionCount: Int
    # Canonical content URL (https://openlibrary.org/works/<id>) — pass to createContentFromBook
    url: String!
  }

  type BookSearchPage {
    items: [BookSearchResult!]!
    page: Int!
    totalPages: Int!
    totalResults: Int!
  }

  input CreateContentFromBookInput {
    # Open Library work URL, or a raw ISBN-10/ISBN-13 (resolved to a work key server-side)
    url: String!
  }
  ```
  Add `BOOK` to `enum ContentType`, `AUTHOR` to wherever `ContentSortBy` is declared as a GraphQL enum, `book: JSON` next to `movie: JSON` on `Content`, `createContentFromBook(input: CreateContentFromBookInput!): Content! @auth` next to `createContentFromMovie` under a `# Book mutations` comment, and `bookSearch`/`bookTrending`/`bookByISBN` next to `movieSearch`/`movieTrending` under a `# Book Discover queries` comment — same pagination defaults and comments as the Movie lines (`page` defaults to 1, max 500; `window` defaults to `WEEK`).
- [ ] **Step 2: Run `make graphql-gen`** from `backend/`.
- [ ] **Step 3: Resolve the known `schema.resolvers.go` collision** (see `backend/CLAUDE.md` → GraphQL): diff the stray file, confirm it only contains stub signatures for the new Book operations (no unrelated changes), copy nothing yet (Task 7 implements them for real), then `rm internal/adapters/graphql/resolvers/schema.resolvers.go` and rebuild to confirm `generated.go`/`models_gen.go` are unchanged by the removal.
- [ ] **Step 4: `go build ./...`** in `backend/` — must compile (stub resolvers aside, there are none left after Step 3; Task 7 adds the real ones, so this build will fail until Task 7 if resolvers aren't stubbed — if `go build` fails here because the new schema fields have no resolver yet, that's expected; confirm the *only* errors are "missing method" for the new Book resolvers, then proceed. Do not hand-write throwaway stub resolvers in this task.)
- [ ] **Step 5: Commit.**

---

## Task 3: Open Library adapter — search and trending

**Files:**
- Create: `backend/internal/core/ports/services/book_client.go`
- Create: `backend/internal/adapters/openlibrary/client.go`
- Create: `backend/internal/adapters/openlibrary/cache.go`
- Create: `backend/internal/adapters/openlibrary/testdata/search_east_of_eden.json`, `backend/internal/adapters/openlibrary/testdata/trending_weekly.json` (recorded fixtures — use the real responses already captured in the design doc/Postman collection for `q=East+of+Eden+Steinbeck` and `trending/weekly.json`)
- Test: `backend/internal/adapters/openlibrary/client_test.go`, `backend/internal/adapters/openlibrary/cache_test.go`

**Interfaces:**
- Produces: `services.BookSearchResult{WorkKey, Title, AuthorName []string, CoverID *int, FirstPublishYear *int, PageCountMedian *int, Subjects []string, RatingsAverage *float64, RatingsCount *int, EditionCount *int}`, `services.BookSearchPage{Items []BookSearchResult, Page, TotalPages, TotalResults int}`, `services.BookSearchClient` (`SearchBooks(ctx, query string, page int) (*BookSearchPage, error)`), `services.BookTrendingClient` (`TrendingBooks(ctx, window domain.TrendingWindow, page int) (*BookSearchPage, error)`), `openlibrary.Client` implementing both, `openlibrary.NewTrendingCache(inner services.BookTrendingClient, ttl time.Duration) *TrendingCache` (mirrors `tmdb.NewTrendingCache`).
- Consumes: `domain.TrendingWindow`, `domain.TrendingWindowDay`/`Week` (Task 1 already has these from the Movie work — no new Task needed).

- [ ] **Step 1: Write failing adapter tests** against the two fixtures: `TestClient_SearchBooks_EastOfEden` (asserts the top result's `WorkKey == "OL23166W"`, `Title == "East of Eden"`, `AuthorName == []string{"John Steinbeck"}`, `FirstPublishYear != nil && *FirstPublishYear == 1952`, `PageCountMedian != nil && *PageCountMedian == 611`) and `TestClient_TrendingBooks_Weekly` (top result `WorkKey == "OL17930368W"`, `Title == "Atomic Habits"`). Serve the fixtures via `httptest.NewServer` with the base URL overridden, mirroring `tmdb/client_test.go`'s pattern.
- [ ] **Step 2: Run them, confirm they fail** (package/types don't exist).
- [ ] **Step 3: Define the ports** in `book_client.go` (signatures above) and implement `openlibrary.Client` in `client.go`: `GET {baseURL}/search.json?q={query}&limit=25&page={page}&fields={fieldList}` and `GET {baseURL}/trending/{daily|weekly}.json?limit=25&page={page}&fields={fieldList}` (map `domain.TrendingWindowDay` → `daily`, `Week` → `weekly`). The `fields` constant is the exact list from Global Constraints — define it once, exported, so Task 4 and tests can reference the same value. No API key/header beyond `Accept: application/json`.
- [ ] **Step 4: Add `cache.go`**: `TrendingCache` wrapping a `BookTrendingClient`, in-memory TTL keyed by `(window, page)`, mirroring `tmdb.TrendingCache` field-for-field (including: only trending is cached, errors are never cached, per-process only). `DefaultTrendingTTL = time.Hour`.
- [ ] **Step 5: Write the cache test** mirroring `tmdb/cache_test.go`'s cases (hit, miss, expiry, error-not-cached).
- [ ] **Step 6: Run all adapter+cache tests, confirm they pass.**
- [ ] **Step 7: Commit.**

---

## Task 4: Open Library adapter — ISBN resolution

**Files:**
- Modify: `backend/internal/core/ports/services/book_client.go`
- Modify: `backend/internal/adapters/openlibrary/client.go`
- Create: `backend/internal/adapters/openlibrary/testdata/isbn_east_of_eden.json` (the real `/isbn/9780434740024.json` response, redirect target), `backend/internal/adapters/openlibrary/testdata/isbn_not_found.json` if needed to simulate the 404 path
- Test: `backend/internal/adapters/openlibrary/client_test.go` (same file, new test functions)

**Interfaces:**
- Produces: `services.BookISBNClient` (`ResolveISBN(ctx context.Context, isbn string) (workKey string, err error)` — returns `domain.ErrNotFound` when Open Library 404s).

- [ ] **Step 1: Write failing tests**: `TestClient_ResolveISBN_Found` (input `"9780434740024"`, expect `workKey == "OL23166W"`, no error — fixture is the edition JSON with `"works":[{"key":"/works/OL23166W"}]`), `TestClient_ResolveISBN_NotFound` (an isbn whose fixture server returns 404, expect `errors.Is(err, domain.ErrNotFound)`).
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement `ResolveISBN`**: `GET {baseURL}/isbn/{isbn}.json` (Go's `http.Client` follows the 302 by default — confirm this in the test server setup), parse `works[0].key`, strip the `/works/` prefix to return the bare id (so callers get the same bare id shape `SearchBooks` results use via `WorkKey`). Map HTTP 404 → `domain.ErrNotFound`.
- [ ] **Step 4: Run tests, confirm they pass.**
- [ ] **Step 5: Commit.**

---

## Task 5: ContentService — CreateFromBook, SearchBooks, TrendingBooks

**Files:**
- Modify: `backend/internal/core/services/content_service.go`
- Test: `backend/test/services/content_service_test.go` (or wherever `TestContentService_CreateFromMovie` lives — follow that file)

**Interfaces:**
- Consumes: `services.BookSearchClient`, `services.BookTrendingClient`, `services.BookISBNClient` (Tasks 3, 4), `domain.ContentTypeBook` (Task 1), `s.repo.GetByURL`/`GetOrCreateByURL` (existing `ContentRepository` port, same as Movie).
- Produces: `(s *ContentService) CreateFromBook(ctx context.Context, rawURLOrISBN string, userID int) (*domain.Content, error)`, `(s *ContentService) SearchBooks(ctx context.Context, query string, page int) (*services.BookSearchPage, error)`, `(s *ContentService) TrendingBooks(ctx context.Context, window domain.TrendingWindow, page int) (*services.BookSearchPage, error)`, `(s *ContentService) ResolveBookISBN(ctx context.Context, isbn string) (*services.BookSearchResult, error)` (resolves ISBN → work key → the same search-index lookup as create, for the ISBN tab's preview-before-add per spec §5; does not write).

- [ ] **Step 1: Write failing service tests**, mirroring `TestContentService_CreateFromMovie`'s structure, covering: success (new work key, mocked `BookSearchClient` returns the East-of-Eden-shaped result, asserts `content.ContentType == domain.ContentTypeBook`, `content.URL != nil && *content.URL == "https://openlibrary.org/works/OL23166W"`); duplicate work key → `errors.Is(err, domain.ErrAlreadyExists)` and the existing row returned (no second `SearchBooks` call — assert the mock's call count); **two distinct work keys for superficially similar titles never collide** (East of Eden vs. the Wayward Bus omnibus, per Review Focus — two separate `CreateFromBook` calls produce two separate rows, both checked via `GetByURL` returning `ErrNotFound` each time before creation); raw ISBN input (`"9780434740024"`) resolves via `BookISBNClient.ResolveISBN` first, then follows the same work-key path as a URL; unknown ISBN → the error the ISBN tab needs (`domain.ErrNotFound`); adapter error → wrapped, not leaked; `BookSearchClient` nil (unconfigured) → a `ErrBookClientUnavailable` sentinel mirroring `ErrMovieClientUnavailable`; an Open Library result missing `author_name` entirely (Review Focus) → `content.Response` stores it with no author, no panic, `AuthorName` empty slice not nil.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** `CreateFromBook` parses `rawURLOrISBN`: if it matches `^https://openlibrary\.org/works/(OL\w+)` extract the work key; else if it matches an ISBN-10/13 shape, call `s.bookISBN.ResolveISBN` to get the work key; else `domain.ErrInvalidInput`. Then: canonical URL = `"https://openlibrary.org/works/" + workKey`; check `s.repo.GetByURL` (dedupe before any further Open Library call, same ordering as Movie); on miss, call `s.bookSearch.SearchBooks(ctx, title-free lookup...)` — **note:** `search.json` has no "look up by work key directly" param; the pragmatic call is `q=key:"/works/<id>"` (spec §4's flagged, unverified assumption) — implement it and let Task 3's adapter tests catch it if the query syntax doesn't return the exact work; if it doesn't resolve, fall back to passing the work's title through once resolved via the fixture data already on hand from Task 3/4's recorded responses, and leave a `// TODO(verify):` comment plus a ledger note rather than silently papering over a real gap. Build `domain.Content{Name: result.Title, URL: &canonicalURL, ContentType: domain.ContentTypeBook, AddedByUserID: userID, Response: <marshaled BookSearchResult-shaped JSON>}`. `SearchBooks`/`TrendingBooks` are thin validated wrappers mirroring `SearchMovies`/`TrendingMovies` exactly (query 1-100 runes trimmed, page 1-500, nil-client sentinel). `ResolveBookISBN` resolves ISBN → work key → one `SearchBooks`-equivalent lookup, returns the `BookSearchResult` without writing.
- [ ] **Step 4: Run tests, confirm they pass.**
- [ ] **Step 5: Commit.**

---

## Task 6: Repository — Author sort rule

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/helpers.go`
- Test: `backend/internal/adapters/repositories/postgres/helpers_test.go` (wherever `ContentSortByAgeRating`'s rule is tested) + a query-count test in `backend/internal/perf/querycount` style if the existing Movie sort rules have one

**Interfaces:**
- Consumes: `domain.ContentSortByAuthor` (Task 1).
- Produces: a `paginator.Rule` case for `domain.ContentSortByAuthor` usable by any list query's `ORDER BY`.

- [ ] **Step 1: Write the failing test** asserting the `SQLRepr` for `ContentSortByAuthor` is `"response->'authorName'->>0"` (mirrors the `ContentSortByBoxOffice`/`AgeRating` cases' shape — text extraction, first array element) and that a missing/empty author sorts last (`NULLReplacement` set to a value that sorts after real authors, e.g. an empty string won't do since real authors could start with punctuation — use `NULL`-last via the same `CASE WHEN response->'authorName'->>0 IS NULL OR response->'authorName'->>0 = '' THEN NULL ELSE response->'authorName'->>0 END` pattern Task 1's Review Focus requires, rather than a bare path that could sort an absent author first alphabetically).
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Add the `case domain.ContentSortByAuthor:` branch** to the sort-rule switch in `helpers.go`, next to `ContentSortByAgeRating`.
- [ ] **Step 4: Run it, confirm it passes.**
- [ ] **Step 5: Commit.**

---

## Task 7: Resolvers

**Files:**
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go`
- Test: `backend/internal/adapters/graphql/resolvers/content_test.go` (wherever `TestMutationResolver_CreateContentFromMovie` lives)

**Interfaces:**
- Consumes: `model.CreateContentFromBookInput`, `model.BookSearchPage`, `model.BookSearchResult` (generated by Task 2), `r.ContentService.CreateFromBook/SearchBooks/TrendingBooks/ResolveBookISBN` (Task 5), `domainToModel` (existing helper).

- [ ] **Step 1: Write failing resolver tests**, mirroring `CreateContentFromMovie`'s resolver test cases exactly (success, unauthenticated → "access denied", invalid input → "invalid book URL or ISBN", not found → "book not found", already-exists → idempotent return) plus `bookSearch`/`bookTrending`/`bookByISBN` query resolver tests (success, service error passthrough).
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement**, copying `CreateContentFromMovie`'s structure verbatim (auth check via `auth.RequireAuth`, `errors.Is(err, domain.ErrAlreadyExists)` idempotent branch, the same error-message switch pattern with Book's own messages) and `MovieSearch`/`MovieTrending`'s structure for the three query resolvers (including the `window *domain.TrendingWindow` nil-means-default handling).
- [ ] **Step 4: `go build ./...` && `go test ./...`** in `backend/` — zero errors, all green. This closes out Task 2's deferred build gap.
- [ ] **Step 5: Commit.**

---

## Task 8: Frontend — Open Library API service + GraphQL defs

**Files:**
- Create: `frontend/src/lib/services/openLibraryApi.ts`
- Modify: `frontend/src/lib/queries/content/index.ts`
- Test: `frontend/tests/unit/openLibraryApi.test.ts`

**Interfaces:**
- Produces: `openLibraryKeys` (mirrors `tmdbKeys`: `all`, `search(query, page)`, `trending(window, page)`), `searchBooks(query, page)`, `fetchTrendingBooks(window, page)`, `resolveBookISBN(isbn)`, `BookSearchResult`/`BookSearchPage` TS interfaces, `coverUrl(coverId, size)` (mirrors `tmdbPosterUrl`: `https://covers.openlibrary.org/b/id/<id>-<size>.jpg`, sizes `'S'|'M'|'L'`), `BOOK_SEARCH_MIN_LENGTH`/`MAX_LENGTH`/`DEBOUNCE_MS`/`STALE_TIME` constants (same values as the Movie equivalents unless the design doc says otherwise — it doesn't, so reuse Movie's), `CREATE_CONTENT_FROM_BOOK` gql mutation + `CreateContentFromBookResponse` TS type in `queries/content/index.ts` (mirrors `CREATE_CONTENT_FROM_MOVIE`'s exact field selection: `id name url contentType`).

- [ ] **Step 1: Write failing tests** for `coverUrl` (null coverId → null; a real id → the exact URL shape), and for `searchBooks`/`fetchTrendingBooks`/`resolveBookISBN` (mock `graphqlRequest`, assert the query sent and the field mapped back from `data.bookSearch`/`data.bookTrending`/`data.bookByISBN`), mirroring `tmdbApi.test.ts`'s structure.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement**, copying `tmdbApi.ts` structure 1:1 (same `gql` query shapes, same stale-time comments, same "no API key reaches the browser" framing — true here for a different reason, since Open Library needs no key at all).
- [ ] **Step 4: Run tests, confirm they pass.**
- [ ] **Step 5: `pnpm run check`** in `frontend/` — zero new type errors.
- [ ] **Step 6: Commit.**

---

## Task 9: Frontend — useAddBook hook

**Files:**
- Create: `frontend/src/lib/queries/content/useAddBook.ts`
- Test: `frontend/tests/unit/useAddBook.test.ts` (or wherever `useAddMovie`'s hook-level test lives — if none exists for Movie, cover this one via the component tests in Tasks 10-13 instead and note that in the task's completion ledger line)

**Interfaces:**
- Consumes: `CREATE_CONTENT_FROM_BOOK` (Task 8).
- Produces: `useAddBook() => { mutate(urlOrISBN: string, opts?), isPending }`.

- [ ] **Step 1: Write the failing test(s)** for success (toast + cache invalidation of `queryKeys.content.lists()`) and the error-message branches, mirroring `useAddMovie`'s four `onError` branches (not-allowed, network, invalid/not-found, auth) with Book-appropriate copy ("Invalid book link or ISBN", "Please sign in to add a book").
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement**, copying `useAddMovie.ts` verbatim with Book nouns substituted.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

---

## Task 10: Frontend — BookCard component

**Files:**
- Create: `frontend/src/lib/components/discover/BookCard.svelte`
- Test: `frontend/tests/components/BookCard.test.ts`

**Interfaces:**
- Consumes: `BookSearchResult` (Task 8), `coverUrl` (Task 8).
- Produces: `<BookCard result isInLibrary isPending onAdd />` (same prop shape as `MovieCard`).

- [ ] **Step 1: Write failing component tests** mirroring `MovieCard.test.ts`'s cases: cover renders when `coverId` present; glyph placeholder (a book icon, not `FilmIcon`) when absent; title links to `result.url`; author line renders `authorName[0]`, "Author unknown" style fallback when the array is empty (Review Focus: missing author); meta line shows year/pages/rating; **rating is hidden/muted when `ratingsCount < 5`** (Review Focus boundary: test both `ratingsCount: 4` muted and `ratingsCount: 5` not muted); tag chips render up to N with "+N more"; "In Library" disabled state; "Adding…" pending state; "Add to Perspectize" default state.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement**, copying `MovieCard.svelte`'s structure (same classes: `border border-border rounded-lg bg-card`, same button states) with a `BookIcon`/`BookOpenIcon` placeholder instead of `FilmIcon`, and no `StarIcon` score badge logic changes beyond the `<5` dimming rule (use a muted text class, not hiding the number entirely — spec says "muted", not "hidden").
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

---

## Task 11: Frontend — BookSearchPanel component

**Files:**
- Create: `frontend/src/lib/components/discover/BookSearchPanel.svelte`
- Test: `frontend/tests/components/BookSearchPanel.test.ts`

**Interfaces:**
- Consumes: `BookCard` (Task 10), `searchBooks`/`openLibraryKeys` (Task 8).
- Produces: `<BookSearchPanel bind:value bind:inputRef libraryUrls pendingUrl onAdd />` (same prop shape as `MovieSearchPanel`, minus the `onAddUrl` link-paste affordance — Book's URL/ISBN paste goes through the dedicated ISBN tab per spec §5, not auto-detected in Search).

- [ ] **Step 1: Write failing tests** mirroring `MovieSearchPanel`'s (debounced search fires after the quiet period; results render via `BookCard`; loading skeleton while debouncing/pending; **empty-results state renders "No books found for '{query}'"** — Review Focus, this exact case has no Movie-doc precedent to copy verbatim so it needs its own assertion; error state with retry; Load More pagination).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement**, copying `MovieSearchPanel.svelte` structure, dropping the `isLink`/`onAddUrl` branch entirely (no link-paste shortcut here), and showing `BookTrendingFeed`-equivalent idle state is NOT shown from this panel (Trending is its own top-level tab per spec §1's three-tabs decision, unlike Movie where idle search shows trending inline) — so the idle state (query shorter than `BOOK_SEARCH_MIN_LENGTH`) is just a prompt: "Search Open Library for a book to add to Perspectize."
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

---

## Task 12: Frontend — BookTrendingFeed component

**Files:**
- Create: `frontend/src/lib/components/discover/BookTrendingFeed.svelte`
- Test: `frontend/tests/components/BookTrendingFeed.test.ts`

**Interfaces:**
- Consumes: `BookCard` (Task 10), `fetchTrendingBooks`/`openLibraryKeys` (Task 8).
- Produces: `<BookTrendingFeed bind:timeWindow libraryUrls pendingUrl onAdd />` (same prop shape as `MovieTrendingFeed`).

- [ ] **Step 1: Write failing tests** mirroring `MovieTrendingFeed`'s (window toggle switches query; Load More; loading/error states) **plus one new assertion the Movie component has no equivalent for: the trending-skew disclosure line renders** ("What's being looked up on Open Library right now — skews toward current nonfiction", spec §6) — test that it's present regardless of window.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement**, copying `MovieTrendingFeed.svelte` structure, window labels `{DAY: 'Today', WEEK: 'This week'}` (same as Movie's `WINDOWS` array), with the disclosure `<p>` always rendered above the results list.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

---

## Task 13: Frontend — BookISBNPanel component

**Files:**
- Create: `frontend/src/lib/components/discover/BookISBNPanel.svelte`
- Test: `frontend/tests/components/BookISBNPanel.test.ts`

**Interfaces:**
- Consumes: `BookCard` (Task 10), `resolveBookISBN` (Task 8), `useAddBook` (Task 9).
- Produces: `<BookISBNPanel libraryUrls pendingUrl onAdd />` — owns its own input and lookup state (no bound `value`/`inputRef` needed from the parent page, since the ISBN tab has no Cmd+K focus target per spec — only Search does, matching `SearchBar`/`MovieSearchPanel`'s existing Cmd+K wiring, which this task does not extend).

- [ ] **Step 1: Write failing tests** for every state spec §5 and the design's Postman collection name: idle (empty input, no result area); **malformed input rejected client-side with no network call** (assert the mock `resolveBookISBN` was never invoked — spec §5's "load-bearing" checksum validation); resolving (brief loading state before the mocked promise resolves); found (renders a `BookCard`-style result with an explanatory note that it dedupes to the same work as any other add path — spec §2); not-found (a clean 404 message, not a raw error dump); **a resolution landing on a title/author that looks unrelated to what was typed renders normally without special-casing** (Review Focus — the panel must not try to detect "this doesn't look right," it just shows whatever `resolveBookISBN` returns, per spec §5's finding that this can legitimately happen).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement**: an ISBN-10/13 client-side validator (checksum, not just length — reuse or write a small `isValidISBN` util alongside the component, unit-tested directly in Step 1's test file or a sibling `isbn.test.ts`), a text input + "Look up" button, and a `createQuery`-or-manual-fetch call to `resolveBookISBN` gated on a valid, submitted ISBN. On a found result, render it via `BookCard` with `onAdd` wired to `useAddBook`'s `mutate` called with the **original work URL** the resolution returned (not the typed ISBN) so `createContentFromBook`'s dedupe behaves identically to the Search/Trending path.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

---

## Task 14: Frontend — wire the Books source into the Discover page

**Files:**
- Modify: `frontend/src/routes/discover/+page.svelte`
- Test: `frontend/tests/components/discover-page.test.ts` or wherever the existing `source` switch (`youtube`/`movies`) is tested — extend it; if no such test file exists, add one covering the three-way `source` switch and the Books sub-tab switch.

**Interfaces:**
- Consumes: `BookSearchPanel`, `BookTrendingFeed`, `BookISBNPanel` (Tasks 11-13), `useAddBook` (Task 9).

- [ ] **Step 1: Write failing tests**: `source=books` shows the Books sub-tabs (Search/Trending/ISBN) and defaults to Search; switching sub-tabs swaps the rendered panel; the URL reflects `?source=books` the same way `?source=movies` does today (reuse the existing `setSource`/`page.url.searchParams` pattern — extend its `Source` type to `'youtube' | 'movies' | 'books'`); a fourth, nested `bookSubSource` local/URL-reflected state for Search/Trending/ISBN (decide whether this needs its own query param, e.g. `?source=books&tab=isbn`, or can be component-local state that resets on navigation — **ruling, since the spec is silent on persistence**: component-local `$state`, not URL-reflected, because none of Movie's internal states (its own search-vs-trending idle toggle) are URL-reflected either, and matching that precedent is lower-risk than inventing new URL schema the spec never asked for).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement**: extend the `Source` type and `setSource`, add the `Books` button to the `source-tabs` row (reusing the exact `Button variant/size` pattern), and render the three new sub-tab buttons + conditionally one of the three Book panels when `source === 'books'`, following the same `role="tablist"` pattern the top-level source switcher already uses.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

---

## Task 15: Frontend — Activity grid Author/Published/Pages/Rating/Tags for Book

**Files:**
- Modify: `frontend/src/lib/utils/grid-config.ts`
- Modify: `frontend/src/lib/utils/formatting.ts`
- Test: `frontend/tests/unit/formatting.test.ts`, `frontend/tests/unit/bookColumns.test.ts` (new, mirrors `movieColumns.test.ts`)

**Interfaces:**
- Consumes: `Content.book: JSON` (Task 2).
- Produces: `BookRow` interface + `bookResponse(row)` (mirrors `MovieRow`/`movieResponse` exactly: `row.contentType !== 'BOOK' → null`; else `row.book ?? row.response`, JSON-parsed if string), `bookAuthorValueGetter`, `bookPublishedValueGetter` (returns the plain year as a string — **never run through `.toLocaleString()`**, per Global Constraints), `bookPagesValueGetter`, `bookRatingValueGetter` + `isLowBookRatingCount` (the `< 5` boundary, mirroring `hasLowVoteCount`'s shape but with the new threshold), a new `COLUMNS` entry `{ colId: 'author', label: 'Author', ... }` inserted as a default-visible column for Book (mirrors how `cast`/`genre`/`rated` are Movie-only defaults — same `defaultColumnVisibility`-style gating, scoped to `BOOK`), and an extension of `contentTags` to fall back to `bookResponse(row)?.subjects` when `movieResponse` is null and the row is a Book.

- [ ] **Step 1: Write failing formatter tests**: `bookPublishedValueGetter` returns `"1952"` as a plain string (assert it is NOT run through any `toLocaleString`-style path — a regression test is a four-digit year with no comma, which is trivially true for any single call, so the real test is on the **rendering path**: assert the grid cell's rendered text for year `1952` contains no comma, and separately for a hypothetical 5-digit edge case if the codebase's number formatter would ever comma-format a 4-digit number — Movie's `releaseYear`/date columns don't hit this, so this is Book's own new risk surface); `bookRatingValueGetter`/`isLowBookRatingCount` boundary table: `ratingsCount: 4` → muted, `5` → not muted (Review Focus); `bookAuthorValueGetter` on a row with empty `authorName` → `null`, not a crash, and sorts/filters last (pair with Task 6's backend rule — this is the client-side mirror for "Loaded" mode and the mobile card list); `contentTags` falls back to `bookResponse(row)?.subjects` for a `BOOK` row when `movieResponse` is null.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the `BookRow`/`bookResponse` pair (copy `MovieRow`/`movieResponse` verbatim, substitute `'BOOK'`/`row.book`), the four value-getters, extend `contentTags`'s fallback chain, and add the `author` entry to `COLUMNS` right after whatever entry currently sits where a Book-specific column set begins (follow the existing Movie-columns comment block's placement convention — add a parallel `// Book columns (BOOK rows read their `book` JSON...)` comment).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: `pnpm run check` && `pnpm run test:run`** in `frontend/` — zero new errors, all green.
- [ ] **Step 6: Commit.**

---

## Self-review notes (for the plan author, not the implementer)

- **Spec coverage:** §1 (data sources) → Tasks 3, 4, 8. §2 (identity) → Tasks 5, 6, 15 (Review Focus dedupe case). §3 (ports) → Tasks 3, 4. §4 (add flow) → Task 5. §5 (ISBN tab) → Tasks 4, 5, 13. §6 (trending disclosure) → Task 12. §7/§7a/§7b (columns, pages, tags) → Tasks 6, 15. §8 (details view: description + related works) is **not in this plan** — the design doc's §8 layout decision was for the Activity-table details modal, which already exists for other types; wiring Book's `description`/related-works into that modal is a reasonable follow-up but the design doc's own timing note ("when it's fetched is still open") means it's not yet specified enough to plan — flagged here rather than silently included or silently dropped. §9 (Amazon) and the dropped word-count section correctly have no tasks.
- **Type consistency:** `BookSearchResult` field names (`workKey`, `authorName`, `coverId`, `firstPublishYear`, `pageCountMedian`, `subjects`, `ratingsAverage`, `ratingsCount`, `editionCount`, `url`) are used identically across Tasks 2 (schema), 3/4 (Go struct), 5 (service), 7 (resolver), 8 (frontend TS type) — checked for drift.
- **Proportion:** this plan is longer than the spec because three new Svelte components and a Go adapter package are being created from nothing (no existing Book code to point at), unlike a plan that only modifies existing files — code blocks are kept to the one place (Task 2's schema additions) where exact copy-paste text matters; every other task gives signatures and test names, not bodies.

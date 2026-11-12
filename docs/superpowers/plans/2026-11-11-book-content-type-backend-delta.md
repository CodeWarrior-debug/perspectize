# Book Content Type — Backend Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Book backend (PR #670) in line with the decisions settled on 2026-11-11 and with what the frontend plan reads, and wire it into the running server.

**Architecture:** No new tables, no migration: everything lives in the `content.response` JSONB. One new port (`BookWorkClient`: the canonical `/works/{id}.json` and `/books/{id}.json` records) implemented by the existing `openlibrary.Client`; `CreateFromBook` enriches the stored payload at add time; `UpdateSourceData` learns BOOK; the Author sort and a new `authorContains` filter read the first author from a structured `authors` list.

**Tech Stack:** Go, gqlgen (schema-first), GORM + pgx, testify, hand-written mocks under `test/`.

**Spec:** `docs/superpowers/specs/2026-11-09-book-content-type-discover-design.md` as revised on `origin/feature/book-content-type-intent` (§2 identity, §4 add flow and authors, §5 ISBN, §8 details). Stacks on PR #670. Consumer: `docs/superpowers/plans/2026-11-11-book-content-type-frontend.md` (its "Prerequisite" table is this plan's scope).

## Global Constraints

- **No migration.** Never run `make migrate-up/down`; `DATABASE_URL` is the shared Neon database.
- **Stored `response` shape for BOOK (replaces the #670 shape; nothing is merged or deployed yet, so no backfill):**
  `{ workKey, title, authors: [{ name, openLibraryKey? }], coverId, firstPublishYear, pageCountMedian, subjects: [], ratingsAverage, ratingsCount, editionCount, description?, relatedWorks: [{ title, url }], resolvedFromISBN? }`. `authorName` is no longer stored. Slices are never `null` (`[]`); `description` and `resolvedFromISBN` are omitted when empty.
- The Discover GraphQL type `BookSearchResult.authorName: [String!]!` is unchanged.
- Identity stays `https://openlibrary.org/works/<OL…W>`; `resolvedFromISBN` is the normalised ISBN the user supplied (digits, trailing `X` uppercase), and is metadata only.
- Related works are canonical work URLs: `https://openlibrary.org/works/OL<digits>W` (slug dropped).
- Open Library errors never leak the upstream URL or body (existing `ErrOpenLibraryAPI` convention); resolvers keep returning generic messages.
- Work-record fetches are **best effort**: any error there is logged and the add/refresh continues without description data.
- Hexagonal rules: domain imports nothing outward; service depends on ports; adapter implements them; wiring only in `cmd/server/main.go`. Adding a method to a port breaks its mocks, so update the mocks under `test/`.
- `make graphql-gen` ends with a colliding `resolvers/schema.resolvers.go`: diff it, confirm it contains only stubs for the new fields, delete it, rebuild (see `backend/CLAUDE.md` → GraphQL).
- No chained shell commands. Run targeted tests while iterating; one full `go test ./...` before pushing. `gofmt -l .` must be empty.
- Conventional Commits, one logical change each; label the PR `new-content-type`; release is "dark backend" (no frontend caller yet).

## Review Focus

1. A work record whose `description` is a plain string, a `{type, value}` object, empty, or absent, and whose text uses `\r\n`: all must yield clean `\n` text or no description, never an error.
2. A description containing a `---` rule that is **not** followed by "Contains:"/"Also contained in:" must keep its full text (no truncation, no related works).
3. `author_name` and `author_key` arrays of different lengths, or no `author_key` at all: names are kept, and no key is ever attached to the wrong author.
4. Open Library down or 404 on the work record: the book is still created/refreshed; a refresh never wipes an existing description, related works or `resolvedFromISBN`.
5. Pasted-link variants (`http://`, no scheme, `www.`, slug, query string, edition link whose record has no `works`), hyphenated/spaced ISBNs, and an id with path characters: all handled or rejected as `ErrInvalidInput` before any URL is built.

---

### Task 1: Wire Open Library into the server (gap in #670)

`cmd/server/main.go` builds `ContentService` with YouTube and Movie options only, so on a running server every Book operation returns `ErrBookClientUnavailable`.

**Files:**
- Create: `backend/cmd/server/books.go`
- Modify: `backend/cmd/server/main.go:~239` (append the options to the `services.NewContentService(...)` call)
- Test: `backend/cmd/server/books_test.go`

**Interfaces:**
- Produces: `bookServiceOptions() []services.ContentServiceOption` — builds one `openlibrary.NewClient()` and returns `WithBookSearch(client)`, `WithBookTrending(openlibrary.NewTrendingCache(client, openlibrary.DefaultTrendingTTL))`, `WithBookISBN(client)`. Later tasks add `WithBookWork(client)` here.

- [ ] **Step 1: Write the failing test** `TestBookServiceOptions_ConfigureBookClients`: build `services.NewContentService(nil, nil, nil, bookServiceOptions()...)` and assert, without any network call, that `SearchBooks(ctx, "", 1)` returns an error satisfying `errors.Is(err, domain.ErrInvalidInput)` (a configured client validates the query; an unconfigured one returns `ErrBookClientUnavailable` first), and likewise `TrendingBooks(ctx, "BAD", 1)`.
- [ ] **Step 2: Run it; expect FAIL** (`bookServiceOptions` undefined). `go -C backend test ./cmd/server -run TestBookServiceOptions`
- [ ] **Step 3: Implement** `bookServiceOptions` in `books.go` and pass `bookServiceOptions()...` as extra options in `main.go`.
- [ ] **Step 4: Run it; expect PASS.**
- [ ] **Step 5: Commit** `fix(backend): wire Open Library clients into the content service`

### Task 2: Structured authors in the stored payload and Author sort

**Files:**
- Modify: `backend/internal/adapters/openlibrary/client.go` (add `author_key` to `Fields`; `olWork.AuthorKey []string`; map to the result)
- Modify: `backend/internal/core/ports/services/book_client.go` (`BookSearchResult.AuthorKey []string`, parallel to `AuthorName`)
- Modify: `backend/internal/core/services/content_service.go` (`shapedBook`, `shapeBookResult`)
- Modify: `backend/internal/adapters/repositories/postgres/helpers.go:~247` (Author sort path)
- Create: `backend/internal/adapters/openlibrary/testdata/search_by_key_east_of_eden.json` (record live: `curl -s 'https://openlibrary.org/search.json?q=key:%22/works/OL23166W%22&fields=<Fields>'`)
- Test: `backend/internal/adapters/openlibrary/client_test.go`, `backend/test/services/content_service_book_test.go` (update `TestCreateFromBook_MissingAuthorNameNoPanic` and the shape assertions in `TestCreateFromBook_Success`), `backend/internal/adapters/repositories/postgres/helpers_test.go` and `computed_cursor_test.go` (Author rule SQL)

**Interfaces:**
- Produces: `type shapedAuthor struct { Name string \`json:"name"\`; OpenLibraryKey string \`json:"openLibraryKey,omitempty"\` }`; `shapedBook.Authors []shapedAuthor \`json:"authors"\`` replaces `AuthorName`; `shapeBookResult` pairs `AuthorName[i]` with `AuthorKey[i]` **only when both slices have equal length**, otherwise names only. Author sort `SQLRepr`: `CASE WHEN response->'authors'->0->>'name' IS NULL OR response->'authors'->0->>'name' = '' THEN NULL ELSE response->'authors'->0->>'name' END` (same `NULLReplacement` as today).

- [ ] **Step 1: Write failing tests.** Adapter: `SearchBooks` against the new fixture returns `AuthorName == ["John Steinbeck"]` and `AuthorKey == ["OL25788A"]`; the existing fixtures (no `author_key`) still parse with `AuthorKey == nil`; the request's `fields` query value equals the exported `Fields` and contains `author_key`. Service: stored response for East of Eden unmarshals to `authors == [{name:"John Steinbeck", openLibraryKey:"OL25788A"}]` and has no `authorName` key; missing authors → `"authors":[]`; two names and three keys → names kept, `openLibraryKey` absent on both; no keys → names only. Repository: the `ContentSortByAuthor` rule equals the SQL above for ASC and DESC.
- [ ] **Step 2: Run them; expect FAIL.** `go -C backend test ./internal/adapters/openlibrary ./internal/adapters/repositories/postgres ./test/services -run "Book|Author"`
- [ ] **Step 3: Implement** the field, mapping, shape and sort path per the Interfaces block.
- [ ] **Step 4: Run them; expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): store book authors as a structured list and sort by the first`

### Task 3: Work and edition records (port + adapter)

**Files:**
- Modify: `backend/internal/core/ports/services/book_client.go`
- Create: `backend/internal/adapters/openlibrary/work.go`
- Modify: `backend/internal/adapters/openlibrary/client.go` (share the edition→work-key extraction between `ResolveISBN` and `ResolveEdition`)
- Create: `backend/internal/adapters/openlibrary/testdata/work_east_of_eden.json` (live `/works/OL23166W.json` reduced to `key`, `title`, `description` — keep the `{type, value}` form), `work_atomic_habits.json` (plain-string description), `edition_east_of_eden.json` (exists as `isbn_east_of_eden.json`; reuse it)
- Test: `backend/internal/adapters/openlibrary/work_test.go`

**Interfaces:**
- Produces (port): `type BookRelatedWork struct { Title, URL string }`; `type BookWork struct { Description string; RelatedWorks []BookRelatedWork }`; `type BookWorkClient interface { FetchWork(ctx context.Context, workKey string) (*BookWork, error); ResolveEdition(ctx context.Context, editionKey string) (workKey string, err error) }`. `FetchWork("OL23166W")` and `ResolveEdition("OL22640535M")` take **bare** ids. Both return `domain.ErrInvalidInput` for an id that does not match `^OL\d+W$` / `^OL\d+M$`, and `domain.ErrNotFound` on a 404. `*Client` satisfies `BookWorkClient`.
- Produces (adapter, unexported): `parseWorkRecord(raw []byte) (*services.BookWork, error)`; `splitRelatedWorks(text string) (description string, related []services.BookRelatedWork)`.

- [ ] **Step 1: Write failing tests** (httptest server, base URL overridden like `client_test.go`):
  - East of Eden: `Description` starts `Steinbeck considered East of Eden`, contains no `\r`, does not contain `Contains:`, and ends with the `([source](http://www.steinbeck.org/about-john/his-works/))` line; `RelatedWorks` has 6 entries, first `{Title:"East of Eden 1/2", URL:"https://openlibrary.org/works/OL17811975W"}`, last `{Title:"Reader's Digest Condensed Books: Spring 1953 Selections", URL:"https://openlibrary.org/works/OL15158232W"}` (slug dropped; both the "Contains:" and "Also contained in:" lists included).
  - Atomic Habits: plain-string description returned verbatim, `RelatedWorks` is empty (non-nil).
  - Table of `splitRelatedWorks`: no rule → whole text, none related; `---` followed by an ordinary paragraph → whole text kept, none related (Review Focus 2); relative links `[X](/works/OL1W/X)` become absolute canonical; a non-work link in the tail (`https://example.com`) is dropped; duplicate URLs collapse; empty/absent description → `""`.
  - `FetchWork("OL1W/../x")` and `("")` → `ErrInvalidInput` with **no request made**; 404 → `ErrNotFound`; 500 → error `errors.Is(err, ErrOpenLibraryAPI)` whose message contains no URL.
  - `ResolveEdition("OL22640535M")` → `"OL23166W"`; edition with no `works` → `ErrOpenLibraryAPI`; `ResolveEdition("OL23166W")` (a work id) → `ErrInvalidInput`.
- [ ] **Step 2: Run; expect FAIL.** `go -C backend test ./internal/adapters/openlibrary`
- [ ] **Step 3: Implement.** `description` is decoded as `json.RawMessage` and accepted as a string or an object with a `value` string. Normalise `\r\n` to `\n`. `splitRelatedWorks`: the related block starts at the first line that is exactly `---` whose next non-blank line starts (case-insensitive) with `Contains` or `Also contained in`; description is the text before that rule, trimmed; related works are the markdown links `[title](url)` in the remainder whose URL matches `(?:https://openlibrary\.org)?/works/(OL\d+W)`, emitted in order as `https://openlibrary.org/works/<id>`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): fetch Open Library work records and resolve edition links`

### Task 4: CreateFromBook enrichment, edition links, link variants

**Files:**
- Modify: `backend/internal/core/services/content_service.go` (`bookWork` field, `WithBookWork`, input parsing, `CreateFromBook`, `ResolveBookISBN`, `shapedBook`)
- Modify: `backend/cmd/server/books.go` (add `WithBookWork(client)`)
- Test: `backend/test/services/content_service_book_test.go` (new mock `mockBookWorkClient` beside the existing three), `backend/cmd/server/books_test.go`

**Interfaces:**
- Consumes: `BookWorkClient` (Task 3), `shapedAuthor` (Task 2).
- Produces: `WithBookWork(client portservices.BookWorkClient) ContentServiceOption`; unexported `parseBookInput(raw string) (kind bookInputKind, id string, err error)` with kinds `workID | editionID | isbn`; unexported `normalizeISBN(raw string) string` (strips spaces and hyphens, uppercases `x`); `shapedBook` gains `Description string \`json:"description,omitempty"\``, `RelatedWorks []shapedRelatedWork \`json:"relatedWorks"\`` (never nil), `ResolvedFromISBN string \`json:"resolvedFromISBN,omitempty"\``. `parseBookInput` accepts, case-insensitively and with the front unanchored like the Movie parser: `openlibrary.org/works/OL<d>W` and `openlibrary.org/books/OL<d>M` (scheme optional, `www.` optional, slug/query/hash allowed), and an ISBN-10/13 after `normalizeISBN`; anything else → `domain.ErrInvalidInput`. The stored URL is always `canonicalBookURL(workKey)`.

- [ ] **Step 1: Write failing tests.**
  - `parseBookInput` table: `https://openlibrary.org/works/OL23166W`, `http://www.openlibrary.org/works/OL23166W/East_of_Eden?x=1`, `openlibrary.org/works/ol23166w` → workID `OL23166W`; `https://openlibrary.org/books/OL22640535M` → editionID; `978-0-434-74002-4` and `0 434 74002 0` → isbn (normalised); `https://openlibrary.org/authors/OL26320A`, `https://example.com/works/OL23166W`, `OL23166W`, `""`, `OL1W/../x` → `ErrInvalidInput`.
  - `CreateFromBook` with the work client mocked: stored response contains the description and related works from the mock; a work URL → `resolvedFromISBN` absent; a hyphenated ISBN → `resolvedFromISBN == "9780434740024"` and `isbn` resolver called with the normalised value; an edition link → `ResolveEdition` called with `OL22640535M`, then the usual duplicate check on the **work** URL (a second add via the work URL returns `ErrAlreadyExists` with no second search call); edition `ErrNotFound` → `ErrNotFound`; `FetchWork` returning an error → row still created, `description` absent, `relatedWorks == []`; `WithBookWork` not applied (nil client) → same as the error case, not `ErrBookClientUnavailable`; edition link with a nil work client → `ErrBookClientUnavailable`.
  - `ResolveBookISBN` accepts a hyphenated ISBN.
  - `cmd/server`: `TestBookServiceOptions_ConfigureBookClients` also asserts `len(bookServiceOptions()) == 4` (search, trending, ISBN, work), since no network-free call exercises the work client.
- [ ] **Step 2: Run; expect FAIL.** `go -C backend test ./test/services ./cmd/server -run "Book"`
- [ ] **Step 3: Implement.** Replace `bookWorksURLRe`/`isbnRe` use in `CreateFromBook` and `ResolveBookISBN` with `parseBookInput`. Order stays: parse → client-nil checks → (edition/ISBN resolution) → duplicate check by canonical URL → `lookupBookByWorkKey` → best-effort `FetchWork` (log with `slog.Warn`, no upstream detail) → shape → `GetOrCreateByURL`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): enrich books at add time and accept Open Library edition links`

### Task 5: UpdateSourceData for BOOK

**Files:**
- Modify: `backend/internal/core/services/content_service.go` (`UpdateSourceData` dispatches on `existing.ContentType`; new unexported `refreshBook`)
- Test: `backend/test/services/content_service_book_test.go` (or `content_service_test.go` beside the YouTube refresh tests, whichever holds their mocks)

**Interfaces:**
- Consumes: `lookupBookByWorkKey`, `shapeBookResult`, `BookWorkClient`.
- Produces: `refreshBook(ctx context.Context, existing *domain.Content) (*domain.Content, error)` — work key from `existing.URL` via `parseBookInput`; fresh search result; best-effort `FetchWork`; **preserves** `resolvedFromISBN` from the existing response; keeps the existing `description` and `relatedWorks` when the fresh `FetchWork` fails; writes via `s.repo.UpdateMetadata(ctx, id, result.Title, json, nil)`. YouTube behaviour is unchanged; other types still return `ErrInvalidInput` (Movie refresh stays out of scope).

- [ ] **Step 1: Write failing tests:** success renames the row from the fresh title and stores fresh ratings; `resolvedFromISBN` survives; `FetchWork` error keeps the previous description and related works; `FetchWork` success replaces them; search returns nothing → `ErrNotFound`; `bookSearch` nil → `ErrBookClientUnavailable`; the repo mock sees exactly one `GetByID` and one `UpdateMetadata` (the DB cost is unchanged, so no new query-budget test); a YouTube row still goes down the YouTube path (existing tests keep passing); a MOVIE row → `ErrInvalidInput`.
- [ ] **Step 2: Run; expect FAIL.** `go -C backend test ./test/services -run "UpdateSourceData"`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): refresh book source data from Open Library`

### Task 6: `authorContains` filter

**Files:**
- Modify: `backend/schema.graphql` (`ContentFilter`: `authorContains: String # Case-insensitive contains on the first author's name (books only)`)
- Modify: `backend/internal/core/domain/pagination.go` (`ContentFilter.AuthorContains *string`)
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go:~531` (map it beside `GenreContains`)
- Modify: `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` (new `applyBookColumnFilters`, called beside `applyMovieColumnFilters` at ~line 350)
- Regenerate: `make graphql-gen` (then resolve the `schema.resolvers.go` collision)
- Test: `backend/test/resolvers/content_resolver_test.go` (mapping, beside the `genreContains` case at ~line 1586), `backend/internal/adapters/repositories/postgres/book_filters_test.go` (mirror `movie_filters_test.go`: SQL + bound args + query count)

**Interfaces:**
- Produces: `applyBookColumnFilters(query *gorm.DB, f *domain.ContentFilter) *gorm.DB` — when `AuthorContains` is non-empty adds `Where("(response->'authors'->0->>'name') ILIKE ?", "%"+value+"%")`, value always bound; empty string adds nothing; rows without the key never match.

- [ ] **Step 1: Write failing tests:** resolver maps `authorContains: "steinbeck"` to `Filter.AuthorContains` (non-nil, equal); repository table: `"stein"` → the SQL fragment above with arg `%stein%`; `cStr("")` adds no clause; `"O'Brien"` is passed as an arg, never interpolated into the SQL text; combined with `GenreContains` the clauses AND together; statement count for a filtered list equals the unfiltered count (page query only).
- [ ] **Step 2: Run; expect FAIL.** `go -C backend test ./internal/adapters/repositories/postgres ./test/resolvers -run "Author|BookFilters"`
- [ ] **Step 3: Implement,** then `make graphql-gen` from `backend/`, diff and delete the stray `schema.resolvers.go`, rebuild.
- [ ] **Step 4: Run Step 2's command and `go -C backend build ./...`; expect PASS and zero errors.**
- [ ] **Step 5: Commit** `feat(backend): filter content by book author`

### Task 7: Verify and record

- [ ] **Step 1:** `go -C backend build ./...` — zero errors.
- [ ] **Step 2:** `gofmt -l backend` — empty.
- [ ] **Step 3:** `go -C backend vet ./...` — clean.
- [ ] **Step 4:** `go -C backend test ./...` once — all pass; report the summary (DB integration tests skip without `DATABASE_URL`: say so rather than calling them passing).
- [ ] **Step 5:** Stale references: `grep -rn "authorName" backend --include='*.go'` — remaining hits must be only the Discover `BookSearchResult` path and its tests, not the stored shape.
- [ ] **Step 6:** Update the frontend plan's "Prerequisite" table to point here and drop rows this plan completes; tick the backend line in `project-management/intents/book-content-type.md`; `graphify update .`; commit `docs(book): backend delta plan done`.

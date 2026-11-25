# Content Creation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One pipeline owns dedupe, import stamping, upsert, the "already existed" outcome and typed error kinds for every content create (PR A). Then a per-type content-facts definition drives the sort, filter and extraction SQL, and the Published sort/filter disagreement and webpage filters are fixed (PR B).

**Architecture:** A `contentCreation` spec per content type (canonical identity, build, precheck flag) runs through one `createContent` pipeline in `core/services`. A per-type registry maps a `ContentType` to its create and refresh behaviour, used by `importOne` and `UpdateSourceData`. Resolvers map the outcome and error kind once through a shared helper that keeps every existing message byte-identical and adds `extensions.code`. Movie, Book and Passage get additive `createContentResultFrom*` mutations; the old ones are `@deprecated`.

**Tech Stack:** Go, gqlgen (schema-first), GORM + pgx, testify, hand-written mocks under `test/`.

**Spec:** none (design from the brief in the session; decisions recorded in the PR bodies).

## Global Constraints

- Services import only `domain`, `ports`, `pkg` (PR #861 allow-list). New services files import no adapter packages.
- Existing message strings stay byte-identical (frontend hooks match substrings: `invalid movie url`, `movie not found`, `invalid youtube url`, `failed to fetch`, `access denied`, `authentication required`, `invalid book`, `book not found`, `no book found`).
- `CONTENT_NOT_ALLOWED` code string unchanged.
- Size ceilings (PR #861 `.size-ceilings.txt`): `content.resolvers.go` 1019, `helpers.go` 1342, `content_service.go` 1339, `import_service.go` 1029, `gorm_content_repository.go` 715, `postgres/helpers.go` 498. These may only shrink. New files stay under 500 lines.
- Migrations: none.
- Query budget: any repo-touching change gets a `querycount` assertion.

## Review Focus

1. Duplicate create of each type returns `alreadyExisted: true` with the stored row, not an error. Tested in Task 4.
2. Invalid input in each create maps to `INVALID_INPUT` with the same message as before. Tested in Task 5.
3. Webpage invalid roles still error before dedupe. Tested in Task 2 (existing tests).
4. Import of a Book or Passage row never stamps a job. Replaced: all creates stamp; tested in Task 3.
5. Upstream fetch failure carries `UNAVAILABLE` with the unchanged message. Tested in Task 1.

---

### Task 1: Error kinds in the domain

**Files:**
- Create: `backend/internal/core/domain/content_errors.go`
- Test: `backend/test/domain/content_errors_test.go`

**Interfaces:**
- Produces: `domain.ErrUnavailable`; `domain.Unavailable(msg string) error` (Error() returns msg, `errors.Is(err, ErrUnavailable)` true); `domain.ErrorKind` string type with constants `KindNone ""`, `KindInvalid "INVALID_INPUT"`, `KindNotFound "NOT_FOUND"`, `KindNotAllowed "CONTENT_NOT_ALLOWED"`, `KindUnavailable "UNAVAILABLE"`; `domain.KindOf(err error) ErrorKind` mapping `ErrInvalidInput`, `ErrInvalidURL`, `ErrInvalidPassage` to invalid, `ErrNotFound`, `ErrContentNotAllowed`, `ErrUnavailable`.

- [ ] **Step 1: Write the failing test** (table: each sentinel, wrapped with `%w`, and `Unavailable("x")` -> `KindUnavailable`, message "x"; plain error -> `KindNone`).
- [ ] **Step 2: Run** `go test ./test/domain/ -run TestKindOf -v` -> FAIL (undefined).
- [ ] **Step 3: Implement** the file above. `Unavailable` returns a small struct type with `Error()` and `Is(target error) bool` returning `target == ErrUnavailable`.
- [ ] **Step 4: Run** the same test -> PASS.
- [ ] **Step 5: Commit** `feat(domain): add typed content error kinds`.

### Task 2: Service sentinels carry the unavailable kind

**Files:**
- Modify: `backend/internal/core/services/content_service.go` (`ErrMovieClientUnavailable` at ~l.873, `ErrBookClientUnavailable` at ~l.1029)
- Modify: `backend/internal/core/services/content_service_webpage.go` (`ErrWebPageClientUnavailable` at l.17)
- Modify: the `"failed to fetch video metadata"` return in `CreateFromYouTube` (l.149) to `domain.Unavailable("failed to fetch video metadata")`

**Interfaces:**
- Consumes: `domain.Unavailable` (Task 1).

- [ ] **Step 1: Write the failing test** in `test/services/content_service_kinds_test.go`: `errors.Is(services.ErrMovieClientUnavailable, domain.ErrUnavailable)` is true for all three sentinels; the YouTube metadata failure error has `KindOf == KindUnavailable` and `Error() == "failed to fetch video metadata"`.
- [ ] **Step 2: Run** `go test ./test/services/ -run TestContentErrorKinds -v` -> FAIL.
- [ ] **Step 3: Implement** by wrapping each sentinel as `domain.Unavailable(<same text>)`. Text unchanged.
- [ ] **Step 4: Run** the test and `go test ./test/services/ ./test/resolvers/` -> PASS.
- [ ] **Step 5: Commit** `fix(services): mark client-unavailable errors with the unavailable kind`.

### Task 3: The create pipeline

**Files:**
- Create: `backend/internal/core/services/content_pipeline.go` (pipeline, spec type, stamping, outcome)
- Modify: `backend/internal/core/services/content_service.go` (CreateFromYouTube, CreateFromMovie, CreateFromBook, CreateFromPassage delegate to the pipeline; remove their bodies)
- Modify: `backend/internal/core/services/content_service_webpage.go` (CreateFromWebPage and CreateFromWebsite delegate; remove `existingByURL`/`saveWebContent` bodies that move into the pipeline)

**Interfaces:**
- Produces:
  ```go
  type contentCreation struct {
      precheck          bool   // GetByURL before fetching; false when the row has nothing to fetch (passage)
      refreshOnConflict bool
      canonical func(ctx context.Context) (string, error)            // parse input, resolve any ids, return stored URL; invalid input errors wrap ErrInvalidInput
      build     func(ctx context.Context, canonical string) (*domain.Content, error) // fetch, policy, shape; unsaved row
  }
  // createContent runs the pipeline and returns (row, alreadyExisted, err).
  func (s *ContentService) createContent(ctx context.Context, spec contentCreation, userID int) (*domain.Content, bool, error)
  ```
  Pipeline order: `canonical` -> if precheck, `GetByURL` hit returns (row, true) -> `build` -> stamp `ImportJobID` from ctx for every type -> `GetOrCreateByURL(content, spec.refreshOnConflict)` -> (row, existed). Public methods keep their signatures and still return `ErrAlreadyExists` with the row for an existing row, so the port and import callers do not change.
- Produces: `type contentRegistry` as `map[domain.ContentType]contentType` with `contentType{ create func(ctx context.Context, raw string, userID int) (*domain.Content, error); refresh func(ctx context.Context, existing *domain.Content) (*domain.Content, error) }`. Used by `importOne` (create, for YouTube and Movie; webpage keeps its special path) and `UpdateSourceData` (refresh, for Book, Movie, YouTube). The claim and nil-URL refusals and the visibility check stay in `UpdateSourceData` before dispatch.
- Consumes: Task 1, Task 2.

Per-type specifics to keep (from the code today):
- YouTube: canonical = `youtube.NormalizeYouTubeURL(ExtractVideoID)` with invalid -> `ErrInvalidURL` wrap; refreshOnConflict true.
- Movie: canonical resolves IMDb to TMDB id, `ErrNotFound` -> "movie not found" wrap; build checks `movieNotAllowed` before any write; refreshOnConflict true.
- Book: canonical does the ISBN/edition resolve; precheck; build does lookup + shape; refreshOnConflict true; it now also stamps.
- Passage: precheck false; canonical and build are the existing `CreateFromPassage` body with no GetByURL; refreshOnConflict false.
- WebPage: canonical = Canonicalize + site-root refusal + roles normalisation (roles captured by the spec closure, so an invalid role still errors before dedupe); precheck true; build = parent validation (unless `ParentValidated`), `Prefetched` or fetch, key from `webPageKey`, marshal; refreshOnConflict false. Dedupe on canonical, store `key`.
- Website: canonical = `SiteRoot`; precheck true; build = fetch root, marshal website response; refreshOnConflict false.

- [ ] **Step 1: Write the failing test** `test/services/content_pipeline_test.go`: table over `{YouTube, Movie, Book, Passage, WebPage, Website}` with a fixture that makes a fresh create succeed and asserts `ImportJobID` equals the job set via `services.WithImportJobID`. Second table case: the same create against a repo whose `GetByURL`/`GetOrCreateByURL` report an existing row, asserting `errors.Is(err, domain.ErrAlreadyExists)` and the stored row returned. Reuse the mocks already in `test/services/content_service_test.go`, `content_service_movie_test.go`, `content_service_book_test.go` (and the passage/webpage helpers there).
- [ ] **Step 2: Run** `go test ./test/services/ -run TestContentPipeline -v` -> FAIL (Book and Passage do not stamp).
- [ ] **Step 3: Implement** `content_pipeline.go` and the specs; move each type's body into a spec closure; stamping moves into `createContent`. Keep each file under 500 lines.
- [ ] **Step 4: Run** `go test ./test/services/ ./test/resolvers/ ./test/roundtrips/` -> PASS (existing tests lock the behaviour).
- [ ] **Step 5: Run** `wc -l` on `content_service.go` and `content_service_webpage.go`: both must be smaller than before (1339 and 303).
- [ ] **Step 6: Commit** `refactor(services): route every content create through one pipeline`.

### Task 4: Registry dispatch in the import and refresh paths

**Files:**
- Modify: `backend/internal/core/services/import_service.go` (`importOne` switch l.916-925 -> registry lookup; webpage path unchanged)
- Modify: `backend/internal/core/services/content_service.go` (`UpdateSourceData` switch l.240-250 -> registry)
- Test: update the hand-written mocks in `test/services/import_service*_test.go` only if the `importContentCreator` interface changes (it should not).

**Interfaces:**
- Consumes: the registry from Task 3.

- [ ] **Step 1: Write the failing test** in `test/services/content_pipeline_test.go`: `importOne`-level behaviour through `ImportItems` for a YouTube and a Movie item still stamps; `UpdateSourceData` for a Book routes to refresh (existing `content_service_book_test.go` covers it; add one table case for the default "cannot be refreshed" error kind `INVALID_INPUT`).
- [ ] **Step 2: Run** the test -> FAIL where the registry is missing.
- [ ] **Step 3: Implement** the lookup; keep the `"cannot import %s"` and `"content type %s cannot be refreshed"` messages.
- [ ] **Step 4: Run** `go test ./test/services/` -> PASS.
- [ ] **Step 5: Commit** `refactor(services): dispatch import and refresh through the content registry`.

### Task 5: Additive GraphQL outcome and error mapping

**Files:**
- Modify: `backend/schema.graphql` (add `createContentResultFromMovie`, `createContentResultFromBook`, `createContentResultFromPassage` returning `CreateContentResult!`; mark `createContentFromMovie`, `createContentFromBook`, `createContentFromPassage` `@deprecated(reason: "Use createContentResultFrom... (returns alreadyExisted)")`)
- Run: `make graphql-gen` in `backend/`, then fix the known `schema.resolvers.go` collision (see backend/CLAUDE.md): move the new stubs into `content.resolvers.go`, `rm` the stray file, rebuild.
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go` (six create resolvers call one helper)
- Modify: `backend/internal/adapters/graphql/resolvers/helpers.go` (shared mapper; net shrink required)
- Test: `backend/test/resolvers/content_create_outcome_test.go`

**Interfaces:**
- Produces (resolvers helpers.go):
  ```go
  // createFailure lists, per mutation, the message to show for each kind; "" means the generic fallback.
  type createFailure struct {
      invalid, notFound, notAllowed, generic string
      invalidPassthrough bool // passage: invalid errors show their own message
  }
  func createOutcome(content *domain.Content, err error) (*model.CreateContentResult, error)
  func createError(err error, f createFailure) error
  ```
  `createOutcome` returns `alreadyExisted: true` when `errors.Is(err, ErrAlreadyExists)` and content != nil. `createError` returns `&gqlerror.Error{Message, Extensions: {"code": string(kind)}}` when the kind is not None, else `fmt.Errorf(f.generic)`. Messages: YouTube invalid "invalid YouTube URL", generic "failed to create content from YouTube"; Movie invalid "invalid movie URL: use a TMDB or IMDb movie link", notFound "movie not found", notAllowed `domain.ErrContentNotAllowed.Error()`, generic "failed to create content from movie"; Book invalid "invalid book URL or ISBN: use an Open Library work link or an ISBN-10/13", notFound "book not found", generic "failed to create content from book"; Passage invalidPassthrough, generic "failed to create passage"; webpage and website keep `webPageInputMessage` first, then the generic.
- Consumes: Task 1 (`KindOf`), Task 3.

- [ ] **Step 1: Write the failing test** `content_create_outcome_test.go`: table over the six mutations: duplicate -> `alreadyExisted: true` (for the three new mutations); each error kind -> `extensions.code` (INVALID_INPUT, NOT_FOUND, CONTENT_NOT_ALLOWED, UNAVAILABLE) with the exact message from the list above.
- [ ] **Step 2: Run** `go test ./test/resolvers/ -run TestCreateContentOutcome -v` -> FAIL (undefined mutations).
- [ ] **Step 3: Implement** the schema edit, regenerate, implement resolvers and helpers.
- [ ] **Step 4: Run** `go build ./...`, `go test ./test/resolvers/ ./test/roundtrips/` -> PASS; `wc -l` on resolvers files must be below the ceilings.
- [ ] **Step 5: Commit** `feat(graphql): report alreadyExisted and error codes for every content create`.

### Task 6: Verification and PR A

- [ ] **Step 1:** `go build ./...` in `backend/`: zero errors.
- [ ] **Step 2:** `gofmt -l .` in `backend/`: empty.
- [ ] **Step 3:** `go test ./...` in `backend/`: all pass; report the DB SKIP count (`-v` grep SKIP) honestly.
- [ ] **Step 4:** Push `chore/content-creation-pipeline`; open PR with `gh api` using `.github/` PR template; body includes "Closes #867".
- [ ] **Step 5:** `bash .claude/scripts/release-slot.sh 1` is deferred until PR B is pushed (PR B branches from this one in the same slot).

### Task 7: Content facts definition (PR B, branch `chore/content-facts-definition` from PR A)

**Files:**
- Create: `backend/internal/core/domain/content_facts.go` (fact -> JSONB path, cast, sortable, filterable; pure Go)
- Modify: `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` (sort, filter, search SQL built from the definition)
- Modify: `backend/internal/adapters/graphql/resolvers/helpers.go` (domain -> model fact extraction uses the definition; delete `parseStatCount` empty->0 path, delete `normalizeHyphenatedISBN`)
- Modify: `backend/schema.graphql` (`ContentFilter`: add `webpageSite: String`, `webpagePublishedAfter: String`, `webpagePublishedBefore: String`, `webpageAuthor: String`; only if the existing `publishedAfter`/`publishedBefore` cannot cover web pages through the facts definition; decide in Task 8 with the reason recorded)

**Interfaces:**
- Produces: `domain.ContentFact` typed string constants; `domain.FactSpec{Path []string, Cast string}`; `domain.FactSpecFor(ContentType, ContentFact) (FactSpec, bool)`.

- [ ] **Step 1 (Task 8 before this): Read** the schema fields `ContentFilter`, `publishedAfter/Before` handling and the repo sort map; confirm the nullable field requirement: every affected output field is nullable `Int`. If any is `Int!`, stop and report.
- [ ] **Step 2: Write the failing parity test** `test/repositories/content_facts_parity_test.go` (sqlmock + `querycount`): for each fact, the sort and the filter SQL reference the same expression; Published sort and `publishedAfter` filter agree for web_page rows.
- [ ] **Step 3: Run** -> FAIL.
- [ ] **Step 4: Implement** the definition and derive the SQL and extraction from it.
- [ ] **Step 5: Run** `go test ./test/repositories/ ./test/resolvers/ ./test/roundtrips/` -> PASS; query-count assertion for the new filter path.
- [ ] **Step 6: Commit** per concern: `feat(domain): define content facts once`, `fix(repositories): sort and filter published date over the same fact`, `refactor(resolvers): drop duplicate ISBN normalisation`.

### Task 8: Webpage filter fields and PR B

- [ ] **Step 1:** Add the webpage filter fields chosen in Task 7 to `ContentFilter` and wire them through the repo; test each (sqlmock parity).
- [ ] **Step 2:** `go build ./...`, `gofmt -l .`, `go test ./...` in `backend/`; report output.
- [ ] **Step 3:** Push, open PR B with `gh api` (base PR A's branch); body names the new `ContentFilter` field names and "Part of #865".
- [ ] **Step 4:** `bash .claude/scripts/release-slot.sh 1` from `/Users/jamesjordan/GitHub/perspectize` after the PR is open.
</content>

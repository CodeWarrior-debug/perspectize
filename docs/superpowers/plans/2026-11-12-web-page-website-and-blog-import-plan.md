# Web page roles, websites and blog import from a file — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let an admin stage the scraped Jordan's Journey blog (1,077 posts) as import candidates, and import the picked rows as `WEB_PAGE` content with role `BLOG_POST`, filed under an optional `WEBSITE` parent.

**Architecture:** extend the web page backend with a `WEBSITE` content type and a nullable `content.parent_content_id`; add an admin-only `CANDIDATE_FILE` import source that stages rows from a file without any listing or network call; make the import worker create web pages from the staged facts (prefetched metadata) and file them under the website, which is find-or-created once per batch.

**Tech Stack:** Go (gqlgen, GORM, golang.org/x/net/html), PostgreSQL (one migration), SvelteKit + Vitest, Python 3.11 (the scraper repo).

**Spec:** [2026-11-12-web-page-website-and-blog-import-design.md](../specs/2026-11-12-web-page-website-and-blog-import-design.md). Builds on the [web page design](../specs/2026-11-11-web-page-content-type-design.md) and [plan](2026-11-11-web-page-content-type-plan.md): **PR 1 of that plan (its Tasks 1–8) must be merged first.** Names used below (`WebPageMeta`, `FetchStatus`, `webpage.Canonicalize`, `ContentService.CreateFromWebPage`) come from it; this plan changes the `CreateFromWebPage` signature as stated in Task 4.

## Global Constraints

- No chained bash commands; one command per Bash call (repo hard rule).
- Never run `make migrate-up`/`migrate-down` or touch the shared Neon `DATABASE_URL`; migrations are written and reviewed only. Local checks use the isolated demo DB (`make demo-up`, port 5434).
- Branch from updated `origin/main`; worktrees under `.claude/worktrees/`. Conventional Commits, one logical change per commit.
- A new `ContentType` value needs no migration (`content.content_type` has no CHECK). DB enum values are lowercase (`website`, `web_page`); Go and GraphQL are UPPERCASE.
- Missing is not zero: an unknown fact is absent from `ImportFacts` JSON, never `0`.
- Every DB-touching change carries a query-count test (`internal/perf/querycount`); batch methods cost the same for 1 and 50 inputs.
- GraphQL: edit `schema.graphql`, run `make graphql-gen`, then delete the colliding `schema.resolvers.go` after copying new stubs into the per-domain file (`backend/CLAUDE.md`).
- Enums bind through `gqlgen.yml` to domain types; no hand-written conversion switches. IDs in inputs use the `IntID` scalar.
- `ImportFacts` keys keep one meaning across types: reading time is `durationSeconds`. New keys this plan adds: `webPageRoles`, `wordCount`.
- Role values in v1: `BLOG_POST` only. JSON key `webPageRoles`, enum `WebPageRole`.
- Limits: 1–5000 items per file; `externalId` ≤ 64 chars; title ≤ 300, summary ≤ 600, author ≤ 200, ≤ 20 tags.
- Website canonical URL is `https://<host>/` (`www.` dropped). A URL with path `/` and no query is never a `WEB_PAGE`.

## Review Focus

Inputs and conditions the spec implies that a person would hit, most likely first. Each has a pinning test in the task named.

1. A file row whose URL is on a different host than `websiteUrl` → whole file refused, naming the row; nothing staged. (Task 6)
2. A file with a duplicate `externalId`, an empty `items` list, or 5,001 items → `ErrInvalidInput`, nothing staged. (Task 6)
3. Importing a page that already exists without a parent → reported `SKIPPED`, **not re-parented**. (Task 7)
4. Two admins importing the same rows at once → website find-or-create does not duplicate it or fail the batch. (Task 7)
5. A blog whose home page is a post (`https://x.com/` as a row URL, or `?p=12` style links) → the bare root is refused as a page; the `?p=12` link stays a page. (Tasks 3, 6)

---

## PR 1 — backend (`feature/website-and-file-import-backend`)

### Task 1: Rename page types to roles in the base design (docs only)

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-web-page-content-type-design.md`, `docs/superpowers/plans/2026-11-11-web-page-content-type-plan.md`, `.claude/skills/content-type-preview/examples/web-page.spec.json`
- Regenerate: `tools/content-type-designer/previews/web-page-activity.html` (with the `content-type-preview` skill; never hand-edit)

**Interfaces:** Produces the names `webPageRoles`, `WebPageRole`, `ContentFilter.webPageRoles` used by every later task. Skip this task only if spec decision D12 is declined, and then substitute that decision's names throughout.

- [ ] **Step 1:** Replace `pageTypes`→`webPageRoles`, `WebPageType`→`WebPageRole`, `webPageTypes`→`webPageRoles`, and the UI labels "Page type(s)"→"Role(s)" in the three source files.
- [ ] **Step 2:** Rebuild the preview from `web-page.spec.json`.
- [ ] **Step 3:** Run `grep -rn "pageTypes\|WebPageType\|webPageTypes" docs .claude tools` — Expected: no output.
- [ ] **Step 4:** Commit `docs: rename web page types to roles`.

### Task 2: Domain, enums and the parent column

**Files:**
- Modify: `backend/internal/core/domain/content.go` (add `ContentTypeWebsite ContentType = "WEBSITE"`; add `ParentContentID *int` to `Content`)
- Create: `backend/internal/core/domain/webpage_role.go`
- Modify: `backend/internal/adapters/repositories/postgres/gorm_models.go`, `gorm_mappers.go`
- Create (conditional): `backend/migrations/0000NN_add_content_parent_id.{up,down}.sql`
- Test: `backend/test/domain/content_test.go`, `backend/test/domain/webpage_role_test.go`

**Interfaces:**
- Produces: `domain.ContentTypeWebsite`; `domain.Content.ParentContentID *int`; `type WebPageRole string` with `WebPageRoleBlogPost WebPageRole = "BLOG_POST"` and `func (r WebPageRole) Valid() bool`; `FetchStatusImported FetchStatus = "IMPORTED"` added to the base plan's `FetchStatus`.

- [ ] **Step 1: Write failing tests** — `TestContentTypeWebsiteValue` (`== "WEBSITE"`); `TestWebPageRoleValid` (`BLOG_POST` true; `""`, `"NEWS"`, `"blog_post"` false); `TestContentParentIDRoundTrip` in the mapper test: nil stays nil, `ptr(7)` round-trips, DB content type string is `website`.
- [ ] **Step 2:** Run `go test ./test/domain/... ./internal/adapters/repositories/postgres/...` — Expected: FAIL (undefined).
- [ ] **Step 3: Implement** the constants, `Valid()`, the field, the GORM column `ParentContentID *int \`gorm:"column:parent_content_id"\`` and both mapper directions.
- [ ] **Step 4: Migration.** Run `ls backend/migrations | tail -5` and `grep -rl parent_content_id backend/migrations`. If a migration already adds `parent_content_id` (the TMDB hierarchy landed), skip this step. Otherwise `make migrate-create name=add_content_parent_id` and write, idempotently: `ALTER TABLE content ADD COLUMN IF NOT EXISTS parent_content_id BIGINT NULL REFERENCES content(id) ON DELETE RESTRICT;` and `CREATE INDEX IF NOT EXISTS idx_content_parent_content_id ON content (parent_content_id) WHERE parent_content_id IS NOT NULL;`; down drops the index then the column. The number is provisional.
- [ ] **Step 5:** Run the Step 2 command — Expected: PASS. Run `go build ./...`.
- [ ] **Step 6: Commit** `feat(content): WEBSITE type, parent_content_id and web page roles`.

### Task 3: Site-root rule (pure functions)

**Files:**
- Modify: `backend/internal/adapters/webpage/canonical.go` (created by the base plan's Task 2)
- Test: `backend/internal/adapters/webpage/canonical_test.go`

**Interfaces:**
- Consumes: `webpage.Canonicalize(raw string) (string, error)`.
- Produces: `func IsSiteRoot(canonical string) bool`; `func SiteRoot(canonical string) (string, error)` returns `https://host/` for any canonical URL (scheme kept, `www.` already dropped); `func SameSite(a, b string) bool` compares hosts ignoring `www.` and case.

- [ ] **Step 1: Write failing table tests.** `IsSiteRoot`: `https://x.com/` true; `https://x.com` (canonicalised first) true; `https://x.com/a` false; `https://x.com/?p=12` false; `https://x.com/#top` true (fragment dropped). `SiteRoot("https://x.com/2020/a/")` = `https://x.com/`; `SiteRoot("ftp://x.com")` errors. `SameSite("https://www.X.com/a", "https://x.com/")` true; `https://blog.x.com/` vs `https://x.com/` false.
- [ ] **Step 2:** Run `go test ./internal/adapters/webpage/ -run 'SiteRoot|SameSite'` — Expected: FAIL.
- [ ] **Step 3: Implement** the three functions on top of `net/url`; no regex.
- [ ] **Step 4:** Re-run — Expected: PASS.
- [ ] **Step 5: Commit** `feat(webpage): site-root and same-site rules`.

### Task 4: Website creation and the parent link in the content service

**Files:**
- Modify: `backend/internal/core/services/content_service.go`, `backend/internal/core/ports/services/content_service.go`
- Test: `backend/test/services/content_service_website_test.go`

**Interfaces:**
- Consumes: Task 2 types, Task 3 functions, the base plan's webpage client port (`Fetch(ctx, url) (domain.WebPageMeta, error)`), `repo.GetOrCreateByURL(ctx, content, true)`.
- Produces (supersedes the base plan's `CreateFromWebPage(ctx, url, userID)`):
```go
type CreateWebPageInput struct {
    URL             string
    Roles           []domain.WebPageRole // nil = detected; empty non-nil = none
    ParentContentID *int                 // must be a WEBSITE on the same host
    Prefetched      *domain.WebPageMeta  // set: skip the network fetch (import files)
}
CreateFromWebPage(ctx context.Context, in CreateWebPageInput, userID int) (*domain.Content, error)
CreateFromWebsite(ctx context.Context, rawURL string, userID int) (*domain.Content, error)
```
Both return `domain.ErrAlreadyExists` with the existing row, like `CreateFromBook`.

- [ ] **Step 1: Write failing tests** (hand-written mock client; assertions on the saved `domain.Content`):
  - `CreateFromWebsite("https://www.Example.com/about")` saves `URL == "https://example.com/"`, type `WEBSITE`, no `publishedAt`/`webPageRoles` keys in `Response`.
  - website fetch `BLOCKED` → row still created, `Name == "example.com"`.
  - `CreateFromWebPage` with a root URL → `ErrInvalidInput` ("that's a website").
  - `ParentContentID` pointing at a `WEB_PAGE` row, a missing row, or a website on another host → `ErrInvalidInput`, no insert.
  - valid parent → saved `ParentContentID` equals it.
  - `Prefetched` set → the client's `Fetch` is never called; `Response.fetch.status == "IMPORTED"`.
  - `Roles: []WebPageRole{"NEWS"}` → `ErrInvalidInput`; empty non-nil → saved `webPageRoles` is `[]`.
  - existing canonical URL → `(existing, ErrAlreadyExists)`, parent **unchanged** even when `ParentContentID` is passed.
- [ ] **Step 2:** Run `go test ./test/services/ -run 'Website|WebPage'` — Expected: FAIL.
- [ ] **Step 3: Implement.** Order in `CreateFromWebPage`: canonicalise → root check → role validation → dedupe by URL (return before any fetch) → parent validation (one `GetByID`) → fetch unless `Prefetched` → build `Response` → `GetOrCreateByURL`. `CreateFromWebsite` reuses the same fetch-and-build helper with the `SiteRoot` URL.
- [ ] **Step 4:** Re-run — Expected: PASS. Update every mock of the content service port under `backend/test/` that the compiler flags.
- [ ] **Step 5: Commit** `feat(content): create websites and file web pages under them`.

### Task 5: GraphQL surface for websites and filing

**Files:**
- Modify: `backend/schema.graphql`, `backend/gqlgen.yml`, `backend/internal/adapters/graphql/resolvers/content.resolvers.go`, `helpers.go`, `backend/internal/adapters/graphql/dataloader/dataloader.go`, `backend/internal/adapters/repositories/postgres/gorm_content_repository.go`
- Test: `backend/test/resolvers/content_website_resolver_test.go`, repository query-count test beside the existing content ones

**Interfaces:**
- Consumes: Task 4's service methods.
- Produces:
```graphql
enum ContentType { …existing… WEBSITE }
enum WebPageRole { BLOG_POST }
input CreateContentFromWebPageInput { url: String!  webPageRoles: [WebPageRole!]  parentContentID: IntID }   # replaces the base input
input CreateContentFromWebsiteInput { url: String! }
type Mutation { createContentFromWebsite(input: CreateContentFromWebsiteInput!): CreateContentResult! @auth }
type Content { …existing…  parentContentID: Int  parentContent: Content }   # parentContent via dataloader
input ContentFilter { …existing…  parentContentID: IntID  webPageRoles: [WebPageRole!] }   # roles: any-of, web page rows only
```
`ContentFilter.webPageRoles` filters with `response->'webPageRoles' @> '["BLOG_POST"]'` per value, OR'd (never `?|`; GORM reads `?` as a placeholder).

- [ ] **Step 1: Write failing tests.** Resolver: unauthenticated `createContentFromWebsite` errors; create returns type `WEBSITE`; `createContentFromWebPage` with `parentContentID` returns a row whose `parentContent.id` matches. Repository: `parentContentID` filter returns only that website's children; `webPageRoles: [BLOG_POST]` returns blog posts and excludes a YouTube row and a plain web page; query count for listing 20 pages selecting `parentContent` is exactly +1 over the same list without it.
- [ ] **Step 2:** Run `go test ./test/resolvers/... ./internal/adapters/repositories/postgres/... -run 'Website|ParentContent|WebPageRole'` — Expected: FAIL.
- [ ] **Step 3: Implement** schema, `make graphql-gen` (handle the collision), the `parentContent` field as `resolver: true` in `gqlgen.yml` backed by a per-request content-by-ID loader (reuse an existing one if present), the filter clauses in the repository, and the resolver wiring in `cmd/server/main.go` if a new dependency appears.
- [ ] **Step 4:** Re-run — Expected: PASS. Then `go build ./...`, `gofmt -l .` (empty), `go vet -tags perf ./internal/perf/...`.
- [ ] **Step 5: Commit** `feat(graphql): websites, parent content and role filter`.

### Task 6: Stage an import from a file

**Files:**
- Modify: `backend/internal/core/domain/import_job.go`, `backend/internal/core/ports/services/import_service.go`, `backend/internal/core/services/import_service.go`, `backend/schema.graphql`, `backend/internal/adapters/graphql/resolvers/import.resolvers.go`, `helpers.go`
- Test: `backend/test/services/import_service_file_test.go`, `backend/test/roundtrips/import_test.go` (add a count)

**Interfaces:**
- Consumes: repository `CreateJob`, `UpdateSource`, `UpsertItems`; Task 3 `Canonicalize`, `SameSite`.
- Produces:
```go
const ImportSourceCandidateFile ImportSourceType = "CANDIDATE_FILE" // DestinationType() == ContentTypeWebPage; Valid() true
const ImportItemKindPage ImportItemKind = "PAGE"
// ImportFacts gains: WebPageRoles []string `json:"webPageRoles,omitempty"`; WordCount *int `json:"wordCount,omitempty"`
type StageImportFileItem struct { ExternalID, URL, Title string; Position int; Facts domain.ImportFacts; Details domain.ImportItemDetails }
type StageImportFileInput struct { Name string; SourceTitle, WebsiteURL *string; Items []StageImportFileItem }
StageImportFromFile(ctx context.Context, actor *domain.AuthenticatedUser, in domain.StageImportFileInput) (*domain.ImportJob, error)
```
GraphQL: `stageImportFromFile(input: StageImportFromFileInput!): ImportJob! @auth` as in the spec §3; `facts`/`details` arrive as JSON and decode into the structs with unknown keys rejected.

- [ ] **Step 1: Write failing tests** (mock repository; the work runs inline via `WithImportSpawn`):
  - non-admin → `ErrForbidden`; `CreateImportJob` with a `CANDIDATE_FILE` source → `ErrInvalidInput` ("not configured").
  - happy path: job `APPROVED`, one source `READY` with `ItemCount == len(items)`, `URL == websiteUrl`, `SourceRef` non-empty; `UpsertItems` called once with every row, `CanonicalURL` canonicalised, `DestinationType == WEB_PAGE`.
  - review-focus 1: a row on another host with `websiteUrl` set → `ErrInvalidInput` naming the row; `CreateJob` never called.
  - review-focus 2: duplicate `externalId`; empty items; 5,001 items; `externalId` of 65 chars; title of 301 chars; `javascript:` URL; non-http `thumbnailUrl` → each `ErrInvalidInput`, nothing saved.
  - review-focus 5: a row `https://x.com/` → rejected; `https://x.com/?p=12` accepted.
  - no `WebsiteURL` → rows from different hosts are accepted.
  - round-trip count: staging 1 and 1,000 rows costs the same statements (job + sources = 2, items = 1, source update = 1).
- [ ] **Step 2:** Run `go test ./test/services/ -run StageImportFromFile` — Expected: FAIL.
- [ ] **Step 3: Implement** the method: validate the whole file first (collect nothing, fail on the first bad row), then `CreateJob` (source `READY`), then `UpsertItems` in one call, then `UpdateSource` with `ItemCount` and `FetchedAt = s.now()`. Add the resolver and the JSON-to-domain mapper in `helpers.go`.
- [ ] **Step 4:** Re-run — Expected: PASS. `make graphql-gen`, `go build ./...`.
- [ ] **Step 5: Commit** `feat(import): stage candidates from a file`.

### Task 7: Import staged pages, filed under the website

**Files:**
- Modify: `backend/internal/core/services/import_service.go` (`importContentCreator`, `runImports`, `importOne`)
- Test: `backend/test/services/import_service_webpage_test.go`

**Interfaces:**
- Consumes: Task 4's `CreateFromWebPage`/`CreateFromWebsite`; `domain.ImportItem.Facts`, `Details`.
- Produces: `importContentCreator` gains `CreateFromWebPage(ctx, in portservices.CreateWebPageInput, userID int) (*domain.Content, error)` and `CreateFromWebsite(ctx, rawURL string, userID int) (*domain.Content, error)`. `importOne` handles `domain.ContentTypeWebPage`.

- [ ] **Step 1: Write failing tests** (fake content creator recording calls):
  - a `CANDIDATE_FILE` batch of 3 rows with `websiteUrl` set → `CreateFromWebsite` called **once**, then `CreateFromWebPage` 3 times each with `ParentContentID` equal to the website's id, `Roles == [BLOG_POST]` (from `facts.webPageRoles`) and `Prefetched` built from the row (title, summary→description, thumbnail→imageUrl, publishedAt, author from `details.people`, `siteName` from the source title, `fetch.status IMPORTED`).
  - without `websiteUrl` → `CreateFromWebsite` never called, `ParentContentID == nil`.
  - review-focus 3: creator returns `(existing, ErrAlreadyExists)` → row `SKIPPED`, `RecordOutcome` carries the existing content id, no second call that touches the parent.
  - review-focus 4: two concurrent `ImportItems` calls over the same rows (creator fake returns `ErrAlreadyExists` on the second website create) → the batch still imports; no row `FAILED`.
  - the website create fails with a transient error → every row of that source is `FAILED` with the message "couldn't create the website"; other sources in the same batch still import.
- [ ] **Step 2:** Run `go test ./test/services/ -run ImportWebPage` — Expected: FAIL.
- [ ] **Step 3: Implement.** In `runImports`, before starting the worker pool, resolve each distinct source's website once into `map[sourceID]*int` (treat `ErrAlreadyExists` as success using the returned row); pass it to `importOne`. Keep the pool and outcome recording unchanged.
- [ ] **Step 4:** Re-run — Expected: PASS. Update the other `importContentCreator` fakes the compiler flags.
- [ ] **Step 5: Commit** `feat(import): import staged web pages under their website`.

### Task 8: Verify and open PR 1

- [ ] **Step 1:** `go build ./...` (zero errors), `gofmt -l .` (empty), `go test ./...`, `go vet -tags perf ./internal/perf/...`, then `graphify update .`. Report the summaries.
- [ ] **Step 2:** PR body: dark backend, one migration only if Task 2 Step 4 created it (the `Migration labels` workflow tags it; it needs a manual `migrate up` per environment), label `new-content-type`, link the spec. Demo reason: no visible change.

---

## PR 2 — exporter (scrappy-scraper repo, branch `wordpress-blog-scraper`)

### Task 9: Emit the web page shape

**Files:**
- Modify: `src/wordpress_scraper/perspectize.py`, `tests/test_perspectize_export.py`

**Interfaces:**
- Produces `perspectize-import.json` with `format: "perspectize-import-candidates/v2"`, `source: { sourceType: "CANDIDATE_FILE", title, websiteUrl, destinationType: "WEB_PAGE", itemCount }`, and per item `facts.kind == "PAGE"`, `facts.webPageRoles == ["BLOG_POST"]`; `details.description` removed (it duplicated `facts.summary`; the file goes from 1.24 MB to 1.06 MB).

- [ ] **Step 1:** Update the tests first: `destinationType == "WEB_PAGE"`, `facts["kind"] == "PAGE"`, `facts["webPageRoles"] == ["BLOG_POST"]`, `source["websiteUrl"] == BASE`, `"description" not in details`.
- [ ] **Step 2:** `python -m pytest tests -q` — Expected: FAIL on those assertions.
- [ ] **Step 3:** Change `DESTINATION_TYPE`, `SOURCE_TYPE`, the `kind`, add the roles fact and `websiteUrl`; bump `FORMAT`.
- [ ] **Step 4:** Re-run — Expected: 19 passed. Re-export `output/jordans-journey` and copy `perspectize-import.json` to `~/Downloads/jordans-journey-archive/`.
- [ ] **Step 5:** Commit `refactor(wordpress): export blog posts as web pages with a BLOG_POST role` and push.

---

## PR 3 — frontend (`feature/website-and-file-import-frontend`)

Branch from `main` after PR 1 is merged **and** `feature/import-staging-frontend` has landed (the `/import` sheet is a prerequisite for the last two tasks; if it has not landed, do Tasks 10–12 and stop).

### Task 10: Detection and the Add dialog's "File under" checkbox

**Files:**
- Modify: `frontend/src/lib/utils/detectContentType.ts`, the Add dialog branch for web pages from the base plan's Task 11, `frontend/src/lib/queries/content/` (mutation documents)
- Test: `frontend/tests/unit/detectContentType.test.ts`, the Add dialog component test

**Interfaces:** Consumes Task 5's mutations and `Content.parentContent`. Produces `{ type: 'WEBSITE', url }` from `detectContentCandidates`.

- [ ] **Step 1: Write failing tests.** Detection: `https://example.com` and `https://example.com/` → `WEBSITE`; `https://example.com/a` → `WEB_PAGE`; `https://example.com/?p=12` → `WEB_PAGE`; YouTube/TMDB/Bible Gateway URLs still win. Dialog, one test per state: checkbox hidden for a website; unticked when the website is not in the library; **pre-ticked** when it is; ticking it with the website missing sends the website create first and then the page create with `parentContentID`; an `alreadyExisted` page reports "already saved", no re-filing.
- [ ] **Step 2:** `pnpm run test:run -- detectContentType AddWebPage` — Expected: FAIL.
- [ ] **Step 3: Implement.** The "is the website in the library" lookup uses the existing content-by-URL query, run once per pasted URL (cache-contract test: one request per distinct host).
- [ ] **Step 4:** Re-run — Expected: PASS. **Step 5:** Commit `feat(web-page): detect websites and file a page under its site`.

### Task 11: Details views

**Files:** Modify `ActivityDetailsModal.svelte`; Test `frontend/tests/components/ActivityDetailsModal.test.ts`.

- [ ] **Step 1: Write failing tests**, one per state: a web page with a parent shows "Part of <site>" linking to that website's modal; without a parent shows nothing; a website shows "Pages in this site" (newest first, title, published date, role), the first 50 with a "N pages in total" line; a website with no pages shows "No pages saved from this site yet"; neither view shows the other's section.
- [ ] **Step 2:** Run the test file — Expected: FAIL. **Step 3:** Implement with the `parentContentID` filter from Task 5 (one query per opened website). **Step 4:** PASS. **Step 5:** Commit `feat(web-page): part-of and pages-in-site on details`.

### Task 12: Role filter

**Files:** Modify the Activity type-filter component from the base plan; Test its component test.

- [ ] **Step 1: Write failing tests**: the "Role" control appears only when the type filter is Web page only; choosing Blog post sends `webPageRoles: [BLOG_POST]`; clearing removes the key. **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(web-page): filter by role`.

### Task 13: Import sheet columns

**Files:** Modify the `/import/[id]` sheet's column definitions and its Decide/All column sets; Test the sheet's component test.

- [ ] **Step 1: Write failing tests**: a `PAGE` row shows Title + summary, Published, Words (`wordCount`), Reading time (`durationSeconds`), Comments (blank when absent, never 0), Roles (pill per entry) in **Decide**; Source and Import in **All**; a row missing `wordCount` shows "—"; the Roles header filter finds blog posts; a `PAGE` row's thumbnail loads with `referrerpolicy="no-referrer"` and falls back to the glyph on error.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** Commit `feat(import): web page columns on the staging sheet`.

### Task 14: Verify and open PR 3

- [ ] **Step 1:** `pnpm run test:run`, `pnpm run check`. **Step 2:** Browser verification is local-only (do not sign in; ask the human). Evidence clip with `~/.claude/tools/video-capture/record-clip.mjs` once the human has staged the file. Label `new-content-type`, `needs-demo-video`.

---

## Rollout runbook (a human does these; no agent touches the shared database)

1. Merge PR 1; apply the `parent_content_id` migration per environment ([MIGRATION_ROLLOUT.md](../../../.docs/MIGRATION_ROLLOUT.md)).
2. Merge the frontend PR and `feature/import-staging-frontend`.
3. Signed in as an admin, call `stageImportFromFile` with `name: "Jordan's Journey"`, `sourceTitle`, `websiteUrl: "https://jordans-journey.com"` and the `items` from `perspectize-import.json`. Check the request body limit first: the server code sets none, but the host's proxy may; if a call is rejected, stage in files of ≤ 250 rows (each call makes its own job).
4. Open `/import/<id>`, filter, select (up to 5,000 for an admin), Import. Progress streams live.

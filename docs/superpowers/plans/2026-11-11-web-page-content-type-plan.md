# Web page content type (`WEB_PAGE`) — Implementation plan

> **For agentic workers:** execute with `superpowers:subagent-driven-development` (or `superpowers:executing-plans` inline). Steps use `- [ ]` checkboxes. TDD: write the failing test first in every task.

**Goal:** add a lightweight `WEB_PAGE` type: paste any URL, the backend reads the page's `<head>` once, and the row appears in Activity with six columns, including the existing Wikidata Category. A perspective can also attach related content by **content ID** (spec §8), e.g. an article about the video the perspective is on.

**Spec:** [2026-11-11-web-page-content-type-design.md](../specs/2026-11-11-web-page-content-type-design.md). Preview: `tools/content-type-designer/previews/web-page-activity.html`.

**Release:** dark backend first ([.docs/RELEASE_APPROACHES.md](../../../.docs/RELEASE_APPROACHES.md)). PR 1 is the web page backend and PR 2 the related-content backend; both are invisible until the frontend uses them. PR 3 is the frontend for both. **Only PR 2 has a migration** (one new table). Apply it by hand per environment before PR 3 merges; never run `migrate up` during dev.

**Agents:** `go-backend` + `test-writer` (PR 1, with `graphql-designer` for the schema), `svelte-frontend` + `vitest-writer` (PR 2). Review PR 1 with `code-reviewer`, paying particular attention to the SSRF dialer.

---

## PR 1 — backend (`feature/web-page-content-type-backend`)

### Task 1: Domain enum
- [ ] Test `backend/test/domain/content_test.go`: `ContentTypeWebPage == "WEB_PAGE"`, and that it round-trips through the lowercase DB converter as `web_page`.
- [ ] Add `ContentTypeWebPage ContentType = "WEB_PAGE"` to `backend/internal/core/domain/content.go`, plus a `WebPageMeta` struct matching spec §2 (`FinalURL, Domain, SiteName, Title, Description, ImageURL, FaviconURL, PublishedAt, Lang *string`; `Fetch{Status, HTTPStatus, At}`).
- [ ] Add a `FetchStatus` type with constants `OK BLOCKED ERROR TIMEOUT NOT_HTML TOO_LARGE`.

### Task 2: URL canonicaliser (pure function)
- [ ] Table test `backend/internal/adapters/webpage/canonical_test.go` covering: uppercase host → lower; `www.` dropped; `#frag` dropped; `utm_source`, `fbclid` and `gclid` dropped while other query params are kept **in their original order**; `:443` dropped; trailing `/` dropped except on root; `ftp://` rejected; no scheme rejected.
- [ ] Implement `Canonicalize(raw string) (string, error)` in `backend/internal/adapters/webpage/canonical.go`.
- [ ] `PreferDeclaredCanonical(fetched, declared string) string`: return `declared` only on the same registrable domain (`golang.org/x/net/publicsuffix`). Test a cross-domain canonical (ignored) and a same-domain one (used).

### Task 3: SSRF-safe HTTP client
- [ ] Tests in `backend/internal/adapters/webpage/client_test.go`, using `httptest` and a dialer whose resolver is injectable so they run offline:
  - a host resolving to `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `100.64.0.1`, `::1` or `fd00::1` → error `ErrBlockedAddress`, and **no connection is attempted**;
  - a public host that 302s to `http://127.0.0.1/` → blocked (the check runs per dial, not per hostname);
  - a 4th redirect → `ERROR`; a 6 s server → `TIMEOUT` (inject the timeout as 100 ms in the test);
  - a body over 512 KiB with no `</head>` → `TOO_LARGE`, reading stops at the limit;
  - `Content-Type: application/pdf` → `NOT_HTML`;
  - port 8080 → rejected.
- [ ] Implement `NewClient(opts)` with an `http.Transport` whose `DialContext` resolves and checks every IP (a `net.Dialer.Control` hook), `CheckRedirect` capped at 3, a `Jar` of nil, the `User-Agent` from the spec and an `io.LimitReader`.
- [ ] The production test seam: allow loopback only when `opts.AllowLoopbackForTests` is set. That flag is set only from `_test.go` and never read from env.

### Task 4: Head parser
- [ ] Fixtures in `backend/internal/adapters/webpage/testdata/`: `arxiv.html` (citation_date, no og:site_name), `og_full.html` (every og tag + JSON-LD datePublished), `bare.html` (`<title>` only), `relative_image.html` (relative og:image and icon). Trim to `<head>`.
- [ ] Table test: each fixture → the expected `WebPageMeta`. Precedence: title is `og:title` > `<title>`; description is `og:description` > `meta[name=description]`; publishedAt is `article:published_time` > `citation_date`/`citation_publication_date` > JSON-LD `datePublished`, normalised to `YYYY-MM-DD`; URLs are made absolute against `finalUrl`; whitespace is collapsed; missing fields are `nil`.
- [ ] Implement `ParseHead(r io.Reader, base *url.URL) WebPageMeta` with `golang.org/x/net/html`'s tokenizer, stopping at `</head>`.

### Task 5: Port + service
- [ ] Port `backend/internal/core/ports/services/webpage_client.go`: `Fetch(ctx, url) (domain.WebPageMeta, error)`. The fetch result always carries `Fetch.Status`; the error is only for invalid input or a blocked address.
- [ ] Service tests in `backend/test/services/content_service_test.go` with a hand-written mock client:
  - happy path: name = title, url = canonical, response = meta JSON, type `WEB_PAGE`;
  - fetch `BLOCKED` → **row still created**, name = `host + path`, `fetch.status = BLOCKED`;
  - blocked address / invalid URL → `ErrInvalidInput`, no row;
  - an existing canonical URL → `alreadyExisted = true`, no second fetch-and-insert (dedupe check before fetch);
  - a declared same-domain canonical that already exists → return that row.
- [ ] Implement `ContentService.CreateFromWebPage(ctx, url, userID)` and `PreviewWebPage(ctx, url)` (fetch and parse only; never writes).

### Task 6: GraphQL
- [ ] Schema (`graphql-designer`): add `WEB_PAGE` to `enum ContentType`; `createContentFromWebPage(input: CreateContentFromWebPageInput!): CreateContentResult! @auth`; `previewWebPage(url: String!): WebPagePreview @auth`, where the type has the spec §2 fields plus `alreadyExistsContentId: IntID`. Run `make graphql-gen` and handle its known `schema.resolvers.go` collision.
- [ ] Resolver tests in `backend/test/resolvers/` (new `content_webpage_resolver_test.go`): unauthenticated → error; create returns the row; preview writes nothing (count rows before and after).
- [ ] Wire the client in `backend/cmd/server/main.go`.

### Task 7: Sorting and filtering
- [ ] Extend the `published_at_sort` expression in `backend/internal/adapters/repositories/postgres/helpers.go` with a `web_page` branch on `response->>'publishedAt'`. Test that a mixed YouTube + web page list sorts by date with nulls last.
- [ ] A query-count test (`.docs/QUERY_BUDGET.md`) proving that listing web pages adds no queries: Category is already dataloaded.

### Task 8: Verify and open PR 1
- [ ] Run `go build ./...`, `gofmt -l .` (must be empty), `go test ./...` and `graphify update .`.
- [ ] PR body: no behaviour change visible (dark), so a one-line Demo reason; the migration label shows none.

---

## PR 2 — related content backend (`feature/perspective-related-content-backend`)

Branch from `main` after PR 1 merges. It needs no web page code, but it is easier to review on its own.

### Task R1: Migration (`db-migration` agent; write and review only)
- [ ] `make migrate-create name=add_perspective_related_content`, then fill in the up/down SQL exactly as in spec §8: table, PK `(perspective_id, content_id)`, FK `CASCADE` to perspectives, FK `RESTRICT` to content, index on `content_id`, `IF NOT EXISTS` / `IF EXISTS`. The number is provisional; rename it to the next free number on `main` just before merge.
- [ ] Check it against the isolated demo DB only (`make demo-up`, port 5434). **Never against `DATABASE_URL`.**

### Task R2: Domain, port and repository
- [ ] Add `RelatedContentIDs []int` to `domain.Perspective`, plus a repository port `ReplaceRelatedContent(ctx, tx, perspectiveID, contentIDs)` and `RelatedContentByPerspectiveIDs(ctx, ids) (map[int][]domain.Content, error)`.
- [ ] Repository tests (sqlmock harness): replace = exactly one `DELETE` + one multi-row `INSERT` carrying `position`; `[]` = only the `DELETE`; the batch read is one query ordered by `perspective_id, position`.
- [ ] Implement them in `gorm_perspective_repository.go` (or a small `gorm_perspective_related_content_repository.go`), with a GORM model for the table in `gorm_models.go`.

### Task R3: Service validation
- [ ] Tests in `backend/test/services/perspective_service_test.go`:
  - 21 IDs → `ErrInvalidInput`;
  - a duplicate ID → `ErrInvalidInput`;
  - an unknown ID → `ErrInvalidInput` naming it;
  - the perspective's own `contentID` → `ErrInvalidInput`;
  - create with IDs → stored in order;
  - update: omitted → unchanged, `[]` → cleared, list → replaced;
  - only the owner can update (the existing owner guard covers it; assert it).
- [ ] Implement this in `PerspectiveService` Create/Update. Writing the perspective row and replacing its related content happen in **one transaction**.

### Task R4: GraphQL and dataloader
- [ ] Schema (`graphql-designer`): `Perspective.relatedContent: [Content!]!`, `Perspective.relatedContentIDs: [Int!]!`, and `relatedContentIDs: [IntID!]` on both inputs, with the doc strings from spec §8. Run `make graphql-gen`.
- [ ] A `relatedContent` dataloader keyed by perspective ID, registered with the existing per-request loaders.
- [ ] Resolver tests in a new `backend/test/resolvers/perspective_related_content_resolver_test.go`: round trip of create → query → update → clear; another user's **private** perspective doesn't expose its related content.
- [ ] **Query-count test:** listing 20 perspectives that select `relatedContent` costs exactly +1 query over the same list without it (`.docs/QUERY_BUDGET.md`).

### Task R5: Verify and open PR 2
- [ ] Run `go build ./...`, `gofmt -l .`, `go test ./...` and `graphify update .`. The PR body says it needs a manual `migrate up` per environment (it will be labelled `migrations-unapplied`). Demo reason: dark backend, no visible change.

---

## PR 3 — frontend (`feature/web-page-content-type-frontend`)

### Task 9: Detection
- [ ] `frontend/tests/unit/detectContentType.test.ts`: `https://arxiv.org/abs/1706.03762` → `WEB_PAGE`; YouTube, TMDB and Bible Gateway URLs **still** win; `example.com` with no scheme is not a web page; `ftp://x` is not.
- [ ] In `frontend/src/lib/utils/detectContentType.ts`, return `{ type: 'WEB_PAGE', url }` where it currently returns `[]` for an unclaimed URL. Update the precedence comment.

### Task 10: Queries and hooks
- [ ] Add `CREATE_CONTENT_FROM_WEB_PAGE` and `PREVIEW_WEB_PAGE` documents, and the `WebPageMeta` TS type, under `frontend/src/lib/queries/content/`.
- [ ] `useCreateWebPage` **must use the authenticated `graphqlRequest()`**, not the bare `graphqlClient`. Its test asserts this by mocking `graphqlRequest`.
- [ ] Cache contract test: a successful create invalidates the content list keys exactly as movie create does.

### Task 11: Add dialog with import preview
- [ ] States to test (each is a separate test): loading the preview; `OK` with title, site, description, image and date; `BLOCKED` with the "couldn't read… you can still save" message and Save enabled; `alreadyExistsContentId` with "Already saved — open it" in place of Save; a network error on the preview, which still allows Save.
- [ ] Implement it in the existing Add Content dialog branch for the detected type. Load images with `referrerpolicy="no-referrer"` and fall back to the glyph on `error`.

### Task 12: Grid renderers
- [ ] Tests in `frontend/tests/unit/formatting.test.ts`: the WebPage item cell shows title + site (or domain) + thumb, and the glyph when there is no image; the Site cell; the Published cell shows `—` with the "declares no publish date" tooltip when null.
- [ ] Component test in `ActivityTable.test.ts`: with the type filter set to **Web page only**, the default visible columns are exactly `◎, WebPage, Site, Category, Published, Added`; **Category is visible and opens the Wikidata popover on click**; clicking ◎ opens the perspective editor only, and clicking the WebPage cell opens content details only. This is the regression guard for the user's one hard requirement.
- [ ] Add the type to the type filter, the icon map and the per-type default column set, and add tooltip specs to `activityTooltipSpecs.ts`.

### Task 13: Details view
- [ ] Test the states: with a description / without one ("This page has no description"); the Fetched tile shows date **and time** in local time, never a status value; there is no related-content section in this modal.
- [ ] Add the Web page section to `ActivityDetailsModal.svelte`.

### Task 14 (optional, D3): Rename
- [ ] Only if D3 is confirmed: an Edit title action for the adder, writing `display_title`. Test it: shown only to the adder, and saving updates the row.

### Task R6: Related content in the perspective editor
- [ ] Extend the perspective query fragments with `relatedContent { id name url contentType response primaryCategory { label } }` and `relatedContentIDs`. Mutation hooks pass `relatedContentIDs` (via `graphqlRequest()`).
- [ ] Component tests for a new `RelatedContentField.svelte`, one per state:
  - empty ("Paste a link to an article, video or page");
  - pasting a web URL → pending chip → resolved chip with title and site;
  - pasting an already-saved URL → reuses the ID, no duplicate chip;
  - pasting a YouTube URL → created as `YOUTUBE_VIDEO`, not as a web page;
  - pasting the perspective's own content → "That's the item you're writing about", no chip;
  - non-URL text → "Paste a link";
  - a blocked fetch → the chip is still added, showing the URL as its title;
  - remove a chip; reorder with ↑/↓;
  - 20 chips → the input is disabled with "Up to 20";
  - save sends the IDs in chip order.
  - reopening a saved perspective → chips render from `perspective.relatedContent`, with no extra request.
- [ ] Implement the field, **paste only, with no pick-list**. It reuses `detectContentCandidates` and each type's existing create hook (they return `{ content, alreadyExisted }`); the chip's title, site and thumb come from that returned `content`. Mount it in the perspective editor for **every** content type, never in a content details modal.

### Task R7: Related content in perspective views
- [ ] Test the **perspective view**: a perspective with related items shows a read-only "Related" list under the review (title, site, type icon, ↗ with `rel="noopener noreferrer"`); one without shows no section. Clicking an item opens that item's own details modal.
- [ ] Test the **content details modal**: a perspective entry in its summary shows "N related" when N > 0 and nothing when 0, and **never the list itself** (D8).
- [ ] Implement it in the perspective view component(s) (wherever a perspective's review text is shown, e.g. the compare page), plus the count in `ActivityDetailsModal.svelte`'s perspectives summary. Data comes from the perspective query and is never fetched per item.

### Task 15: Verify and open PR 3
- [ ] Run `pnpm run test:run` and `pnpm run check`, then do browser verification via the `pr-verification` skill: add arxiv, a blocked site and a duplicate; set a category on the new row; on a YouTube video perspective, attach an article by URL, save, reload, and see it listed under Related. This needs PR 2's migration on the DB the dev server uses: ask first, never apply it yourself.
- [ ] Evidence: an sv- video (behaviour change). Label `new-content-type`.
- [ ] Update `.claude/docs/ADDING_CONTENT_TYPE.md` with a short "Worked example: Web page (no external API)" pointer, since this is the first type with a generic fetcher.

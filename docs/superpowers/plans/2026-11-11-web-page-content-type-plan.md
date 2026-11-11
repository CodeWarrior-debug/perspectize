# Web page content type (`WEB_PAGE`) — Implementation plan

> **For agentic workers:** execute with `superpowers:subagent-driven-development` (or `superpowers:executing-plans` inline). Steps use `- [ ]` checkboxes. TDD: write the failing test first in every task.

**Goal:** add a lightweight `WEB_PAGE` type: paste any URL, the backend reads the page's `<head>` once, and the row appears in Activity with six columns, including the existing Wikidata Category.

**Spec:** [2026-11-11-web-page-content-type-design.md](../specs/2026-11-11-web-page-content-type-design.md). Preview: `tools/content-type-designer/previews/web-page-activity.html`.

**Release:** dark backend first ([.docs/RELEASE_APPROACHES.md](../../../.docs/RELEASE_APPROACHES.md)). PR 1 is backend only and invisible until the frontend sends the mutation. PR 2 is the frontend. **No migration in either PR.**

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

## PR 2 — frontend (`feature/web-page-content-type-frontend`)

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
- [ ] Tests in `frontend/tests/unit/formatting.test.ts`: the Page item cell shows title + site (or domain) + thumb, and the glyph when there is no image; the Site cell; the Published cell shows `—` with the "declares no publish date" tooltip when null.
- [ ] Component test in `ActivityTable.test.ts`: with the type filter set to **Web page only**, the default visible columns are exactly `◎, Page, Site, Category, Published, Added`, and **Category is visible and opens the Wikidata popover on click**. This is the regression guard for the user's one hard requirement.
- [ ] Add the type to the type filter, the icon map and the per-type default column set, and add tooltip specs to `activityTooltipSpecs.ts`.

### Task 13: Details view
- [ ] Test the states: with a description / without one ("This page has no description"); fetch `BLOCKED` tile; a Same category list with items / an empty one (hidden, not "0 items").
- [ ] Add the Web page section to `ActivityDetailsModal.svelte`. Same category reuses the content list query filtered by `primaryCategoryId`, limit 10, and is fetched on open only.

### Task 14 (optional, D3): Rename
- [ ] Only if D3 is confirmed: an Edit title action for the adder, writing `display_title`. Test it: shown only to the adder, and saving updates the row.

### Task 15: Verify and open PR 2
- [ ] Run `pnpm run test:run` and `pnpm run check`, then do browser verification via the `pr-verification` skill: add arxiv, a blocked site and a duplicate; set a category on the new row.
- [ ] Evidence: an sv- video (behaviour change). Label `new-content-type`.
- [ ] Update `.claude/docs/ADDING_CONTENT_TYPE.md` with a short "Worked example: Web page (no external API)" pointer, since this is the first type with a generic fetcher.

# Webpage roles, websites and blog import from a file — Design

Status: **decisions D12–D18 confirmed as proposed (2026-11-13); spec itself still awaiting PR review.** Request (2026-11-12): bring Grandpa's WordPress blog (jordans-journey.com, 1,077 posts) into Perspectize through the import staging sheet. The content type is a **webpage**, not a new "blog post" type. A webpage carries **one or more roles** (blog post is the first), and a webpage **may** be a child of a **website**, but does not have to be.

Extends: [webpage content type design](2026-11-11-web-page-content-type-design.md) (`WEB_PAGE`, `previewWebPage`, §9 page types) and the [import staging plan](../plans/2026-10-27-import-staging-plan.md). Plan: [2026-11-12-web-page-website-and-blog-import-plan.md](../plans/2026-11-12-web-page-website-and-blog-import-plan.md).

Everything in the base design stays as written unless this document says otherwise. This document adds three things: a rename (§1), the website parent (§2) and the import source (§3).

## 1. Roles, not "page types" (rename)

The base design §9 already has the right shape: an ordered list on the page, first entry primary, empty = plain webpage, stored in `content.response`, `BLOG_POST` and `SESSION_TRANSCRIPT` the values in v1, both picked by the adder. This document only renames it to match the request's wording ("webpage role"):

| Base design (§9) | This design |
|---|---|
| `pageTypes` (JSON key) | `webPageRoles` |
| `enum WebPageType` | `enum WebPageRole` |
| `ContentFilter.webPageTypes` | `ContentFilter.webPageRoles` |
| "Page types" (UI label) | "Roles" (details tile "Role", filter "Role") |

No migration and no behaviour change: nothing is built yet. There is no role detection in v1 (base design D10): the adder picks roles in the Add dialog's multiselect dropdown, whose label becomes "Roles". The `@>` containment filter and "not editable after add" (D11) are all unchanged.

## 2. Websites and the optional parent link

**A website is content.** `WEBSITE` is a new content type for a whole site ("Jordan's Journey", "arxiv.org"), identified by its **origin**. People can categorise it and write perspectives on it like any other content. A webpage may point at one website as its parent. It does not have to.

| Rule | Value |
|---|---|
| Identity / canonical URL | The origin: `https://<host>/` (scheme kept, `www.` dropped, host lowercased, path `/`). |
| Site root vs page | A URL with path `/` and no query is **always a `WEBSITE`, never a `WEB_PAGE`**. This keeps the global `UNIQUE(url)` from ever holding one address under two types. A page like `https://x.com/?p=12` (has a query) is a webpage. |
| Link | `content.parent_content_id` (nullable FK to `content(id)`, `ON DELETE RESTRICT`, indexed). This is the same column the [TMDB hierarchy design](2026-09-27-tmdb-content-types-design.md) §3 specifies; whichever PR lands first creates it, with that exact definition. |
| Who may be a parent | Only a `WEBSITE` row, and only of a `WEB_PAGE` row on the **same host** (`www.` ignored). Enforced in the service. A website has no parent. |
| **No force-add** | Unlike seasons and episodes, adding a page never adds its website. A page with no parent is normal. |
| Metadata | A website reads the same `<head>` fields through the same safe fetcher (webpage design §4): title, `siteName`, description, image, favicon, language. It has no `publishedAt`, `author` or roles. |
| No rollup | A website's perspectives are the ones written on the website itself, never on its pages ([glossary: No rollup](../../glossary/content-types/GLOSSARY.md)). |

**How a page gets a parent**

1. **Add dialog:** after a URL is pasted, a checkbox "File this page under <host>". It is ticked when that website already exists in the library, otherwise unticked. Ticking it when the website is missing adds the website too (find-or-create, the same dedupe as any add).
2. **File import (§3):** a file source with a website URL files every row under that website.
3. **Never automatic otherwise.** An existing page is never re-parented by a later add or import.

There is no content delete today. `RESTRICT` means a future one cannot orphan filed pages: it must refuse a website that still has pages. Un-filing a page is out of scope for v1.

**Detection:** a pasted bare-host URL (`https://example.com`, `https://example.com/`) now detects as `{ type: 'WEBSITE', url }`, after the existing hosts (YouTube, TMDB/IMDb, Bible Gateway) and before Webpage.

**Shows:** the webpage details view gets a "Part of <site>" link when it has a parent. The website details view lists its pages (title, published date, roles; newest first, capped at 50 with a count). The Activity grid has no new default column. `ContentFilter.parentContentID` lists a website's children.

## 3. Importing a blog from a file

**Why a file.** jordans-journey.com is hosted on WordPress.com, whose REST API is closed (`/wp-json/` answers 404), so a live lister cannot read it. The [scrappy-scraper](https://github.com/CodeWarrior-debug/scrappy-scraper) `wordpress-blog-scraper` branch already reads it (sitemap plus archive pages) and exports `perspectize-import.json`. Perspectize takes that file as an import source.

**New source type `CANDIDATE_FILE`.** An admin supplies the candidates; nothing is listed and no outside API is called. Destination type is `WEB_PAGE`. Admin only, because it creates rows other people will import from.

```graphql
enum ImportSourceType { …existing…  CANDIDATE_FILE }
input StageImportFromFileInput {
  name: String!                       # the import's name
  sourceTitle: String                 # e.g. "Jordan's Journey"
  websiteUrl: String                  # set = every row is filed under this website; null = standalone pages
  items: [StageImportItemInput!]!     # 1..5000
}
input StageImportItemInput {
  externalId: String!                 # ≤ 64 chars, unique in the file
  url: String!                        # http(s), on websiteUrl's host when websiteUrl is set
  title: String!
  position: Int!                      # 0 = newest
  facts: JSON!                        # ImportFacts keys only
  details: JSON                       # ImportItemDetails keys only
}
type Mutation { stageImportFromFile(input: StageImportFromFileInput!): ImportJob! @auth }   # admin only
```

The job is `APPROVED`, the source is `READY` with `fetchedAt` = now and `itemCount` = rows staged. Rows that fail validation are not staged and are counted in the error. A file with any invalid row is refused whole (`ErrInvalidInput` naming the first bad row), so a half-staged import cannot happen.

**Row shape.** The scraper's export is already `ImportItem`-shaped. Two facts are new to `ImportFacts`: `webPageRoles` (list of `WebPageRole`; shown as a sheet column and filterable) and `wordCount`. `kind` gains `PAGE`. A blog post row therefore has `kind: "PAGE"`, `webPageRoles: ["BLOG_POST"]`, a summary, published date, `wordCount`, reading time as `durationSeconds`, `commentCount` when known, and `thumbnailUrl`. As everywhere, an unknown fact is absent, never 0 (Decision 8).

**Importing a row (no network).** For a `CANDIDATE_FILE` row the import does **not** fetch the page: the staged facts are the metadata. The worker calls `CreateFromWebPage` with prefetched metadata built from the row (title, summary → description, thumbnail → `imageUrl`, `publishedAt`, author, `siteName` from the source title, roles from `facts`, and `fetch.status = IMPORTED`, a new value meaning "supplied by an import file"). Reasons: the scraper has just read the site, 1,077 more fetches would only add load, and WordPress.com rate-limits. The website, when `websiteUrl` is set, is find-or-created **once per import batch** before the workers start, and each page's `parent_content_id` is set to it.

**Trust.** The file is admin-supplied but still validated, because its URLs end up as links other people click: `http`/`https` only; `imageUrl` also `http`/`https`; title ≤ 300 chars, summary ≤ 600, author ≤ 200, at most 20 tags; every URL canonicalised with the webpage canonicaliser; with `websiteUrl` set, a row on any other host is invalid.

**Duplicates.** `UNIQUE(url)` still decides. A row whose canonical URL is already content shows "In library" in the sheet and is skipped on import. Staging the same file twice makes a second import job, which shows the first run's rows as in library.

## 4. Rollout

| Step | Who | Notes |
|---|---|---|
| Backend PR (dark): website type, parent link, `CANDIDATE_FILE`, staged-row import | review + merge | The migration (`parent_content_id`) is written, not applied. |
| Apply the migration per environment | human | [MIGRATION_ROLLOUT.md](../../../.docs/MIGRATION_ROLLOUT.md). Never from a dev session. |
| Stage the file | human admin | One GraphQL call with the scraper's `perspectize-import.json` (1.2 MB), signed in as an admin. |
| Pick and import rows on the sheet | human | Needs the `/import` page: today only on the unmerged `feature/import-staging-frontend`. |
| Frontend PR: bare-host detection, "File under" checkbox, Part of / Pages lists, Roles and Words columns | review + merge | After the import sheet lands. |

## 5. Decisions (confirmed 2026-11-13, all as proposed)

| # | Question | Decision |
|---|---|---|
| D12 | Rename `pageTypes` to `webPageRoles` (§1)? | Yes, now, before anything is built. |
| D13 | Is a website its own content type (`WEBSITE`), or only a host name shown on pages? | Own type, because it needs perspectives and a category like any content, and a parent must be a row. |
| D14 | Reuse `content.parent_content_id` from the TMDB design? | Yes; one hierarchy column for every type. The rule differs by type: TMDB forces the parent, websites never do. |
| D15 | Import without fetching (§3)? | Yes for file sources. A live-fetch variant stays possible later as an option on the source. |
| D16 | Does the `NEWS` role belong in the roles list? | No in v1. `NEWS_ARTICLE` has its own design (source bias ratings) and stays a separate type. |
| D17 | Can a person un-file a page from its website? | Not in v1. |
| D18 | Source type name `CANDIDATE_FILE`? | Yes: generic, not WordPress-specific, so another scraper's output imports the same way. |

## 6. Not in scope

Live WordPress listing (`/wp-json/wp/v2/posts`; see `2026-09-18-wordpress-blog-import-job-design.md` on the unpushed local branch `chore/wordpress-import-job-spec`), importing comments (the scraper has them; Perspectize has no home for them yet), scheduled re-sync, uploading the file from a browser (an admin posts it to the mutation), un-filing, editing roles after add (base D11), site-level "type" fields such as "a blog".

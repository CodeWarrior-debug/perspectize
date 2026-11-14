# Webpage content type (`WEB_PAGE`) — Design

Status: **proposal, not reviewed.** Request (2026-11-11): a very lightweight "webpage" type, mostly for saving related links for now. Its default columns must still allow a Wikidata category the way YouTube does, and few default columns are fine.

Preview: [tools/content-type-designer/previews/web-page-activity.html](../../../tools/content-type-designer/previews/web-page-activity.html) (built from [`web-page.spec.json`](../../../.claude/skills/content-type-preview/examples/web-page.spec.json); rebuild with the `content-type-preview` skill, never hand-edit the HTML).
Plan: [2026-11-11-web-page-content-type-plan.md](../plans/2026-11-11-web-page-content-type-plan.md).

## Scope

`WEB_PAGE` is any http(s) page that no other type claims. You paste a URL and the backend reads the page's `<head>` once for its title, description, site name, preview image and publish date, then stores the row. People categorise it and write perspectives on it like any other content.

**In v1:** add by URL; metadata read once at add time; the six columns below; the details view; Wikidata category (already built for every type); Activity filter by type; **page types the adder picks from a multiselect dropdown** (Blog post, Session transcript; §9), a multi-valued role list aligned with Schema.org; and **related content on a perspective** (§8). For example, in your perspective on a YouTube video you attach a blog post saying that video set the production standard for the next generation. The perspective stores the post's **content ID**, not its URL.

**Not in v1:** a content-to-content relation outside a perspective; a reverse "cited by" view on the related item (the table in §8 makes it cheap later); a Discover tab; re-reading metadata on a schedule; full-text extraction, archiving or screenshots of the page; per-site adapters (Medium, Substack, X and so on); page types beyond Blog post and Session transcript, detecting a page's types automatically, and changing a page's types after it is added (all in §9).

## 1. Ingestion

| Step | Rule |
|---|---|
| Detect | Frontend `detectContentCandidates`: any `http(s)://` URL that is not YouTube, TMDB/IMDb or Bible Gateway now returns `{ type: 'WEB_PAGE', url }` instead of nothing. The precedence order is unchanged, with Webpage last among URLs. |
| Mutation | `createContentFromWebPage(input: { url: String!, pageTypes: [WebPageType!] }): CreateContentResult! @auth`. `pageTypes` omitted or `[]` = none (a plain webpage); the reader never infers them in v1 (§9). It returns `alreadyExisted` like the others. |
| Canonical URL (dedupe key) | Lowercase the scheme and host, drop `www.`, the fragment, `utm_*`/`fbclid`/`gclid`, the default port and a trailing slash (except on `/`). If the page declares `<link rel=canonical>` **on the same registrable domain**, use that. The global `UNIQUE(url)` stays the dedupe key. If the canonical URL already belongs to another type (a YouTube watch URL can't reach here; a Wikipedia URL could), return the existing row. |
| Fetch | One GET, details in §4. It **never blocks the add**: on any failure the row is still created with `fetch.status` set and the title falling back to `host + path`. |

## 2. Stored shape

The shared columns are `name` (title), `url` (canonical) and `created_at`. Everything else goes in `content.response`:

```jsonc
{
  "schemaVersion": 1,
  "finalUrl": "https://arxiv.org/abs/1706.03762",   // after redirects
  "domain": "arxiv.org",                             // registrable host, no www
  "siteName": "arXiv.org",                           // og:site_name, else null
  "title": "Attention Is All You Need",              // og:title > <title>, trimmed; null if none
  "description": "…",                                // og:description > meta description; null if none
  "imageUrl": "https://…",                           // og:image (absolute), else null
  "faviconUrl": "https://arxiv.org/favicon.ico",     // <link rel=icon>, else /favicon.ico (not verified)
  "publishedAt": "2017-06-12",                       // article:published_time > citation_date > JSON-LD datePublished; null if none
  "pageTypes": ["BLOG_POST"],                        // roles the page plays, chosen by the adder (never read from the page), first = primary; [] = plain webpage (§9)
  "author": "Jane Doe",                              // JSON-LD author name > meta[name=author]; null if none. Max 200 chars
  "lang": "en",                                      // <html lang>, else null
  "fetch": { "status": "OK", "httpStatus": 200, "at": "2026-11-11T08:00:00Z" }
  // status: OK | BLOCKED (4xx) | ERROR (5xx/network) | TIMEOUT | NOT_HTML | TOO_LARGE.
  // Internal only: it drives the fallback title and the Add dialog's "couldn't read" message.
  // It is never shown as a value in the grid or the details view; only `at` is shown.
}
```

**Missing is `null`, never a guess.** `content.name` is `title`, or `host + path` when the title is null. A user rename would write `display_title`, the existing first-write-wins column, which needs no migration (decision D3).

**No migration for the type itself.** `content.content_type` has no CHECK constraint, and nothing above needs a new column. Related content (§8) adds one table.

## 3. Default columns (6)

| # | Column | Kind | Source | Empty means | Status |
|---|---|---|---|---|---|
| 1 | ◎ Perspectize | perspectize | derived | — | shipped |
| 2 | WebPage | item | `name` + `siteName` (else domain) + `imageUrl` / `faviconUrl` thumb | — | new renderer branch |
| 3 | Site | text | `response.domain` | never empty | new |
| 4 | **Category** | pill | `content.primaryCategory` | "No category set yet. Click to pick one." | **already shipped for all types** |
| 5 | Published | date | `response.publishedAt` | "The page declares no publish date." | new branch in the existing published-at sort expression |
| 6 | Added | date | `content.created_at` | never empty | shipped |

**Category needs no new work.** The column, the Wikidata typeahead popover, `setPrimaryCategory` and the `categories` table are all type-agnostic (`ActivityTable.svelte` colId `category`, `CategoryServiceImpl.SetPrimaryCategory`). The only work is to confirm the column is not hidden when the type filter is Webpage only, and to cover that with a test.

**Column picker only:** page types (pills), author, description, language, fetched (date and time). Page types stay out of the defaults because in v1 most rows have none; the Activity filter (§9) and the details view carry it instead.

## 4. Fetching safely (the only real risk)

The backend fetches a URL that a user typed, which is a server-side request forgery (SSRF) surface. Every rule below is required and each one gets a test:

- `http`/`https` only, ports 80/443 only.
- Resolve DNS **in the dialer** and reject loopback, private (RFC 1918), link-local (including `169.254.169.254` metadata), CGNAT, multicast, unspecified and IPv6 ULA/link-local addresses. The check runs on **every connection, redirects included**, so a DNS-rebind or a redirect to `127.0.0.1` fails (use a custom `net.Dialer.Control`, not a pre-check on the hostname).
- At most 3 redirects, a 5 s total timeout, and no cookies.
- Read at most 512 KiB and stop at `</head>`. A `Content-Type` other than `text/html`/`application/xhtml+xml` gives `NOT_HTML`; a PDF still saves with its file name as the title.
- Send a descriptive `User-Agent` (`PerspectizeBot/1.0 (+repo URL)`). Never send user data.
- Parse with `golang.org/x/net/html` (already a dependency), not regex.
- Per-user rate limit: reuse the existing auth'd mutation limiter if there is one, otherwise 30 adds per minute per user.

Images are **not** downloaded or proxied. The frontend loads `imageUrl`/`faviconUrl` directly with `referrerpolicy="no-referrer"` and `loading="lazy"`, and falls back to the type glyph on error.

## 5. Details view

Title, site and URL (opens in a new tab, `rel="noopener noreferrer"`); description, or "This page has no description" when there is none; tiles for Type (the `pageTypes` labels, "Webpage" when empty), Site, Author (shown only when the page declares one), Published, Fetched (date **and time** the metadata was read, in the viewer's local time, e.g. "2026-11-11 08:02"; no status) and Language; perspectives. Footer: "Title, description and image come from the page's own metadata, read once when the link was added. Perspectize links to the page; it does not copy its content."

**Import preview (Decision 8):** after the URL is pasted, the Add dialog shows the fetched title, site, author, description, image and published date before Save, plus a **Page types** multiselect dropdown (Blog post, Session transcript; empty by default, which saves a plain webpage; §9). A blocked fetch shows "We couldn't read this page's details (HTTP 403). You can still save the link." This needs a read-only `previewWebPage(url)` query that runs the same fetcher without writing anything.

## 6. Source terms and liability (Decision 9)

We store only what the page publishes for link previews (title, description, image URL) and always link back. We store no body text and no image bytes. Robots.txt is not consulted for a single user-initiated fetch, which is the same stance as link unfurlers; revisit this if fetching ever becomes automated or periodic.

## 7. Decisions to confirm

| # | Question | Proposed default |
|---|---|---|
| D1 | ~~Is a shared category enough for related links?~~ | **Decided 2026-11-11:** no. Related content is attached on a perspective by content ID (§8). |
| D6 | Can a perspective relate any content type, or only webpages? | Any type. The editor's paste box runs the same detection as Add Content, so a YouTube, movie or Bible Gateway link becomes that type's row. |
| D7 | Should related content inherit the perspective's privacy? | Yes. It is part of the perspective and has no privacy setting of its own. |
| D8 | Should a perspective entry in a content details modal show an "N related" count? | Yes: the count only, never the list. |
| D2 | Display label: "Webpage", "Link" or "Article"? | **Webpage**, one word everywhere it is shown (decided 2026-11-14). The enum stays `WEB_PAGE`; users never see it. |
| D3 | Can the person who added a page rename it when the title is bad or missing? | Yes, via the existing `display_title`. It is in the plan as the last, optional task. |
| D4 | Should `previewWebPage` (the import preview) ship in v1 or follow? | v1, because Decision 8 applies to every type. |
| D5 | Wikipedia URLs: save as Webpage, or offer "set as category" instead? | Save as Webpage; no special case in v1. |
| D9 | Which page types ship in v1? | **Blog post and Session transcript** (Blog post requested 2026-11-11; Session transcript added 2026-11-14). The field is a list from day one, so adding Article, Web app, Game and so on later is an enum value, not a migration (§9). |
| D10 | Auto-detect page types, or only let the adder choose? | **Only the adder chooses, in v1** (decided 2026-11-14): a multiselect dropdown in the Add dialog, nothing selected by default. No detection of any kind: no `BlogPosting` markup parsing, no URL guessing such as `/blog/`. Detection is a later enhancement (§9). |
| D11 | Can types change after the page is added? | Not in v1 (the row is shared, and the adder's choice is fixed at add time). Revisit with D3's rename, which has the same "who may edit a shared row" question. |

## 8. Related content on a perspective

**Use case.** Someone has a perspective on a YouTube video. They find an article arguing that this video set the production-quality standard for the next generation, and they attach that article to their perspective as related. The article becomes a `WEB_PAGE` content row (or is reused if it already exists), and **the perspective references its content ID**.

### Storage: a join table, not URL strings

Migration `0000NN_add_perspective_related_content` (the number is provisional; take the next free one on `main` before merge):

```sql
CREATE TABLE IF NOT EXISTS perspective_related_content (
  perspective_id INTEGER     NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
  content_id     INTEGER     NOT NULL REFERENCES content(id)      ON DELETE RESTRICT,
  position       SMALLINT    NOT NULL,          -- display order chosen by the author, 0-based
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (perspective_id, content_id)
);
CREATE INDEX IF NOT EXISTS idx_perspective_related_content_content
  ON perspective_related_content (content_id);   -- reverse "cited by" lookups later
-- down: DROP TABLE IF EXISTS perspective_related_content;
```

- **Why not an `INTEGER[]` like `related_perspective_ids`?** An array has no foreign key, so a deleted or mistyped ID would dangle silently. The table guarantees every ID is a real content row, and it gives an indexed reverse lookup.
- **FK kinds follow `backend/CLAUDE.md`:** the perspective → child rows FK is `CASCADE` (deleting a perspective drops its links); the FK to `content` is `RESTRICT`, like every other content FK.
- No owner column is needed: the perspective owns the rows. User deletion already reassigns perspectives, so nothing new goes in `UserService.Delete`.

### API

```graphql
type Perspective {
  # …existing fields…
  "Content the author attached as related, in their chosen order. Follows the perspective's privacy."
  relatedContent: [Content!]!       # dataloaded; [] when none
  relatedContentIDs: [Int!]!
}
input CreatePerspectiveInput { relatedContentIDs: [IntID!] }   # omit = none
input UpdatePerspectiveInput {
  "Omit = unchanged; [] = clear; a list replaces the whole set, in this order."
  relatedContentIDs: [IntID!]
}
```

**Validation (in the service, `ErrInvalidInput`):** at most 20 IDs; no duplicates; every ID exists (a single `WHERE id = ANY($1)` count); and **not the perspective's own `contentID`**, since a video can't be related to itself.

**Writes:** replace-the-set in one transaction (`DELETE … WHERE perspective_id = $1`, then a multi-row `INSERT`). Two statements, whatever the list length.

**Reads:** `Perspective.relatedContent` goes through a per-request dataloader keyed by perspective ID: one query joining `perspective_related_content` to `content` for every perspective on the page. A query-count test pins this at **+1 query per request**, not per perspective.

**Privacy:** a private perspective's related content is visible only where the perspective is. The related content rows themselves stay public content, as they are today.

### Two separate surfaces: don't blend them

Related content is a **perspective** field. It never appears in a content item's own details modal, and the Webpage type's details view (§5) has no related-content section.

| Surface | What it is | Related content? |
|---|---|---|
| **Content details modal** (e.g. the YouTube video's) | Facts about the item: title, tiles, description, a perspectives summary | **No.** At most, a perspective entry in its summary shows a count such as "3 related", which opens that perspective. |
| **Perspective editor** (Add/Edit perspective, on any type) | The author's ratings, review, feelings… | **Yes, an input:** the paste box below. |
| **Perspective view** (reading one perspective, yours or someone else's) | One person's take | **Yes, a read-only list** under the review text. |

### Editor flow (paste only; there is no "choose from a list")

The only way to add an item is to paste its link. The editor never offers a pick-list, because it has no source of candidates to offer. Each chip's title, site and thumbnail come from **the content row the paste created or reused** (`content.name`, `response.siteName`/`domain` and `response.imageUrl` for a webpage; the equivalent fields for other types). That row is returned by the create mutation in step 2, so no extra query is needed.

1. Paste a URL and run `detectContentCandidates` on it. A YouTube, movie or Bible Gateway link resolves to that type; any other URL resolves to `WEB_PAGE`.
2. Call that type's existing create mutation. They all return `{ content, alreadyExisted }`, so an article someone already saved is reused, not duplicated, and the returned `content` supplies the chip's data.
3. Push `content.id` onto the list, rendered as a removable chip (thumb, title, site). Reorder by drag, or by ↑/↓ for keyboard users.
4. Save the perspective with `relatedContentIDs`.

When the perspective is reopened for editing, the chips come from `Perspective.relatedContent`, which is already loaded with the perspective (dataloaded, §8 API).

Typing text that isn't a URL shows "Paste a link." Pasting the perspective's own content shows "That's the item you're writing about." A failed fetch still adds the chip, because the webpage row is still created (§1); its title is the URL fallback.

### Where it shows

- **Perspective view only:** a read-only "Related" list under the review text. Each item shows title, site and type icon, has an ↗ to the original URL, and links to that item's own details modal.
- **Content details modal:** nothing beyond the optional "N related" count on a perspective entry (decision D8).
- **Activity grid:** nothing new in v1.

## 9. Page types (multi-role), chosen by the adder

**Why.** A webpage is not one kind of thing: one is an article, another is a place where a game is played, another is a dashboard. There is no official single list of page roles, but [Schema.org](https://schema.org/WebPage) is the de facto vocabulary, and unlike the others (Open Graph's `og:type`, Dublin Core's type list) it already allows a page to carry several types at once. Perspectize uses its own short enum, each value mapped to a Schema.org type, rather than inventing labels or exposing raw Schema.org names.

**Multi-role.** `pageTypes` is an **ordered list; the first entry is the primary role**. A page with no entry is a plain webpage. One list covers "primary plus secondary roles" without a second field, and it matches how Schema.org markup can declare several `@type` values.

**Site type is separate and out of scope.** This describes one *page* ("this post"), not the *site* ("a blog"). A site-level field can follow later without touching this one.

### Vocabulary

| Perspectize value | Schema.org type | Ships in |
|---|---|---|
| `BLOG_POST` | [BlogPosting](https://schema.org/BlogPosting) (a kind of [Article](https://schema.org/Article)) | **v1** |
| `SESSION_TRANSCRIPT` | No dedicated type; closest is [Conversation](https://schema.org/Conversation). The record of a working session, for example a shared Claude Code session page. | **v1** |
| `ARTICLE` | Article, NewsArticle, Report | later |
| `TUTORIAL` | HowTo, Recipe | later |
| `DISCUSSION` | DiscussionForumPosting, QAPage | later |
| `WEB_APP` | WebApplication | later |
| `DASHBOARD` | WebApplication with `additionalType` | later |
| `GAME` | VideoGame | later |
| `DATASET` | Dataset | later |

The later rows are a roadmap, not a promise; each one is a new enum value plus a picker option, with no migration (a detector is optional and separate). `DASHBOARD` has no Schema.org type of its own, so it would lean on `additionalType`. Add them only when a real page needs them.

### Choosing page types (no detection in v1)

The adder picks the types in a **multiselect dropdown** in the Add dialog, nothing selected by default. The reader never sets `pageTypes`: it does not parse JSON-LD for them, and it does not guess from `og:type` or URL patterns. **Missing is empty, never a guess.** The order the adder picks them in is the stored order, so the first pick is the primary role. Picking nothing saves a plain webpage.

*Later, optional:* a detector could pre-select the dropdown, for example a JSON-LD block in `<head>` whose `@type` is or includes `BlogPosting`. It would only pre-fill a choice the adder can change, and it is out of v1.

`author` is still read from the page, in the metadata pass, as JSON-LD `author.name` (string, object or first array item), else `meta[name=author]`, capped at 200 characters.

### API and filter

```graphql
enum WebPageType { BLOG_POST SESSION_TRANSCRIPT }   # additive: later values never break clients
type WebPagePreview { …spec §2 fields…  author: String }   # no pageTypes: the reader never infers them
input ContentFilter { …existing…  webPageTypes: [WebPageType!] }   # match any (OR); webpage rows only
```

The list is stored in `content.response` (no migration) as the uppercase enum names, and `webPageTypes` filters with JSONB containment, one `response->'pageTypes' @> '["BLOG_POST"]'` per value, OR'd. Use `@>` rather than the `?|` operators: GORM reads a bare `?` as a bind placeholder. The enum is bound to a domain type in `gqlgen.yml` like the others, with no hand-written conversion switch. Rows of other content types never match a `webPageTypes` filter, as with the movie column filters.

### Where it shows

| Surface | What |
|---|---|
| Add dialog (import preview) | A **Page types** multiselect dropdown (Blog post, Session transcript), empty by default, plus the author line. |
| Activity filter | A "Page type" control that appears when the type filter is Webpage only. It offers Blog post and Session transcript in v1. |
| Details view | A **Type** tile (the chosen labels joined with a comma, e.g. "Blog post, Session transcript", or "Webpage" when empty) and an **Author** tile when known. |
| Column picker | "Page types" pills and "Author". Neither is a default column. |
| Perspective editor | Unchanged. A related blog post is just a webpage chip; its Type is not shown on the chip in v1. |

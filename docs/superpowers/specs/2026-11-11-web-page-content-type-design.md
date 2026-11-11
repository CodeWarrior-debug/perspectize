# Web page content type (`WEB_PAGE`) — Design

Status: **proposal, not reviewed.** Request (2026-11-11): a very lightweight "webpage" type, mostly for saving related links for now. Its default columns must still allow a Wikidata category the way YouTube does, and few default columns are fine.

Preview: [tools/content-type-designer/previews/web-page-activity.html](../../../tools/content-type-designer/previews/web-page-activity.html) (built from [`web-page.spec.json`](../../../.claude/skills/content-type-preview/examples/web-page.spec.json); rebuild with the `content-type-preview` skill, never hand-edit the HTML).
Plan: [2026-11-11-web-page-content-type-plan.md](../plans/2026-11-11-web-page-content-type-plan.md).

## Scope

`WEB_PAGE` is any http(s) page that no other type claims. You paste a URL and the backend reads the page's `<head>` once for its title, description, site name, preview image and publish date, then stores the row. People categorise it and write perspectives on it like any other content.

**In v1:** add by URL; metadata read once at add time; the six columns below; the details view; Wikidata category (already built for every type); Activity filter by type.

**Not in v1:** an explicit "related to item X" link between two content rows (§7, decision D1); a Discover tab; re-reading metadata on a schedule; full-text extraction, archiving or screenshots of the page; per-site adapters (Medium, Substack, X and so on).

## 1. Ingestion

| Step | Rule |
|---|---|
| Detect | Frontend `detectContentCandidates`: any `http(s)://` URL that is not YouTube, TMDB/IMDb or Bible Gateway now returns `{ type: 'WEB_PAGE', url }` instead of nothing. The precedence order is unchanged, with Web page last among URLs. |
| Mutation | `createContentFromWebPage(input: { url: String! }): CreateContentResult! @auth`. It returns `alreadyExisted` like the others. |
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
  "lang": "en",                                      // <html lang>, else null
  "fetch": { "status": "OK", "httpStatus": 200, "at": "2026-11-11T08:00:00Z" }
  // status: OK | BLOCKED (4xx) | ERROR (5xx/network) | TIMEOUT | NOT_HTML | TOO_LARGE
}
```

**Missing is `null`, never a guess.** `content.name` is `title`, or `host + path` when the title is null. A user rename would write `display_title`, the existing first-write-wins column, which needs no migration (decision D3).

**No migration.** `content.content_type` has no CHECK constraint, and nothing above needs a new column.

## 3. Default columns (6)

| # | Column | Kind | Source | Empty means | Status |
|---|---|---|---|---|---|
| 1 | ◎ Perspectize | perspectize | derived | — | shipped |
| 2 | Page | item | `name` + `siteName` (else domain) + `imageUrl` / `faviconUrl` thumb | — | new renderer branch |
| 3 | Site | text | `response.domain` | never empty | new |
| 4 | **Category** | pill | `content.primaryCategory` | "No category set yet. Click to pick one." | **already shipped for all types** |
| 5 | Published | date | `response.publishedAt` | "The page declares no publish date." | new branch in the existing published-at sort expression |
| 6 | Added | date | `content.created_at` | never empty | shipped |

**Category needs no new work.** The column, the Wikidata typeahead popover, `setPrimaryCategory` and the `categories` table are all type-agnostic (`ActivityTable.svelte` colId `category`, `CategoryServiceImpl.SetPrimaryCategory`). The only work is to confirm the column is not hidden when the type filter is Web page only, and to cover that with a test.

**Column picker only:** description, language, fetch status.

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

Title, site and URL (opens in a new tab, `rel="noopener noreferrer"`); description, or "This page has no description" when there is none; tiles for Site, Published, Fetched (status + date) and Language; the **Same category** list (other content with this `primaryCategory`, any type, capped at 10); perspectives. Footer: "Title, description and image come from the page's own metadata, read once when the link was added. Perspectize links to the page; it does not copy its content."

**Import preview (Decision 8):** after the URL is pasted, the Add dialog shows the fetched title, site, description, image, published date and fetch status before Save. A blocked fetch shows "We couldn't read this page's details (HTTP 403). You can still save the link." This needs a read-only `previewWebPage(url)` query that runs the same fetcher without writing anything.

## 6. Source terms and liability (Decision 9)

We store only what the page publishes for link previews (title, description, image URL) and always link back. We store no body text and no image bytes. Robots.txt is not consulted for a single user-initiated fetch, which is the same stance as link unfurlers; revisit this if fetching ever becomes automated or periodic.

## 7. Decisions to confirm

| # | Question | Proposed default |
|---|---|---|
| D1 | "Related links": is a **shared Wikidata category** enough for now, or do you need an explicit "this page relates to video X" link? | Category is enough for v1, and Same category in the details view makes it visible. An explicit `content_relation (from_id, to_id, created_by)` table is a separate follow-up and needs a migration. |
| D2 | Display label: "Web page", "Link" or "Article"? | **Web page** (enum `WEB_PAGE`). |
| D3 | Can the person who added a page rename it when the title is bad or missing? | Yes, via the existing `display_title`. It is in the plan as the last, optional task. |
| D4 | Should `previewWebPage` (the import preview) ship in v1 or follow? | v1, because Decision 8 applies to every type. |
| D5 | Wikipedia URLs: save as Web page, or offer "set as category" instead? | Save as Web page; no special case in v1. |

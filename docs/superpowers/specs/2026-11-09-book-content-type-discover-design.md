# Book content type (`BOOK`) — Discover design

Status: brainstormed interactively tonight (2026-11-09); not yet built. Preview of the
intended grid: `tools/content-type-designer/previews/book-activity.html`, built by the
`content-type-preview` skill from `.claude/skills/content-type-preview/examples/book.spec.json`.
Preview of the intended Discover page (Search/Trending/ISBN tabs):
`tools/content-type-designer/previews/book-discover.html` — hand-built, since
`content-type-preview` only covers the Activity table; no skill exists yet for a
Discover-page mock. Postman collection for the Open Library endpoints this design relies
on: `docs/superpowers/specs/postman/book-openlibrary.postman_collection.json` (§10).
Test case throughout: *East of Eden* (John Steinbeck).

## Scope

One new content type, `BOOK`, reachable only through a new **Books** source on the
Discover page (`/discover?source=books`), with three tabs: **Search** (title/author,
mirrors Movie's search), **Trending**, and **ISBN** (paste/type an ISBN-10 or ISBN-13 to
add a specific edition directly). All three run live tonight against **Open Library
only** — no Google Books fallback. Nothing else.

## Decisions

### 1. Data source: Open Library's `search.json`, `trending/{window}.json`, and `isbn/{isbn}.json`

`search.json` and `trending.json` return the same shape — a `works[]`/`docs[]` array of
**works**, not editions — and, confirmed live against real data tonight, both honor a
`fields=` filter that already gives everything the grid needs in one call: `key` (the
work id), `title`, `author_name`, `cover_i`, `first_publish_year`,
`number_of_pages_median`, `subject[]`, `ratings_average`, `ratings_count`,
`edition_count`. `isbn/{isbn}.json` is a different shape — it 302s to a specific
**edition** record (confirmed live tonight: `GET /isbn/9780434740024.json` → `/books/
OL22640535M.json`), which has no author name, rating, or page-count-median of its own,
but does carry a `works[0].key` back to the same work key the other two paths use (§5).
No API key, no quota — Open Library is free and CORS-open, but the backend still proxies
it (see §3) for consistency with every other Discover source and so trending can be
cached server-side.

Real examples pulled live tonight (2026-11-09):
- *East of Eden* (`search.json?q=East+of+Eden+Steinbeck`) → work `/works/OL23166W`,
  cover 11386937, year 1952, 611 median pages, rating 4.1 (100 ratings), 65 subjects.
  Its 1970 Heinemann edition, `isbn/9780434740024.json`, resolves to the same work key.
- *Atomic Habits* (`trending/weekly.json`) → work `/works/OL17930368W`, year 2016,
  322 pages, rating 3.97 (1489 ratings) — trending skews toward current nonfiction
  bestsellers, not classics; that's an honest property of the feed, not a bug.
- *Brainscan* (a zine, via `search.json?q=subject:zines`) → no cover, no rating,
  3 subjects, 30 pages — the sparse case the "unknown, not zero" cells exist for.

### 2. Identity: the Open Library **work key**, not ISBN-13

The content-type designer's existing catalog entry (`tools/content-type-designer/src/catalog.ts`)
lists Book's identity as "ISBN-13 (fallback: title + primary author)". Tonight's research
found that's wrong for how books actually arrive here: neither `search.json` nor
`trending.json` returns an ISBN — only a work key, and even the **ISBN tab** (§5)
immediately resolves its input down to that same work key rather than keying on the ISBN
itself. **This design overrides the catalog**: canonical identity/dedupe key is
`https://openlibrary.org/works/<id>`, stored in `content.url` under the existing global
`UNIQUE(url)`, exactly like Movie's TMDB URL. The catalog entry should be updated to match
once this ships.

One consequence: two different editions of the same book — say, the ISBN tab for the 1970
Heinemann *East of Eden* and a search-tab add of the same work — dedupe to **one row**,
same as they should. The specific edition/ISBN that triggered the add is still worth
keeping (§5), just not as the identity.

### 3. Backend ports (mirrors Movie's split)

- `BookSearchClient.SearchBooks(ctx, query, page) (*BookSearchPage, error)` →
  `GET /search.json?q={query}&fields=...&page={page}`.
- `BookTrendingClient.TrendingBooks(ctx, window domain.TrendingWindow, page int) (*BookSearchPage, error)` →
  `GET /trending/{daily|weekly}.json`. **Reuses the existing `TrendingWindow` enum**
  (`DAY`/`WEEK`) instead of adding a new one — Open Library also offers `monthly`,
  `yearly`, `now`, `forever`, which are deferred (§6) rather than growing the schema for a
  v1 that only needs parity with Movie's two windows.
- `BookISBNClient.ResolveISBN(ctx, isbn string) (string, error)` → `GET /isbn/{isbn}.json`,
  returns just the work key from the redirect target's `works[0].key` (§5).
- `BookSearchResult` / `BookSearchPage` structs mirror `MovieSearchResult`/`MovieSearchPage`
  field-for-field: `WorkKey string`, `Title string`, `AuthorName []string`, `CoverID *int`,
  `FirstPublishYear *int`, `PageCountMedian *int`, `Subjects []string`,
  `RatingsAverage *float64`, `RatingsCount *int`, `URL string` (the canonical
  `openlibrary.org/works/...` link).
- One adapter, `backend/internal/adapters/openlibrary/`, no auth config — first content
  type with no API key at all.

### 4. Add flow: `createContentFromBook(input: { url })`

Same shape as `createContentFromMovie`. The service re-fetches the exact work by key at
add time (never trusts a client-supplied snapshot) via the same `search.json` call scoped
to that one key, so the stored payload is fresh, not whatever the browser had cached from
the search result. **Decision to confirm:** this means CreateFromBook calls the search
*index* (fast, one HTTP call, gives every field above) rather than the canonical
`/works/{id}.json` (which has `description` and `subjects` but not `author_name`,
`ratings_average`, or `number_of_pages_median` — those are search-index aggregates, not on
the work record itself, confirmed live tonight). The write-up assumes the search-index
route; the details-view description (§8) needs a second, separate `/works/{id}.json`
call — its layout is decided (§8), but whether that call happens eagerly here or lazily
when the details modal opens is still open.

Only the Discover **Add** button (from any of the three tabs) creates a book in v1 — no
paste-a-Open-Library-URL flow in the general Add Content window. The mutation already
takes a bare URL, so adding that input path later is a small follow-up, not a redesign.

### 5. ISBN entry: a third Discover tab, independent of Amazon

This is a standalone capability, not a stepping stone to Amazon linking (§8) — it exists
because it's the one reliable way to add a **specific edition** by a number printed on the
book in your hand, which neither Search nor Trending can do (they rank/aggregate by work,
never by one printing). Flow: user types or pastes an ISBN-10 or ISBN-13 (hyphens/spaces
stripped, format-validated client-side); the backend calls `BookISBNClient.ResolveISBN`
(`GET /isbn/{isbn}.json`, confirmed live tonight to 302 to the specific edition), pulls
`works[0].key` off the redirect target, and from there runs the **exact same** work-key
resolution as §4 — so the ISBN tab's "Add" button ultimately calls
`createContentFromBook` with the resolved work URL, not a new mutation.

**What's kept from the ISBN itself:** the edition's `isbn_10`/`isbn_13` (both present on
the edition record) are stored in the row's JSONB payload as
`response.resolvedFromISBN`, even though the identity stays work-level (§2). Nothing
reads that field in v1 — it's there so a later feature (an edition picker, or revisiting
Amazon linking per §8) has real data to build on instead of refetching.

**Error cases:** an ISBN with no Open Library record 404s cleanly ("No book found for that
ISBN"); a malformed ISBN (wrong length/checksum) is rejected client-side before any call.
**Caution found tonight:** not every nonsense-looking ISBN 404s — `9999999999999` (13
nines, checksum-invalid) resolved to an unrelated, real but mis-keyed Open Library record
instead of erroring. `9780000000001` and a few other all-zero/all-one patterns did 404 as
expected, so this isn't universal, but it means **client-side ISBN-13 checksum validation
is load-bearing, not a nice-to-have** — it's the only thing standing between a garbage
input and a confidently-wrong "Added: Rómulo Maccio" toast. The Postman collection (§10)
has this exact case in Folder 2a.

### 6. Trending feed quality

Unlike Movie (TMDB trending is always current releases, exactly what you'd expect),
Open Library's trending genuinely surprised tonight's testing: it's dominated by
self-help/business bestsellers (*Atomic Habits*, *The 48 Laws of Power*), not literary
classics. That's **disclosed in the UI** with a one-line note under the Trending tab
("What's being looked up on Open Library right now — skews toward current nonfiction"),
not hidden or treated as a bug to fix.

### 7. Default columns (single Book type in view; Type hidden when solo)

**Revised from the first pass tonight: Author is a primary (default) column, not just
the item cell's sub-line.** The item cell still shows the author underneath the title
(so a card/mobile view never loses it), but a book's author is as central as a movie's
title — someone scanning the grid should be able to sort/filter by author without opening
the column picker, which the sub-line alone can't do.

◎ · **Book** (cover + title) · **Author** (`author_name[0]`; sortable, filterable —
unlike Movie's Cast/Director this needs no role-scoped search, it's one name) ·
**Published** (`first_publish_year`, rendered as a plain 4-digit string — **not** through
the shared `num` formatter, which applies a thousands separator and would render a year as
"1,952") · **Pages** (`number_of_pages_median` — see §7a) · **Rating** (`ratings_average`
out of 5, muted when `ratings_count < 5` — Open Library's community ratings are far
sparser than TMDB's vote counts, so the dimming threshold is much lower) · **Tags**
(chips from `subject[]`) — see §7b for why this reuses the existing shared Tags column
rather than a new "Subjects" one, and why it isn't split into genre/theme.

In the column picker: Editions (`edition_count`), Language, Date Added.

### 7a. Pages: native field, and word count is not available

`number_of_pages_median` is exactly what Open Library's search/trending index calls it —
it's **not a single stored page count**, it's a derived median computed across every
edition the index has for that work. Confirmed by comparing two real calls tonight: East
of Eden's search-index `number_of_pages_median` is **611**, but the specific 1970
Heinemann edition fetched via `isbn/9780434740024.json` has its own `number_of_pages:
525` — a different number, because it's one printing, not the cross-edition median. The
median is the only page-count figure available from Search/Trending; an edition's own
`number_of_pages` is only reachable per-edition (e.g. via the ISBN tab, §5), not at the
work level.

**Word count has no source.** Open Library's documented schema (editions and works alike)
has no word-count field anywhere — this isn't a gap in what tonight's calls happened to
fetch, it's not tracked by the API at all. The only way to show one would be either (a) a
rough estimate (pages × an assumed words-per-page, commonly ~250–300 for prose, which
would need a visible "estimated" label and is really a pages-column feature, not new
data) or (b) a different data source entirely, which nothing researched tonight provides
for free. **This needs your call before it goes further** — estimate-from-pages, a
different source, or drop it.

### 7b. Tags, not Subjects — and no genre/theme split

Checked tonight whether Open Library's `subjects` could be split into genre vs. theme:
the canonical work record (`/works/{id}.json`) does have a separate `genres` field, but
it's an array of opaque tag references (`/tags/OL170T`) needing one more API call per tag
to resolve to a label, **and it's often empty** — East of Eden has two, Atomic Habits has
none. `subject_people`/`subject_places`/`subject_times` exist too, but those are entities
(character names, settings), not genre/theme categories. There's no reliable free split
here, the same way Movie's TMDB keywords aren't split into genre vs. theme either.

So this reuses the project's existing **shared `Tags` column** (`grid-config.ts`,
currently fed by YouTube video tags and Movie's TMDB keywords) rather than inventing a
one-off "Subjects" header — same component, same external-source-tags caveat, same #560
overlap (separating source tags from user tags) that Movie's Tags column already carries.

### 8. Details view

Cover (book-cover aspect, not 2:3 like Movie posters — books vary, use `contain` not a
fixed poster box), title, author(s), tiles (Perspectives, Avg. rating, Rating count,
Pages, Published, Editions, Tags as chips), Description, and — when present — a
**Related works** link list. Attribution footer: "Data: Open Library (archive.org),
community-contributed; may be incomplete."

**Layout decided tonight using real descriptions** (East of Eden, *Atomic Habits*, and
*Brainscan* all have one on the canonical `/works/{id}.json` record; *Make a zine!*
genuinely has none — confirmed live, not a fetch that was skipped). **When it's fetched is
still open** — eagerly at add time (one more call per add) vs. lazily when the details
modal opens (one more call per view) is not decided; tonight only settled what it looks
like once it's there.

Two things the real text surfaced that a placeholder wouldn't have:
- **Descriptions are markdown, not plain text** — bold, links, and horizontal rules all
  showed up in East of Eden's raw field. Whatever renders this needs to treat it as
  external content like any other (strip or safely render the markdown; sanitize the way
  the project already sanitizes other user/external HTML, `.docs/SECURITY.md`), not emit
  it raw.
- **Some descriptions embed a related-works list** — East of Eden's carries "Contains:
  East of Eden 1/2 / 2/2" and "Also contained in: [4 omnibus editions]", because Open
  Library tracks multi-volume splits and combined editions as separate works linked only
  through this prose field. That's promoted to its own **Related works** section in the
  details modal (reusing the existing `links` block shape) rather than left as inline
  markdown links buried in a paragraph — *Atomic Habits* and *Brainscan* have no such
  list, so the section only appears when there's something to show.

### 9. Deferred: Amazon (ISBN itself is in scope — see §5)

Explicitly **out of scope for this design**, at the owner's direction tonight — and unlike
ISBN lookup, nothing short-term unlocks this: there is no free ISBN-lookup API on Amazon's
side. Goodreads' bridge API was shut down by Amazon in 2020 (`FEATURE_BACKLOG.md`); the
real one, the Product Advertising API, needs a live Associates account (ongoing qualifying
sales to keep access) and is built for affiliate links, not lookups. The one thing that
*does* work without any API: for print books, Amazon's ASIN is usually the ISBN-10, so
`amazon.com/dp/{isbn10}` reliably lands on the print listing — but Kindle ASINs aren't
derived from the ISBN at all, so there's no reliable free path to a specific Kindle
edition. When this is revisited, §5's `response.resolvedFromISBN` is the field it builds
from — but only for rows added via the ISBN tab; a search- or trending-added row has no
ISBN on file unless a later feature fetches one.

## Backend change list

| Layer | Change |
|---|---|
| Domain | `ContentTypeBook = "BOOK"` |
| Port | `core/ports/services` `BookSearchClient`, `BookTrendingClient` (reuses `domain.TrendingWindow`), `BookISBNClient` |
| Adapter | `adapters/openlibrary/` client — no auth config |
| Service | `CreateFromBook` (dedupe by canonical work URL, re-fetch by work key at add time); ISBN resolution step feeds the same service |
| Schema | `BOOK` enum value, `BookSearchResult`/`BookSearchPage` types, `createContentFromBook(input: CreateContentFromBookInput!)`, `bookSearch(query, page)`, `bookTrending(window, page)`, `bookByISBN(isbn: String!): BookSearchResult` (resolves without adding, for the ISBN tab's preview-before-add); `ContentSortBy.AUTHOR` for the new default Author column |
| Config | none — first content type with no API key |
| Frontend | `openLibraryApi.ts` (mirrors `tmdbApi.ts`), `BookSearchPanel.svelte`, `BookTrendingFeed.svelte`, `BookISBNPanel.svelte`, `BookCard.svelte`, `useAddBook.ts`, Books tab (with its three sub-tabs) on `/discover`, Book column set (adds a new `author` entry to `grid-config.ts`'s shared `COLUMNS`; reuses the existing `tags` entry — §7b), `Published` cell renderer formats the plain year (no `toLocaleString`), CSP `img-src` gains `covers.openlibrary.org` |

## Testing

- Backend: domain const; service (success, duplicate URL, bad/unknown work key, adapter
  error); ISBN resolution (valid ISBN, unknown ISBN → 404, malformed ISBN rejected);
  adapter against a recorded fixture (Open Library needs no token, so a live check is
  cheap too); query-count budget for create and list; resolver tests.
- Frontend: column-def test for the Book default set, including Author's new entry in
  `COLUMNS`; cell renderers for Published (plain year, no thousands separator)/Pages/
  Rating/Tags, including the `ratings_count < 5` dimming rule and the no-cover case;
  ISBN tab input validation (valid 10/13-digit, hyphenated, malformed, not-found).
- Stateful UI (per the global testing principle): the item cell has states — cover + full
  metadata, no cover, no rating, no subjects — each needs its own test, matching the four
  real examples pulled tonight (East of Eden, Atomic Habits, Make a zine!, Brainscan). The
  ISBN tab has its own states: idle, resolving, found (hands off to the same add flow),
  not found, invalid format.

## Rollout

No migration needed for the content row itself (JSONB payload, like every other type).
No config to set in any environment — no API key exists for Open Library. The only
rollout step is the GraphQL schema change going out with a normal deploy.

## Out of scope

Amazon linking (§9), Google Books fallback, pasting an Open Library URL into the general
Add Content window, *when* the description is fetched (§8 — layout is decided, timing
isn't), monthly/yearly/now/forever trending windows, word count (§7a — needs an answer
before it's in scope at all), an edition picker (showing all editions of a work),
batch/barcode-scanner ISBN entry.

## Decisions to confirm

1. **Identity is the Open Library work key**, overriding the content-type-designer
   catalog's stated ISBN-13 identity — the catalog entry needs updating to match.
2. **CreateFromBook re-fetches via `search.json` scoped to the work key**, not the
   canonical `/works/{id}.json` record, because the latter lacks author name, rating, and
   page count. The ISBN tab depends on this same mechanism.
3. **Reuses the existing `TrendingWindow` enum** (DAY/WEEK) rather than adding Open
   Library's full daily/weekly/monthly/yearly/now/forever set.
4. **Rating dimming threshold is `ratings_count < 5`**, not Movie's `< 50` — a guess at
   Open Library's much sparser community ratings, not measured.
5. ~~No separate Author column by default~~ — **reversed tonight**: Author is now a
   default column (§7), not just the item cell's sub-line.
6. **ISBN entry is a dedicated third tab**, not folded into the Search tab's text input —
   because a bare ISBN typed into a title search wouldn't reliably rank the exact edition,
   while the dedicated `/isbn/{isbn}.json` endpoint always resolves deterministically.

### 10. Postman collection

`docs/superpowers/specs/postman/book-openlibrary.postman_collection.json` hits the three
real Open Library endpoints directly (no backend exists yet): Folder 0 is Search and
Trending, Folder 1 is the ISBN tab's resolution chain (ISBN → edition → canonical work
record), Folder 2 is the edge cases above — including the "not every bad ISBN 404s"
finding, confirmed live via its own test script. Useful both to explore the API now and
as a living reference once the Go adapter exists (the adapter should return the same
shapes these requests do).

## Open question (yours, not mine)

**Word count (§7a).** Open Library has no word-count field anywhere in its schema — this
isn't a missing fetch, it's not tracked by the source at all. Three ways forward: (a) an
*estimated* word count from pages × an assumed words-per-page, clearly labeled as an
estimate; (b) a different data source entirely (none found tonight that's free); (c) drop
it. Need your call before this is anything but a question mark in the design.

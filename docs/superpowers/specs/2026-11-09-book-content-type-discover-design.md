# Book content type (`BOOK`) — Discover design

Status: brainstormed interactively tonight (2026-11-09); not yet built. Preview of the
intended grid: `tools/content-type-designer/previews/book-activity.html`, built by the
`content-type-preview` skill from `.claude/skills/content-type-preview/examples/book.spec.json`.
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
route; a details-view description (§7) needs a second, separate `/works/{id}.json` call,
deferred to when the details modal is actually built.

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

### 6. Trending feed quality

Unlike Movie (TMDB trending is always current releases, exactly what you'd expect),
Open Library's trending genuinely surprised tonight's testing: it's dominated by
self-help/business bestsellers (*Atomic Habits*, *The 48 Laws of Power*), not literary
classics. That's **disclosed in the UI** with a one-line note under the Trending tab
("What's being looked up on Open Library right now — skews toward current nonfiction"),
not hidden or treated as a bug to fix.

### 7. Default columns (single Book type in view; Type hidden when solo)

◎ · **Book** (cover + title, author as the item's sub-line — matches Movie's Film column
pattern) · **Published** (`first_publish_year`) · **Pages** (`number_of_pages_median`) ·
**Rating** (`ratings_average` out of 5, muted when `ratings_count < 5` — Open Library's
community ratings are far sparser than TMDB's vote counts, so the dimming threshold is
much lower) · **Subjects** (chips from `subject[]`, same external-source-tags caveat as
Movie's Tags/TMDB-keywords column, and the same #560 overlap).

In the column picker: Author (as its own sortable/filterable column, for anyone who wants
it separate from the item cell), Editions (`edition_count`), Language, Date Added. No
separate Author column by default — same reasoning as Movie's "Director leads Cast,
doesn't get its own column": the item cell's sub-line already carries it, and nothing in
v1 needs author-scoped search the way Movie needed cast/director-scoped search.

### 8. Details view

Cover (book-cover aspect, not 2:3 like Movie posters — books vary, use `contain` not a
fixed poster box), title, author(s), tiles (Perspectives, Avg. rating, Rating count,
Pages, Published, Editions, Subjects as chips). **Description is not fetched in v1** — it
needs the separate `/works/{id}.json` call noted in §4, deferred until the details modal
itself is built. Attribution footer: "Data: Open Library (archive.org), community-
contributed; may be incomplete."

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
| Schema | `BOOK` enum value, `BookSearchResult`/`BookSearchPage` types, `createContentFromBook(input: CreateContentFromBookInput!)`, `bookSearch(query, page)`, `bookTrending(window, page)`, `bookByISBN(isbn: String!): BookSearchResult` (resolves without adding, for the ISBN tab's preview-before-add) |
| Config | none — first content type with no API key |
| Frontend | `openLibraryApi.ts` (mirrors `tmdbApi.ts`), `BookSearchPanel.svelte`, `BookTrendingFeed.svelte`, `BookISBNPanel.svelte`, `BookCard.svelte`, `useAddBook.ts`, Books tab (with its three sub-tabs) on `/discover`, Book column set, CSP `img-src` gains `covers.openlibrary.org` |

## Testing

- Backend: domain const; service (success, duplicate URL, bad/unknown work key, adapter
  error); ISBN resolution (valid ISBN, unknown ISBN → 404, malformed ISBN rejected);
  adapter against a recorded fixture (Open Library needs no token, so a live check is
  cheap too); query-count budget for create and list; resolver tests.
- Frontend: column-def test for the Book default set; cell renderers for Published/Pages/
  Rating/Subjects, including the `ratings_count < 5` dimming rule and the no-cover case;
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
Add Content window, a details-view description, monthly/yearly/now/forever trending
windows, a separate Author column, an edition picker (showing all editions of a work),
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
5. **No separate Author column by default** — same call as Movie's Director-leads-Cast,
   but here there's no scoped-search need driving it either way.
6. **ISBN entry is a dedicated third tab**, not folded into the Search tab's text input —
   because a bare ISBN typed into a title search wouldn't reliably rank the exact edition,
   while the dedicated `/isbn/{isbn}.json` endpoint always resolves deterministically.

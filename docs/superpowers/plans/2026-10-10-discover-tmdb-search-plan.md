# Discover: TMDB movie search — implementation plan

> **Written without superpowers** — no `superpowers:*` skill was available in this session. Planned by the orchestrator; executed by implementer subagents.

Branch: `feature/discover-tmdb-search` (no pre-existing issue).

## Goal

The Discover page (`/discover`) is YouTube-only today. Add a **Movies** source: the user types a title, sees live TMDB search results (poster, title, year, score, overview), and adds a movie to Perspectize in one click. Adding reuses the existing `createContentFromMovie` mutation with the canonical TMDB URL, so dedupe and metadata shaping are unchanged.

## Decisions

- **Search runs through our backend** (`movieSearch` GraphQL query → TMDB `/search/movie`). The TMDB read token never reaches the browser, same as YouTube trending.
- **Public query** (no `@auth`), like `youtubeTrending`. Adding still requires sign-in. Abuse is bounded by the existing HTTP rate limiter. **Searches are not cached server-side** (user decision); each search goes to TMDB.
- **Separate port** `MovieSearchClient` (not a new method on `MovieClient`), mirroring `YouTubeTrendingClient`, so existing `MovieClient` mocks stay untouched.
- **Adult results excluded** (`include_adult=false`).
- **UI:** a two-option source switch (YouTube | Movies) at the top of Discover, persisted in the URL as `?source=movies`. YouTube stays the default and is unchanged.
- **Debounce** 350 ms, minimum 2 characters, query key includes `query` and `page`.

## GraphQL contract (both halves code against this)

```graphql
# One movie from TMDB search (Discover page Movies source).
type MovieSearchResult {
  tmdbId: Int!
  title: String!
  # YYYY-MM-DD; null when TMDB has no date
  releaseDate: String
  overview: String!
  # TMDB image path, e.g. "/abc.jpg"; prefix with https://image.tmdb.org/t/p/<size>
  posterPath: String
  # TMDB vote average 0-10; null when there are no votes
  voteAverage: Float
  # Canonical content URL (https://www.themoviedb.org/movie/<id>) — pass to createContentFromMovie
  url: String!
}

type MovieSearchPage {
  items: [MovieSearchResult!]!
  page: Int!
  totalPages: Int!
  totalResults: Int!
}

# in type Query:
  # Discover page: TMDB movie search, cached server-side. page defaults to 1 (max 500).
  movieSearch(query: String!, page: Int): MovieSearchPage!
```

Errors: blank/too-long query (>100 chars after trim) or page outside 1..500 → `ErrInvalidInput` message passed through. Anything else → `"movie search is unavailable right now"` (logged server-side, never the token/URL).

## Task 1 — Backend (go-backend)

1. `internal/core/ports/services/movie_client.go`: add `MovieSearchResult`, `MovieSearchPage` structs and
   `MovieSearchClient interface { SearchMovies(ctx, query string, page int) (*MovieSearchPage, error) }`.
2. `internal/adapters/tmdb/client.go`: `(*Client).SearchMovies` → `GET /search/movie?query=&page=&include_adult=false&language=en-US`, parse `page,total_pages,total_results,results[id,title,release_date,overview,poster_path,vote_average,vote_count]`. Empty `release_date` → nil; `vote_count == 0` → nil score; `url = CanonicalMovieURL(id)` is set by the resolver or kept on the struct. Reuse `c.get` (sanitized errors). Note `c.get` maps 404 to "movie not found"; fine.
3. `unconfigured.go`: `SearchMovies` → `ErrNotConfigured`. `fixture_client.go`: return one result built from the movie_603 fixture (id 603) for any query — offline demo/round-trip.
4. ~~Search cache~~ — dropped: searches are not cached server-side.
5. `internal/core/services/content_service.go`: option `WithMovieSearch(client)`, method `SearchMovies(ctx, query string, page int)` doing validation (trim; 1..100 runes; page 0→1; 1..500) then delegating. Nil client → wrapped `tmdb.ErrNotConfigured`-style error (not `ErrInvalidInput`). Add the method to the `ContentService` port interface and every mock implementing it.
6. `schema.graphql`: add the contract above. Run `make graphql-gen` in `backend/` (beware the known `schema.resolvers.go` collision — keep the resolver in `content.resolvers.go`). Resolver `MovieSearch` mirrors `YoutubeTrending` error handling and maps fields (`url` = `tmdb.CanonicalMovieURL`).
7. `cmd/server/main.go`: when a token is set, pass `tmdb.NewClient` (no cache wrapper) via `services.WithMovieSearch`; otherwise pass `tmdb.UnconfiguredClient{}`. Demo mode: if the roundtrip harness / demo wiring builds a `FixtureClient`, pass it too.
8. Tests (testify, table-driven, repo mocks): client (httptest server: params sent, parsing, nil date/score, error sanitizing), service validation table, resolver (mapping + error passthrough/generic). No DB access → no query-count test needed.

## Task 2 — Frontend (svelte-frontend + vitest)

1. `src/lib/services/tmdbApi.ts`: `MOVIE_SEARCH` gql, types, `searchMovies(query, page)`, `tmdbKeys = { all: ['tmdb'], search: (q, page) => [...all, 'search', q, page] }`, `tmdbPosterUrl(path, size = 'w185')`, `releaseYear(date)`.
2. `src/lib/components/discover/MovieCard.svelte`: poster (fallback placeholder icon), title + year, `★ 7.8` score, 3-line clamped overview, "Add to Perspectize" button / "Adding…" / "In Library" (disabled) states, link to the TMDB page (`rel="noopener noreferrer"`, new tab). TMDB attribution text in the panel footer ("Movie data from TMDB").
3. `src/lib/components/discover/MovieSearchPanel.svelte`: input (Cmd/Ctrl+K focus is handled by the page — expose `inputRef`), 350 ms debounce, min 2 chars, `createQuery` with key `tmdbKeys.search(debounced, 1)`, `staleTime: 10 min`, `enabled: debounced.length >= 2`; Load More accumulates pages like the YouTube grid; empty/idle/error/loading (`isPending`) states; a pasted TMDB/IMDb link (`validateMovieInput`) shows an "Add to Perspectize" submit that adds directly.
4. `src/routes/discover/+page.svelte`: source switch (`role="tablist"`, two buttons with `aria-selected`) bound to `?source=` via `goto(..., { replaceState: true, keepFocus: true, noScroll: true })`; YouTube block unchanged; Movies renders the panel. In-library check uses the existing `libraryUrls` set against `result.url`. Add uses `useAddMovie()` with `pendingId` tracking. Update the subtitle per source.
5. Tests: `tmdbApi` utils; `MovieCard` states; `MovieSearchPanel` with fake timers (one call after debounce; no call under 2 chars; load more); query-key contract test (key varies with query and page) per `.docs/QUERY_BUDGET.md`; Discover page source switch.

## Verification (orchestrator)

`go build ./...`, `gofmt -l .`, `go test ./...` in `backend/`; `pnpm run test:run`, `pnpm run check`, prettier in `frontend/`; adversarial diff review; `graphify update .`. No browser verification in cloud → PR labelled `needs-demo-video`.

## Task 3 — Trending movies (follow-up, after Tasks 1–2 land)

- Backend: `movieTrending(window: TrendingWindow = WEEK, page: Int): MovieSearchPage!` (`enum TrendingWindow { DAY WEEK }`) → TMDB `GET /trending/movie/{day|week}`. Trending pages ARE cached server-side (TTL ~1h, keyed by window + page), like YouTube Trending; search stays uncached.
- Frontend: Movies tab shows "Trending movies this week" while the search box is empty (fewer than 2 chars); results switch to search once typing.

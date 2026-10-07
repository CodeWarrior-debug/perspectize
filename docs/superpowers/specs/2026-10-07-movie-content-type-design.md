# Movie content type (`MOVIE`) — Design

Status: **written and built autonomously overnight, not reviewed.** The brainstorming gate asks for approval at each stage; the owner delegated the whole run ("brainstorm, use superpowers, execute overnight"), so every judgment call below is mine and is listed in **Decisions to confirm** so it can be overruled in the morning.

This **narrows and amends** `2026-09-27-tmdb-content-types-design.md` to the **Movie** type only. TV show / season / episode stay in that spec and are out of scope here. Where this doc and the TMDB doc disagree on a Movie column, this doc wins (owner pointers of 2026-10-07).

Preview of the intended grid: `tools/content-type-designer/previews/movie-activity.html`, from `tools/content-type-designer/previews/movie-activity.spec.json` (built with the `content-type-preview` skill; it predates these pointers and will be rebuilt from `.claude/skills/content-type-preview/examples/movie.spec.json`).

## Scope

One new content type, `MOVIE`, added by TMDB movie URL or IMDb `tt` id, shown in the Activity table with its own default columns, searchable by cast and director. Nothing else.

## Decisions

### 1. Identity and ingestion (unchanged from the TMDB doc, restated)

- Enum `MOVIE` (domain const, GraphQL enum, DB value `movie` via the existing lowercase converter).
- Canonical URL `https://www.themoviedb.org/movie/<tmdb id>` is the dedupe key; global `UNIQUE(url)` stays.
- Input accepted: TMDB movie URL (with or without slug), or `imdb.com/title/tt…` (resolved through TMDB `/find`). Title search is out of scope for v1.
- One adapter `backend/internal/adapters/tmdb/` behind a port; call `/movie/{id}?append_to_response=credits,release_dates,external_ids,keywords`. Auth: v4 read-access token in `TMDB_API_READ_ACCESS_TOKEN`; the variable *name* goes in `.env.example`, the value is set by the owner by hand.
- Mutation `createContentFromMovie(input: { url })`. Adding content never needs a migration for the JSONB payload.
- TMDB attribution text and logo in the details modal; CSP `img-src` gains `image.tmdb.org`.

### 2. People (cast + director) — one column, searchable, deduplicated by TMDB person id

**Storage:** `response.cast` = top-billed **15** cast entries `{id, name, character, order}`, and `response.directors` = **all** directors `{id, name}`. The full cast is not stored (a film can have 100+), so the grid and the payload stay small; the details modal links to TMDB for the rest.

**One column, "Cast":** directors first, marked `dir.`, then cast in billing order, as chips. The cell shows the first three and "+N"; the header tooltip says directors lead. Tooltip uses the existing multi mode (checklist + copy), with each person's role (`Director` / `as <character>`) and TMDB person id.

**Same-named actors:** identity is the TMDB **person id**, never the name. Two "Chris Evans" are two ids. Name search matches both (that is what a name search should do); the tooltip shows the id and a link to the TMDB person page so the reader can tell them apart; the id filter below is exact.

**Searchable, by role (answers "movies Mel Gibson directed vs. acted in"):**
- New `ContentSearchField` values `CAST` and `DIRECTOR`. `CAST` = name `ILIKE` over `response.cast[*].name`; `DIRECTOR` = same over `response.directors[*].name`. Each is its own scope, so searching `DIRECTOR` for "Mel Gibson" returns only the films he directed. Implemented as an `EXISTS (SELECT 1 FROM jsonb_array_elements(...))` expression in the existing `contentSearchColumns` map (one `?` placeholder, like TAGS).
- New filter `personId: IntID` (+ optional `personRole: CAST | DIRECTOR`, default any) = exact id match via JSONB containment (`response->'cast' @> '[{"id":N}]'`). This is the dedupe-correct way to ask for one person's films.
- One migration adds a **partial GIN index** (`jsonb_path_ops`) on the movie rows' cast and directors so containment is index-assisted. Migration is **written, not applied** (see Rollout).
- Limitation, stated in the tooltip: only the top 15 cast are searchable.

**Why not a `person` table now:** it buys "all films with X" and exact identity, both of which the id filter + GIN index already give for one type. Promote to `person` + `content_person` when a second type (TV) needs shared people. Revisit then.

### 3. Age rating (G / PG / PG-13 / R / NC-17): a stored string, not a table

Store the US certification as `response.certification` (text, from `release_dates` where `iso_3166_1 = US`, the first non-empty certification, preferring theatrical). **No lookup table.** It is a closed five-value set, one region, never joined, and never edited by users. A table adds a join to every list query and a migration for no capability.
- Sort: a `CASE` mapping in `helpers.go` (`G < PG < PG-13 < R < NC-17`, `NR`/null last) so it orders by rating, not A–Z.
- Filter: by value list.
- Revisit as a table only if non-US ratings (per-region) or TV Parental Guidelines enter the product. The TMDB doc already flags that mixed-scale case.

### 4. Money: Box office and Vs. budget

Both read `response.budget` and `response.revenue` (USD integers). TMDB reports `0` for "unknown": **0 is stored as null and shown as "—", never "$0"**.
- **Box office** = `revenue`. Rendered compact (`$1.2B`, `$316M`) with the exact figure in the tooltip. Same pattern as `viewCount`: BIGINT sort rule over the JSONB path, `NULLReplacement` 0.
- **Vs. budget** = `revenue ÷ budget`, shown as a percentage (`3,455%`). Sort rule is a `CASE` like `PercentLiked`: null when either side is null, so those rows sort last. **Judgment call:** I chose gross ÷ budget (a multiple) over profit ÷ budget ((revenue − budget) ÷ budget), because it reads without a sign and "performance against budget" most naturally means "how many times the budget did it take". The tooltip states both the multiple and the net. It ignores marketing and the studio's share of gross, so under 100% does not mean a loss. The tooltip says that.
- Budget itself is a details tile and a column-picker column, not a default column.

### 5. Duration (renamed from Runtime, matches YouTube)

Header is **Duration**; the tooltip says "Runtime" and that TMDB reports it to the minute.
- Stored in the existing `content.length` column in **seconds** with `length_units = 'seconds'` (what YouTube does), as `runtime_minutes × 60`; `response.runtimeMinutes` keeps the source value and `response.runtimeSecondsKnown = false`. It then sorts with YouTube videos and across mixed types with no mixed-unit alert.
- **Display rule (shared by YouTube and Movie):** `h:mm:ss` when the duration is an hour or more; `m:ss` under an hour. A movie therefore shows `2:22:00` and `45:00`. **Judgment call:** the owner's rule says seconds-unavailable under an hour shows `mm:ss`; it does not say what an hour-plus movie with no seconds shows. I chose `h:mm:ss` with `:00` for consistency, so the shape always signals "time". The tooltip carries the precision: "Runtime to the minute (TMDB does not report seconds)". If you'd rather show `2:22`, change one branch in the shared formatter.
- One formatter, `formatDurationSeconds`, already exists in `formatting.ts`; Movie reuses it and the YouTube path is checked against the same cases.

### 6. Default columns (single Movie type in view; Type is hidden when solo)

◎ · **Film** (poster + year) · **Genre** · **Rated** · **Cast** · **Duration** · **Released** · **Box office** · **Vs. budget** · **TMDB Score** · **Tags**

- **Date Added is not a default** (owner pointer); it stays in the column picker.
- **Tags** is a default. For Movie, tags are TMDB `keywords` (an external-source set). That intersects issue #560 (separate source tags from user tags); the column reads one source set today and must not block that decision.
- Director is no longer its own column (it leads Cast).
- Your rating is not a grid column (ANSWERS Q12 — perspectives are not grid columns); the existing Perspectize ◎ column covers it. This overrides the TMDB doc's "Your rating on by default".
- In the picker: Budget, Date Added, Studio, Collection, Votes, Synopsis, TMDB ID.
- TMDB Score is out of **10** (`vote_average`), shown as `8.1`, not a percent. Muted when `vote_count < 50`.

### 7. Details view

As in the TMDB doc §7 (Movie): 2:3 poster, tagline, tiles (Perspectives, Avg. rating, TMDB Score, Duration, Released, Rated, Director(s), Genre, Budget, Box office, Vs. budget, Collection), Synopsis, **Top cast (the stored 15, linked to TMDB person pages)**, Writers omitted in v1 (not stored), Keywords. Attribution at the bottom.

## Backend change list

| Layer | Change |
|---|---|
| Domain | `ContentTypeMovie = "MOVIE"`; `ContentSearchFieldCast/Director`; `ContentSortBy` values `BOX_OFFICE`, `VS_BUDGET`, `AGE_RATING` |
| Port | `core/ports/services` `MovieClient` (`GetMovie(ctx, tmdbID)`, `FindByIMDbID`) |
| Adapter | `adapters/tmdb/` client + URL/id parser |
| Service | `CreateFromMovie` (dedupe by canonical URL, build `Content` with length in seconds and the `response` payload) |
| Repo | sort rules + the two search fields + `personId` filter in `gorm_content_repository.go`/`helpers.go` |
| Schema | enum value, input, mutation, new sort/search enums, `ContentFilter.personId/personRole` |
| Migration | `0000NN` partial GIN index on movie cast/directors (written only) |
| Config | `TMDB_API_READ_ACCESS_TOKEN` (name only in `.env.example`) |
| Frontend | movie column set, Cast/Box office/Vs. budget renderers, shared duration formatter, Add Movie form, queries/types, CSP |

## Testing

- Backend: domain const; service (success, duplicate URL, bad URL, adapter error, repo failure, zero budget/revenue → null, runtime→seconds); adapter against a recorded fixture (no live token needed); repo search/sort/filter sqlmock tests; query-count budget for create and list; resolver tests.
- Frontend: formatter table tests (Duration cases, compact money, vs-budget %, null/zero), column-def test for the Movie default set, cell renderers, query/type exports.
- Stateful UI (per the global testing principle): Cast cell has states — directors-only, cast-only, both, overflow "+N", empty — each gets a test. Duration has hour / sub-hour / unknown.

## Rollout

Migration is **not applied** by this work (never `make migrate-*`; shared Neon DB). The PR must say a manual `migrate up` is needed per environment. The owner sets `TMDB_API_READ_ACCESS_TOKEN` in each environment. Live ingest against real TMDB is **not verified overnight** (no token available to the agent); the adapter is tested against recorded fixtures and the first live add is a morning check.

## Out of scope

TV types, title search, non-US certifications, people as content, a `person` table, writers, watch providers, full-cast storage.

## Decisions to confirm (overnight judgment calls)

1. **Vs. budget = gross ÷ budget** as a multiple-in-percent, not profit ÷ budget.
2. **Hour-plus movies show `2:22:00`**, not `2:22`.
3. **Top 15 cast stored**, full cast not searchable.
4. **No `person` table and no `age_rating` table** in v1.
5. **Cast column is one column with directors first**, with role-scoped search instead of two columns.
6. **Your rating is not a default column** (overrides the TMDB doc).
7. Branch/migration numbering is provisional until merge.

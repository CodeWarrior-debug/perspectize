# TMDB Content Types (Movie, TV show, TV season, TV episode) — Design

Status: draft for review. Designed in `tools/content-type-designer` — open `tools/content-type-designer/index.html`, pick a type under **Single-type view**, and every column, tooltip and details view below is live there. Section 4 → **Select the TMDB family** shows the four together. Output → **Single-type views** emits the tables in this doc from the tool state.

## Problem

Perspectize takes three content types today: `YOUTUBE`, `CLAIM` and `BIBLE_PASSAGE`. Films and TV are the obvious next source, and TMDB covers all four levels — movie, show, season, episode — through one API with one key. The questions are how many content types that makes, what identifies each one, which columns each shows when it is the only type in view, what the popovers say, and what the details modal shows.

## Decisions

### 1. Four content types, not one "TV" type with a level field

`MOVIE`, `TV_SHOW`, `TV_SEASON`, `TV_EPISODE`. Each level is a different thing to have a perspective on: an opinion about *Breaking Bad* is not an opinion about "Ozymandias". Each level has its own columns (Episodes vs No.), its own media (a poster vs a still), its own details layout, and its own filter chip. One type with a `level` field would put all of that behind conditionals in every renderer.

### 2. Identity = TMDB ids, via a regenerated canonical URL

| Type | Dedupe key | Stored `url` (always regenerated, never stored as pasted) |
|---|---|---|
| Movie | tmdb movie id | `https://www.themoviedb.org/movie/<id>` |
| TV show | tmdb tv id | `https://www.themoviedb.org/tv/<id>` |
| TV season | tv id + season_number | `https://www.themoviedb.org/tv/<id>/season/<n>` |
| TV episode | tv id + season_number + episode_number | `https://www.themoviedb.org/tv/<id>/season/<n>/episode/<e>` |

This is the Bible passage pattern (`CanonicalPassageURL`): the canonical URL *is* the dedupe key. The four URL shapes never collide, so the **global `UNIQUE(url)` stays** and no constraint migration is needed. Pasted inputs — TMDB URLs with slugs, `imdb.com/title/tt…` (resolved through TMDB `/find`), or a title search — are parsed to ids and then discarded. The season's own TMDB `_id` and the IMDb id are stored in `response` for linking, not for dedupe.

### 3. Hierarchy: soft parent links, no auto-created parents

Seasons and episodes store `tmdbShowId`, `showName`, `seasonNumber` (and `episodeNumber`) in `response`. Adding an episode does **not** create its show or season rows. The **Show** cell and the details breadcrumb link to the parent's Perspectize row when it exists, and to TMDB when it does not. The show's details view lists its seasons, and the season's lists its episodes. Each entry is marked "in Perspectize › open" or "+ Add", which is how a user walks down the hierarchy.

No `parent_content_id` column yet. That keeps this change migration-free. Promote the fields to a real column only if "all perspectives under this show" becomes a query (see Open questions).

### 4. Ingestion and backend

- One adapter, `backend/internal/adapters/tmdb/`, behind a port in `core/ports/services/`, using a v4 read-access token (`TMDB_API_READ_ACCESS_TOKEN`, added through the secret workflow in `.docs/SECURITY.md`).
- Calls per create: movie `/movie/{id}?append_to_response=credits,release_dates,external_ids,keywords`; show `/tv/{id}?append_to_response=credits,content_ratings,external_ids,keywords`; season `/tv/{id}/season/{n}` + the parent `/tv/{id}`; episode `/tv/{id}/season/{n}/episode/{e}?append_to_response=credits,external_ids` + the parent `/tv/{id}`.
- Season and episode inherit network, genres and US certification from the parent show call. TMDB certifies series, not seasons or episodes, and has no per-season genres.
- "Update source data" re-fetches with the existing 6h cooldown. This matters most for shows, where Status and Next episode go stale.
- **Attribution is required by TMDB's terms:** the TMDB logo and "This product uses the TMDB API but is not endorsed or certified by TMDB." go in every TMDB details modal and on an About/credits page.
- Images are hot-linked from `image.tmdb.org/t/p/{size}{path}` (w92 posters and w185 stills in the grid, w342 posters and w300 stills in details). The CSP `img-src` needs `image.tmdb.org`.

### 5. Columns when one type is filtered in

These are the defaults the tool suggests. Everything else stays in the column picker. **Type is dropped whenever a single type is filtered in**: every row would repeat it. This is a new `hideWhenSolo` rule and applies to every type, not only TMDB. Category (Wikidata) is off by default for TMDB types because Genre does the same job from the source.

| Movie (10) | TV show (10) | TV season (8) | TV episode (10) |
|---|---|---|---|
| ◎ | ◎ | ◎ | ◎ |
| Film (poster + year) | Show (poster + air years) | Season (poster + show name) | Episode (still + "Show · S5 E14") |
| Genre | Genre | Show | Show |
| Rated (MPA) | Network | Runtime (Σ episodes) | No. (S5 · E14) |
| Director | Episodes (+ seasons) | Episodes | Director |
| Runtime | First aired | Premiered | Runtime |
| Released | Status (Returning/Ended/Canceled) | Your rating | Aired |
| TMDB Score | TMDB Score | Date Added | TMDB Score |
| Your rating | Your rating | | Your rating |
| Date Added | Date Added | | Date Added |

In the column picker: Collection, Studio, Status, Votes, Keywords, Synopsis, TMDB ID, Watched (movie); Created by, TV rating, Votes, Keywords, Overview, Watching (show); No., Genre, TV rating, Network, Score, Overview (season); Genre, TV rating, Network, Episode type, Votes, Overview (episode).

New generic columns (per-type labels in brackets):
- `series` "Series" (Show / Collection)
- `position` "No."
- `episodes` "Episodes"
- `certification` "Age rating" (Rated / TV rating)
- `releaseStatus` "Release status" (Status / Episode type)

All five live in `response` JSONB, so none needs a migration.

### 6. Tooltips and popovers

Every header tooltip, and every cell popover with its copy value, is written per binding in `src/catalog.ts` (`tooltip`, `cellTip`, `appearance`). You can try them in the tool: hover a header or cell, and click a cell to pin its popover and use Copy. The rules they follow:

- **Copy copies the raw value.** Runtime copies `167`, not "2h 47m". Score copies `8.1`, the 0–10 average, not "81%". No. copies `S05E14`.
- **The popover says what the cell can't:** the vote count behind a score, primary vs US release date, director *and* writers, the per-season episode breakdown, next episode for a returning show.
- **Genre and Keywords use multi mode:** a checklist with Copy selected / Copy all, nothing copied by default. This is the existing tooltipSpec `multi` mode.
- Scores are muted when `vote_count < 50`. Season scores have no vote count at all, so Season Score is off by default.
- Episode overviews are blurred until hovered. They spoil plots.

### 7. Details view (ActivityDetailsModal)

The layouts are in `src/details.ts`. In the tool, click a title to open one. "Show field sources" annotates every value with the field it comes from.

- **Movie:** 2:3 poster. Tagline in italics under the title. Subtitle `year · Rated · runtime`. Links to TMDB and IMDb. Tiles: Perspectives, Avg. Rating, TMDB Score, Runtime, Released, Rated, Director, Genre, Budget, Box office, Collection, Date Added. Sections: Synopsis, Top cast (5), Writers, Keywords. Budget and revenue render "—" when TMDB reports 0, never "$0".
- **TV show:** poster. Subtitle `air years · TV rating · Network`. Tiles: Perspectives, Avg. Rating, TMDB Score, Status, Episodes, First aired, Last aired, Next episode, Created by, Network, Genre, Date Added. Sections: Overview, **Seasons list** (✓ in Perspectize / + Add), Top cast, Keywords.
- **TV season:** poster. Breadcrumb `Show`. Subtitle `S5 · 16 episodes · Network`. Tiles: Perspectives, Avg. Rating, Episodes, Total runtime, Premiered, Finale, TMDB Score, Date Added. Sections: Overview, **Episodes list** (from the season payload, so no extra call).
- **TV episode:** 16:9 still. Breadcrumb `Show › Season N`. Subtitle `S5 · E14 · air date · runtime`. Tiles: Perspectives, Avg. Rating, TMDB Score, Runtime, Aired, Director, Written by, Episode type, Date Added. Sections: Overview (spoiler-blurred) and Guest stars. **Prev / next episode** buttons cross season boundaries at a finale.
- All four keep the modal's shared chrome: header band, Last updated, Compare, Update source data. The TMDB attribution sits at the bottom.

### 8. Mixed-type behaviour (TMDB family together)

With the four TMDB types selected and the majority rule, the table shows ◎ · Item · Type · Length · Date · Approval · Rating · Date Added.

- **Length is one unit (minutes)** for movie, season and episode, so it sorts across them without the mixed-unit alert. The show does not bind Length and renders "—". TMDB's `episode_run_time` is deprecated and usually empty, and summing every season costs N extra calls.
- **Show and No. are hidden but not lost.** The Item subtitle carries "Show · S5 E14" for episodes and the show name for seasons. The tool records this as `carriedBy: 'Item subtitle'`, and the review reports it as covered.
- **Age rating mixes scales** (MPA vs TV Parental Guidelines). Sorting it alone raises the mixed-unit alert, and each scale sorts by its own order, not A–Z.
- **Genre names differ between TMDB's movie and TV lists** ("Science Fiction" vs "Sci-Fi & Fantasy"). A cross-type genre filter needs a small mapping table.

## Out of scope

- Watch-provider / "where to stream" data (TMDB `/watch/providers`, JustWatch-attributed).
- People as content (actors, directors).
- Non-US certifications: US is the first cut, and a user-region setting can come later.
- Auto-creating parent show or season rows.

## Open questions

1. **Parent rows.** Should adding an episode offer, in the same dialog, to add its show too? The recommendation is to offer it with a checkbox that is off by default.
2. **Aggregation.** Should a show's details view roll up perspectives on its seasons and episodes? That is the trigger for promoting `tmdbShowId` to an indexed column (migration).
3. **Specials (season 0).** Allow them, or hide them from the add flow? The recommendation is to allow them, and sort them last.
4. **Your rating vs TMDB Score.** Both are on by default. Is that one rating column too many for a 10-column view? The alternative is to put Watched in place of Your rating.

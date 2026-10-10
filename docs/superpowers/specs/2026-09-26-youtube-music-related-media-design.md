# YouTube Music Tracks & Related Media — Design

**Status:** Reviewed 2026-10-10 against `main` @ `dfa1fc7` (see **Review against main** below). Phase A is built on PR #440; Phase B of the plan brings it up to `main` and adds the feature flag. · **Date:** 2026-09-26
**Builds on:** `tools/content-type-designer/proposals/youtube-music-track-spec.md` (PR #440)

## Goal

Pasting a YouTube Music link into Add Content produces a **music track** item that is playable in-app. Related YouTube uploads of the same song are **not** made into content rows. They are kept as lightweight references on the track, and a user can promote one to its own item on purpose.

## Decisions

1. **Classify before normalizing.** `music.youtube.com` is detected before `NormalizeYouTubeURL` erases the host. Today every YT Music link silently becomes a `YOUTUBE_VIDEO` row (the type was `YOUTUBE` when this was written; renamed on `main` in #394).
2. **New content type `YOUTUBE_MUSIC`.** Its canonical URL is `https://music.youtube.com/watch?v=<id>`, which differs from the video canonical URL, so the global `UNIQUE(url)` constraint can stay as it is.
3. **Enrichment is layered, and each layer is optional beyond the first:**
   1. YouTube Data API v3: title, duration and thumbnail. This layer must succeed for the row to be created.
   2. YT Music InnerTube metadata: artist, album, and song vs. video. This source is unofficial and may fail; the row is still created without it.
   3. MusicBrainz recording search on artist, title and ±3s duration: ISRC, release date and genre, plus Cover Art Archive art.
4. **Identity chain:** ISRC, then YT Music video ID, then normalized artist + title + album. A match returns the existing row (`ErrAlreadyExists`) and adds the pasted video ID to its related media.
5. **`relatedMedia` references, not entities.** Stored in `response` JSONB as `[{provider:"youtube", videoId, kind, title, addedFrom, contentId?}]`, where `kind` is one of `audio | official_video | lyric_video | live | other`.
   - A reference gets no enrichment, no validation and no perspectives.
   - A reference is checked only when someone tries to play it. If it fails, it is marked `unavailable` and greyed out.
6. **Promotion requires consent.** "Add as its own item" runs the normal `CreateFromYouTube` flow on the reference's video ID. Afterwards the reference stores the new `contentId`, and the new video row gets `response.relatedTo = <trackId>`. If that video already exists as content, the two are simply linked.
7. **Prompting is sparing.** The app offers promotion at most once per add, as a toast action ("This song also has an official video — add it separately?"). The same action is always available in the details modal. It never prompts in bulk.
8. **The player uses the primary video ID with fallback.** It embeds a `youtube-nocookie.com` iframe, and on an embed error (the label disabled embedding) tries the next playable reference. When every option fails, it shows "Open in YouTube Music".
9. **`relatedMedia` is a cross-type field.** Only YT Music writes it in this plan. Podcast and book use are deferred.
10. **Lyrics are linked out, never displayed.** The app never stores or renders lyrics text.
    - **Check:** the backend calls the LRCLIB API (`/api/search`, matching artist + title ±3s duration) only to learn whether lyrics exist, then discards the text.
    - **Persist only the result**, in `response.lyrics = {available, lrclibId, hasSynced, checkedAt}`.
    - **When to check:** at add time, asynchronously, so the add is never blocked. A row marked "not available" is re-checked lazily when its modal opens and `checkedAt` is more than 30 days old. A row marked "available" is never re-checked.
    - **UI rule: every link's label says where it goes.** No link lands anywhere other than what it names without saying so first. Searches always use title + artist and never artist alone.

      | State | Option shown | Label / warning |
      |---|---|---|
      | Lyrics found **and** LRCLIB has per-track pages | Open lyrics | "Open lyrics" — opens this song's lyrics |
      | Lyrics found, **no** per-track pages | Search lyrics | "Search lyrics for '<Title>' – <Artist>" + helper text: "Opens a search results page, not this song directly." |
      | Not found | Search anyway | "No lyrics found for this song." + "Search LRCLIB for '<Title>' – <Artist>" with the same search-results warning |
      | Not yet checked or check failed | Search lyrics | Same as the search row |
      | Always, for YouTube-backed rows | YouTube Music | "Open song in YouTube Music" + helper text: "Lyrics tab shown there if available." |

      The label "Open lyrics" is reserved for the confirmed per-track destination.
    - Applies to `YOUTUBE_MUSIC` and `MUSIC_TRACK` rows.
    - **Resolved 2026-09-27:** LRCLIB has per-track pages. `https://lrclib.net/tracks/<lrclibId>` renders that song's plain and synced lyrics, and search is `https://lrclib.net/search/<url-encoded title artist>`. Both were verified in a headless browser, and the routes were confirmed in LRCLIB's app bundle. Guessed paths like `/lyrics/<id>` and `/search?q=` render a blank page and must not be used. Its metadata is volunteer-entered and messy: the top search hit for Bohemian Rhapsody had the artist set to "Bohemian Rhapsody - Queen", and a 3:38 cut was listed. The ±3s duration match is therefore required, not optional.

## Flow states (expected share)

| State | ~Share | Outcome |
|---|---|---|
| Full enrichment (Topic/Art Track, ISRC found) | 55–65% | Complete row; plays inline |
| No MusicBrainz match | ~20% | Artist and album only; identity is the video ID; ISRC lookup retried later |
| InnerTube down | 5–10%, bursty | Data API fields only; shows "enrichment pending" and retries |
| ISRC duplicate | ~5% | Existing row returned; pasted ID added to its related media |
| Same ID already a `YOUTUBE_VIDEO` row | 3–5% | Track created; reference linked to the existing row via `contentId` |
| Not a track (playlist, album, artist) | ~3% | Clear message; a track picker is deferred |
| Embed blocked | 2–3% | Fallback to a reference, then an outbound link |
| Invalid ID | <1% | Specific error |

## Deferred

- Treating plain `youtube.com` links as songs when InnerTube reports that they are one.
- Picking a track from an album or playlist.
- Displaying lyrics text in-app, including synced highlighting. This is out of scope because of display-rights liability; the app links out instead (decision 10).
- `relatedMedia` for other content types.
- Players for other content types. A separate plan will cover podcast `<audio>` and embeds for YouTube videos.

## Risks

- **InnerTube is unofficial.** Isolate it behind a port and treat every failure as non-fatal.
- **Rate limits.** MusicBrainz allows 1 request/second and requires a User-Agent. Queue lookups; don't block the add.
- **ytmusicapi is a Python library.** The Go adapter calls the InnerTube `next`/`player` endpoints directly, using that library as the reference implementation. A Python sidecar is rejected.

## Review against main (2026-10-10)

`main` moved 95 commits after Phase A was built. Everything below was checked against `main` @ `dfa1fc7` and the Neon move. The decisions above stand unless amended here; the plan's Phase B carries each item.

### What changed on main that affects this feature

| Change on `main` | Effect here |
|---|---|
| `YOUTUBE` renamed to `YOUTUBE_VIDEO` (#394, migration 000028) | Every `ContentTypeYouTube` / `'YOUTUBE'` reference in the music code and tests must become `ContentTypeYouTubeVideo` / `'YOUTUBE_VIDEO'`. The DB value `youtube_video` is what `linkExistingVideos` and promotion now look up. |
| `MOVIE` type landed (#565, #567, #568) with a worked example in `.claude/docs/ADDING_CONTENT_TYPE.md` | It set conventions this type must follow: a shaped per-type JSON field (`movie: JSON`) that the list selects instead of `response`; the `length_display` column (`LengthDisplay`); a per-type default column set applied when the type filter is exactly that type; `UnconfiguredClient` for optional services; the `ErrContentNotAllowed` policy guard; `otelhttp` transports; round-trip statement counts. |
| Migrations 000028–000030 are taken | Ours is renumbered **000031**. It stays provisional until the last step before merge (`.docs/PR_WORKFLOW.md` → Migration labels; the `Migration labels` workflow flags collisions automatically). |
| Query budget (#520, `.docs/QUERY_BUDGET.md`) | Every new repository/service path needs a pinned statement count. `linkExistingVideos` called `GetByURL` in a loop — the one smell the doc names first — so it becomes one batched `GetByURLs`. |
| Production database moved to Neon (#540) | Direct (non-pooled) connection string; `jsonb_set` and the partial index are unaffected. Neon branches (`.claude/skills/neon-postgres-branches`) are the right place to rehearse 000031 before applying it. The free-tier compute suspends after ~5 min idle, so a background lyrics check after a quiet spell may wait on a cold start; the 10 s timeout covers that. Cloud sessions can run DB-backed tests against a **local** Postgres (`backend/CLAUDE.md` → Testing), never the shared Neon DB. |
| Observability (#463) | External HTTP clients use `otelhttp.NewTransport`; the three new adapters must too. |
| `NewContentService(repo, yt, movie, opts...)` | Positional `movie` client; every test constructor changes. |
| No feature-flag infrastructure exists | Added below (decision 11). |

### Decisions added or amended

11. **Feature flag `FEATURE_YOUTUBE_MUSIC`, off by default, served by the backend.**
    - **Backend:** `Config.Features.YouTubeMusic` from `FEATURE_YOUTUBE_MUSIC=true`. When off, the four music mutations (`createContentFromYouTubeMusic`, `promoteRelatedMedia`, `markRelatedMediaUnavailable`, `refreshLyricsAvailability`) return `ErrFeatureDisabled` ("YouTube Music tracks are not enabled") before doing anything. Reads are never gated: `Content.music`, `relatedMedia` and `lyrics` keep working for rows that already exist, so turning the flag off later leaves existing tracks intact and only stops new ones.
    - **GraphQL:** `type Features { youtubeMusic: Boolean! }` and `query { features: Features! }`, no auth. Typed fields, not a `[String!]` list: a flag that is removed is a schema change caught at build time, not a stale string nobody notices.
    - **Frontend:** `useFeatures()` with `staleTime: Infinity` and `enabled: browser`. If the query fails for any reason (including an older backend that has no `features` query), every flag reads **false**. Gates: `useAddVideo` routes `music.youtube.com` links to the music mutation only when `youtubeMusic` is on; otherwise behaviour is exactly today's (the link becomes a video). The "YouTube Music" chip and the album/playlist notice in Add Content show only when on. The details panel renders for any `YOUTUBE_MUSIC` row regardless, since such rows can only exist if the flag was on when they were added.
    - **Why not a `VITE_` variable:** the frontend is a static build, so a build-time flag can't be flipped without a redeploy, and the frontend and backend could disagree. A backend-served flag also removes the deploy-order problem the Movie STATUS file reported: a frontend deployed ahead of the backend sees no `features` query, treats the flag as off, and never sends a mutation the backend lacks.
    - **Why not a DB table or a vendor now:** nothing needs per-user or runtime toggling yet. The typed `Features` GraphQL type is the contract; moving its source from env to a table or a vendor later changes nothing in the frontend.
    - **Rollout:** deploy the backend with the flag off → apply 000031 → set the flag in dev → verify → set it in prod. Backend deploys before frontend, as for Movie.
12. **Response layout (amends decisions 5 and 10).** Music fields move into one sub-object: `response.music = {videoId, artist, artists, album, videoType, isrc, releaseDate, genre, musicbrainzId, coverImageUrl, enrichmentPending}`. The YouTube Data API payload stays at the top level (so the existing `viewCount` / `channelTitle` / `description` extraction keeps working for music rows). `relatedMedia` and `lyrics` stay top-level because they are cross-type (decision 9; lyrics will apply to a MusicBrainz-based track type too). The ISRC index expression becomes `(response->'music'->>'isrc')`. Phase A merged the music keys into the top level; this is corrected in Phase B, before anything is deployed or any migration is applied.
13. **A shaped `Content.music: JSON` field, like `Content.movie`.** Set only for `YOUTUBE_MUSIC` rows. The details query selects `music`, `relatedMedia` and `lyrics`, never `response`. The list query is unchanged.
14. **Length.** `Length` is the Data API duration in seconds with `LengthDisplay = YouTubeLengthDisplay()` (source `youtube`, seconds). The MusicBrainz recording length is used only for match confidence, not display, as the flow table already said.
15. **Grid.** The Channel column shows `music.artist` for music rows (the catalog's "Creator → Artist" alias). A `YOUTUBE_MUSIC` default column set (Artist, Album, Released, Length, Genre) applies when the type filter is exactly `YOUTUBE_MUSIC`, following `MOVIE_DEFAULT_COLS`; the Item header reads "Track" then. The Item thumbnail uses `music.coverImageUrl` when present. The mobile card list gets no music fields (parity with Movie).
16. **Batching.** `ContentRepository.GetByURLs(ctx, urls)` returns existing rows for a set of canonical URLs in one statement; `linkExistingVideos` uses it. Statement budgets are pinned in tests (plan task B5).
17. **Adapters.** All three new HTTP clients wrap `otelhttp.NewTransport`. They stay keyless, so no `UnconfiguredClient` is needed; the feature flag is the off switch.
18. **Naming (to confirm).** The type stays `YOUTUBE_MUSIC` (DB `youtube_music`). The parallel to `YOUTUBE_VIDEO` would be `YOUTUBE_MUSIC_TRACK`; `YOUTUBE_MUSIC` is shorter and is the product's name. Changing it later costs a migration, so decide before 000031 is applied.
19. **Policy guard (to confirm).** Movie refuses NC-17 and TMDB-adult titles with `ErrContentNotAllowed`. The Data API payload already fetched carries `contentDetails.contentRating.ytRating`; the same guard would refuse `ytAgeRestricted` tracks. Default in the plan: apply it, for consistency with Movie. Say so if you'd rather not.
20. **`core/services` imports `adapters/youtube`** for `ClassifyURL`, the same hexagonal exception Movie made for `tmdb.ParseMovieInput`. Kept; listed so it is unwound together.

### Decisions to confirm

- [ ] 11: flag name `FEATURE_YOUTUBE_MUSIC`, off by default, backend-served (no `VITE_` twin).
- [ ] 18: keep `YOUTUBE_MUSIC` rather than `YOUTUBE_MUSIC_TRACK`.
- [ ] 19: refuse `ytAgeRestricted` tracks, as Movie refuses NC-17.
- [ ] 15: the five default columns for the music-only view.

### Not verified yet

- No browser run of any UI (cloud session; no Clerk sign-in). PR #440 carries `needs-demo-video` for a local session.
- Migration 000031 is written, not applied anywhere, and not yet rehearsed on a Neon branch.
- The InnerTube `next` endpoint has only been exercised on one real response (a live official video). The audio-track-with-counterpart shape is built from ytmusicapi's documented structure, not a capture.

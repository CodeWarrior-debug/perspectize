# YouTube Music Tracks & Related Media — Design

**Status:** Draft for review · **Date:** 2026-09-26
**Builds on:** `tools/content-type-designer/proposals/youtube-music-track-spec.md` (PR #440)

## Goal

Pasting a YouTube Music link into Add Content produces a **music track** item that is playable in-app. Related YouTube uploads of the same song are **not** made into content rows. They are kept as lightweight references on the track, and a user can promote one to its own item on purpose.

## Decisions

1. **Classify before normalizing.** `music.youtube.com` is detected before `NormalizeYouTubeURL` erases the host. Today every YT Music link silently becomes a `YOUTUBE` row.
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
| Same ID already a `YOUTUBE` row | 3–5% | Track created; reference linked to the existing row via `contentId` |
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

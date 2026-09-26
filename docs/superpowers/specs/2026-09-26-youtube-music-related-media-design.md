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
- Lyrics (no source exists).
- `relatedMedia` for other content types.
- Players for other content types. A separate plan will cover podcast `<audio>` and embeds for YouTube videos.

## Risks

- **InnerTube is unofficial.** Isolate it behind a port and treat every failure as non-fatal.
- **Rate limits.** MusicBrainz allows 1 request/second and requires a User-Agent. Queue lookups; don't block the add.
- **ytmusicapi is a Python library.** The Go adapter calls the InnerTube `next`/`player` endpoints directly, using that library as the reference implementation. A Python sidecar is rejected.

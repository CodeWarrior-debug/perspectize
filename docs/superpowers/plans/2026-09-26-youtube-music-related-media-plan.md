# YouTube Music Tracks & Related Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pasted `music.youtube.com` link becomes a playable `YOUTUBE_MUSIC` item. Related YouTube uploads are stored as `relatedMedia` references that a user can promote to their own item.

**Architecture:** URL classification runs before normalization and routes the link to `ContentService.CreateFromYouTubeMusic`.

- A new `ytmusic` adapter (InnerTube) and a new `musicbrainz` adapter sit behind ports.
- Enrichment is layered, and only the Data API layer is fatal.
- `relatedMedia` lives in `response` JSONB.
- A new `promoteRelatedMedia` mutation reuses `CreateFromYouTube`.
- The frontend adds routing in Add Content, a `MediaPlayer` component with embed fallback, and a related-media list in the details modal.

**Tech Stack:** Go 1.25+, gqlgen, GORM/Postgres 17, Svelte 5 runes, TanStack Query, AG Grid.

**Spec:** `docs/superpowers/specs/2026-09-26-youtube-music-related-media-design.md`. Decisions are argued there, not here.

## Global Constraints

- Branch: `claude/music-content-api-oyfdht`.
- **Never run `make migrate-up`.** Write the SQL only. The PR must state that it needs a manual `migrate up` in each environment.
- Before numbering the migration, check `ls backend/migrations/ | tail -5` and in-flight branches.
- Run `make graphql-gen` after any `schema.graphql` edit. Then delete the stray `schema.resolvers.go` after diffing it (see `backend/CLAUDE.md`).
- External calls are always mocked in tests. No test hits InnerTube, MusicBrainz or YouTube.
- Frontend: Svelte 5 runes only, and the TanStack function-wrapper pattern.

---

## Task 1 — Domain: content type and related media

- [ ] Add `ContentTypeYouTubeMusic ContentType = "YOUTUBE_MUSIC"` in `backend/internal/core/domain/content.go`, along with the DB converter (`youtube_music`).
- [ ] Add `RelatedMedia{Provider, VideoID, Kind, Title, AddedFrom, ContentID *int, Unavailable bool}` and `RelatedMediaKind` constants (`audio`, `official_video`, `lyric_video`, `live`, `other`) in a new `domain/related_media.go`.
- [ ] Add pure helpers with table-driven tests in `test/domain/`: `AddRelatedMedia(existing, ref)`, which dedupes by `provider + videoId`, and `LinkRelatedMedia(videoId, contentID)`.

## Task 2 — URL classification

- [ ] In `adapters/youtube/parser.go`, add `ClassifyURL(url) (kind URLKind, videoID string, err error)`. It returns `video | musicTrack | musicCollection | invalid`:
  - `music.youtube.com/watch?v=` returns `musicTrack`, and a `list=` parameter is ignored.
  - `/playlist` and `/browse/` return `musicCollection`.
  - Every existing pattern returns `video`.
- [ ] Add `NormalizeYouTubeMusicURL(id)`, which returns `https://music.youtube.com/watch?v=<id>`.
- [ ] Extend `test/youtube/parser_test.go` with all of the shapes above. The existing cases must stay green.

## Task 3 — Ports and adapters

- [ ] Add port `YTMusicClient.GetTrack(ctx, videoID) (*YTMusicTrack, error)`. It returns artist, album, `isSong`, and counterpart video IDs with their kinds.
- [ ] Add port `MusicBrainzClient.FindRecording(ctx, artist, title string, durationSec int) (*Recording, error)`. It returns ISRC, release date, genre tags and release MBID; the cover URL comes from Cover Art Archive.
- [ ] Add adapter `adapters/ytmusic/`, which POSTs to the InnerTube `next` endpoint with a WEB_REMIX client context. Use the ytmusicapi parsing as the reference. Apply a timeout of ≤3s.
- [ ] Add adapter `adapters/musicbrainz/`, with a 1 request/second limiter and a required User-Agent. Match on duration ±3s and choose the highest score ≥90. Otherwise return `ErrNotFound`.
- [ ] Add parser tests against recorded JSON fixtures in `test/ytmusic/` and `test/musicbrainz/`.
- [ ] Wire both adapters in `cmd/server/main.go` through a `ContentServiceOption`, `WithMusicEnrichment(yt, mb)`.

## Task 4 — Service: `CreateFromYouTubeMusic`

- [ ] Implement the flow in `content_service.go`:
  1. Classify the URL. Return `ErrInvalidURL` for anything that isn't `musicTrack`. For `musicCollection`, return a new `ErrNotATrack`.
  2. Build the canonical URL. If it already exists, add the pasted ID to the existing row's related media and return `ErrAlreadyExists`.
  3. Call the Data API `GetVideoMetadata`. This call is **fatal** on error.
  4. Call `YTMusicClient.GetTrack`. On error, log it and set `response.enrichmentPending=true`.
  5. Call `MusicBrainzClient.FindRecording` when an artist is known. If it finds an ISRC and a row with that ISRC exists, append the related media to that row and return `ErrAlreadyExists`.
  6. Seed `relatedMedia` from the InnerTube counterparts. For each one whose canonical `YOUTUBE` URL already exists, set `contentId`.
  7. Upsert with `ContentTypeYouTubeMusic`.
- [ ] Add a `GetByISRC(ctx, isrc)` repo method that queries `response->>'isrc'` for the `youtube_music` type. Update every mock that implements `ContentRepository`.
- [ ] Add service tests with mocks, one per spec flow state: full, no-MB-match, InnerTube-down, ISRC-dupe, URL-dupe, existing-video-link, not-a-track, Data API failure.

## Task 5 — Migration

- [ ] Write an idempotent migration `NNNNNN_youtube_music_isrc_index` that runs `CREATE INDEX IF NOT EXISTS idx_content_isrc ON content ((response->>'isrc')) WHERE content_type = 'youtube_music';`, with a matching down file. No constraint changes are needed.
- [ ] If `content_type` is a DB enum or check constraint, add `youtube_music` idempotently. Check first.
- [ ] Do not apply it. Flag it in the PR body.

## Task 6 — GraphQL

- [ ] Add `YOUTUBE_MUSIC` to the `ContentType` enum.
- [ ] Add `createContentFromYouTubeMusic(input: CreateContentFromUrlInput!)`. Make it `@auth`-gated and derive the user ID the same way `CreateContentFromYouTube` does.
- [ ] Add a `RelatedMedia` type and a `Content.relatedMedia: [RelatedMedia!]!` field, resolved from `response`.
- [ ] Add `promoteRelatedMedia(contentId: ID!, videoId: String!): Content!`. It calls `CreateFromYouTube` and then links both directions in one transaction. If the video already exists, it returns the existing row, linked.
- [ ] Add `markRelatedMediaUnavailable(contentId: ID!, videoId: String!)` for the player's lazy check.
- [ ] Add resolver tests in `test/resolvers/`.

## Task 7 — Frontend: Add Content routing

- [ ] Add `classifyYouTubeUrl()` in `src/lib/utils/youtube.ts`, mirroring the backend, with unit tests.
- [ ] In `AddVideoDialog.svelte`, call the music mutation for `musicTrack` links. For `musicCollection`, show "Paste a song link, not an album or playlist".
- [ ] After a successful add, if `relatedMedia` contains an `official_video` with no `contentId`, show one toast with an "Add video separately" action that calls `promoteRelatedMedia`. Show it once per add and never for a duplicate.

## Task 8 — Frontend: player and related media

- [ ] Build `MediaPlayer.svelte`, which takes a primary video ID and a fallback list. It renders a `youtube-nocookie` iframe with `enablejsapi=1`.
  - On an `onError` of 101/150 (embedding disabled), it calls `markRelatedMediaUnavailable` and advances to the next reference.
  - Once every option is exhausted, it shows "Open in YouTube Music".
- [ ] Mount the player in the details modal for `YOUTUBE_MUSIC` rows.
- [ ] Add a related-media list under the player. Each entry shows its kind chip and title, and offers either "Add as its own item" or "Open in Perspectize" when `contentId` is set. Unavailable entries are greyed out.
- [ ] Add icon/thumbnail rendering in `activityItemCellRenderer.ts` / `formatting.ts`: the `note` icon, plus the Cover Art Archive URL when one is present and `i.ytimg` otherwise. The Artist label comes from the Creator column.
- [ ] Update the CSP in `app.html` (`frame-src`) for `https://www.youtube-nocookie.com`, and `img-src` for `coverartarchive.org` and `archive.org`.
- [ ] Add component tests for the player's fallback sequence, the prompt showing once, and the promote/open button states.

## Task 9 — Verify

- [ ] Run these and record the output summaries: `go build ./...`, `gofmt -l .` (empty), `go test ./...`, and `pnpm install` then `pnpm run test:run` in `frontend/`.
- [ ] Run `graphify update .`.
- [ ] PR (`feat` template): state the manual migration and the unofficial InnerTube dependency, and leave the UI demo screenshots for a local session. Cloud sessions can't sign in through Clerk.

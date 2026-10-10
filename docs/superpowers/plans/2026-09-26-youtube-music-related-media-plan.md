# YouTube Music Tracks & Related Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pasted `music.youtube.com` link becomes a playable `YOUTUBE_MUSIC` item. Related YouTube uploads are stored as `relatedMedia` references that a user can promote to their own item.

**Architecture:** URL classification runs before normalization and routes the link to `ContentService.CreateFromYouTubeMusic`.

- A new `ytmusic` adapter (InnerTube) and a new `musicbrainz` adapter sit behind ports.
- Enrichment is layered, and only the Data API layer is fatal.
- `relatedMedia` lives in `response` JSONB.
- A new `promoteRelatedMedia` mutation reuses `CreateFromYouTube`.
- The frontend adds routing in Add Content, a `MediaPlayer` component with embed fallback, and a related-media list in the details modal.

**Tech Stack:** Go 1.27 (toolchain pinned in `go.mod`), gqlgen, GORM / Postgres 17 on Neon, Svelte 5 runes, TanStack Query, AG Grid.

**Phases.** Phase A (tasks 1–9) was built 2026-09-27 on PR #440 against the `main` of that day. Phase B (tasks B1–B9) is the 2026-10-10 review: it brings the branch up to `main` @ `dfa1fc7`, adds the feature flag, and pins the query budgets. Phase B is required before merge; nothing from Phase A is deployed or applied anywhere.

**Spec:** `docs/superpowers/specs/2026-09-26-youtube-music-related-media-design.md`. Decisions are argued there, not here.

## Global Constraints

- Branch: `claude/music-content-api-oyfdht`.
- **Never run `make migrate-up`** against `DATABASE_URL` (the shared Neon database). Write the SQL only. DB-backed tests in a cloud session run against a **local** Postgres (`backend/CLAUDE.md` → Testing); rehearsing the migration happens on a Neon branch (task B8).
- Migration numbers are provisional until merge (`.docs/PR_WORKFLOW.md` → Migration labels). Check `git ls-tree origin/main backend/migrations/` and in-flight branches; finalize as the last step before merging.
- **Query budget is a gate** (`.docs/QUERY_BUDGET.md`): every new repository or service path has its statement count asserted; a repo call inside a loop is rejected.
- **Feature-flagged.** All four music mutations are behind `FEATURE_YOUTUBE_MUSIC` (spec decision 11). Default off.
- Run `make graphql-gen` after any `schema.graphql` edit. Then delete the stray `schema.resolvers.go` after diffing it (see `backend/CLAUDE.md`).
- External calls are always mocked in tests. No test hits InnerTube, MusicBrainz or YouTube.
- Frontend: Svelte 5 runes only, and the TanStack function-wrapper pattern.

---

## Task 1 — Domain: content type and related media

- [x] Add `ContentTypeYouTubeMusic ContentType = "YOUTUBE_MUSIC"` in `backend/internal/core/domain/content.go`, along with the DB converter (`youtube_music`).
- [x] Add `RelatedMedia{Provider, VideoID, Kind, Title, AddedFrom, ContentID *int, Unavailable bool}` and `RelatedMediaKind` constants (`audio`, `official_video`, `lyric_video`, `live`, `other`) in a new `domain/related_media.go`.
- [x] Add pure helpers with table-driven tests in `test/domain/`: `AddRelatedMedia(existing, ref)`, which dedupes by `provider + videoId`, and `LinkRelatedMedia(videoId, contentID)`.

## Task 2 — URL classification

- [x] In `adapters/youtube/parser.go`, add `ClassifyURL(url) (kind URLKind, videoID string, err error)`. It returns `video | musicTrack | musicCollection | invalid`:
  - `music.youtube.com/watch?v=` returns `musicTrack`, and a `list=` parameter is ignored.
  - `/playlist` and `/browse/` return `musicCollection`.
  - Every existing pattern returns `video`.
- [x] Add `NormalizeYouTubeMusicURL(id)`, which returns `https://music.youtube.com/watch?v=<id>`.
- [x] Extend `test/youtube/parser_test.go` with all of the shapes above. The existing cases must stay green.

## Task 3 — Ports and adapters

- [x] Add port `YTMusicClient.GetTrack(ctx, videoID) (*YTMusicTrack, error)`. It returns artist, album, `isSong`, and counterpart video IDs with their kinds.
- [x] Add port `MusicBrainzClient.FindRecording(ctx, artist, title string, durationSec int) (*Recording, error)`. It returns ISRC, release date, genre tags and release MBID; the cover URL comes from Cover Art Archive.
- [x] Add adapter `adapters/ytmusic/`, which POSTs to the InnerTube `next` endpoint with a WEB_REMIX client context. Use the ytmusicapi parsing as the reference. Apply a timeout of ≤3s.
- [x] Add adapter `adapters/musicbrainz/`, with a 1 request/second limiter and a required User-Agent. Match on duration ±3s and choose the highest score ≥90. Otherwise return `ErrNotFound`.
- [x] Add parser tests against recorded JSON fixtures in `test/ytmusic/` and `test/musicbrainz/`.
- [x] Wire both adapters in `cmd/server/main.go` through a `ContentServiceOption`, `WithMusicEnrichment(yt, mb)`.

## Task 4 — Service: `CreateFromYouTubeMusic`

- [x] Implement the flow in `content_service.go`:
  1. Classify the URL. Return `ErrInvalidURL` for anything that isn't `musicTrack`. For `musicCollection`, return a new `ErrNotATrack`.
  2. Build the canonical URL. If it already exists, add the pasted ID to the existing row's related media and return `ErrAlreadyExists`.
  3. Call the Data API `GetVideoMetadata`. This call is **fatal** on error.
  4. Call `YTMusicClient.GetTrack`. On error, log it and set `response.enrichmentPending=true`.
  5. Call `MusicBrainzClient.FindRecording` when an artist is known. If it finds an ISRC and a row with that ISRC exists, append the related media to that row and return `ErrAlreadyExists`.
  6. Seed `relatedMedia` from the InnerTube counterparts. For each one whose canonical `YOUTUBE` URL already exists, set `contentId`.
  7. Upsert with `ContentTypeYouTubeMusic`.
- [x] Add a `GetByISRC(ctx, isrc)` repo method that queries `response->>'isrc'` for the `youtube_music` type. Update every mock that implements `ContentRepository`.
- [x] Add service tests with mocks, one per spec flow state: full, no-MB-match, InnerTube-down, ISRC-dupe, URL-dupe, existing-video-link, not-a-track, Data API failure.

## Task 5 — Migration

- [x] Write an idempotent migration `NNNNNN_youtube_music_isrc_index` that runs `CREATE INDEX IF NOT EXISTS idx_content_isrc ON content ((response->>'isrc')) WHERE content_type = 'youtube_music';`, with a matching down file. No constraint changes are needed.
- [x] If `content_type` is a DB enum or check constraint, add `youtube_music` idempotently. Check first.
- [x] Do not apply it. Flag it in the PR body.

## Task 6 — GraphQL

- [x] Add `YOUTUBE_MUSIC` to the `ContentType` enum.
- [x] Add `createContentFromYouTubeMusic(input: CreateContentFromUrlInput!)`. Make it `@auth`-gated and derive the user ID the same way `CreateContentFromYouTube` does.
- [x] Add a `RelatedMedia` type and a `Content.relatedMedia: [RelatedMedia!]!` field, resolved from `response`.
- [x] Add `promoteRelatedMedia(contentId: ID!, videoId: String!): Content!`. It calls `CreateFromYouTube` and then links both directions in one transaction. If the video already exists, it returns the existing row, linked.
- [x] Add `markRelatedMediaUnavailable(contentId: ID!, videoId: String!)` for the player's lazy check.
- [x] Add resolver tests in `test/resolvers/`.

## Task 7 — Frontend: Add Content routing

- [x] Add `classifyYouTubeUrl()` in `src/lib/utils/youtube.ts`, mirroring the backend, with unit tests.
- [x] In `AddVideoDialog.svelte`, call the music mutation for `musicTrack` links. For `musicCollection`, show "Paste a song link, not an album or playlist".
- [x] After a successful add, if `relatedMedia` contains an `official_video` with no `contentId`, show one toast with an "Add video separately" action that calls `promoteRelatedMedia`. Show it once per add and never for a duplicate.

## Task 8 — Frontend: player and related media

- [x] Build `MediaPlayer.svelte`, which takes a primary video ID and a fallback list. It renders a `youtube-nocookie` iframe with `enablejsapi=1`.
  - On an `onError` of 101/150 (embedding disabled), it calls `markRelatedMediaUnavailable` and advances to the next reference.
  - Once every option is exhausted, it shows "Open in YouTube Music".
- [x] Mount the player in the details modal for `YOUTUBE_MUSIC` rows.
- [x] Add a related-media list under the player. Each entry shows its kind chip and title, and offers either "Add as its own item" or "Open in Perspectize" when `contentId` is set. Unavailable entries are greyed out.
- [ ] Add icon/thumbnail rendering in `activityItemCellRenderer.ts` / `formatting.ts`: the `note` icon, plus the Cover Art Archive URL when one is present and `i.ytimg` otherwise. The Artist label comes from the Creator column. _(Partly done: the grid Type column shows the music icon. The Item thumbnail still uses `i.ytimg`; switching it to `coverImageUrl` is still to do.)_
- [x] Update the CSP in `app.html` (`frame-src`) for `https://www.youtube-nocookie.com`, and `img-src` for `coverartarchive.org` and `archive.org`.
- [x] Add component tests for the player's fallback sequence, the prompt showing once, and the promote/open button states.

## Task 9 — Lyrics availability (link out, no text stored)

- [x] **Port and adapter.** Add port `LyricsClient.Check(ctx, artist, title string, durationSec int) (*LyricsAvailability, error)`, returning `{Available, LRCLibID, HasSynced}`.
  - Build the adapter in `adapters/lrclib/`: call `GET https://lrclib.net/api/search`, match artist + title and duration ±3s, and send a project User-Agent.
  - **The adapter must drop `plainLyrics` and `syncedLyrics` while parsing.** Add a test asserting that no lyrics text leaves the adapter.
- [x] **Service.** Add `ContentService.CheckLyrics(ctx, contentID)`, which writes `response.lyrics = {available, lrclibId, hasSynced, checkedAt}`.
  - After `CreateFromYouTubeMusic` succeeds (and for `MUSIC_TRACK`), call it asynchronously in a goroutine with its own timeout. A failure is logged and doesn't block the add.
- [x] **GraphQL.** Add `Content.lyrics: LyricsAvailability` (nullable, since the row may not have been checked yet) and `mutation refreshLyricsAvailability(contentId: ID!)`.
  - The mutation only re-checks when the stored result is "not available" and `checkedAt` is more than 30 days old. Otherwise it returns the stored value.
- [x] **Frontend.** Build `LyricsLinks.svelte` in the details modal, implementing the spec's decision-10 state table exactly.
  - "Open lyrics" appears **only** when `available && lrclibId` and per-track pages are confirmed (confirmed; link `https://lrclib.net/tracks/<lrclibId>`, search `https://lrclib.net/search/<encodeURIComponent(title + ' ' + artist)>`).
  - Every search link carries its "Opens a search results page, not this song directly." helper text.
  - Searches are always built from title + artist and are never artist-only.
  - The YouTube Music link reads "Open song in YouTube Music" with "Lyrics tab shown there if available."
  - Opening the modal calls the refresh mutation when the stored result is stale.
  - Tests cover each row of the state table, including that "Open lyrics" never renders for a search URL, that no search URL is artist-only, and the stale-refresh trigger.
- [x] **Link target verified 2026-09-27:** per-track pages exist at `/tracks/:id`. See spec decision 10.

## Task 10 — Verify (Phase A, done 2026-09-27)

- [x] `go build ./...` OK · `gofmt -l .` empty · `go test ./...` 25 packages ok · `pnpm run test:run` 145 files / 1744 tests.
- [x] `graphify update .` could not run (not installed in the cloud session). Run locally. _(carried to B8)_
- [x] PR #440 retitled as `feat`, description on the feature template.

---

# Phase B — bring up to `main` and harden (2026-10-10)

Order matters: B1 before everything; B2 and B3 before B5's budgets are pinned; B8 last.

## Task B1 — Merge `origin/main` and adapt to the rename

**Suggested subagent:** `go-backend` for the backend half, `svelte-frontend` for the frontend half (review: `code-reviewer`).

- [ ] `git merge origin/main`. Expected conflicts (from a dry run): `cmd/server/main.go`, `generated.go`, `models_gen.go`, `resolvers/helpers.go`, `domain/content.go`, `domain/errors.go`, `services/content_service.go`, `schema.graphql`, `test/resolvers/content_resolver_test.go`, `test/services/user_service_test.go`, `ActivityDetailsModal.svelte`, `AddContentPopover.svelte`, `queries/content/index.ts`. Take `main`'s side for generated files and re-run `make graphql-gen` (then diff and delete the stray `schema.resolvers.go`).
- [ ] Rename: `domain.ContentTypeYouTube` → `ContentTypeYouTubeVideo` in `content_music.go` (promotion) and its tests; `'YOUTUBE'` → `'YOUTUBE_VIDEO'` in `useAddVideo.ts`, `AddContentPopover.svelte`, `discover/+page.svelte` and the music tests. `NormalizeYouTubeURL` is unchanged, so `linkExistingVideos` already finds `youtube_video` rows by URL.
- [ ] `NewContentService(repo, yt, movie, opts...)`: update every music test constructor to pass a movie client (`tmdb.UnconfiguredClient{}` or the existing mock).
- [ ] Re-apply the Phase A `AddContentPopover.svelte` changes on top of `main`'s version (it now routes `MOVIE` too): music chip, collection notice, `classifyYouTubeUrl` import. Keep `useAddVideo` as the last `createMutation` call (its comment explains why).
- [ ] Wire `WithMusicEnrichment(...)` in `main.go` next to `WithYouTubeTrending(...)`.
- [ ] Green: `go build ./...`, `go test ./...`, `pnpm run check` (only the two pre-existing errors from #471), `pnpm run test:run`.

## Task B2 — Migration renumber and index expression

**Suggested subagent:** `db-migration`.

- [ ] Rename `000029_youtube_music_isrc_index.*` → `000031_youtube_music_isrc_index.*` (000029 and 000030 are on `main`). Update the header note: "next free on main as of 2026-10-10; still provisional until merge".
- [ ] Index expression follows spec decision 12: `CREATE INDEX IF NOT EXISTS idx_content_isrc ON content ((response->'music'->>'isrc')) WHERE content_type = 'youtube_music';`. Down file unchanged.
- [ ] If spec decision 18 changes the type name, change the DB value here and in the domain converter in the same commit.
- [ ] Do not apply it. The `Migration labels` workflow sets `migrations-unapplied` on the PR by itself.

## Task B3 — Response layout and the `music` field

**Suggested subagent:** `go-backend`, then `svelte-frontend`.

- [ ] Backend: `musicFields.merge` writes `response.music = {...}` instead of top-level keys. `relatedMedia` and `lyrics` stay top-level. `musicSummary` / `readMusicSummary` read `response.music.artist(s)`.
- [ ] `GormContentRepository.GetByISRC` queries `response->'music'->>'isrc'` so it matches the index.
- [ ] Schema: `Content.music: JSON` ("YouTube Music metadata; null for other types"), populated in `domainToModel` the way `movie` is (`if c.ContentType == domain.ContentTypeYouTubeMusic { m.Music = responseMap["music"] }`).
- [ ] Frontend: `MusicTrack.music` replaces `MusicTrack.response`; `GET_MUSIC_TRACK`, `REFRESH_LYRICS_AVAILABILITY` and `MARK_RELATED_MEDIA_UNAVAILABLE` select `music { }` and never `response`. `MusicTrackPanel` reads `data.music.artist`.
- [ ] Tests: the service tests' `repo.field(...)` assertions move to the `music` sub-object; a resolver test selects `music` and checks `artist`, `isrc`, `coverImageUrl`.

## Task B4 — Feature flag `FEATURE_YOUTUBE_MUSIC`

**Suggested subagent:** `go-backend` (backend), `svelte-frontend` (frontend); review `code-reviewer`.

- [ ] Config: `Config.Features struct { YouTubeMusic bool }`, read from `FEATURE_YOUTUBE_MUSIC` (`"true"` only), default false. Add the variable to `backend/.env.example` with a one-line comment. Test in `test/config/` (unset → false; `true` → true; `t.Setenv` isolation per `clearConfigEnvVars`).
- [ ] Domain: `ErrFeatureDisabled = errors.New("feature is not enabled")`.
- [ ] Schema: `type Features { youtubeMusic: Boolean! }`, `features: Features!` on `Query` (no `@auth`). `make graphql-gen`; move the stub into `content.resolvers.go` (or a new `features.resolvers.go` if the domain-per-file rule in `backend/CLAUDE.md` prefers it).
- [ ] Resolver: `Resolver` gains a `Features` field set in `NewResolver` (main.go passes `cfg.Features`). The four music mutations start with `if !r.Features.YouTubeMusic { return nil, fmt.Errorf("YouTube Music tracks are not enabled") }`. Reads (`music`, `relatedMedia`, `lyrics`) are not gated.
- [ ] `go vet -tags perf ./internal/perf/...` after changing `NewResolver` (the perf harness constructs a resolver and rots otherwise).
- [ ] Resolver tests: `features` returns the configured value; each music mutation returns the not-enabled error when off and proceeds when on; `setupTestServer` gets a `features` parameter defaulting to on so existing music tests keep passing.
- [ ] Frontend: `src/lib/queries/features/index.ts` (`GET_FEATURES`, `Features` type) and `useFeatures.ts` (`staleTime: Infinity`, `enabled: browser`, `retry: false`); a `featureEnabled(query, 'youtubeMusic')` helper returns false while pending, on error, or when the field is missing.
- [ ] Gates: `useAddVideo.mutationFn` takes `{ url, musicEnabled }` (or reads the flag through a passed accessor) and only routes to the music mutation when enabled; `AddContentPopover` shows the "YouTube Music" chip and the collection notice only when enabled; `AddVideoDialog` likewise.
- [ ] Tests: `tests/unit/hooks-useFeatures.test.ts` with the real `QueryClient` helper (`mountConsumers` → one fetch; error → all false); `hooks-useAddVideo-music.test.ts` adds "flag off → video mutation, no music chip".

## Task B5 — Query budgets

**Suggested subagent:** `go-backend` (review: `code-reviewer`).

- [ ] Repository: add `GetByURLs(ctx, urls []string) ([]*domain.Content, error)` (one `WHERE url IN (?)`, empty input issues no query). `linkExistingVideos` builds the canonical URLs and calls it once. Update every `ContentRepository` mock.
- [ ] `CheckLyrics` returns the updated `*domain.Content` so `RefreshLyricsAvailability` no longer re-reads the row; `MarkRelatedMediaUnavailable` likewise returns the content.
- [ ] `query_count_test.go`: `GetByISRC` = 1; `SetResponseKey` = 1; `GetByURLs` = 1 for 50 URLs and 0 for none.
- [ ] Service round-trip counts (go-sqlmock or the local Postgres harness), each pinned with `AssertExactly`:
  - new track, no counterparts: `GetByURL` + upsert = **2** (+ `GetByISRC` = **3** when an ISRC resolved; + `GetByURLs` = **4** when counterparts exist);
  - duplicate by URL = **1**; duplicate by ISRC = `GetByURL` + `GetByISRC` + `SetResponseKey` = **3**;
  - `PromoteRelatedMedia` = `GetByID` + (`GetByURL` + upsert) + 2 × `SetResponseKey` = **5**;
  - `MarkRelatedMediaUnavailable` = **2**; `CheckLyrics` = `GetByID` + `SetResponseKey` = **2** (0 writes when the stored result is reused).
  - The background lyrics check is counted separately from the add (it runs after the add returns).
- [ ] Frontend cache contract (`tests/unit/query-cache-contract.test.ts` style, real `QueryClient`): `useMusicTrack` has an explicit `staleTime` (60 s) and a second mount inside it costs 0 fetches; `usePromoteRelatedMedia.onSuccess` invalidates exactly `content.music(id)` and `content.lists()` and leaves `content.detail(id)` untouched; `useRefreshLyrics` writes `setQueryData` and invalidates nothing.

## Task B6 — Conventions from Movie

**Suggested subagent:** `go-backend`.

- [ ] `CreateFromYouTubeMusic` sets `LengthDisplay: domain.YouTubeLengthDisplay()`.
- [ ] `ytmusic`, `musicbrainz`, `lrclib` clients: `Transport: otelhttp.NewTransport(http.DefaultTransport)`, and `slog.Error` with the path on non-200 responses (they already log; add the path).
- [ ] Policy guard, if spec decision 19 is confirmed: refuse the add with `domain.ErrContentNotAllowed` when the Data API payload has `contentDetails.contentRating.ytRating == "ytAgeRestricted"`, checked after metadata and before any write, like `movieNotAllowed`. The frontend maps it with the existing `contentNotAllowedMessage` helper. One service test and one resolver test.
- [ ] Extend `.claude/docs/ADDING_CONTENT_TYPE.md`'s worked-examples list with a pointer to this spec (one line, next to Movie).

## Task B7 — Grid columns for music rows

**Suggested subagent:** `svelte-frontend` (review: `code-reviewer`).

- [ ] Channel column: for `YOUTUBE_MUSIC` rows the cell shows `music.artist` (fall back to `channelTitle`). The list query already selects `channelTitle`; add `music` to the list selection only if the artist is needed there (it is), the same way `movie` is selected.
- [ ] Per-type default set in `grid-config.ts`: `YOUTUBE_MUSIC_DEFAULT_COLS` (Artist via the Channel column, Album, Released, Length, Genre), applied when the type filter is exactly `YOUTUBE_MUSIC`, mirroring `MOVIE_DEFAULT_COLS` and `defaultColumnVisibility`. Item header "Track" in that view (mirror the "Film" switch).
- [ ] Album, Released and Genre read `music.album` / `music.releaseDate` / `music.genre`; they are picker-only outside the music view.
- [ ] Item thumbnail: `music.coverImageUrl` when present (Cover Art Archive; `img-src https:` already allows it), else the `i.ytimg` thumbnail.
- [ ] Tests in `tests/unit/` for the column set, the header switch, and the renderers (`formatting.test.ts`, a `musicColumns.test.ts` mirroring `movieColumns.test.ts`). Mobile card list: no music fields (parity with Movie), note it in the STATUS file.

## Task B8 — Verification and rollout

- [ ] Backend: `go build ./...`, `gofmt -l .` empty, `go vet ./... && go vet -tags perf ./internal/perf/...`, `go test ./...`. In a cloud session also run the DB-backed tests against a local Postgres per `backend/CLAUDE.md` → Testing so `GetByISRC`, `SetResponseKey`, `GetByURLs` and the index are exercised; confirm in the CI `Test & Lint` log that they ran rather than skipped.
- [ ] Frontend: `pnpm run test:run`, `pnpm run check` (baseline: the two #471 errors only), `pnpm exec prettier --check` on touched files.
- [ ] `graphify update .` locally.
- [ ] Rehearse 000031 on a **Neon branch** from a local session (`.claude/skills/neon-postgres-branches`): create a branch from production, run `migrate up` against the branch's connection string only, confirm `\d content` shows `idx_content_isrc`, then delete the branch. Never against the parent.
- [ ] PR #440: keep `needs-demo-video` until a local session records the demo (add a YT Music song, play it, open lyrics, promote the official video, paste a playlist link, flip the flag off and confirm a music link adds as a plain video). Run `/revise-claude-md` and add a **Session Learnings** section to the PR body (`.docs/PR_WORKFLOW.md`).
- [ ] Last step before merge: confirm 000031 is still the next free number on `main` and `check-migration-number-before-apply` is off; renumber if not.
- [ ] Rollout order: backend deploy (flag off) → `migrate up` 000031 per environment → swap `migrations-unapplied` for `migrations-applied` → `FEATURE_YOUTUBE_MUSIC=true` in dev → verify → prod → frontend deploy can go any time (it reads the flag).

## Task B9 — Docs and handover

- [ ] Write `docs/superpowers/plans/2026-09-26-youtube-music-related-media-STATUS.md` in the Movie STATUS format: what is built (commit list), not verified, morning checklist, known follow-ups (grid thumbnail on the card list, InnerTube retry job, `core/services` → `adapters/youtube` import, the `tools/content-type-designer/proposals/` folder).
- [ ] Move or drop `tools/content-type-designer/proposals/`: `main` now keeps previews under `tools/content-type-designer/previews/` built by the `content-type-preview` skill. Either rebuild the YouTube Music preview with that skill or delete the proposals folder and link the spec instead.
- [ ] Close the loop on #470 (check constraint) in the STATUS follow-ups; it is not blocked on this PR.

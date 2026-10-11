# AUDIO_TRACK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the built YOUTUBE_MUSIC feature to the decided AUDIO_TRACK design (one track row per recording, link-only adds for Spotify / Apple Music / Amazon Music, a seeded Apple genre tree with the Option C picker, and the provider playback safeguards), so the owner can test it locally tonight on the demo stack.

**Architecture:** Hexagonal Go backend. A new `track_links` child table holds every link of a track (the first pasted link is also `content.url`, per ADR 0005). A new `AudioTrackRepository` and `MusicGenreRepository` sit beside `ContentRepository`, so the four existing hand-written `ContentRepository` mocks do not change. A pure link parser lives in `adapters/musiclinks`. Music metadata moves from top-level response keys into `response.music`, exposed as `Content.audioTrack: JSON` (the `movie: JSON` pattern). On the SvelteKit side, a `playerCoordinator` module (BroadcastChannel) enforces one active player. A data-driven `MusicGenrePicker` renders the Option C tree that the backend serves from the seeded `music_genres` table.

**Tech Stack:** Go 1.x, gqlgen (schema-first), GORM + pgx, golang-migrate, go-sqlmock + `internal/perf/querycount`; SvelteKit + Svelte 5 runes, TanStack Query (svelte-query), Vitest + @testing-library/svelte, AG Grid; Docker demo stack; Neon CLI; CDP recorder under `~/.claude/tools/video-capture`.

**Spec:** `adrs/0001-*.md` … `adrs/0006-*.md`, `docs/superpowers/wayfinder/audio-track/map.md` and tickets 01–09, and the glossary. The genre picker reference is `tools/content-type-designer/previews/audio-genre-picker-options.html` (Option C). The earlier spec `docs/superpowers/specs/2026-09-26-youtube-music-related-media-design.md` is superseded wherever the ADRs differ.

## Global Constraints

- Work only inside the worktree `/Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track` (branch `feature/audio-track-content-type`).
- No `&&` chaining in shell commands. Run each command as its own Bash call. Pipes (`|`) are fine.
- **Never run `make migrate-up` / `make migrate-down` / `migrate ... up|down` against `DATABASE_URL`.** It is the shared database. Migrations run only in two places:
  - the demo stack's own Postgres (`make demo-up`, applied automatically by its `migrate` service);
  - the Neon branch `audio-track-verify` in Task 19.
- Migration numbers are **provisional until merge**:
  - `000032` is the existing, unapplied ISRC index; this plan renames and rewrites it.
  - New migrations: `000033_add_music_genres`, `000034_add_content_genre_id`, `000035_add_track_links`.
  - If `main` gains migrations first, renumber before merge. Nothing is applied to the shared DB by this plan.
- `.env*` files (except `.env.example`) are unreadable. Never try to read or print them.
- Never print a database URL. Any command that could echo one is piped through `sed -E 's#postgres(ql)?://[^ ]+#<branch-url>#g'`.
- The private deployment URL never appears in commits, PR bodies, clips or this plan.
- Content type value: GraphQL/domain `AUDIO_TRACK`, DB `audio_track` (lowercased by `contentTypeToDBValue`).
- Providers (DB and GraphQL string): `youtube`, `spotify`, `apple_music`, `amazon_music`.
- `track_links.kind`: DB `listen` | `embed`, GraphQL `LISTEN` | `EMBED`.
- `track_links.source`: DB `pasted` | `matched`, GraphQL `PASTED` | `MATCHED`.
- Dedupe order (ADR 0005): ISRC, then MusicBrainz recording id, then (provider, provider track id), then exact URL.
  - Fuzzy "same song?" is only ever a prompt; nothing is merged without the user's confirmation.
  - A YouTube Music user upload (`videoType == "other"`) is never merged by ISRC/MBID or offered as a candidate.
- Spotify, Apple Music and Amazon Music links are **link-only**: no provider API call of any kind. YouTube Music keeps its InnerTube + Data API + MusicBrainz flow.
- Genre rules:
  - Suggest, never apply.
  - Anyone may set the genre while it is null. The adder may change it within **30 days** of `content.created_at`. Otherwise the error is `genre can only be changed by the person who added this track, within 30 days of adding it`.
- Option C:
  - Apple `Worldwide` (id 19) is shown as **`Regional & Cultural`**.
  - Moved under it: `MOVE_TO_WORLDWIDE` = African, Arabic, Brazilian, Chinese, Cuban, Indian, Korean, Russian, Turkish, Tarab, Jewish Music, French Pop, German Folk, German Pop, J-Pop, Enka, Kayokyoku.
  - `DROP_FROM_C` = Hörspiele, Folk (the root only).
  - `SUBGENRES_TO_WORLDWIDE` = Folk, whose children Iraqi Folk 100103 and Khaleeji Folk 100104 move under 19.
- Playback rules (ticket 03, hard requirements):
  - One active player per tab and across tabs, with a per-viewer override that is **off by default**.
  - No autoplay and no auto-advance to another track.
  - Closing the details modal stops playback.
  - Only YouTube embed errors **101 and 150** mark a link unavailable, per link. 153 and every other code mark nothing. No 30-day recheck.
  - Refuse age-restricted tracks.
  - Show an `E` badge for explicit tracks.
- AddContentPopover rule: `useAddVideo()` stays the **last** `createMutation` call, because existing tests capture the last options.
- `make graphql-gen` leaves a stray `schema.resolvers.go`: move the new stubs into the right `*.resolvers.go` file and delete it. After changing `NewResolver`, run `go vet -tags perf ./internal/perf/...`.
- Conventional commits, one logical change each, made with `git -C <worktree>` or from the worktree dir.

## Review Focus

1. **Re-pasting the same song with tracking or locale noise.** Examples: Spotify `?si=…`, `open.spotify.com/intl-de/track/…`, Apple `?i=` album links, Amazon `?trackAsin=`. Expected: the canonical provider id is found and the existing row is returned (`alreadyExisted: true`), with no second row. Tests: Task 7 `TestParse_CanonicalisesNoise` and Task 8 `TestCreateAudioTrack_RepasteWithTrackingParamsReturnsExisting`.
2. **Changing a genre someone else set, or after 30 days.** Expected: a clear error and the row unchanged; setting an empty genre always works. Tests: Task 5 `TestSetContentGenre_LockedReturnsErrGenreLocked` and Task 10 `TestSetTrackGenre_LockedMessage`.
3. **Searching the genre picker without accents or with different case.** Example: "forro" should find "Forró", "hip hop" should find "Hip-Hop/Rap"'s branch, and a parent shows when only a child matches. Test: Task 13 `MusicGenrePicker › search ignores accents and keeps matching parents`.
4. **Embed errors other than 101/150 (153, 2, 5, 100).** Expected: no link is marked unavailable. 100 still moves to the next upload. 153 shows the configuration message. Test: Task 14 `parseEmbedMessage › only 101 and 150 mark` and `MediaPlayer › 153 marks nothing`.
5. **Closing the details modal while a track plays.** Expected: the iframe is removed, the audio stops and the coordinator slot is released. Test: Task 16 `AudioTrackPanel › closing removes the player and releases the claim`.

---

## File Structure

**Backend — create**
- `backend/internal/core/domain/audio_track.go`: `MusicFields`, `ReadMusic`, `TrackLink` and its enums, and the provider constants.
- `backend/internal/core/domain/music_genre.go`: `MusicGenre`, `MatchGenre`, `CanChangeGenre`, `GenreChangeWindowDays`.
- `backend/internal/core/ports/repositories/audio_track_repository.go`: the `AudioTrackRepository` and `MusicGenreRepository` ports.
- `backend/internal/adapters/repositories/postgres/gorm_audio_track_repository.go`: the track_links and audio queries.
- `backend/internal/adapters/repositories/postgres/gorm_music_genre_repository.go`: genre list and genre set.
- `backend/internal/adapters/repositories/cached/music_genre_repository.go`: the TTL cache of the genre list.
- `backend/internal/adapters/musiclinks/parse.go`: the pure link parser for all four providers.
- `backend/internal/core/services/content_audio_track.go`: `CreateAudioTrack`, the link-only path, and the genre and link service methods.
- `backend/cmd/gen-music-genres/main.go` and `reshape.go`: the Option C reshape and seed SQL generator.
- `backend/data/music-genres/apple-genres-34.compact.json`: the compact Apple snapshot.
- `backend/migrations/000033_add_music_genres.{up,down}.sql` (generated), `000034_add_content_genre_id.*` and `000035_add_track_links.*`.
- Tests: `test/domain/audio_track_test.go`, `test/domain/music_genre_test.go`, `test/musiclinks/parse_test.go`, `test/services/content_audio_track_test.go`, `test/resolvers/audio_track_resolver_test.go`, `internal/adapters/repositories/postgres/gorm_audio_track_repository_test.go`, `internal/adapters/repositories/postgres/gorm_music_genre_repository_test.go`, `internal/adapters/repositories/cached/music_genre_repository_test.go`, `cmd/gen-music-genres/reshape_test.go`, and `test/roundtrips/audio_track_test.go`.

**Backend — modify**
- Domain: `domain/content.go` (the type constant and `GenreID`) and `domain/errors.go` (`ErrGenreLocked`).
- Ports and services: `ports/services/content_service.go`, `ports/services/youtube_client.go` (`AgeRestricted`), `ports/services/music_clients.go` (`Explicit`), `services/content_music.go` and `services/content_service.go`.
- Adapters: `adapters/youtube/client.go`, `adapters/ytmusic/client.go`, and in `adapters/repositories/postgres/` the files `gorm_content_repository.go`, `gorm_models.go` and `gorm_mappers.go`.
- GraphQL: `schema.graphql`, `gqlgen.yml`, `adapters/graphql/resolvers/{content.resolvers.go,helpers.go,resolver.go}`, `adapters/graphql/dataloader/dataloader.go` and `directives/auth_test.go`.
- Wiring and tests: `internal/server/api.go`, `cmd/server/main.go`, `test/roundtrips/harness_test.go`, and the migration `000032_*` (rename and rewrite).

**Frontend — create**
- Utilities: `src/lib/utils/audioLinks.ts` (mirror of the parser), `src/lib/utils/genreTree.ts` (tree build, search and Recent) and `src/lib/utils/playerCoordinator.ts` (claim/release and the BroadcastChannel).
- Settings: `src/lib/stores/playbackSettings.svelte.ts`, which holds the overlapping-playback override in localStorage.
- Queries: `src/lib/queries/content/useAudioTrack.ts`, which replaces `useMusicTrack.ts`, and `src/lib/queries/content/useAddAudioTrack.ts`.
- Components: `MusicGenrePicker.svelte`, `AudioTrackFields.svelte` and `AudioTrackPanel.svelte` (which replaces `MusicTrackPanel.svelte`), all under `src/lib/components/`.
- Tests:
  - `tests/unit/audioLinks.test.ts`, `tests/unit/genreTree.test.ts`, `tests/unit/playerCoordinator.test.ts` and `tests/unit/audio-track-cache-contract.test.ts`;
  - `tests/components/MusicGenrePicker.test.ts`, `tests/components/AudioTrackFields.test.ts` and `tests/components/AudioTrackPanel.test.ts`.

**Frontend — modify**
- Queries: `src/lib/queries/content/index.ts`, `src/lib/queries/keys.ts` and `src/lib/queries/content/useAddVideo.ts`.
- Utilities: `src/lib/utils/{mediaPlayer.ts,detectContentType.ts,formatting.ts}`.
- Components: `MediaPlayer.svelte`, `AddContentPopover.svelte`, `AddVideoDialog.svelte`, `ActivityDetailsModal.svelte`, `SettingsDialog.svelte` and `ActivityTable.svelte`.
- Grid: `src/lib/components/activity/grid-config.ts` (or its current path; find it with `graphify explain "grid-config"`) and `columnLayouts.ts`.
- Tests: `tests/components/MediaPlayer.test.ts`, `tests/components/AddContentPopover.test.ts`, `tests/unit/formatting.test.ts` and `tests/unit/hooks-useAddVideo-music.test.ts` (renamed to `hooks-useAddAudioTrack.test.ts`).

**Tools (append-only rule)**
- Create the copy `~/.claude/tools/video-capture/demos/demo-audio-track/record-audio-track-tour.mjs` with its `README.md`. Register it in the "Recorders index". Never edit `demo-movie-content-type/*`.

---

## Task Map

| # | Task | Stack | Depends on | Can run in parallel with |
|---|------|-------|-----------|--------------------------|
| 1 | Rename YOUTUBE_MUSIC to AUDIO_TRACK (backend) | backend | — | 2, 7, 12, 13, 14 |
| 2 | Rename to AUDIO_TRACK (frontend) | frontend | 1 (the schema names) | 3–7 |
| 3 | `response.music` layout, `Content.audioTrack`, migration 000032 | backend | 1 | 4, 7 |
| 4 | Option C reshape generator and `music_genres` seed (000033) | backend | — | 1–3, 7 |
| 5 | `content.genre_id` (000034), genre domain and genre repos | backend | 3, 4 | 6, 7 |
| 6 | `track_links` (000035), domain and `AudioTrackRepository` | backend | 5 | 7 |
| 7 | `musiclinks` parser | backend | — | everything |
| 8 | Service: `CreateAudioTrack` link-only path, genre and link methods | backend | 5, 6, 7 | 11–14 |
| 9 | Service: the YouTube Music path (age, explicit, MBID, uploads, batching, suggestion) | backend | 8 | 11–14 |
| 10 | GraphQL schema, resolvers, dataloader, wiring, roundtrips | backend | 9 | 12–14 |
| 11 | Frontend data layer and cache contracts | frontend | 2, 10 (schema) | 12–14 |
| 12 | `audioLinks`, `detectContentType`, `genreTree` | frontend | — | 1–11 |
| 13 | `MusicGenrePicker` | frontend | 12 | 1–11, 14 |
| 14 | Playback safeguards (coordinator, player, setting) | frontend | — | 1–13 |
| 15 | Add flow UI | frontend | 11, 12, 13 | 16, 17 |
| 16 | Details panel | frontend | 11, 13, 14 | 15, 17 |
| 17 | Grid columns | frontend | 11 | 15, 16 |
| 18 | Full verification and integration run on the demo Postgres | both | 1–17 | — |
| 19 | Neon branch `audio-track-verify` verification | backend | 18 | 20 |
| 20 | Demo clip | both | 18 | 19 |

Lanes: tasks 7, 12, 13 and 14 have no dependencies and can start at once. The backend chain is 1 → 3 → 4/5 → 6 → 8 → 9 → 10. The frontend chain is 2 → 11 → 15/16/17, once 12–14 are done.

---

### Task 1: Rename YOUTUBE_MUSIC to AUDIO_TRACK (backend)

**Files:**
- Modify: `backend/internal/core/domain/content.go:15`
- Modify: `backend/internal/core/ports/services/content_service.go:35-37`
- Modify: `backend/internal/core/ports/repositories/content_repository.go:38` (comment only)
- Modify: `backend/internal/core/services/content_music.go` (lines 25, 46, 50, 101, 131 and 343)
- Modify: `backend/internal/adapters/repositories/postgres/gorm_content_repository.go:530-535`
- Modify: `backend/schema.graphql` (lines 223, 226, 300 and 551)
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go:379-389`
- Modify: `backend/internal/adapters/graphql/directives/auth_test.go:344`
- Test: `backend/test/domain/content_test.go`, `backend/test/services/content_music_test.go`, `backend/test/resolvers/content_music_resolver_test.go`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `domain.ContentTypeAudioTrack ContentType = "AUDIO_TRACK"` (DB `audio_track`).
  - `ContentService.CreateAudioTrackFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error)`, renamed from `CreateFromYouTubeMusic`.
  - The GraphQL mutation `createAudioTrack(input: CreateContentFromYouTubeInput!): CreateContentResult!`, renamed from `createContentFromYouTubeMusic`. Its input type changes in Task 10.
  - The `ContentType` enum value `AUDIO_TRACK`, replacing `YOUTUBE_MUSIC`.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/domain/content_test.go`:

```go
func TestContentType_AudioTrack(t *testing.T) {
	assert.Equal(t, domain.ContentType("AUDIO_TRACK"), domain.ContentTypeAudioTrack)
}
```

In `backend/test/resolvers/content_music_resolver_test.go`, replace every `createContentFromYouTubeMusic(` with `createAudioTrack(` and every `domain.ContentTypeYouTubeMusic` with `domain.ContentTypeAudioTrack`. In `backend/test/services/content_music_test.go`, replace `CreateFromYouTubeMusic(` with `CreateAudioTrackFromYouTube(` and `domain.ContentTypeYouTubeMusic` with `domain.ContentTypeAudioTrack`:

```bash
sed -i '' -e 's/createContentFromYouTubeMusic(/createAudioTrack(/g' -e 's/ContentTypeYouTubeMusic/ContentTypeAudioTrack/g' backend/test/resolvers/content_music_resolver_test.go
```
```bash
sed -i '' -e 's/CreateFromYouTubeMusic(/CreateAudioTrackFromYouTube(/g' -e 's/ContentTypeYouTubeMusic/ContentTypeAudioTrack/g' backend/test/services/content_music_test.go
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./test/domain/ ./test/services/ ./test/resolvers/`
Expected: FAIL to compile with `undefined: domain.ContentTypeAudioTrack` and `has no field or method CreateAudioTrackFromYouTube`.

- [ ] **Step 3: Implement the rename**

In `backend/internal/core/domain/content.go`, replace the constant:

```go
	// ContentTypeAudioTrack is one recording (ADR 0001). Stored as audio_track.
	ContentTypeAudioTrack ContentType = "AUDIO_TRACK"
```

Apply the rename across the code and the schema. The `--` stops grep from reading the patterns as options:

```bash
grep -rl -e ContentTypeYouTubeMusic -e CreateFromYouTubeMusic -e createContentFromYouTubeMusic -e YOUTUBE_MUSIC backend/internal backend/schema.graphql | xargs sed -i '' -e 's/ContentTypeYouTubeMusic/ContentTypeAudioTrack/g' -e 's/CreateFromYouTubeMusic/CreateAudioTrackFromYouTube/g' -e 's/createContentFromYouTubeMusic/createAudioTrack/g' -e 's/YOUTUBE_MUSIC/AUDIO_TRACK/g'
```

In `backend/internal/adapters/repositories/postgres/gorm_content_repository.go`, change the ISRC lookup's type literal:

```go
// GetByISRC returns the AUDIO_TRACK row whose response carries this ISRC.
func (r *GormContentRepository) GetByISRC(ctx context.Context, isrc string) (*domain.Content, error) {
	var model ContentModel
	err := r.db.WithContext(ctx).
		Where("content_type = ? AND response->>'isrc' = ?", "audio_track", isrc).
```

In `backend/schema.graphql`, the mutation now reads:

```graphql
  "Adds an AUDIO_TRACK from a music.youtube.com song link. Returns the existing row when it is already stored."
  createAudioTrack(input: CreateContentFromYouTubeInput!): CreateContentResult! @auth
```

Keep the existing directive and arguments exactly as they were on `createContentFromYouTubeMusic`. Only the name and description change.

Regenerate:

```bash
make -C backend graphql-gen
```

`make graphql-gen` leaves a stray `backend/internal/adapters/graphql/resolvers/schema.resolvers.go`. Diff it against `content.resolvers.go`. Make sure `func (r *mutationResolver) CreateAudioTrack` lives in `content.resolvers.go`, with the body of the old `CreateContentFromYouTubeMusic` and `r.ContentService.CreateAudioTrackFromYouTube(ctx, input.URL, authUser.ID)`. Then delete the stray file:

```bash
rm backend/internal/adapters/graphql/resolvers/schema.resolvers.go
```

In `backend/internal/adapters/graphql/directives/auth_test.go`, rename the mock method to `CreateAudioTrackFromYouTube` (the sed above already did this when the file was under `backend/internal`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend test ./test/domain/ ./test/services/ ./test/resolvers/ ./internal/...`
Expected: `ok` for every package.
Run: `grep -rn -e YOUTUBE_MUSIC -e youtube_music -e YouTubeMusic backend --include='*.go' --include='*.graphql' --include='*.sql'`
Expected: only `NormalizeYouTubeMusicURL`, its tests and the `000032_youtube_music_isrc_index.*` file names, which Task 3 renames.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "refactor(content): rename YOUTUBE_MUSIC to AUDIO_TRACK (ADR 0001)"
```

---

### Task 2: Rename to AUDIO_TRACK (frontend)

**Files:**
- Modify: `frontend/src/lib/queries/content/index.ts` (lines 14, 85, 105 and 381–383)
- Modify: `frontend/src/lib/queries/content/useAddVideo.ts`
- Modify: `frontend/src/lib/queries/keys.ts:30` (comment)
- Modify: `frontend/src/lib/queries/content/useMusicTrack.ts:14` (comment)
- Modify: `frontend/src/lib/utils/formatting.ts:459`
- Modify: `frontend/src/lib/components/ActivityDetailsModal.svelte` (lines 69 and 139)
- Test: `frontend/tests/unit/formatting.test.ts` (lines 796–804) and `frontend/tests/unit/hooks-useAddVideo-music.test.ts`

**Interfaces:**
- Consumes: the Task 1 GraphQL names (`createAudioTrack`, `AUDIO_TRACK`).
- Produces:
  - `ContentType` now includes `'AUDIO_TRACK'` (no `'YOUTUBE_MUSIC'`).
  - `CREATE_AUDIO_TRACK` replaces `CREATE_CONTENT_FROM_YOUTUBE_MUSIC`.
  - `CreateAudioTrackResponse` replaces `CreateMusicContentResponse` and is keyed `createAudioTrack`.
  - The type icon label is `'Audio Track'`.

- [ ] **Step 1: Write the failing test**

In `frontend/tests/unit/formatting.test.ts`, change the music icon case (around line 796) to:

```ts
	it('renders the audio track icon with its label', () => {
		const el = typeCellRenderer({ value: 'AUDIO_TRACK' } as never) as HTMLElement;
		expect(el.getAttribute('aria-label') ?? el.title).toBe('Audio Track');
	});
```

(Keep whichever assertion style the existing case uses. Only the input `'AUDIO_TRACK'` and the expected label `'Audio Track'` change.)

In `frontend/tests/unit/hooks-useAddVideo-music.test.ts`, replace `createContentFromYouTubeMusic` with `createAudioTrack` and `CREATE_CONTENT_FROM_YOUTUBE_MUSIC` with `CREATE_AUDIO_TRACK`:

```bash
sed -i '' -e 's/createContentFromYouTubeMusic/createAudioTrack/g' -e 's/CREATE_CONTENT_FROM_YOUTUBE_MUSIC/CREATE_AUDIO_TRACK/g' -e 's/YOUTUBE_MUSIC/AUDIO_TRACK/g' frontend/tests/unit/hooks-useAddVideo-music.test.ts
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/formatting.test.ts tests/unit/hooks-useAddVideo-music.test.ts`
Expected: FAIL. The label is still `YouTube Music Track`, and `CREATE_AUDIO_TRACK` is not exported.

- [ ] **Step 3: Implement the rename**

```bash
grep -rl -e YOUTUBE_MUSIC -e createContentFromYouTubeMusic -e CreateMusicContentResponse -e CreateContentFromYouTubeMusic frontend/src | xargs sed -i '' -e 's/CREATE_CONTENT_FROM_YOUTUBE_MUSIC/CREATE_AUDIO_TRACK/g' -e 's/CreateContentFromYouTubeMusic/CreateAudioTrack/g' -e 's/createContentFromYouTubeMusic/createAudioTrack/g' -e 's/CreateMusicContentResponse/CreateAudioTrackResponse/g' -e 's/YOUTUBE_MUSIC/AUDIO_TRACK/g'
```

Then, in `frontend/src/lib/utils/formatting.ts`, set the icon map entry's label to `'Audio Track'`. In `frontend/src/lib/components/ActivityDetailsModal.svelte`, change the modal title for music rows from `'YouTube Music Track'` to `'Audio Track'`. Check that `frontend/src/lib/queries/content/index.ts` now reads:

```ts
export type ContentType = 'YOUTUBE_VIDEO' | 'CLAIM' | 'BIBLE_PASSAGE' | 'MOVIE' | 'AUDIO_TRACK';
```

and that the mutation is:

```ts
export const CREATE_AUDIO_TRACK = gql`
	mutation CreateAudioTrack($input: CreateContentFromYouTubeInput!) {
		createAudioTrack(input: $input) {
```

(the body is unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/formatting.test.ts tests/unit/hooks-useAddVideo-music.test.ts tests/components/AddContentPopover.test.ts tests/components/MusicTrackPanel.test.ts`
Expected: PASS.
Run: `grep -rn -e YOUTUBE_MUSIC -e 'YouTube Music Track' frontend/src frontend/tests`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "refactor(frontend): rename YOUTUBE_MUSIC to AUDIO_TRACK"
```

---

### Task 3: `response.music` layout, `Content.audioTrack`, migration 000032

Old-spec decisions 12 and 13 still apply. Music keys stop being top-level response keys and move into one `music` object. The GraphQL field exposes that object, as `movie: JSON` does for movies. `relatedMedia` and `lyrics` stay top-level, because `SetResponseKey` writes them by key.

**Files:**
- Create: `backend/internal/core/domain/audio_track.go`
- Modify: `backend/internal/core/services/content_music.go`. Replace the `musicFields` struct, `enrichMusic`, `merge` and `readMusicSummary`.
- Modify: `backend/internal/adapters/repositories/postgres/gorm_content_repository.go`, in `GetByISRC`.
- Rename and rewrite: `backend/migrations/000032_youtube_music_isrc_index.{up,down}.sql` becomes `000032_audio_track_isrc_index.{up,down}.sql`.
- Modify: `backend/schema.graphql`, adding `audioTrack: JSON` to `Content`.
- Modify: `backend/internal/adapters/graphql/resolvers/helpers.go`, in `domainToModel`.
- Test: `backend/test/domain/audio_track_test.go`, `backend/test/services/content_music_test.go`, `backend/internal/adapters/repositories/postgres/query_count_test.go` and `backend/test/resolvers/content_music_resolver_test.go`.

**Interfaces:**
- Consumes: `domain.ContentTypeAudioTrack` from Task 1.
- Produces:
  ```go
  // package domain
  type MusicFields struct {
      Provider          TrackProvider `json:"provider"`
      VideoID           string        `json:"videoId,omitempty"`
      Artist            string        `json:"artist,omitempty"`
      Artists           []string      `json:"artists,omitempty"`
      Album             string        `json:"album,omitempty"`
      VideoType         string        `json:"videoType,omitempty"`
      ISRC              string        `json:"isrc,omitempty"`
      ReleaseDate       string        `json:"releaseDate,omitempty"`
      Genre             string        `json:"genre,omitempty"`
      MusicBrainzID     string        `json:"musicbrainzId,omitempty"`
      CoverImageURL     string        `json:"coverImageUrl,omitempty"`
      EnrichmentPending bool          `json:"enrichmentPending,omitempty"`
      Explicit          bool          `json:"explicit,omitempty"`
      SuggestedGenreID  *int          `json:"suggestedGenreId,omitempty"`
  }
  type TrackProvider string // ProviderYouTube "youtube", ProviderSpotify "spotify", ProviderAppleMusic "apple_music", ProviderAmazonMusic "amazon_music"
  const ResponseKeyMusic = "music"
  func ReadMusic(raw json.RawMessage) MusicFields
  func IsUnofficialUpload(m MusicFields) bool // Provider youtube && VideoType == "other"
  ```
  - GraphQL: `Content.audioTrack: JSON`. It is the `response.music` object for AUDIO_TRACK rows and null for every other type.

- [ ] **Step 1: Write the failing tests**

Create `backend/test/domain/audio_track_test.go`:

```go
package domain_test

import (
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestReadMusic_ReadsNestedObject(t *testing.T) {
	raw := json.RawMessage(`{"items":[],"music":{"provider":"youtube","artist":"Queen","isrc":"GBUM71029604","explicit":true,"suggestedGenreId":21}}`)
	m := domain.ReadMusic(raw)
	assert.Equal(t, domain.ProviderYouTube, m.Provider)
	assert.Equal(t, "Queen", m.Artist)
	assert.Equal(t, "GBUM71029604", m.ISRC)
	assert.True(t, m.Explicit)
	if assert.NotNil(t, m.SuggestedGenreID) {
		assert.Equal(t, 21, *m.SuggestedGenreID)
	}
}

func TestReadMusic_EmptyOrMalformedIsZero(t *testing.T) {
	assert.Equal(t, domain.MusicFields{}, domain.ReadMusic(nil))
	assert.Equal(t, domain.MusicFields{}, domain.ReadMusic(json.RawMessage(`{"music":"nope"}`)))
}

func TestIsUnofficialUpload(t *testing.T) {
	assert.True(t, domain.IsUnofficialUpload(domain.MusicFields{Provider: domain.ProviderYouTube, VideoType: "other"}))
	assert.False(t, domain.IsUnofficialUpload(domain.MusicFields{Provider: domain.ProviderYouTube, VideoType: "audio"}))
	assert.False(t, domain.IsUnofficialUpload(domain.MusicFields{Provider: domain.ProviderSpotify}))
}
```

In `backend/test/services/content_music_test.go`, update `fakeMusicRepo.GetByISRC` to read the nested key, and add a layout test:

```go
func (r *fakeMusicRepo) GetByISRC(_ context.Context, isrc string) (*domain.Content, error) {
	for _, c := range r.rows {
		if c.ContentType == domain.ContentTypeAudioTrack && domain.ReadMusic(c.Response).ISRC == isrc {
			return c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func TestCreateAudioTrackFromYouTube_WritesMusicObject(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), nil,
		services.WithMusicEnrichment(fullTrack(), isrcMatch(), &fakeLyrics{}), syncRunner())

	got, err := svc.CreateAudioTrackFromYouTube(context.Background(), musicURL, 7)
	require.NoError(t, err)

	var top map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(got.Response, &top))
	assert.NotContains(t, top, "artist", "music keys are no longer top-level")
	assert.Contains(t, top, "relatedMedia")
	m := domain.ReadMusic(got.Response)
	assert.Equal(t, domain.ProviderYouTube, m.Provider)
	assert.NotEmpty(t, m.Artist)
	assert.Equal(t, "GBUM71029604", m.ISRC)
}
```

(`ytMeta(id)`, `fullTrack()`, `isrcMatch()`, `syncRunner()`, `audioID`, `musicURL` and `fakeLyrics` already exist in this file.)

Then change every assertion in that file that reads a top-level music key through the `field` helper to read `domain.ReadMusic(row.Response).<Field>` instead. Run `grep -n 'field(' backend/test/services/content_music_test.go` to find them. `relatedMedia` and `lyrics` assertions stay as they are.

Append to `backend/internal/adapters/repositories/postgres/query_count_test.go`:

```go
func TestQueryCount_GetByISRC_ReadsNestedMusicKeyInOneQuery(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`content_type = \$1 AND response->'music'->>'isrc' = \$2`).
		WithArgs("audio_track", "GBUM71029604", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type"}).AddRow(9, "Song", "audio_track"))

	c := querycount.Attach(t, db)
	got, err := NewGormContentRepository(db).GetByISRC(context.Background(), "GBUM71029604")
	require.NoError(t, err)
	assert.Equal(t, 9, got.ID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}
```

(If `NewGormContentRepository` takes more arguments in this file's other tests, copy that call.)

Append to `backend/test/resolvers/content_music_resolver_test.go`:

```go
func TestContentAudioTrackField_ExposesMusicObjectOnlyForTracks(t *testing.T) {
	u := trackURL
	repo := &mockContentRepository{
		getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
			if id == 1 {
				return &domain.Content{ID: 1, Name: "Song", URL: &u, ContentType: domain.ContentTypeAudioTrack,
					Response: json.RawMessage(`{"music":{"provider":"youtube","artist":"Queen","explicit":true}}`)}, nil
			}
			return &domain.Content{ID: 2, Name: "Clip", ContentType: domain.ContentTypeYouTubeVideo,
				Response: json.RawMessage(`{"music":{"artist":"spoof"}}`)}, nil
		},
	}
	server := setupTestServer(repo, musicYT())
	defer server.Close()

	result := executeGraphQL(t, server, `{ a: contentByID(id: 1) { audioTrack } b: contentByID(id: 2) { audioTrack } }`)
	require.Empty(t, result.Errors)
	var data struct {
		A struct{ AudioTrack map[string]any `json:"audioTrack"` } `json:"a"`
		B struct{ AudioTrack map[string]any `json:"audioTrack"` } `json:"b"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "Queen", data.A.AudioTrack["artist"])
	assert.Equal(t, true, data.A.AudioTrack["explicit"])
	assert.Nil(t, data.B.AudioTrack)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./test/domain/ ./test/services/ ./test/resolvers/ ./internal/adapters/repositories/postgres/ -run 'ReadMusic|IsUnofficial|WritesMusicObject|GetByISRC_ReadsNested|AudioTrackField'`
Expected: FAIL. The compile errors are `undefined: domain.ReadMusic`, `Cannot query field "audioTrack"`, and the sqlmock "could not match" error for the ISRC query.

- [ ] **Step 3: Implement**

Create `backend/internal/core/domain/audio_track.go`:

```go
package domain

import "encoding/json"

// TrackProvider is where a track link points. Stored lowercase.
type TrackProvider string

const (
	ProviderYouTube     TrackProvider = "youtube"
	ProviderSpotify     TrackProvider = "spotify"
	ProviderAppleMusic  TrackProvider = "apple_music"
	ProviderAmazonMusic TrackProvider = "amazon_music"
)

// ResponseKeyMusic is the response key holding MusicFields (old-spec decisions 12/13).
const ResponseKeyMusic = "music"

// MusicFields is response.music on an AUDIO_TRACK row.
type MusicFields struct {
	Provider          TrackProvider `json:"provider"`
	VideoID           string        `json:"videoId,omitempty"`
	Artist            string        `json:"artist,omitempty"`
	Artists           []string      `json:"artists,omitempty"`
	Album             string        `json:"album,omitempty"`
	VideoType         string        `json:"videoType,omitempty"`
	ISRC              string        `json:"isrc,omitempty"`
	ReleaseDate       string        `json:"releaseDate,omitempty"`
	Genre             string        `json:"genre,omitempty"`
	MusicBrainzID     string        `json:"musicbrainzId,omitempty"`
	CoverImageURL     string        `json:"coverImageUrl,omitempty"`
	EnrichmentPending bool          `json:"enrichmentPending,omitempty"`
	Explicit          bool          `json:"explicit,omitempty"`
	SuggestedGenreID  *int          `json:"suggestedGenreId,omitempty"`
}

// ReadMusic returns response.music, or the zero value when absent or malformed.
func ReadMusic(raw json.RawMessage) MusicFields {
	var wrap struct {
		Music json.RawMessage `json:"music"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &wrap) != nil || len(wrap.Music) == 0 {
		return MusicFields{}
	}
	var m MusicFields
	if json.Unmarshal(wrap.Music, &m) != nil {
		return MusicFields{}
	}
	return m
}

// IsUnofficialUpload reports a YouTube Music user upload (InnerTube type other).
// ADR 0005: it is its own track, never merged with the official recording.
func IsUnofficialUpload(m MusicFields) bool {
	return m.Provider == ProviderYouTube && m.VideoType == "other"
}
```

In `backend/internal/core/services/content_music.go`, replace the `musicFields` struct and `merge` with a `domain.MusicFields`-based builder. `enrichMusic` now returns the music object, the related media and the InnerTube title:

```go
type enriched struct {
	music        domain.MusicFields
	title        string
	relatedMedia []domain.RelatedMedia
}

func (s *ContentService) enrichMusic(ctx context.Context, videoID string, meta *portservices.VideoMetadata) *enriched {
	e := &enriched{music: domain.MusicFields{Provider: domain.ProviderYouTube, VideoID: videoID}, relatedMedia: []domain.RelatedMedia{}}
	m := &e.music

	if s.ytMusic == nil {
		m.EnrichmentPending = true
	} else if track, err := s.ytMusic.GetTrack(ctx, videoID); err != nil {
		slog.Warn("YouTube Music enrichment failed", "videoID", videoID, "error", err)
		m.EnrichmentPending = true
	} else {
		e.title, m.Artists, m.Album, m.VideoType = track.Title, track.Artists, track.Album, track.VideoType
		for _, c := range track.Counterparts {
			e.relatedMedia, _ = domain.AddRelatedMedia(e.relatedMedia, domain.RelatedMedia{
				Provider: providerYouTube, VideoID: c.VideoID, Kind: relatedKind(c.VideoType), Title: c.Title, AddedFrom: "ytmusic-counterpart",
			})
		}
	}
	if len(m.Artists) > 0 {
		m.Artist = strings.Join(m.Artists, ", ")
	} else if meta.ChannelName != "" {
		m.Artist = strings.TrimSuffix(meta.ChannelName, " - Topic")
	}

	title := e.title
	if title == "" {
		title = meta.Title
	}
	if s.musicBrainz != nil && len(m.Artists) > 0 {
		rec, err := s.musicBrainz.FindRecording(ctx, m.Artists[0], title, meta.Duration)
		switch {
		case err == nil:
			m.ISRC, m.ReleaseDate, m.Genre, m.MusicBrainzID, m.CoverImageURL = rec.ISRC, rec.ReleaseDate, rec.Genre, rec.MBID, rec.CoverImageURL
		case errors.Is(err, domain.ErrNotFound):
		default:
			slog.Warn("MusicBrainz lookup failed", "videoID", videoID, "error", err)
		}
	}
	return e
}

// buildMusicResponse stores the YouTube Data API payload with music and relatedMedia beside it.
func buildMusicResponse(ytResponse json.RawMessage, music domain.MusicFields, related []domain.RelatedMedia) (json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	if len(ytResponse) > 0 {
		if err := json.Unmarshal(ytResponse, &out); err != nil {
			return nil, err
		}
	}
	mj, err := json.Marshal(music)
	if err != nil {
		return nil, err
	}
	rj, err := json.Marshal(related)
	if err != nil {
		return nil, err
	}
	out[domain.ResponseKeyMusic] = mj
	out[keyRelatedMedia] = rj
	return json.Marshal(out)
}
```

In `CreateAudioTrackFromYouTube`, use the new shape:

```go
	e := s.enrichMusic(enrichCtx, videoID, metadata)

	if e.music.ISRC != "" {
		if existing, err := s.repo.GetByISRC(ctx, e.music.ISRC); err == nil && existing != nil {
			ref := domain.RelatedMedia{Provider: providerYouTube, VideoID: videoID, Kind: domain.RelatedMediaKindOther, Title: metadata.Title, AddedFrom: "duplicate-isrc"}
			if err := s.addRelatedMedia(ctx, existing, ref); err != nil {
				slog.Warn("failed to record duplicate as related media", "contentID", existing.ID, "error", err)
			}
			return existing, domain.ErrAlreadyExists
		} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing isrc: %w", err)
		}
	}

	related := s.linkExistingVideos(ctx, e.relatedMedia)
	response, err := buildMusicResponse(metadata.Response, e.music, related)
	if err != nil {
		return nil, fmt.Errorf("failed to build music response: %w", err)
	}
	// ... content literal unchanged except:
	if e.title != "" {
		content.Name = e.title
	}
```

Delete the old `musicFields` type and `(*musicFields).merge`. Update `readMusicSummary` (it reads the artist for lyrics) to:

```go
func readMusicSummary(c *domain.Content) (artist string, artists []string) {
	m := domain.ReadMusic(c.Response)
	return m.Artist, m.Artists
}
```

(Keep its existing callers. If its current signature returns a struct, return `domain.ReadMusic(c.Response)` and update the two call sites to read `.Artist` and `.Artists`.)

In `gorm_content_repository.go`:

```go
// GetByISRC returns the AUDIO_TRACK row whose response.music carries this ISRC.
// Backed by the partial expression index idx_content_music_isrc (000032).
func (r *GormContentRepository) GetByISRC(ctx context.Context, isrc string) (*domain.Content, error) {
	var model ContentModel
	err := r.db.WithContext(ctx).
		Where("content_type = ? AND response->'music'->>'isrc' = ?", "audio_track", isrc).
		Order("id").
		First(&model).Error
```

Rename the migration so it keeps its number and gains new contents:

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track mv backend/migrations/000032_youtube_music_isrc_index.up.sql backend/migrations/000032_audio_track_isrc_index.up.sql
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track mv backend/migrations/000032_youtube_music_isrc_index.down.sql backend/migrations/000032_audio_track_isrc_index.down.sql
```

`backend/migrations/000032_audio_track_isrc_index.up.sql`:

```sql
-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. Was 000032_youtube_music_isrc_index (ADR 0001 renames it
-- before it is ever applied).
-- Dedupe step 1 (ADR 0005): find an AUDIO_TRACK by ISRC in response.music.
CREATE INDEX IF NOT EXISTS idx_content_music_isrc
    ON content ((response->'music'->>'isrc'))
    WHERE content_type = 'audio_track';
```

`backend/migrations/000032_audio_track_isrc_index.down.sql`:

```sql
DROP INDEX IF EXISTS idx_content_music_isrc;
```

In `backend/schema.graphql`, in `type Content` after `movie: JSON`:

```graphql
  "AUDIO_TRACK metadata (response.music: provider, artist, album, isrc, explicit, suggestedGenreId…); null for other content types."
  audioTrack: JSON
```

Run `make -C backend graphql-gen`. Delete the stray `schema.resolvers.go` (this change adds no resolver). In `helpers.go`'s `domainToModel`, inside the `if err := json.Unmarshal(...)` success branch, add the following next to the movie case:

```go
			if c.ContentType == domain.ContentTypeAudioTrack {
				if music, ok := responseMap[domain.ResponseKeyMusic].(map[string]interface{}); ok {
					m.AudioTrack = music
				}
			}
```

(gqlgen generates `AudioTrack map[string]interface{}` on `model.Content`, the same type as `Movie`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend test ./test/domain/ ./test/services/ ./test/resolvers/ ./internal/adapters/repositories/postgres/`
Expected: `ok` for all four.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "refactor(audio-track): store music metadata in response.music and expose Content.audioTrack"
```

---
### Task 4: Option C reshape generator and `music_genres` seed (000033)

The genre table is seeded from Apple's genre snapshot, reshaped per ADR 0006 Option C. Three things are committed: the compact snapshot, a small Go generator, and its output. A drift test fails if anyone hand-edits the SQL or the lists.

**Files:**
- Create: `backend/data/music-genres/apple-genres-34.compact.json`
- Create: `backend/cmd/gen-music-genres/reshape.go`
- Create: `backend/cmd/gen-music-genres/main.go`
- Create (generated): `backend/migrations/000033_add_music_genres.up.sql` and `.down.sql`
- Test: `backend/cmd/gen-music-genres/reshape_test.go`

**Interfaces:**
- Consumes: the Apple snapshot at `/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/9cd8fee7-66d5-4222-baae-e22e81129e3c/scratchpad/apple-genres-34.json`. This is a session scratch file; if it is gone, re-fetch Apple's genre tree for id 34 and save it in the same shape (`{"34":{"name","id","subgenres":{…}}}`).
- Produces:
  - The table `music_genres(id INTEGER PK, name VARCHAR(100) NOT NULL, apple_name VARCHAR(100) NOT NULL, parent_id INTEGER NULL FK → music_genres.id)`.
  - 523 rows. `name` is the display name: 19 is `Regional & Cultural`. `apple_name` is Apple's original name.
  - Compact snapshot format: a JSON array of `[name, appleId, [children]]`, holding the children of Apple's root 34 (the same shape as `DATA` in the preview file).

- [ ] **Step 1: Make the compact snapshot**

```bash
mkdir -p /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/data/music-genres
```
```bash
python3 -I -c "import json,sys; d=json.load(open(sys.argv[1])); f=lambda n:[n['name'],int(n['id']),[f(c) for c in n.get('subgenres',{}).values()]]; json.dump([f(c) for c in d['34']['subgenres'].values()], open(sys.argv[2],'w'), ensure_ascii=False)" /private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/9cd8fee7-66d5-4222-baae-e22e81129e3c/scratchpad/apple-genres-34.json /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/data/music-genres/apple-genres-34.compact.json
```
```bash
python3 -I -c "import json,sys; r=json.load(open(sys.argv[1])); c=lambda n:1+sum(c(k) for k in n[2]); print(len(r), sum(c(n) for n in r))" /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/data/music-genres/apple-genres-34.compact.json
```
Expected: `51 525`.

- [ ] **Step 2: Write the failing test**

`backend/cmd/gen-music-genres/reshape_test.go`:

```go
package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const snapshotPath = "../../data/music-genres/apple-genres-34.compact.json"
const migrationPath = "../../migrations/000033_add_music_genres.up.sql"

func loadRoots(t *testing.T) []node {
	t.Helper()
	raw, err := os.ReadFile(snapshotPath)
	require.NoError(t, err)
	var roots []node
	require.NoError(t, json.Unmarshal(raw, &roots))
	return roots
}

func countNodes(ns []node) int {
	n := 0
	for _, x := range ns {
		n += 1 + countNodes(x.Kids)
	}
	return n
}

func byID(rows []Row) map[int]Row {
	m := make(map[int]Row, len(rows))
	for _, r := range rows {
		m[r.ID] = r
	}
	return m
}

func TestReshape_OptionC(t *testing.T) {
	roots := loadRoots(t)
	rows, err := Reshape(roots)
	require.NoError(t, err)

	// Folk (1289) and Hörspiele (100107) are dropped; everything else stays.
	assert.Equal(t, countNodes(roots)-2, len(rows))
	assert.Equal(t, 523, len(rows))

	m := byID(rows)
	assert.Equal(t, "Regional & Cultural", m[19].Name)
	assert.Equal(t, "Worldwide", m[19].AppleName)
	assert.Nil(t, m[19].ParentID)
	assert.NotContains(t, m, 1289)
	assert.NotContains(t, m, 100107)

	for _, id := range []int{1203, 1197, 1122, 1232, 100024, 1262, 1243, 1299, 1300, 100084, 50000121, 50000064, 50000068, 50000066, 27, 28, 30} {
		require.Contains(t, m, id)
		require.NotNil(t, m[id].ParentID, "id %d should move under 19", id)
		assert.Equal(t, 19, *m[id].ParentID, "id %d", id)
	}
	// Folk's children are lifted under 19.
	assert.Equal(t, 19, *m[100103].ParentID)
	assert.Equal(t, 19, *m[100104].ParentID)
	// A moved genre keeps its own children.
	assert.Equal(t, 1203, *m[42].ParentID) // Amapiano under African
	// Untouched roots stay roots.
	assert.Nil(t, m[21].ParentID) // Rock
}

func TestReshape_ParentsComeBeforeChildren(t *testing.T) {
	rows, err := Reshape(loadRoots(t))
	require.NoError(t, err)
	seen := map[int]bool{}
	for _, r := range rows {
		if r.ParentID != nil {
			assert.True(t, seen[*r.ParentID], "row %d before its parent %d", r.ID, *r.ParentID)
		}
		seen[r.ID] = true
	}
}

func TestReshape_FailsWhenAListedRootIsMissing(t *testing.T) {
	_, err := Reshape([]node{{Name: "Worldwide", ID: 19}, {Name: "Rock", ID: 21}})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "African")
}

func TestRenderUp_EscapesQuotesAndNulls(t *testing.T) {
	p := 4
	sql := RenderUp([]Row{{ID: 4, Name: "Children's Music", AppleName: "Children's Music"}, {ID: 1014, Name: "Lullabies", AppleName: "Lullabies", ParentID: &p}})
	assert.Contains(t, sql, "(4, 'Children''s Music', 'Children''s Music', NULL),")
	assert.Contains(t, sql, "(1014, 'Lullabies', 'Lullabies', 4)\nON CONFLICT (id) DO NOTHING;")
}

func TestCommittedMigrationMatchesGenerator(t *testing.T) {
	rows, err := Reshape(loadRoots(t))
	require.NoError(t, err)
	committed, err := os.ReadFile(migrationPath)
	require.NoError(t, err, "run: go -C backend run ./cmd/gen-music-genres")
	assert.Equal(t, RenderUp(rows), string(committed), "000033 is generated; re-run the generator instead of editing it")
	assert.True(t, strings.HasPrefix(string(committed), "-- GENERATED"))
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `go -C backend test ./cmd/gen-music-genres/`
Expected: FAIL to compile with `undefined: node`, `undefined: Reshape` and `undefined: RenderUp`.

- [ ] **Step 4: Implement**

`backend/cmd/gen-music-genres/reshape.go`:

```go
package main

import (
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// node is one Apple genre in the compact snapshot: [name, appleId, [children]].
type node struct {
	Name string
	ID   int
	Kids []node
}

func (n *node) UnmarshalJSON(b []byte) error {
	var raw []json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	if len(raw) != 3 {
		return fmt.Errorf("genre node needs [name, id, children], got %d items", len(raw))
	}
	if err := json.Unmarshal(raw[0], &n.Name); err != nil {
		return err
	}
	if err := json.Unmarshal(raw[1], &n.ID); err != nil {
		return err
	}
	return json.Unmarshal(raw[2], &n.Kids)
}

// Row is one music_genres row.
type Row struct {
	ID        int
	Name      string // display name
	AppleName string // Apple's name, kept for matching provider genres
	ParentID  *int
}

const (
	worldwideID      = 19
	worldwideDisplay = "Regional & Cultural"
)

// Option C (ADR 0006). Same lists as the picker preview
// tools/content-type-designer/previews/audio-genre-picker-options.html.
var (
	moveToWorldwide = []string{"African", "Arabic", "Brazilian", "Chinese", "Cuban", "Indian", "Korean", "Russian", "Turkish", "Tarab", "Jewish Music", "French Pop", "German Folk", "German Pop", "J-Pop", "Enka", "Kayokyoku"}
	dropFromC            = []string{"Hörspiele", "Folk"} // Folk: the root goes, its children are lifted
	subgenresToWorldwide = []string{"Folk"}
)

// Reshape applies Option C and flattens the tree, parents before children.
func Reshape(roots []node) ([]Row, error) {
	var kept, moved, lifted []node
	found := map[string]bool{}
	for _, r := range roots {
		found[r.Name] = true
		if slices.Contains(subgenresToWorldwide, r.Name) {
			lifted = append(lifted, r.Kids...)
		}
		switch {
		case slices.Contains(moveToWorldwide, r.Name):
			moved = append(moved, r)
		case slices.Contains(dropFromC, r.Name):
		default:
			kept = append(kept, r)
		}
	}
	for _, name := range slices.Concat(moveToWorldwide, dropFromC) {
		if !found[name] {
			return nil, fmt.Errorf("snapshot has no root genre %q; update the Option C lists", name)
		}
	}

	var rows []Row
	seen := map[int]bool{}
	var walk func(n node, parent *int) error
	walk = func(n node, parent *int) error {
		if seen[n.ID] {
			return fmt.Errorf("duplicate genre id %d (%s)", n.ID, n.Name)
		}
		seen[n.ID] = true
		name := n.Name
		if n.ID == worldwideID {
			name = worldwideDisplay
		}
		rows = append(rows, Row{ID: n.ID, Name: name, AppleName: n.Name, ParentID: parent})
		id := n.ID
		for _, k := range n.Kids {
			if err := walk(k, &id); err != nil {
				return err
			}
		}
		return nil
	}

	hasWorldwide := false
	for _, r := range kept {
		if r.ID == worldwideID {
			hasWorldwide = true
			r.Kids = slices.Concat(r.Kids, moved, lifted)
		}
		if err := walk(r, nil); err != nil {
			return nil, err
		}
	}
	if !hasWorldwide {
		return nil, fmt.Errorf("snapshot has no Worldwide genre (id %d)", worldwideID)
	}
	return rows, nil
}

func sqlString(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

const upHeader = `-- GENERATED by backend/cmd/gen-music-genres from
-- backend/data/music-genres/apple-genres-34.compact.json. Do not edit by hand:
-- change the snapshot or the Option C lists and re-run the generator.
--
-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. ADR 0006: Apple's genre tree, Option C. Apple's
-- Worldwide (19) is displayed as "Regional & Cultural"; apple_name keeps
-- Apple's own name for matching provider genres.
CREATE TABLE IF NOT EXISTS music_genres (
    id         INTEGER PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    apple_name VARCHAR(100) NOT NULL,
    parent_id  INTEGER NULL REFERENCES music_genres(id) ON DELETE RESTRICT
);

COMMENT ON TABLE music_genres IS 'Seeded Apple Music genre tree (Option C, ADR 0006). Read-only at runtime.';

INSERT INTO music_genres (id, name, apple_name, parent_id) VALUES
`

const downSQL = `DROP TABLE IF EXISTS music_genres;
`

// RenderUp is the full up migration for rows.
func RenderUp(rows []Row) string {
	var b strings.Builder
	b.WriteString(upHeader)
	for i, r := range rows {
		parent := "NULL"
		if r.ParentID != nil {
			parent = strconv.Itoa(*r.ParentID)
		}
		sep := ","
		if i == len(rows)-1 {
			sep = ""
		}
		fmt.Fprintf(&b, "    (%d, %s, %s, %s)%s\n", r.ID, sqlString(r.Name), sqlString(r.AppleName), parent, sep)
	}
	b.WriteString("ON CONFLICT (id) DO NOTHING;\n")
	return b.String()
}
```

`backend/cmd/gen-music-genres/main.go`:

```go
// Command gen-music-genres writes migration 000033 (music_genres seed) from the
// compact Apple snapshot, applying ADR 0006 Option C. Run from backend/:
//
//	go run ./cmd/gen-music-genres
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	in := flag.String("in", "data/music-genres/apple-genres-34.compact.json", "compact Apple genre snapshot")
	out := flag.String("out", "migrations/000033_add_music_genres", "migration path prefix; .up.sql and .down.sql are added")
	flag.Parse()
	if err := run(*in, *out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(in, out string) error {
	raw, err := os.ReadFile(in)
	if err != nil {
		return err
	}
	var roots []node
	if err := json.Unmarshal(raw, &roots); err != nil {
		return fmt.Errorf("parse %s: %w", in, err)
	}
	rows, err := Reshape(roots)
	if err != nil {
		return err
	}
	if err := os.WriteFile(out+".up.sql", []byte(RenderUp(rows)), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(out+".down.sql", []byte(downSQL), 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %d genres to %s.up.sql\n", len(rows), out)
	return nil
}
```

Generate the migration:

```bash
go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend run ./cmd/gen-music-genres
```
Expected: `wrote 523 genres to migrations/000033_add_music_genres.up.sql`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `go -C backend test ./cmd/gen-music-genres/`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend/data/music-genres backend/cmd/gen-music-genres backend/migrations/000033_add_music_genres.up.sql backend/migrations/000033_add_music_genres.down.sql
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): seed music_genres from Apple's tree, reshaped per Option C (ADR 0006)"
```

---

### Task 5: `content.genre_id` (000034), genre domain and genre repositories

**Files:**
- Create: `backend/migrations/000034_add_content_genre_id.up.sql` and `.down.sql`
- Create: `backend/internal/core/domain/music_genre.go`
- Modify: `backend/internal/core/domain/content.go` (add `GenreID *int`) and `backend/internal/core/domain/errors.go` (`ErrGenreLocked`)
- Create: `backend/internal/core/ports/repositories/audio_track_repository.go` (the `MusicGenreRepository` port; Task 6 appends to it)
- Create: `backend/internal/adapters/repositories/postgres/gorm_music_genre_repository.go`
- Create: `backend/internal/adapters/repositories/cached/music_genre_repository.go`
- Modify: in `backend/internal/adapters/repositories/postgres/`, `gorm_models.go` (`ContentModel.GenreID`), `gorm_mappers.go` (both directions) and `gorm_content_repository.go` (`applyMovieColumnFilters`, the genre filter)
- Test: `backend/test/domain/music_genre_test.go`, `backend/internal/adapters/repositories/postgres/gorm_music_genre_repository_test.go`, `backend/internal/adapters/repositories/cached/music_genre_repository_test.go` and `backend/internal/adapters/repositories/postgres/movie_filters_test.go`

**Interfaces:**
- Consumes: the `music_genres` table (Task 4).
- Produces:
  ```go
  // domain
  type MusicGenre struct { ID int; Name string; AppleName string; ParentID *int }
  const GenreChangeWindowDays = 30
  var ErrGenreLocked = errors.New("genre can only be changed by the person who added this track, within 30 days of adding it")
  func MatchGenre(name string, genres []MusicGenre) *MusicGenre // shallowest match wins, then lowest id; nil if none
  // Content gains: GenreID *int

  // ports/repositories
  type MusicGenreRepository interface {
      List(ctx context.Context) ([]domain.MusicGenre, error)
      SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error) // ErrNotFound | ErrGenreLocked
  }
  // postgres
  func NewGormMusicGenreRepository(db *gorm.DB) *GormMusicGenreRepository
  // cached
  const DefaultMusicGenreTTL = time.Hour
  func NewMusicGenreRepository(inner repositories.MusicGenreRepository, ttl time.Duration) *MusicGenreRepository
  ```
- The genre filter (`ContentFilter.GenreContains`) now also matches AUDIO_TRACK rows whose `music_genres.name` contains the text.

- [ ] **Step 1: Write the failing tests**

`backend/test/domain/music_genre_test.go`:

```go
package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ip(i int) *int { return &i }

var testGenres = []domain.MusicGenre{
	{ID: 21, Name: "Rock", AppleName: "Rock"},
	{ID: 18, Name: "Hip-Hop/Rap", AppleName: "Hip-Hop/Rap"},
	{ID: 5, Name: "Classical", AppleName: "Classical"},
	{ID: 9, Name: "Opera", AppleName: "Opera", ParentID: ip(5)},
	{ID: 1028, Name: "Opera", AppleName: "Opera", ParentID: ip(5)},
	{ID: 50000167, Name: "Stage Works", AppleName: "Stage Works", ParentID: ip(5)},
	{ID: 50000180, Name: "Opera", AppleName: "Opera", ParentID: ip(50000167)},
	{ID: 19, Name: "Regional & Cultural", AppleName: "Worldwide"},
	{ID: 1188, Name: "Polka", AppleName: "Polka", ParentID: ip(19)},
	{ID: 15, Name: "R&B/Soul", AppleName: "R&B/Soul"},
}

func TestMatchGenre(t *testing.T) {
	cases := map[string]int{
		"rock":        21,
		"  ROCK ":     21,
		"Hip Hop":     18,
		"hip-hop":     18,
		"rap":         18,
		"opera":       9, // shallowest, then lowest id
		"Worldwide":   19,
		"polka":       1188,
		"rnb":         15,
	}
	for in, want := range cases {
		got := domain.MatchGenre(in, testGenres)
		require.NotNil(t, got, in)
		assert.Equal(t, want, got.ID, in)
	}
	assert.Nil(t, domain.MatchGenre("", testGenres))
	assert.Nil(t, domain.MatchGenre("vaporwave", testGenres), "no match means no genre (ADR 0006)")
}
```

`backend/internal/adapters/repositories/postgres/gorm_music_genre_repository_test.go`:

```go
package postgres

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

const setGenreRe = `UPDATE content SET genre_id = \$1, updated_at = NOW\(\) WHERE id = \$2 AND content_type = 'audio_track' ` +
	`AND \(genre_id IS NULL OR \(added_by_user_id = \$3 AND created_at > NOW\(\) - make_interval\(days => \$4\)\)\) RETURNING \*`

func TestMusicGenreList_OneQuery(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "music_genres" ORDER BY id`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "apple_name", "parent_id"}).
			AddRow(19, "Regional & Cultural", "Worldwide", nil).AddRow(1188, "Polka", "Polka", 19))

	c := querycount.Attach(t, db)
	got, err := NewGormMusicGenreRepository(db).List(context.Background())
	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, "Worldwide", got[0].AppleName)
	assert.Equal(t, 19, *got[1].ParentID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestSetContentGenre_SuccessIsOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(setGenreRe).WithArgs(21, 5, 7, 30).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type", "genre_id"}).AddRow(5, "Song", "audio_track", 21))

	c := querycount.Attach(t, db)
	got, err := NewGormMusicGenreRepository(db).SetContentGenre(context.Background(), 5, 21, 7, 30)
	require.NoError(t, err)
	require.NotNil(t, got.GenreID)
	assert.Equal(t, 21, *got.GenreID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestSetContentGenre_LockedReturnsErrGenreLocked(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(setGenreRe).WithArgs(21, 5, 8, 30).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT id FROM content WHERE id = \$1 AND content_type = 'audio_track'`).WithArgs(5).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(5))

	c := querycount.Attach(t, db)
	_, err := NewGormMusicGenreRepository(db).SetContentGenre(context.Background(), 5, 21, 8, 30)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)
	c.AssertExactly(t, 2) // the read only happens on the miss path
	assertAllExpectationsMet(t, mock)
}

func TestSetContentGenre_MissingOrNotATrackIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(setGenreRe).WithArgs(21, 99, 7, 30).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT id FROM content WHERE id = \$1 AND content_type = 'audio_track'`).WithArgs(99).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := NewGormMusicGenreRepository(db).SetContentGenre(context.Background(), 99, 21, 7, 30)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assertAllExpectationsMet(t, mock)
}
```

`backend/internal/adapters/repositories/cached/music_genre_repository_test.go`:

```go
package cached

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type countingGenres struct {
	calls int
	sets  int
}

func (c *countingGenres) List(context.Context) ([]domain.MusicGenre, error) {
	c.calls++
	return []domain.MusicGenre{{ID: 21, Name: "Rock", AppleName: "Rock"}}, nil
}

func (c *countingGenres) SetContentGenre(_ context.Context, contentID, genreID, _, _ int) (*domain.Content, error) {
	c.sets++
	return &domain.Content{ID: contentID, GenreID: &genreID}, nil
}

func TestMusicGenreRepository_ListIsCachedForTTL(t *testing.T) {
	inner := &countingGenres{}
	r := NewMusicGenreRepository(inner, time.Hour)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	r.now = func() time.Time { return now }

	_, err := r.List(context.Background())
	require.NoError(t, err)
	got, err := r.List(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, inner.calls)

	got[0].Name = "poisoned"
	again, _ := r.List(context.Background())
	assert.Equal(t, "Rock", again[0].Name, "callers get a copy")

	now = now.Add(time.Hour + time.Second)
	_, _ = r.List(context.Background())
	assert.Equal(t, 2, inner.calls)
}

func TestMusicGenreRepository_SetPassesThrough(t *testing.T) {
	inner := &countingGenres{}
	r := NewMusicGenreRepository(inner, time.Hour)
	_, err := r.SetContentGenre(context.Background(), 5, 21, 7, 30)
	require.NoError(t, err)
	assert.Equal(t, 1, inner.sets)
}
```

In `backend/internal/adapters/repositories/postgres/movie_filters_test.go`, replace the two genre cases:

```go
		{"genre contains", domain.ContentFilter{GenreContains: cStr("sci")},
			`WHERE \(\(response->'genres'\)::text ILIKE \$1 OR genre_id IN \(SELECT id FROM music_genres WHERE name ILIKE \$2\)\) ORDER BY`,
			[]driver.Value{"%sci%", "%sci%", int64(11)}},
```
```go
		{"filters AND together", domain.ContentFilter{GenreContains: cStr("x"), MinTmdbScore: f64(7)},
			`ILIKE \$2\) AND \(response->>'voteAverage'\)::FLOAT8 >= \$3 ORDER BY`, []driver.Value{"%x%", "%x%", 7.0, int64(11)}},
```

If `TestQueryCount_FilteredMovieList_IsOnePageQuery` lists the arguments for `GenreContains: cStr("drama")`, add the second `"%drama%"` right after the first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./test/domain/ ./internal/adapters/repositories/postgres/ ./internal/adapters/repositories/cached/`
Expected: FAIL to compile with `undefined: domain.MatchGenre`, `undefined: NewGormMusicGenreRepository` and `undefined: NewMusicGenreRepository`. The filter cases fail on the regex match.

- [ ] **Step 3: Implement**

`backend/migrations/000034_add_content_genre_id.up.sql`:

```sql
-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. ADR 0006: an AUDIO_TRACK's genre is one node of the
-- seeded music_genres tree. Nullable: no match means no genre.
ALTER TABLE content
    ADD COLUMN IF NOT EXISTS genre_id INTEGER NULL
    REFERENCES music_genres(id) ON DELETE SET NULL;

COMMENT ON COLUMN content.genre_id IS 'AUDIO_TRACK genre (music_genres.id). Anyone sets it while NULL; the adder may change it within 30 days (ADR 0006).';
```

`backend/migrations/000034_add_content_genre_id.down.sql`:

```sql
ALTER TABLE content DROP COLUMN IF EXISTS genre_id;
```

(No index: genre lookups go by `content.id`, and the filter's subquery reads the 523-row `music_genres`. Add one only with measured evidence, per the db-migration rule.)

`backend/internal/core/domain/music_genre.go`:

```go
package domain

import "strings"

// MusicGenre is one node of the seeded Apple genre tree (ADR 0006, Option C).
type MusicGenre struct {
	ID        int
	Name      string // display name ("Regional & Cultural" for Apple's Worldwide)
	AppleName string // Apple's name, used to match provider genre strings
	ParentID  *int
}

// GenreChangeWindowDays is how long the adder may change a set genre.
const GenreChangeWindowDays = 30

// genreAliases maps common provider spellings onto Apple names (both normalised).
var genreAliases = map[string]string{
	"hip hop":                "hip-hop/rap",
	"hip-hop":                "hip-hop/rap",
	"hiphop":                 "hip-hop/rap",
	"rap":                    "hip-hop/rap",
	"r&b":                    "r&b/soul",
	"rnb":                    "r&b/soul",
	"rhythm and blues":       "r&b/soul",
	"soul":                   "r&b/soul",
	"edm":                    "dance",
	"electronic dance music": "dance",
	"singer-songwriter":      "singer/songwriter",
	"progressive rock":       "prog-rock/art rock",
	"kpop":                   "k-pop",
	"jpop":                   "j-pop",
	"world":                  "worldwide",
	"world music":            "worldwide",
}

func normGenre(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}

// MatchGenre finds the genre a provider string names, by display or Apple name
// after aliasing. The shallowest match wins, then the lowest id. Nil when
// nothing matches: no match means no genre (ADR 0006).
func MatchGenre(name string, genres []MusicGenre) *MusicGenre {
	key := normGenre(name)
	if key == "" {
		return nil
	}
	if alias, ok := genreAliases[key]; ok {
		key = alias
	}
	byID := make(map[int]MusicGenre, len(genres))
	for _, g := range genres {
		byID[g.ID] = g
	}
	depth := func(g MusicGenre) int {
		d := 0
		for p := g.ParentID; p != nil && d < 10; d++ {
			parent, ok := byID[*p]
			if !ok {
				break
			}
			p = parent.ParentID
		}
		return d
	}
	var best *MusicGenre
	bestDepth := 0
	for i := range genres {
		g := genres[i]
		if normGenre(g.Name) != key && normGenre(g.AppleName) != key {
			continue
		}
		d := depth(g)
		if best == nil || d < bestDepth || (d == bestDepth && g.ID < best.ID) {
			best, bestDepth = &genres[i], d
		}
	}
	return best
}
```

In `backend/internal/core/domain/errors.go`:

```go
// ErrGenreLocked: the genre is set and the caller is not the adder inside the
// 30-day window (ADR 0006). The message is shown to users as-is.
var ErrGenreLocked = errors.New("genre can only be changed by the person who added this track, within 30 days of adding it")
```

In `backend/internal/core/domain/content.go`, add to `Content` after `PrimaryCategoryID`:

```go
	// GenreID is the AUDIO_TRACK genre (music_genres.id); nil when unset.
	GenreID *int
```

In `gorm_models.go`, add the following to `ContentModel` after `PrimaryCategoryID`:

```go
	GenreID           *int            `gorm:"column:genre_id"`
```

In `gorm_mappers.go`, add `GenreID: m.GenreID,` to `contentModelToDomain` and `GenreID: c.GenreID,` to `contentDomainToModel`.

`backend/internal/core/ports/repositories/audio_track_repository.go`:

```go
package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// MusicGenreRepository reads the seeded genre tree and sets a track's genre.
type MusicGenreRepository interface {
	// List returns every genre, ordered by id.
	List(ctx context.Context) ([]domain.MusicGenre, error)
	// SetContentGenre sets an AUDIO_TRACK's genre when it is unset, or when
	// userID added the track less than windowDays ago. ErrNotFound when the row
	// is missing or not a track; ErrGenreLocked otherwise.
	SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error)
}
```

`backend/internal/adapters/repositories/postgres/gorm_music_genre_repository.go`:

```go
package postgres

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// MusicGenreModel is a music_genres row.
type MusicGenreModel struct {
	ID        int    `gorm:"primaryKey"`
	Name      string `gorm:"column:name"`
	AppleName string `gorm:"column:apple_name"`
	ParentID  *int   `gorm:"column:parent_id"`
}

func (MusicGenreModel) TableName() string { return "music_genres" }

// GormMusicGenreRepository implements repositories.MusicGenreRepository.
type GormMusicGenreRepository struct {
	db *gorm.DB
}

var _ repositories.MusicGenreRepository = (*GormMusicGenreRepository)(nil)

func NewGormMusicGenreRepository(db *gorm.DB) *GormMusicGenreRepository {
	return &GormMusicGenreRepository{db: db}
}

func (r *GormMusicGenreRepository) List(ctx context.Context) ([]domain.MusicGenre, error) {
	var models []MusicGenreModel
	if err := r.db.WithContext(ctx).Order("id").Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list music genres: %w", err)
	}
	out := make([]domain.MusicGenre, len(models))
	for i, m := range models {
		out[i] = domain.MusicGenre{ID: m.ID, Name: m.Name, AppleName: m.AppleName, ParentID: m.ParentID}
	}
	return out, nil
}

// SetContentGenre is one owner-and-window-scoped UPDATE ... RETURNING. Only a
// miss pays a second read, to tell "missing" from "locked".
func (r *GormMusicGenreRepository) SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error) {
	var m ContentModel
	err := r.db.WithContext(ctx).Raw(
		`UPDATE content SET genre_id = ?, updated_at = NOW() WHERE id = ? AND content_type = 'audio_track' `+
			`AND (genre_id IS NULL OR (added_by_user_id = ? AND created_at > NOW() - make_interval(days => ?))) RETURNING *`,
		genreID, contentID, userID, windowDays,
	).Scan(&m).Error
	if err != nil {
		return nil, fmt.Errorf("failed to set track genre: %w", err)
	}
	if m.ID != 0 {
		return contentModelToDomain(&m), nil
	}

	var probe struct{ ID int }
	if err := r.db.WithContext(ctx).Raw(`SELECT id FROM content WHERE id = ? AND content_type = 'audio_track'`, contentID).Scan(&probe).Error; err != nil {
		return nil, fmt.Errorf("failed to read track after genre miss: %w", err)
	}
	if probe.ID == 0 {
		return nil, domain.ErrNotFound
	}
	return nil, domain.ErrGenreLocked
}
```

`backend/internal/adapters/repositories/cached/music_genre_repository.go`:

```go
package cached

import (
	"context"
	"slices"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// DefaultMusicGenreTTL bounds reuse of the genre list. The table only changes
// through a migration, so an hour is generous.
const DefaultMusicGenreTTL = time.Hour

// MusicGenreRepository caches List. The picker, the grid's genre column and the
// service's id validation all read it, so it is otherwise a query per request.
// SetContentGenre passes straight through.
type MusicGenreRepository struct {
	repositories.MusicGenreRepository

	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	list    []domain.MusicGenre
	expires time.Time
}

var _ repositories.MusicGenreRepository = (*MusicGenreRepository)(nil)

func NewMusicGenreRepository(inner repositories.MusicGenreRepository, ttl time.Duration) *MusicGenreRepository {
	return &MusicGenreRepository{MusicGenreRepository: inner, ttl: ttl, now: time.Now}
}

// List serves a copy of the cached list, or reads through once it expires.
func (r *MusicGenreRepository) List(ctx context.Context) ([]domain.MusicGenre, error) {
	r.mu.Lock()
	if r.list != nil && r.now().Before(r.expires) {
		out := slices.Clone(r.list)
		r.mu.Unlock()
		return out, nil
	}
	r.mu.Unlock()

	got, err := r.MusicGenreRepository.List(ctx)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	r.list, r.expires = slices.Clone(got), r.now().Add(r.ttl)
	r.mu.Unlock()
	return got, nil
}
```

In `gorm_content_repository.go`'s `applyMovieColumnFilters`, replace the genre clause:

```go
	if f.GenreContains != nil && *f.GenreContains != "" {
		// Movies keep their TMDB genre list in response; AUDIO_TRACK rows point at
		// the seeded genre tree (ADR 0006). One filter box covers both.
		pattern := "%" + *f.GenreContains + "%"
		query = query.Where("((response->'genres')::text ILIKE ? OR genre_id IN (SELECT id FROM music_genres WHERE name ILIKE ?))", pattern, pattern)
	}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend test ./test/domain/ ./internal/adapters/repositories/postgres/ ./internal/adapters/repositories/cached/`
Expected: `ok` for all three.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): content.genre_id, genre matching and genre repositories (ADR 0006)"
```

---

### Task 6: `track_links` (000035), domain and `AudioTrackRepository`

**Files:**
- Create: `backend/migrations/000035_add_track_links.up.sql` and `.down.sql`
- Modify: `backend/internal/core/domain/audio_track.go` (add `TrackLink` and its enums)
- Modify: `backend/internal/core/ports/repositories/audio_track_repository.go` (append `AudioTrackRepository`)
- Create: `backend/internal/adapters/repositories/postgres/gorm_audio_track_repository.go`
- Test: `backend/internal/adapters/repositories/postgres/gorm_audio_track_repository_test.go` (sqlmock and query counts)
- Test: `backend/internal/adapters/repositories/postgres/gorm_audio_track_integration_test.go` (real Postgres `testdb`, run in Task 18)

**Interfaces:**
- Consumes: `domain.MusicFields`, `domain.TrackProvider` (Task 3); `content.genre_id` and `ContentModel.GenreID` (Task 5).
- Produces:
  ```go
  // domain
  type TrackLinkKind string   // TrackLinkKindListen "LISTEN", TrackLinkKindEmbed "EMBED"
  type TrackLinkSource string // TrackLinkSourcePasted "PASTED", TrackLinkSourceMatched "MATCHED"
  type TrackLink struct {
      ID, ContentID int; Provider TrackProvider; ProviderTrackID, URL string
      Kind TrackLinkKind; Source TrackLinkSource; UnavailableAt *time.Time; CreatedAt time.Time
  }
  // ports/repositories
  type AudioTrackRepository interface {
      CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) // (row, alreadyExisted, err)
      AddLink(ctx context.Context, link domain.TrackLink) (bool, error)                                         // false: (provider, id) already linked
      GetByLink(ctx context.Context, provider domain.TrackProvider, providerTrackID string) (*domain.Content, error)
      GetByMusicBrainzID(ctx context.Context, mbid string) (*domain.Content, error)
      FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error)
      ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error)
      LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
      MarkLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error) // EMBED links only; ErrNotFound otherwise
  }
  // postgres
  func NewGormAudioTrackRepository(db *gorm.DB) *GormAudioTrackRepository
  ```
- Statement budgets: `CreateWithLink` is 1 (2 on a URL conflict). Every other method is 1, and 0 for empty input.

- [ ] **Step 1: Write the failing tests**

`backend/internal/adapters/repositories/postgres/gorm_audio_track_repository_test.go`:

```go
package postgres

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

func spotifyLink() domain.TrackLink {
	return domain.TrackLink{Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC",
		URL: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", Kind: domain.TrackLinkKindListen, Source: domain.TrackLinkSourcePasted}
}

func newTrack() *domain.Content {
	u := "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
	g := 21
	return &domain.Content{Name: "Never Gonna Give You Up", URL: &u, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: 7,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Rick Astley"}}`), GenreID: &g}
}

func TestCreateWithLink_IsOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`WITH new_content AS \(\s*INSERT INTO content .* ON CONFLICT \(url\) DO NOTHING RETURNING \* \), new_link AS \(\s*INSERT INTO track_links .* ON CONFLICT \(provider, provider_track_id\) DO NOTHING RETURNING id \) SELECT \* FROM new_content`).
		WithArgs("Never Gonna Give You Up", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", 7, nil, nil,
			`{"music":{"provider":"spotify","artist":"Rick Astley"}}`, 21,
			"spotify", "4uLU6hMCjMI75M1A2tKUQC", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "listen", "pasted").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type", "genre_id"}).AddRow(40, "Never Gonna Give You Up", "audio_track", 21))

	c := querycount.Attach(t, db)
	got, existed, err := NewGormAudioTrackRepository(db).CreateWithLink(context.Background(), newTrack(), spotifyLink())
	require.NoError(t, err)
	assert.False(t, existed)
	assert.Equal(t, 40, got.ID)
	assert.Equal(t, domain.ContentTypeAudioTrack, got.ContentType)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestCreateWithLink_URLConflictReadsExisting(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`WITH new_content AS`).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT \* FROM "content" WHERE url = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type"}).AddRow(12, "Old", "audio_track"))

	c := querycount.Attach(t, db)
	got, existed, err := NewGormAudioTrackRepository(db).CreateWithLink(context.Background(), newTrack(), spotifyLink())
	require.NoError(t, err)
	assert.True(t, existed)
	assert.Equal(t, 12, got.ID)
	c.AssertExactly(t, 2)
	assertAllExpectationsMet(t, mock)
}

func TestAddLink_ConflictReportsNotAdded(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`INSERT INTO track_links \(content_id, provider, provider_track_id, url, kind, source\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6\) ON CONFLICT \(provider, provider_track_id\) DO NOTHING RETURNING id`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	l := spotifyLink()
	l.ContentID = 40
	added, err := NewGormAudioTrackRepository(db).AddLink(context.Background(), l)
	require.NoError(t, err)
	assert.False(t, added)
	assertAllExpectationsMet(t, mock)
}

func TestGetByLink_OneJoinQuery(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT content\.\* FROM content JOIN track_links tl ON tl\.content_id = content\.id WHERE tl\.provider = \$1 AND tl\.provider_track_id = \$2 LIMIT 1`).
		WithArgs("spotify", "4uLU6hMCjMI75M1A2tKUQC").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type"}).AddRow(40, "Song", "audio_track"))

	c := querycount.Attach(t, db)
	got, err := NewGormAudioTrackRepository(db).GetByLink(context.Background(), domain.ProviderSpotify, "4uLU6hMCjMI75M1A2tKUQC")
	require.NoError(t, err)
	assert.Equal(t, 40, got.ID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestGetByLink_MissIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`FROM content JOIN track_links`).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	_, err := NewGormAudioTrackRepository(db).GetByLink(context.Background(), domain.ProviderSpotify, "x")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestFindSameSongCandidates_TitleArtistAndNoUploads(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`content_type = \$1 AND lower\(name\) = lower\(\$2\) AND lower\(response->'music'->>'artist'\) = lower\(\$3\) AND COALESCE\(response->'music'->>'videoType', ''\) <> 'other' ORDER BY id LIMIT \$4`).
		WithArgs("audio_track", "Song", "Queen", 5).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(3))
	got, err := NewGormAudioTrackRepository(db).FindSameSongCandidates(context.Background(), "Song", "Queen", 5)
	require.NoError(t, err)
	assert.Len(t, got, 1)
	assertAllExpectationsMet(t, mock)
}

func TestLinksByContentIDs_OneQueryAnyBatchAndZeroForEmpty(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "track_links" WHERE content_id = ANY\(CAST\(\$1 AS bigint\[\]\)\) ORDER BY content_id, id`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "content_id", "provider", "provider_track_id", "url", "kind", "source"}).
			AddRow(1, 1, "youtube", "abc", "https://music.youtube.com/watch?v=abc", "embed", "pasted").
			AddRow(2, 1, "spotify", "def", "https://open.spotify.com/track/def", "listen", "pasted"))

	repo := NewGormAudioTrackRepository(db)
	c := querycount.Attach(t, db)
	got, err := repo.LinksByContentIDs(context.Background(), seqIDs(50))
	require.NoError(t, err)
	require.Len(t, got[1], 2)
	assert.Equal(t, domain.TrackLinkKindEmbed, got[1][0].Kind)
	assert.Equal(t, domain.TrackLinkSourcePasted, got[1][1].Source)
	c.AssertExactly(t, 1)

	empty, err := repo.LinksByContentIDs(context.Background(), nil)
	require.NoError(t, err)
	assert.Empty(t, empty)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestContentByURLs_OneQueryKeyedByURL(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "content" WHERE url IN \(\$1,\$2\)`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "url", "content_type"}).AddRow(5, "https://www.youtube.com/watch?v=a", "youtube_video"))
	c := querycount.Attach(t, db)
	got, err := NewGormAudioTrackRepository(db).ContentByURLs(context.Background(), []string{"https://www.youtube.com/watch?v=a", "https://www.youtube.com/watch?v=b"})
	require.NoError(t, err)
	assert.Equal(t, 5, got["https://www.youtube.com/watch?v=a"].ID)
	assert.NotContains(t, got, "https://www.youtube.com/watch?v=b")
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestMarkLinkUnavailable_EmbedOnlyOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`UPDATE track_links SET unavailable_at = COALESCE\(unavailable_at, NOW\(\)\) WHERE id = \$1 AND kind = 'embed' RETURNING \*`).
		WithArgs(9).WillReturnRows(sqlmock.NewRows([]string{"id", "content_id", "provider", "kind", "unavailable_at"}).AddRow(9, 1, "youtube", "embed", "2026-10-11T12:00:00Z"))
	mock.ExpectQuery(`UPDATE track_links`).WithArgs(10).WillReturnRows(sqlmock.NewRows([]string{"id"}))

	repo := NewGormAudioTrackRepository(db)
	got, err := repo.MarkLinkUnavailable(context.Background(), 9)
	require.NoError(t, err)
	assert.NotNil(t, got.UnavailableAt)
	_, err = repo.MarkLinkUnavailable(context.Background(), 10)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assertAllExpectationsMet(t, mock)
}
```

(If the sqlmock driver rejects the `unavailable_at` string, use `time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)` and import `time`.)

`backend/internal/adapters/repositories/postgres/gorm_audio_track_integration_test.go`. This is real SQL against a local `testdb`, and it skips everywhere else:

```go
package postgres

// Real-Postgres checks for the AUDIO_TRACK SQL that sqlmock cannot judge: the
// CTE insert, the conflict paths, and the genre window. Runs only against a
// local database named testdb (see openLocalUserTodoTestDB). Task 18 runs it:
//
//	DATABASE_URL="postgres://demo:demo@127.0.0.1:5434/testdb?sslmode=disable" \
//	  go test -p 1 ./internal/adapters/repositories/postgres/ -run AudioTrackIntegration -v

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestAudioTrackIntegration(t *testing.T) {
	db := openLocalUserTodoTestDB(t)
	ctx := context.Background()
	users := NewGormUserRepository(db)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	adder, err := users.CreateFromClerk(ctx, "at-adder-"+suffix, "at-adder-"+suffix, "")
	require.NoError(t, err)
	other, err := users.CreateFromClerk(ctx, "at-other-"+suffix, "at-other-"+suffix, "")
	require.NoError(t, err)
	var contentIDs []int
	t.Cleanup(func() {
		_ = db.Exec("DELETE FROM content WHERE id IN ?", append(contentIDs, 0)).Error
		_ = db.Exec("DELETE FROM users WHERE id IN ?", []int{adder.ID, other.ID}).Error
	})

	audio := NewGormAudioTrackRepository(db)
	genres := NewGormMusicGenreRepository(db)

	url := "https://open.spotify.com/track/it" + suffix
	c := &domain.Content{Name: "Integration Song", URL: &url, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: adder.ID,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Tester"}}`)}
	link := domain.TrackLink{Provider: domain.ProviderSpotify, ProviderTrackID: "it" + suffix, URL: url, Kind: domain.TrackLinkKindListen, Source: domain.TrackLinkSourcePasted}

	created, existed, err := audio.CreateWithLink(ctx, c, link)
	require.NoError(t, err)
	assert.False(t, existed)
	contentIDs = append(contentIDs, created.ID)

	again, existed, err := audio.CreateWithLink(ctx, c, link)
	require.NoError(t, err)
	assert.True(t, existed)
	assert.Equal(t, created.ID, again.ID)

	links, err := audio.LinksByContentIDs(ctx, []int{created.ID})
	require.NoError(t, err)
	require.Len(t, links[created.ID], 1, "the CTE inserted exactly one link")

	byLink, err := audio.GetByLink(ctx, domain.ProviderSpotify, "it"+suffix)
	require.NoError(t, err)
	assert.Equal(t, created.ID, byLink.ID)

	cands, err := audio.FindSameSongCandidates(ctx, "integration song", "TESTER", 5)
	require.NoError(t, err)
	require.NotEmpty(t, cands)

	// Genre: anyone may set it while empty; then only the adder, inside 30 days.
	_, err = genres.SetContentGenre(ctx, created.ID, 21, other.ID, domain.GenreChangeWindowDays)
	require.NoError(t, err)
	_, err = genres.SetContentGenre(ctx, created.ID, 14, other.ID, domain.GenreChangeWindowDays)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)
	got, err := genres.SetContentGenre(ctx, created.ID, 14, adder.ID, domain.GenreChangeWindowDays)
	require.NoError(t, err)
	assert.Equal(t, 14, *got.GenreID)
	require.NoError(t, db.Exec("UPDATE content SET created_at = NOW() - INTERVAL '31 days' WHERE id = ?", created.ID).Error)
	_, err = genres.SetContentGenre(ctx, created.ID, 21, adder.ID, domain.GenreChangeWindowDays)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)

	// Only EMBED links can be marked unavailable.
	_, err = audio.MarkLinkUnavailable(ctx, links[created.ID][0].ID)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// ON DELETE SET NULL is not exercised: genres are never deleted at runtime.
	all, err := genres.List(ctx)
	require.NoError(t, err)
	assert.Len(t, all, 523)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./internal/adapters/repositories/postgres/ -run 'CreateWithLink|AddLink|GetByLink|FindSameSong|LinksByContentIDs|ContentByURLs|MarkLinkUnavailable|AudioTrackIntegration'`
Expected: FAIL to compile with `undefined: NewGormAudioTrackRepository` and `undefined: domain.TrackLink`.

- [ ] **Step 3: Implement**

`backend/migrations/000035_add_track_links.up.sql`:

```sql
-- PROVISIONAL NUMBER until merge. Never applied to the shared DB by the
-- AUDIO_TRACK work. ADR 0005: one content row per recording; every link to
-- it (including the first pasted one, which is also content.url) is a row
-- here. A provider track id belongs to exactly one track.
CREATE TABLE IF NOT EXISTS track_links (
    id                SERIAL PRIMARY KEY,
    content_id        INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    provider          VARCHAR(32)  NOT NULL CHECK (provider IN ('youtube', 'spotify', 'apple_music', 'amazon_music')),
    provider_track_id VARCHAR(128) NOT NULL,
    url               TEXT         NOT NULL,
    kind              VARCHAR(16)  NOT NULL DEFAULT 'listen' CHECK (kind IN ('listen', 'embed')),
    source            VARCHAR(16)  NOT NULL DEFAULT 'pasted' CHECK (source IN ('pasted', 'matched')),
    unavailable_at    TIMESTAMPTZ  NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_track_links_provider_track UNIQUE (provider, provider_track_id)
);

-- LinksByContentIDs (the details view and the dataloader) reads by content_id.
CREATE INDEX IF NOT EXISTS idx_track_links_content_id ON track_links (content_id);

COMMENT ON TABLE track_links IS 'Links to one AUDIO_TRACK recording (ADR 0005). kind=embed plays in-page (YouTube); listen opens the provider.';
COMMENT ON COLUMN track_links.unavailable_at IS 'Set once when the embed reports 101/150 (ticket 03). Never cleared automatically in v1.';
```

`backend/migrations/000035_add_track_links.down.sql`:

```sql
DROP TABLE IF EXISTS track_links;
```

Append to `backend/internal/core/domain/audio_track.go`. Add `"time"` to its imports:

```go
// TrackLinkKind says whether a link plays in-page (EMBED) or opens the provider (LISTEN).
type TrackLinkKind string

const (
	TrackLinkKindListen TrackLinkKind = "LISTEN"
	TrackLinkKindEmbed  TrackLinkKind = "EMBED"
)

// TrackLinkSource says how a link got onto the track.
type TrackLinkSource string

const (
	TrackLinkSourcePasted  TrackLinkSource = "PASTED"
	TrackLinkSourceMatched TrackLinkSource = "MATCHED" // reserved for the matcher (ticket 02); unused in v1
)

// TrackLink is one track_links row.
type TrackLink struct {
	ID              int
	ContentID       int
	Provider        TrackProvider
	ProviderTrackID string
	URL             string
	Kind            TrackLinkKind
	Source          TrackLinkSource
	UnavailableAt   *time.Time
	CreatedAt       time.Time
}
```

Append to `backend/internal/core/ports/repositories/audio_track_repository.go`:

```go
// AudioTrackRepository holds the AUDIO_TRACK queries that touch track_links or
// response.music. It is separate from ContentRepository so the existing
// ContentRepository mocks are unchanged.
type AudioTrackRepository interface {
	// CreateWithLink inserts the content row and its first link in one
	// statement. On a URL conflict it returns the existing row and true.
	CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error)
	// AddLink attaches a link to link.ContentID. False when (provider, id) is
	// already linked to some track.
	AddLink(ctx context.Context, link domain.TrackLink) (bool, error)
	GetByLink(ctx context.Context, provider domain.TrackProvider, providerTrackID string) (*domain.Content, error)
	GetByMusicBrainzID(ctx context.Context, mbid string) (*domain.Content, error)
	// FindSameSongCandidates: AUDIO_TRACK rows whose title (and artist, when
	// given) match case-insensitively, excluding unofficial uploads.
	FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error)
	// ContentByURLs returns existing rows keyed by url; absent urls are absent.
	ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error)
	// LinksByContentIDs returns links grouped by content id, ordered by id.
	LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
	// MarkLinkUnavailable stamps unavailable_at on an EMBED link (first time
	// only). ErrNotFound for unknown or LISTEN links.
	MarkLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error)
}
```

`backend/internal/adapters/repositories/postgres/gorm_audio_track_repository.go`:

```go
package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// TrackLinkModel is a track_links row. kind and source are stored lowercase.
type TrackLinkModel struct {
	ID              int        `gorm:"primaryKey;autoIncrement"`
	ContentID       int        `gorm:"column:content_id"`
	Provider        string     `gorm:"column:provider"`
	ProviderTrackID string     `gorm:"column:provider_track_id"`
	URL             string     `gorm:"column:url"`
	Kind            string     `gorm:"column:kind"`
	Source          string     `gorm:"column:source"`
	UnavailableAt   *time.Time `gorm:"column:unavailable_at"`
	CreatedAt       time.Time  `gorm:"column:created_at"`
}

func (TrackLinkModel) TableName() string { return "track_links" }

func trackLinkModelToDomain(m *TrackLinkModel) domain.TrackLink {
	return domain.TrackLink{
		ID: m.ID, ContentID: m.ContentID, Provider: domain.TrackProvider(m.Provider), ProviderTrackID: m.ProviderTrackID,
		URL: m.URL, Kind: domain.TrackLinkKind(strings.ToUpper(m.Kind)), Source: domain.TrackLinkSource(strings.ToUpper(m.Source)),
		UnavailableAt: m.UnavailableAt, CreatedAt: m.CreatedAt,
	}
}

// GormAudioTrackRepository implements repositories.AudioTrackRepository.
type GormAudioTrackRepository struct {
	db *gorm.DB
}

var _ repositories.AudioTrackRepository = (*GormAudioTrackRepository)(nil)

func NewGormAudioTrackRepository(db *gorm.DB) *GormAudioTrackRepository {
	return &GormAudioTrackRepository{db: db}
}

const createWithLinkSQL = `WITH new_content AS (
	INSERT INTO content (name, url, content_type, added_by_user_id, length, length_units, response, genre_id, created_at, updated_at)
	VALUES (?, ?, 'audio_track', ?, ?, ?, CAST(? AS jsonb), ?, NOW(), NOW())
	ON CONFLICT (url) DO NOTHING RETURNING * ), new_link AS (
	INSERT INTO track_links (content_id, provider, provider_track_id, url, kind, source)
	SELECT id, ?, ?, ?, ?, ? FROM new_content
	ON CONFLICT (provider, provider_track_id) DO NOTHING RETURNING id ) SELECT * FROM new_content`

func (r *GormAudioTrackRepository) CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
	if c.URL == nil {
		return nil, false, fmt.Errorf("%w: track url is required", domain.ErrInvalidInput)
	}
	response := "{}"
	if len(c.Response) > 0 {
		response = string(c.Response)
	}
	var m ContentModel
	err := r.db.WithContext(ctx).Raw(createWithLinkSQL,
		c.Name, *c.URL, c.AddedByUserID, c.Length, c.LengthUnits, response, c.GenreID,
		string(link.Provider), link.ProviderTrackID, link.URL, strings.ToLower(string(link.Kind)), strings.ToLower(string(link.Source)),
	).Scan(&m).Error
	if err != nil {
		return nil, false, fmt.Errorf("failed to create audio track: %w", err)
	}
	if m.ID != 0 {
		return contentModelToDomain(&m), false, nil
	}
	var existing ContentModel
	if err := r.db.WithContext(ctx).Where("url = ?", *c.URL).First(&existing).Error; err != nil {
		return nil, false, fmt.Errorf("failed to read existing track after url conflict: %w", err)
	}
	return contentModelToDomain(&existing), true, nil
}

func (r *GormAudioTrackRepository) AddLink(ctx context.Context, link domain.TrackLink) (bool, error) {
	var id int
	err := r.db.WithContext(ctx).Raw(
		`INSERT INTO track_links (content_id, provider, provider_track_id, url, kind, source) VALUES (?,?,?,?,?,?) `+
			`ON CONFLICT (provider, provider_track_id) DO NOTHING RETURNING id`,
		link.ContentID, string(link.Provider), link.ProviderTrackID, link.URL,
		strings.ToLower(string(link.Kind)), strings.ToLower(string(link.Source)),
	).Scan(&id).Error
	if err != nil {
		return false, fmt.Errorf("failed to add track link: %w", err)
	}
	return id != 0, nil
}

func (r *GormAudioTrackRepository) GetByLink(ctx context.Context, provider domain.TrackProvider, providerTrackID string) (*domain.Content, error) {
	var m ContentModel
	err := r.db.WithContext(ctx).Raw(
		`SELECT content.* FROM content JOIN track_links tl ON tl.content_id = content.id WHERE tl.provider = ? AND tl.provider_track_id = ? LIMIT 1`,
		string(provider), providerTrackID,
	).Scan(&m).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get track by link: %w", err)
	}
	if m.ID == 0 {
		return nil, domain.ErrNotFound
	}
	return contentModelToDomain(&m), nil
}

func (r *GormAudioTrackRepository) GetByMusicBrainzID(ctx context.Context, mbid string) (*domain.Content, error) {
	var m ContentModel
	err := r.db.WithContext(ctx).
		Where("content_type = ? AND response->'music'->>'musicbrainzId' = ?", "audio_track", mbid).
		Order("id").First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get track by musicbrainz id: %w", err)
	}
	return contentModelToDomain(&m), nil
}

func (r *GormAudioTrackRepository) FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error) {
	q := r.db.WithContext(ctx).Where("content_type = ? AND lower(name) = lower(?)", "audio_track", title)
	if artist != "" {
		q = q.Where("lower(response->'music'->>'artist') = lower(?)", artist)
	}
	var models []ContentModel
	err := q.Where("COALESCE(response->'music'->>'videoType', '') <> 'other'").Order("id").Limit(limit).Find(&models).Error
	if err != nil {
		return nil, fmt.Errorf("failed to find same-song candidates: %w", err)
	}
	out := make([]*domain.Content, len(models))
	for i := range models {
		out[i] = contentModelToDomain(&models[i])
	}
	return out, nil
}

func (r *GormAudioTrackRepository) ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error) {
	out := make(map[string]*domain.Content, len(urls))
	if len(urls) == 0 {
		return out, nil
	}
	var models []ContentModel
	if err := r.db.WithContext(ctx).Where("url IN ?", urls).Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get content by urls: %w", err)
	}
	for i := range models {
		if models[i].URL != nil {
			out[*models[i].URL] = contentModelToDomain(&models[i])
		}
	}
	return out, nil
}

func (r *GormAudioTrackRepository) LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	out := make(map[int][]domain.TrackLink, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var models []TrackLinkModel
	err := r.db.WithContext(ctx).Where("content_id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Order("content_id, id").Find(&models).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get track links: %w", err)
	}
	for i := range models {
		out[models[i].ContentID] = append(out[models[i].ContentID], trackLinkModelToDomain(&models[i]))
	}
	return out, nil
}

func (r *GormAudioTrackRepository) MarkLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error) {
	var m TrackLinkModel
	err := r.db.WithContext(ctx).Raw(
		`UPDATE track_links SET unavailable_at = COALESCE(unavailable_at, NOW()) WHERE id = ? AND kind = 'embed' RETURNING *`, linkID,
	).Scan(&m).Error
	if err != nil {
		return nil, fmt.Errorf("failed to mark track link unavailable: %w", err)
	}
	if m.ID == 0 {
		return nil, domain.ErrNotFound
	}
	l := trackLinkModelToDomain(&m)
	return &l, nil
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend test ./internal/adapters/repositories/postgres/`
Expected: `ok`. `TestAudioTrackIntegration` skips here because `DATABASE_URL` is not the local `testdb`. Task 18 runs it.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): track_links table and AudioTrackRepository (ADR 0005)"
```

---

### Task 7: `musiclinks` parser

This is a pure function and makes no network calls. It turns any supported paste into (provider, provider track id, canonical URL, kind). It is the only place that knows provider URL shapes. Ticket 01 item 3 flags the Amazon and slugless Apple shapes as unverified; they are covered here from the documented public formats.

**Files:**
- Create: `backend/internal/adapters/musiclinks/parse.go`
- Test: `backend/test/musiclinks/parse_test.go`

**Interfaces:**
- Consumes: `youtube.ClassifyURL(url string) (URLKind, string, error)` and `youtube.NormalizeYouTubeMusicURL(videoID string) string` (existing); `domain.ErrInvalidURL`, `domain.ErrNotATrack` and the `domain.Provider*` constants.
- Produces:
  ```go
  package musiclinks
  type Link struct {
      Provider        domain.TrackProvider
      ProviderTrackID string
      CanonicalURL    string
      Kind            domain.TrackLinkKind // EMBED for YouTube Music, LISTEN otherwise
      SuggestedTitle  string               // from an Apple song slug; "" otherwise
  }
  func Parse(raw string) (Link, error) // ErrNotATrack for albums/playlists/artists; ErrInvalidURL otherwise
  ```

- [ ] **Step 1: Write the failing test**

`backend/test/musiclinks/parse_test.go`:

```go
package musiclinks_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/musiclinks"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse_Tracks(t *testing.T) {
	cases := []struct {
		in   string
		want musiclinks.Link
	}{
		{"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
			musiclinks.Link{Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC", CanonicalURL: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", Kind: domain.TrackLinkKindListen}},
		{"spotify:track:4uLU6hMCjMI75M1A2tKUQC",
			musiclinks.Link{Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC", CanonicalURL: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", Kind: domain.TrackLinkKindListen}},
		{"https://music.apple.com/us/song/bohemian-rhapsody/1440650711",
			musiclinks.Link{Provider: domain.ProviderAppleMusic, ProviderTrackID: "1440650711", CanonicalURL: "https://music.apple.com/us/song/1440650711", Kind: domain.TrackLinkKindListen, SuggestedTitle: "Bohemian Rhapsody"}},
		{"https://music.apple.com/gb/song/1440650711",
			musiclinks.Link{Provider: domain.ProviderAppleMusic, ProviderTrackID: "1440650711", CanonicalURL: "https://music.apple.com/gb/song/1440650711", Kind: domain.TrackLinkKindListen}},
		{"https://music.amazon.com/tracks/B07D5J5QX3",
			musiclinks.Link{Provider: domain.ProviderAmazonMusic, ProviderTrackID: "B07D5J5QX3", CanonicalURL: "https://music.amazon.com/tracks/B07D5J5QX3", Kind: domain.TrackLinkKindListen}},
		{"https://music.amazon.co.uk/albums/B07D5HXYZ1?trackAsin=B07D5J5QX3&ref=dm_sh",
			musiclinks.Link{Provider: domain.ProviderAmazonMusic, ProviderTrackID: "B07D5J5QX3", CanonicalURL: "https://music.amazon.co.uk/tracks/B07D5J5QX3", Kind: domain.TrackLinkKindListen}},
		{"https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=abc",
			musiclinks.Link{Provider: domain.ProviderYouTube, ProviderTrackID: "dQw4w9WgXcQ", CanonicalURL: "https://music.youtube.com/watch?v=dQw4w9WgXcQ", Kind: domain.TrackLinkKindEmbed}},
	}
	for _, tc := range cases {
		got, err := musiclinks.Parse(tc.in)
		require.NoError(t, err, tc.in)
		assert.Equal(t, tc.want, got, tc.in)
	}
}

// Review Focus 1: tracking and locale noise must not create a second identity.
func TestParse_CanonicalisesNoise(t *testing.T) {
	base, err := musiclinks.Parse("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")
	require.NoError(t, err)
	for _, in := range []string{
		"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=1a2b3c4d5e",
		"https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC",
		"  HTTPS://OPEN.SPOTIFY.COM/track/4uLU6hMCjMI75M1A2tKUQC/  ",
	} {
		got, err := musiclinks.Parse(in)
		require.NoError(t, err, in)
		assert.Equal(t, base.ProviderTrackID, got.ProviderTrackID, in)
		assert.Equal(t, base.CanonicalURL, got.CanonicalURL, in)
	}
	apple, err := musiclinks.Parse("https://music.apple.com/us/album/a-night-at-the-opera/1440650428?i=1440650711&l=es")
	require.NoError(t, err)
	assert.Equal(t, "1440650711", apple.ProviderTrackID)
	assert.Equal(t, "", apple.SuggestedTitle, "an album slug is not the song title")
}

func TestParse_CollectionsAreNotTracks(t *testing.T) {
	for _, in := range []string{
		"https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx",
		"https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
		"https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt",
		"https://music.apple.com/us/album/a-night-at-the-opera/1440650428",
		"https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb",
		"https://music.amazon.com/albums/B07D5HXYZ1",
		"https://music.amazon.com/playlists/B01M11SBC8",
		"https://music.youtube.com/playlist?list=OLAK5uy_x",
	} {
		_, err := musiclinks.Parse(in)
		assert.ErrorIs(t, err, domain.ErrNotATrack, in)
	}
}

func TestParse_Unsupported(t *testing.T) {
	for _, in := range []string{
		"",
		"not a url",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ", // plain YouTube stays a video (ADR 0005)
		"https://soundcloud.com/rick/never",
		"https://open.spotify.com/track/short",
		"https://music.amazon.com/tracks/lowercase1",
		"https://evil.example/open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
	} {
		_, err := musiclinks.Parse(in)
		assert.ErrorIs(t, err, domain.ErrInvalidURL, in)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go -C backend test ./test/musiclinks/`
Expected: FAIL to compile with `no required module provides package .../adapters/musiclinks`.

- [ ] **Step 3: Implement**

`backend/internal/adapters/musiclinks/parse.go`:

```go
// Package musiclinks parses pasted music links into a provider identity. It is
// pure (no network): Spotify, Apple Music and Amazon Music adds are link-only
// (ADR 0002), and YouTube Music identity comes from the existing parser.
package musiclinks

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// Link is the identity of one pasted track link.
type Link struct {
	Provider        domain.TrackProvider
	ProviderTrackID string
	CanonicalURL    string
	Kind            domain.TrackLinkKind
	SuggestedTitle  string
}

var (
	spotifyID   = regexp.MustCompile(`^[A-Za-z0-9]{22}$`)
	appleID     = regexp.MustCompile(`^[0-9]{5,15}$`)
	amazonASIN  = regexp.MustCompile(`^[A-Z0-9]{10}$`)
	spotifyURI  = regexp.MustCompile(`^spotify:track:([A-Za-z0-9]{22})$`)
	countryCode = regexp.MustCompile(`^[a-z]{2}$`)
)

func invalid(reason string) error {
	return fmt.Errorf("%w: %s", domain.ErrInvalidURL, reason)
}

// Parse identifies a pasted track link.
func Parse(raw string) (Link, error) {
	s := strings.TrimSpace(raw)
	if m := spotifyURI.FindStringSubmatch(s); m != nil {
		return spotify(m[1]), nil
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" || (!strings.EqualFold(u.Scheme, "https") && !strings.EqualFold(u.Scheme, "http")) {
		return Link{}, invalid("not a link")
	}
	host := strings.ToLower(u.Hostname())
	parts := strings.FieldsFunc(u.Path, func(r rune) bool { return r == '/' })

	switch {
	case host == "open.spotify.com" || host == "play.spotify.com":
		return parseSpotify(parts)
	case host == "music.apple.com" || host == "geo.music.apple.com":
		return parseApple(parts, u.Query())
	case strings.HasPrefix(host, "music.amazon."):
		return parseAmazon(host, parts, u.Query())
	case host == "music.youtube.com":
		kind, videoID, err := youtube.ClassifyURL(s)
		if err != nil {
			return Link{}, invalid("not a YouTube Music song link")
		}
		if kind == youtube.URLKindMusicCollection {
			return Link{}, domain.ErrNotATrack
		}
		if kind != youtube.URLKindMusicTrack {
			return Link{}, invalid("not a YouTube Music song link")
		}
		return Link{Provider: domain.ProviderYouTube, ProviderTrackID: videoID,
			CanonicalURL: youtube.NormalizeYouTubeMusicURL(videoID), Kind: domain.TrackLinkKindEmbed}, nil
	}
	return Link{}, invalid("unsupported music link")
}

func spotify(id string) Link {
	return Link{Provider: domain.ProviderSpotify, ProviderTrackID: id,
		CanonicalURL: "https://open.spotify.com/track/" + id, Kind: domain.TrackLinkKindListen}
}

func parseSpotify(parts []string) (Link, error) {
	if len(parts) > 0 && strings.HasPrefix(parts[0], "intl-") {
		parts = parts[1:]
	}
	if len(parts) < 2 {
		return Link{}, invalid("not a Spotify track link")
	}
	switch parts[0] {
	case "track":
		if !spotifyID.MatchString(parts[1]) {
			return Link{}, invalid("bad Spotify track id")
		}
		return spotify(parts[1]), nil
	case "album", "playlist", "artist", "show", "episode":
		return Link{}, domain.ErrNotATrack
	}
	return Link{}, invalid("not a Spotify track link")
}

func parseApple(parts []string, q url.Values) (Link, error) {
	if len(parts) < 2 || !countryCode.MatchString(parts[0]) {
		return Link{}, invalid("not an Apple Music link")
	}
	cc, kind, rest := parts[0], parts[1], parts[2:]
	apple := func(id, title string) Link {
		return Link{Provider: domain.ProviderAppleMusic, ProviderTrackID: id,
			CanonicalURL: "https://music.apple.com/" + cc + "/song/" + id, Kind: domain.TrackLinkKindListen, SuggestedTitle: title}
	}
	switch kind {
	case "song":
		switch {
		case len(rest) == 1 && appleID.MatchString(rest[0]):
			return apple(rest[0], ""), nil
		case len(rest) == 2 && appleID.MatchString(rest[1]):
			return apple(rest[1], titleFromSlug(rest[0])), nil
		}
		return Link{}, invalid("bad Apple Music song link")
	case "album":
		if i := q.Get("i"); appleID.MatchString(i) {
			return apple(i, ""), nil
		}
		return Link{}, domain.ErrNotATrack
	case "playlist", "artist", "station", "music-video":
		return Link{}, domain.ErrNotATrack
	}
	return Link{}, invalid("not an Apple Music song link")
}

func parseAmazon(host string, parts []string, q url.Values) (Link, error) {
	if len(parts) < 2 {
		return Link{}, invalid("not an Amazon Music link")
	}
	amazon := func(asin string) Link {
		return Link{Provider: domain.ProviderAmazonMusic, ProviderTrackID: asin,
			CanonicalURL: "https://" + host + "/tracks/" + asin, Kind: domain.TrackLinkKindListen}
	}
	switch parts[0] {
	case "tracks":
		if amazonASIN.MatchString(parts[1]) {
			return amazon(parts[1]), nil
		}
		return Link{}, invalid("bad Amazon Music track id")
	case "albums":
		if t := q.Get("trackAsin"); amazonASIN.MatchString(t) {
			return amazon(t), nil
		}
		return Link{}, domain.ErrNotATrack
	case "playlists", "artists", "user-playlists", "podcasts":
		return Link{}, domain.ErrNotATrack
	}
	return Link{}, invalid("not an Amazon Music track link")
}

// titleFromSlug turns "bohemian-rhapsody" into "Bohemian Rhapsody". A hint only:
// the user confirms the title in the add form.
func titleFromSlug(slug string) string {
	words := strings.FieldsFunc(slug, func(r rune) bool { return r == '-' })
	for i, w := range words {
		if w != "" {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
```

(Spotify upper-case host and the trailing slash are handled because `url.Hostname()` is lowercased here and `FieldsFunc` drops empty segments. `ClassifyURL` keeps its current error and kind contract. If the constant names differ (for example `URLKindMusicTrack`), use the names in `backend/internal/adapters/youtube/parser.go`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `go -C backend test ./test/musiclinks/`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend/internal/adapters/musiclinks backend/test/musiclinks
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): parse Spotify, Apple Music, Amazon Music and YouTube Music links"
```

---
### Task 8: Service: `CreateAudioTrack` link-only path, genre and link methods

**Files:**
- Create: `backend/internal/core/services/content_audio_track.go`
- Modify: `backend/internal/core/services/content_service.go` (two struct fields: `audio`, `genres`)
- Modify: `backend/internal/core/ports/services/content_service.go` (the input and result types, plus five interface methods)
- Modify: `backend/internal/adapters/graphql/directives/auth_test.go`, and any other `ContentService` implementer that `go vet` reports (method stubs)
- Test: `backend/test/services/content_audio_track_test.go`

**Interfaces:**
- Consumes:
  - `musiclinks.Parse` and `musiclinks.Link` (Task 7);
  - `repositories.AudioTrackRepository` (Task 6) and `repositories.MusicGenreRepository` (Task 5);
  - `domain.MusicFields` (Task 3).
- Produces:
  ```go
  // ports/services
  type CreateAudioTrackInput struct {
      URL, Title, Artist string; GenreID, SameAsContentID *int; CreateNew bool; UserID int
  }
  type CreateAudioTrackResult struct {
      Content *domain.Content; AlreadyExisted bool; Candidates []*domain.Content
  }
  // ContentService gains:
  CreateAudioTrack(ctx context.Context, in CreateAudioTrackInput) (*CreateAudioTrackResult, error)
  MusicGenres(ctx context.Context) ([]domain.MusicGenre, error)
  SetTrackGenre(ctx context.Context, contentID, genreID, userID int) (*domain.Content, error)
  TrackLinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
  MarkTrackLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error)
  // services
  func WithAudioTracks(audio repositories.AudioTrackRepository, genres repositories.MusicGenreRepository) ContentServiceOption
  ```
- `CreateAudioTrack` budget for a new link-only track is 4 statements: GetByLink, GetByURL, candidates and the CTE. The genre-id check adds 0 when the genre cache is warm. A duplicate found by link is 1 statement. A candidate prompt is 3.
- In this task the YouTube Music path is a thin bridge: it calls the existing `CreateAudioTrackFromYouTube` and then `AddLink`. Task 9 replaces it.

- [ ] **Step 1: Write the failing test**

`backend/test/services/content_audio_track_test.go`:

```go
package services_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeAudioRepo is an in-memory AudioTrackRepository over fakeMusicRepo's rows.
type fakeAudioRepo struct {
	content *fakeMusicRepo
	links   []domain.TrackLink
	calls   map[string]int
}

func newFakeAudioRepo(content *fakeMusicRepo) *fakeAudioRepo {
	return &fakeAudioRepo{content: content, calls: map[string]int{}}
}

func (r *fakeAudioRepo) CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
	r.calls["CreateWithLink"]++
	if existing, err := r.content.GetByURL(ctx, *c.URL); err == nil {
		return existing, true, nil
	}
	created := r.content.add(c)
	link.ContentID, link.ID = created.ID, len(r.links)+1
	r.links = append(r.links, link)
	return created, false, nil
}

func (r *fakeAudioRepo) AddLink(_ context.Context, link domain.TrackLink) (bool, error) {
	r.calls["AddLink"]++
	for _, l := range r.links {
		if l.Provider == link.Provider && l.ProviderTrackID == link.ProviderTrackID {
			return false, nil
		}
	}
	link.ID = len(r.links) + 1
	r.links = append(r.links, link)
	return true, nil
}

func (r *fakeAudioRepo) GetByLink(_ context.Context, p domain.TrackProvider, id string) (*domain.Content, error) {
	r.calls["GetByLink"]++
	for _, l := range r.links {
		if l.Provider == p && l.ProviderTrackID == id {
			return r.content.rows[l.ContentID], nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeAudioRepo) GetByMusicBrainzID(_ context.Context, mbid string) (*domain.Content, error) {
	r.calls["GetByMusicBrainzID"]++
	for _, c := range r.content.rows {
		if c.ContentType == domain.ContentTypeAudioTrack && domain.ReadMusic(c.Response).MusicBrainzID == mbid {
			return c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeAudioRepo) FindSameSongCandidates(_ context.Context, title, artist string, limit int) ([]*domain.Content, error) {
	r.calls["FindSameSongCandidates"]++
	var out []*domain.Content
	for _, c := range r.content.rows {
		m := domain.ReadMusic(c.Response)
		if c.ContentType == domain.ContentTypeAudioTrack && strings.EqualFold(c.Name, title) &&
			(artist == "" || strings.EqualFold(m.Artist, artist)) && !domain.IsUnofficialUpload(m) {
			out = append(out, c)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (r *fakeAudioRepo) ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error) {
	r.calls["ContentByURLs"]++
	out := map[string]*domain.Content{}
	for _, u := range urls {
		if c, err := r.content.GetByURL(ctx, u); err == nil {
			out[u] = c
		}
	}
	return out, nil
}

func (r *fakeAudioRepo) LinksByContentIDs(_ context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	r.calls["LinksByContentIDs"]++
	out := map[int][]domain.TrackLink{}
	for _, l := range r.links {
		if slices.Contains(ids, l.ContentID) {
			out[l.ContentID] = append(out[l.ContentID], l)
		}
	}
	return out, nil
}

func (r *fakeAudioRepo) MarkLinkUnavailable(_ context.Context, id int) (*domain.TrackLink, error) {
	for i := range r.links {
		if r.links[i].ID == id && r.links[i].Kind == domain.TrackLinkKindEmbed {
			return &r.links[i], nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeAudioRepo) linksFor(contentID int) []domain.TrackLink {
	var out []domain.TrackLink
	for _, l := range r.links {
		if l.ContentID == contentID {
			out = append(out, l)
		}
	}
	return out
}

type fakeGenres struct {
	list   []domain.MusicGenre
	locked map[int]bool
	set    map[int]int
}

func newFakeGenres() *fakeGenres {
	return &fakeGenres{
		list: []domain.MusicGenre{
			{ID: 21, Name: "Rock", AppleName: "Rock"},
			{ID: 14, Name: "Pop", AppleName: "Pop"},
			{ID: 18, Name: "Hip-Hop/Rap", AppleName: "Hip-Hop/Rap"},
		},
		locked: map[int]bool{},
		set:    map[int]int{},
	}
}

func (g *fakeGenres) List(context.Context) ([]domain.MusicGenre, error) { return slices.Clone(g.list), nil }

func (g *fakeGenres) SetContentGenre(_ context.Context, contentID, genreID, _, windowDays int) (*domain.Content, error) {
	if windowDays != domain.GenreChangeWindowDays {
		return nil, errors.New("wrong window")
	}
	if g.locked[contentID] {
		return nil, domain.ErrGenreLocked
	}
	g.set[contentID] = genreID
	return &domain.Content{ID: contentID, GenreID: &genreID}, nil
}

// noYouTube fails the test if the YouTube Data API is called.
func noYouTube(t *testing.T) *mockYouTubeClient {
	return &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		t.Error("link-only adds must not call YouTube")
		return nil, errors.New("unexpected")
	}}
}

func audioService(t *testing.T, repo *fakeMusicRepo, audio *fakeAudioRepo, genres *fakeGenres) *services.ContentService {
	return services.NewContentService(repo, noYouTube(t), nil, services.WithAudioTracks(audio, genres), syncRunner())
}

const spotifyURL = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"

func TestCreateAudioTrack_SpotifyIsLinkOnly(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	genre := 14

	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: spotifyURL + "?si=abc", Title: "  Never Gonna Give You Up ", Artist: "Rick Astley", GenreID: &genre, UserID: 7,
	})
	require.NoError(t, err)
	require.NotNil(t, res.Content)
	assert.False(t, res.AlreadyExisted)
	assert.Empty(t, res.Candidates)
	c := res.Content
	assert.Equal(t, domain.ContentTypeAudioTrack, c.ContentType)
	assert.Equal(t, "Never Gonna Give You Up", c.Name)
	assert.Equal(t, spotifyURL, *c.URL, "content.url is the first pasted link, canonicalised (ADR 0005)")
	assert.Equal(t, 14, *c.GenreID)
	m := domain.ReadMusic(c.Response)
	assert.Equal(t, domain.ProviderSpotify, m.Provider)
	assert.Equal(t, "Rick Astley", m.Artist)

	links := audio.linksFor(c.ID)
	require.Len(t, links, 1)
	assert.Equal(t, domain.TrackLinkKindListen, links[0].Kind)
	assert.Equal(t, domain.TrackLinkSourcePasted, links[0].Source)
	assert.Equal(t, map[string]int{"GetByLink": 1, "FindSameSongCandidates": 1, "CreateWithLink": 1}, audio.calls)
}

func TestCreateAudioTrack_AppleUsesSlugTitleWhenBlank(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: "https://music.apple.com/us/song/bohemian-rhapsody/1440650711", UserID: 7,
	})
	require.NoError(t, err)
	assert.Equal(t, "Bohemian Rhapsody", res.Content.Name)
}

func TestCreateAudioTrack_LinkOnlyNeedsATitle(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: "https://music.amazon.com/tracks/B07D5J5QX3", UserID: 7,
	})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Empty(t, repo.rows)
}

// Review Focus 1.
func TestCreateAudioTrack_RepasteWithTrackingParamsReturnsExisting(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	first, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", UserID: 7})
	require.NoError(t, err)

	for _, again := range []string{spotifyURL + "?si=zzz", "https://open.spotify.com/intl-fr/track/4uLU6hMCjMI75M1A2tKUQC"} {
		res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: again, Title: "Different Title", UserID: 8})
		require.NoError(t, err, again)
		assert.True(t, res.AlreadyExisted, again)
		assert.Equal(t, first.Content.ID, res.Content.ID, again)
	}
	assert.Len(t, repo.rows, 1)
}

func TestCreateAudioTrack_SameSongCandidatesAskInsteadOfCreating(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	existing, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", Artist: "Queen", UserID: 7})
	require.NoError(t, err)

	apple := "https://music.apple.com/us/song/song/1440650711"
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: apple, Title: "song", Artist: "QUEEN", UserID: 8})
	require.NoError(t, err)
	assert.Nil(t, res.Content, "nothing is created until the user answers (ADR 0005)")
	require.Len(t, res.Candidates, 1)
	assert.Equal(t, existing.Content.ID, res.Candidates[0].ID)
	assert.Len(t, repo.rows, 1)

	// "Different song": create anyway.
	res, err = svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: apple, Title: "Song", Artist: "Queen", CreateNew: true, UserID: 8})
	require.NoError(t, err)
	require.NotNil(t, res.Content)
	assert.NotEqual(t, existing.Content.ID, res.Content.ID)
}

func TestCreateAudioTrack_SameAsAttachesTheLink(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	existing, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", UserID: 7})
	require.NoError(t, err)

	id := existing.Content.ID
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: "https://music.amazon.com/tracks/B07D5J5QX3", SameAsContentID: &id, UserID: 8,
	})
	require.NoError(t, err)
	assert.True(t, res.AlreadyExisted)
	assert.Equal(t, id, res.Content.ID)
	assert.Len(t, audio.linksFor(id), 2)
	assert.Len(t, repo.rows, 1)
}

func TestCreateAudioTrack_SameAsMustBeATrack(t *testing.T) {
	repo := newFakeMusicRepo()
	video := repo.add(&domain.Content{Name: "Clip", ContentType: domain.ContentTypeYouTubeVideo})
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, SameAsContentID: &video.ID, UserID: 8})
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateAudioTrack_RejectsCollectionsAndUnknownGenres(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: "https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx", Title: "x", UserID: 7})
	assert.ErrorIs(t, err, domain.ErrNotATrack)

	bad := 999999
	_, err = svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "x", GenreID: &bad, UserID: 7})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Empty(t, repo.rows)
}

func TestCreateAudioTrack_NotConfigured(t *testing.T) {
	svc := services.NewContentService(newFakeMusicRepo(), noYouTube(t), nil)
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "x"})
	assert.Error(t, err)
}

func TestSetTrackGenre_ValidatesAndUsesTheWindow(t *testing.T) {
	repo := newFakeMusicRepo()
	genres := newFakeGenres()
	svc := audioService(t, repo, newFakeAudioRepo(repo), genres)

	c, err := svc.SetTrackGenre(context.Background(), 5, 21, 7)
	require.NoError(t, err)
	assert.Equal(t, 21, *c.GenreID)

	_, err = svc.SetTrackGenre(context.Background(), 5, 424242, 7)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)

	genres.locked[6] = true
	_, err = svc.SetTrackGenre(context.Background(), 6, 21, 7)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)
}

func TestTrackLinkMethodsPassThrough(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", UserID: 7})
	require.NoError(t, err)

	links, err := svc.TrackLinksByContentIDs(context.Background(), []int{res.Content.ID, 999})
	require.NoError(t, err)
	assert.Len(t, links[res.Content.ID], 1)

	_, err = svc.MarkTrackLinkUnavailable(context.Background(), links[res.Content.ID][0].ID)
	assert.ErrorIs(t, err, domain.ErrNotFound, "a LISTEN link cannot be marked unavailable")

	got, err := svc.MusicGenres(context.Background())
	require.NoError(t, err)
	assert.Len(t, got, 3)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./test/services/ -run 'CreateAudioTrack_|SetTrackGenre_|TrackLinkMethods'`
Expected: FAIL to compile with `undefined: services.WithAudioTracks` and `undefined: portservices.CreateAudioTrackInput`.

- [ ] **Step 3: Implement**

In `backend/internal/core/ports/services/content_service.go`, add the types and the methods:

```go
// CreateAudioTrackInput is one add-track request (ADR 0005).
type CreateAudioTrackInput struct {
	URL             string
	Title           string // required for Spotify/Apple/Amazon (no lookup is made); ignored for YouTube Music
	Artist          string
	GenreID         *int
	SameAsContentID *int // the user confirmed "same song": attach the link to this track
	CreateNew       bool // the user said "different song": skip the same-song check
	UserID          int
}

// CreateAudioTrackResult: Content is nil exactly when Candidates is non-empty.
type CreateAudioTrackResult struct {
	Content        *domain.Content
	AlreadyExisted bool
	Candidates     []*domain.Content
}
```

```go
	// AUDIO_TRACK (ADRs 0001, 0005, 0006).
	CreateAudioTrack(ctx context.Context, in CreateAudioTrackInput) (*CreateAudioTrackResult, error)
	MusicGenres(ctx context.Context) ([]domain.MusicGenre, error)
	SetTrackGenre(ctx context.Context, contentID, genreID, userID int) (*domain.Content, error)
	TrackLinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
	MarkTrackLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error)
```

In `backend/internal/core/services/content_service.go`, add to the `ContentService` struct:

```go
	audio  repositories.AudioTrackRepository
	genres repositories.MusicGenreRepository
```

(Import `.../core/ports/repositories` if the file does not already.)

`backend/internal/core/services/content_audio_track.go`:

```go
package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/musiclinks"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	maxTrackTitleLength   = 200
	maxTrackArtistLength  = 200
	maxSameSongCandidates = 5
)

var errAudioTracksOff = errors.New("audio tracks are not configured")

// WithAudioTracks enables AUDIO_TRACK adds, track links and genres.
func WithAudioTracks(audio repositories.AudioTrackRepository, genres repositories.MusicGenreRepository) ContentServiceOption {
	return func(s *ContentService) { s.audio, s.genres = audio, genres }
}

// CreateAudioTrack adds one recording from a pasted link (ADR 0005). Dedupe
// order: (provider, id) and exact URL here; ISRC and MusicBrainz id on the
// YouTube Music path, which is the only one that learns them. A fuzzy
// same-title match is returned as Candidates and nothing is created until the
// caller answers with SameAsContentID or CreateNew.
func (s *ContentService) CreateAudioTrack(ctx context.Context, in portservices.CreateAudioTrackInput) (*portservices.CreateAudioTrackResult, error) {
	if s.audio == nil || s.genres == nil {
		return nil, errAudioTracksOff
	}
	link, err := musiclinks.Parse(in.URL)
	if err != nil {
		return nil, err
	}
	if in.GenreID != nil {
		if err := s.validateGenre(ctx, *in.GenreID); err != nil {
			return nil, err
		}
	}
	if in.SameAsContentID != nil {
		return s.attachToTrack(ctx, *in.SameAsContentID, link)
	}
	existing, err := s.existingByLink(ctx, link)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return &portservices.CreateAudioTrackResult{Content: existing, AlreadyExisted: true}, nil
	}
	if link.Provider == domain.ProviderYouTube {
		return s.createFromYouTubeLink(ctx, in, link)
	}
	return s.createLinkOnly(ctx, in, link)
}

func toTrackLink(contentID int, l musiclinks.Link) domain.TrackLink {
	return domain.TrackLink{ContentID: contentID, Provider: l.Provider, ProviderTrackID: l.ProviderTrackID,
		URL: l.CanonicalURL, Kind: l.Kind, Source: domain.TrackLinkSourcePasted}
}

// existingByLink: dedupe steps 3 and 4 (provider+id, then exact URL).
func (s *ContentService) existingByLink(ctx context.Context, link musiclinks.Link) (*domain.Content, error) {
	c, err := s.audio.GetByLink(ctx, link.Provider, link.ProviderTrackID)
	if err == nil && c != nil {
		return c, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing track link: %w", err)
	}
	c, err = s.repo.GetByURL(ctx, link.CanonicalURL)
	if err == nil && c != nil {
		return c, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}
	return nil, nil
}

// attachToTrack adds the pasted link to a track the user confirmed is the same song.
func (s *ContentService) attachToTrack(ctx context.Context, contentID int, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	target, err := s.repo.GetByID(ctx, contentID)
	if err != nil {
		return nil, err
	}
	if target.ContentType != domain.ContentTypeAudioTrack {
		return nil, domain.ErrNotFound
	}
	added, err := s.audio.AddLink(ctx, toTrackLink(target.ID, link))
	if err != nil {
		return nil, fmt.Errorf("failed to attach link: %w", err)
	}
	if !added {
		// The link already belongs to a track; that track is the answer.
		if owner, err := s.audio.GetByLink(ctx, link.Provider, link.ProviderTrackID); err == nil && owner != nil {
			return &portservices.CreateAudioTrackResult{Content: owner, AlreadyExisted: true}, nil
		}
	}
	return &portservices.CreateAudioTrackResult{Content: target, AlreadyExisted: true}, nil
}

// createLinkOnly stores a Spotify / Apple Music / Amazon Music link with the
// title and artist the user typed. No provider API is called (ADR 0002).
func (s *ContentService) createLinkOnly(ctx context.Context, in portservices.CreateAudioTrackInput, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = link.SuggestedTitle
	}
	artist := strings.TrimSpace(in.Artist)
	switch {
	case title == "":
		return nil, fmt.Errorf("%w: a title is required for %s links", domain.ErrInvalidInput, link.Provider)
	case len(title) > maxTrackTitleLength:
		return nil, fmt.Errorf("%w: title is longer than %d characters", domain.ErrInvalidInput, maxTrackTitleLength)
	case len(artist) > maxTrackArtistLength:
		return nil, fmt.Errorf("%w: artist is longer than %d characters", domain.ErrInvalidInput, maxTrackArtistLength)
	}

	if !in.CreateNew {
		cands, err := s.audio.FindSameSongCandidates(ctx, title, artist, maxSameSongCandidates)
		if err != nil {
			return nil, fmt.Errorf("failed to check same-song candidates: %w", err)
		}
		if len(cands) > 0 {
			return &portservices.CreateAudioTrackResult{Candidates: cands}, nil
		}
	}

	response, err := json.Marshal(map[string]domain.MusicFields{domain.ResponseKeyMusic: {Provider: link.Provider, Artist: artist}})
	if err != nil {
		return nil, err
	}
	url := link.CanonicalURL
	created, existed, err := s.audio.CreateWithLink(ctx, &domain.Content{
		Name: title, URL: &url, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: in.UserID,
		Response: response, GenreID: in.GenreID,
	}, toTrackLink(0, link))
	if err != nil {
		return nil, fmt.Errorf("failed to save track: %w", err)
	}
	return &portservices.CreateAudioTrackResult{Content: created, AlreadyExisted: existed}, nil
}

// createFromYouTubeLink — bridge until Task 9 folds the YouTube Music flow in.
func (s *ContentService) createFromYouTubeLink(ctx context.Context, in portservices.CreateAudioTrackInput, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	c, err := s.CreateAudioTrackFromYouTube(ctx, link.CanonicalURL, in.UserID)
	existed := errors.Is(err, domain.ErrAlreadyExists) && c != nil
	if err != nil && !existed {
		return nil, err
	}
	if _, err := s.audio.AddLink(ctx, toTrackLink(c.ID, link)); err != nil {
		slog.Warn("failed to record YouTube Music track link", "contentID", c.ID, "error", err)
	}
	return &portservices.CreateAudioTrackResult{Content: c, AlreadyExisted: existed}, nil
}

// MusicGenres is the seeded genre tree (cached by the repository).
func (s *ContentService) MusicGenres(ctx context.Context) ([]domain.MusicGenre, error) {
	if s.genres == nil {
		return nil, errAudioTracksOff
	}
	return s.genres.List(ctx)
}

func (s *ContentService) validateGenre(ctx context.Context, id int) error {
	genres, err := s.MusicGenres(ctx)
	if err != nil {
		return fmt.Errorf("failed to load genres: %w", err)
	}
	for _, g := range genres {
		if g.ID == id {
			return nil
		}
	}
	return fmt.Errorf("%w: unknown genre %d", domain.ErrInvalidInput, id)
}

// SetTrackGenre: anyone while empty; the adder within 30 days (ADR 0006).
func (s *ContentService) SetTrackGenre(ctx context.Context, contentID, genreID, userID int) (*domain.Content, error) {
	if err := s.validateGenre(ctx, genreID); err != nil {
		return nil, err
	}
	return s.genres.SetContentGenre(ctx, contentID, genreID, userID, domain.GenreChangeWindowDays)
}

func (s *ContentService) TrackLinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	if s.audio == nil {
		return nil, errAudioTracksOff
	}
	return s.audio.LinksByContentIDs(ctx, ids)
}

// MarkTrackLinkUnavailable records an embed error 101/150 for one link (ticket 03).
func (s *ContentService) MarkTrackLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error) {
	if s.audio == nil {
		return nil, errAudioTracksOff
	}
	return s.audio.MarkLinkUnavailable(ctx, linkID)
}
```

Add the five stubs to `mockContentService` in `backend/internal/adapters/graphql/directives/auth_test.go`. Use that file's own alias for the services port package (shown as `portservices` here):

```go
func (m *mockContentService) CreateAudioTrack(context.Context, portservices.CreateAudioTrackInput) (*portservices.CreateAudioTrackResult, error) {
	return nil, nil
}
func (m *mockContentService) MusicGenres(context.Context) ([]domain.MusicGenre, error) { return nil, nil }
func (m *mockContentService) SetTrackGenre(context.Context, int, int, int) (*domain.Content, error) {
	return nil, nil
}
func (m *mockContentService) TrackLinksByContentIDs(context.Context, []int) (map[int][]domain.TrackLink, error) {
	return nil, nil
}
func (m *mockContentService) MarkTrackLinkUnavailable(context.Context, int) (*domain.TrackLink, error) {
	return nil, nil
}
```

Find any other `ContentService` implementer and give it the same stubs:

```bash
grep -rln "func (.*) CreateFromMovie(ctx" /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend vet ./...`
Expected: no output.
Run: `go -C backend test ./test/services/ ./internal/adapters/graphql/...`
Expected: `ok` for every package.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): CreateAudioTrack with link-only adds, same-song candidates and genre setting"
```

---

### Task 9: Service: the YouTube Music path (age, explicit, MBID, uploads, batching, suggestion)

This task folds the old `CreateAudioTrackFromYouTube` into `CreateAudioTrack`. The YouTube Music flow now:
- refuses age-restricted videos;
- records the explicit badge;
- dedupes by ISRC and then by MusicBrainz id, adding the pasted link to the existing track instead of a related-media entry;
- never merges or prompts for an unofficial upload;
- batches the related-video lookup into one query;
- stores a genre suggestion without applying it;
- creates the content row and its link in one statement.

The resolver switches to `CreateAudioTrack` (still with the old input type until Task 10).

**Files:**
- Modify: `backend/internal/core/ports/services/youtube_client.go` (`VideoMetadata.AgeRestricted`)
- Modify: `backend/internal/core/ports/services/music_clients.go` (`YTMusicTrack.Explicit`)
- Modify: `backend/internal/adapters/youtube/client.go` (`contentRating`)
- Modify: `backend/internal/adapters/ytmusic/client.go` (`badges`)
- Modify: `backend/internal/core/services/content_music.go` (remove `CreateAudioTrackFromYouTube`; update `enrichMusic` and `linkExistingVideos`)
- Modify: `backend/internal/core/services/content_audio_track.go` (the real `createFromYouTubeLink`)
- Modify: `backend/internal/core/ports/services/content_service.go` (drop `CreateAudioTrackFromYouTube`) and `directives/auth_test.go` (drop its stub)
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go` (`CreateAudioTrack`) and `helpers.go` (`audioTrackError`)
- Test: `backend/internal/adapters/youtube/client_http_test.go`, `backend/internal/adapters/ytmusic/client_test.go`, `backend/test/services/content_music_test.go`, `backend/test/resolvers/content_music_resolver_test.go`, `backend/test/resolvers/content_resolver_test.go` (setup option) and `backend/test/resolvers/audio_track_mocks_test.go` (new)

**Interfaces:**
- Consumes: everything from Task 8; `domain.MatchGenre` (Task 5); `AudioTrackRepository.GetByMusicBrainzID` and `ContentByURLs` (Task 6).
- Produces:
  - `portservices.VideoMetadata.AgeRestricted bool`;
  - `portservices.YTMusicTrack.Explicit bool`;
  - `response.music.explicit` and `response.music.suggestedGenreId`;
  - the resolver helper `audioTrackError(err error) error`;
  - test helper `setupTestServerWithRepos(repo, yt, perspectiveRepo, userRepo, opts ...services.ContentServiceOption)`;
  - test mocks `mockAudioTrackRepository` and `mockMusicGenreRepository` in `test/resolvers`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/internal/adapters/youtube/client_http_test.go`:

```go
func TestClient_GetVideoMetadata_AgeRestriction(t *testing.T) {
	restricted := `{"items":[{"snippet":{"title":"T","channelTitle":"C"},"contentDetails":{"duration":"PT3M","contentRating":{"ytRating":"ytAgeRestricted"}},"statistics":{}}]}`
	c := newHTTPTestClient(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(restricted)) })
	meta, err := c.GetVideoMetadata(context.Background(), "abc123DEF45")
	require.NoError(t, err)
	assert.True(t, meta.AgeRestricted)

	ok := newHTTPTestClient(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(okVideoJSON)) })
	meta, err = ok.GetVideoMetadata(context.Background(), "abc123DEF45")
	require.NoError(t, err)
	assert.False(t, meta.AgeRestricted)
	assert.NotContains(t, string(meta.Response), "contentRating", "an absent rating is not stored")
}
```

Append to `backend/internal/adapters/ytmusic/client_test.go`:

```go
func TestToTrack_ExplicitBadge(t *testing.T) {
	var v videoRenderer
	require.NoError(t, json.Unmarshal([]byte(`{"videoId":"X","title":{"runs":[{"text":"Song"}]},`+
		`"badges":[{"musicInlineBadgeRenderer":{"icon":{"iconType":"MUSIC_EXPLICIT_BADGE"}}}]}`), &v))
	assert.True(t, toTrack(&v).Explicit)

	var clean videoRenderer
	require.NoError(t, json.Unmarshal([]byte(`{"videoId":"Y","title":{"runs":[{"text":"Song"}]}}`), &clean))
	assert.False(t, toTrack(&clean).Explicit)
}
```

(Add `"encoding/json"` to that file's imports if it is missing.)

In `backend/test/services/content_music_test.go`, the YouTube tests now go through `CreateAudioTrack`. Add a helper next to `musicURL` that keeps every existing assertion meaningful:

```go
// createYT adds a YouTube Music link the way the resolver does, mapping
// AlreadyExisted back to ErrAlreadyExists so the older assertions still read.
func createYT(svc *services.ContentService, url string, userID int) (*domain.Content, error) {
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: url, UserID: userID})
	if err != nil {
		return nil, err
	}
	if res.AlreadyExisted {
		return res.Content, domain.ErrAlreadyExists
	}
	return res.Content, nil
}
```

Then apply these mechanical edits to the file:

```bash
sed -i '' -E 's/svc\.CreateAudioTrackFromYouTube\(context\.Background\(\), /createYT(svc, /g' backend/test/services/content_music_test.go
```
```bash
sed -i '' -E 's/services\.NewContentService\(repo, (.*), syncRunner\(\)\)/services.NewContentService(repo, \1, syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))/' backend/test/services/content_music_test.go
```

After the second sed, check that every `NewContentService(repo, …)` in the file carries `WithAudioTracks`:

```bash
grep -n "NewContentService(" backend/test/services/content_music_test.go
```

Any line without it gets `services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres())` by hand. Tests that need to inspect the audio fake construct it first: `audio := newFakeAudioRepo(repo)`.

Hand edits to existing tests:
- In `TestCreateFromYouTubeMusic_FullEnrichment`, replace `assert.Equal(t, []bool{false}, repo.upserts, …)` with the audio-fake assertion below. Construct `audio := newFakeAudioRepo(repo)` and pass it in `WithAudioTracks(audio, newFakeGenres())`.

  ```go
  	assert.Equal(t, 1, audio.calls["CreateWithLink"], "content and its first link are one statement")
  	assert.Equal(t, 1, audio.calls["ContentByURLs"], "related videos are looked up in one batch")
  	require.Len(t, audio.linksFor(c.ID), 1)
  	assert.Equal(t, domain.TrackLinkKindEmbed, audio.linksFor(c.ID)[0].Kind)
  ```
- The duplicate-ISRC test (the one asserting `AddedFrom: "duplicate-isrc"`) now asserts a track link on the existing row, and no new related-media entry:

  ```go
  	links := audio.linksFor(existing.ID)
  	require.Len(t, links, 2, "the pasted YouTube Music link joins the existing track (ADR 0005)")
  	assert.Equal(t, domain.ProviderYouTube, links[1].Provider)
  ```

  Seed `existing` through `createYT` with a first URL so that it has its own link. Then paste a second YouTube Music URL whose fake MusicBrainz match returns the same ISRC.
- Any test using `GetByURL` to pre-seed a duplicate keeps working, because `existingByLink` falls back to `GetByURL`.

Append these new tests:

```go
func TestCreateAudioTrack_YouTube_RefusesAgeRestricted(t *testing.T) {
	repo := newFakeMusicRepo()
	yt := &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		return &portservices.VideoMetadata{Title: "Song", Duration: 200, AgeRestricted: true, Response: json.RawMessage(`{"items":[]}`)}, nil
	}}
	svc := services.NewContentService(repo, yt, nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(),
		services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))
	_, err := createYT(svc, musicURL, 7)
	assert.ErrorIs(t, err, domain.ErrContentNotAllowed)
	assert.Empty(t, repo.rows)
}

func TestCreateAudioTrack_YouTube_StoresExplicitAndSuggestsGenreWithoutApplying(t *testing.T) {
	repo := newFakeMusicRepo()
	track := fullTrack()
	track.track.Explicit = true
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(track, isrcMatch(), nil), syncRunner(),
		services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)
	m := domain.ReadMusic(c.Response)
	assert.True(t, m.Explicit)
	require.NotNil(t, m.SuggestedGenreID, "MusicBrainz genre 'rock' matches Rock (21)")
	assert.Equal(t, 21, *m.SuggestedGenreID)
	assert.Nil(t, c.GenreID, "suggest, never apply (ADR 0006)")
}

func TestCreateAudioTrack_YouTube_DedupesByMusicBrainzID(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	existing := repo.add(&domain.Content{Name: "Bohemian Rhapsody", ContentType: domain.ContentTypeAudioTrack,
		Response: json.RawMessage(`{"music":{"provider":"spotify","musicbrainzId":"mbid-1"}}`)})
	mb := &fakeMB{rec: &portservices.Recording{MBID: "mbid-1", Genre: "rock"}} // no ISRC
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), mb, nil), syncRunner(),
		services.WithAudioTracks(audio, newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, existing.ID, c.ID)
	require.Len(t, audio.linksFor(existing.ID), 1)
	assert.Equal(t, audioID, audio.linksFor(existing.ID)[0].ProviderTrackID)
	assert.Len(t, repo.rows, 1)
}

func TestCreateAudioTrack_YouTube_UnofficialUploadIsNeverMerged(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	repo.add(&domain.Content{Name: "Bohemian Rhapsody", ContentType: domain.ContentTypeAudioTrack,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Queen","isrc":"GBUM71029604"}}`)})
	upload := fullTrack()
	upload.track.VideoType = "other"
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(upload, isrcMatch(), nil), syncRunner(),
		services.WithAudioTracks(audio, newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err, "same ISRC and same title, but an unofficial upload is its own track (ADR 0005)")
	assert.True(t, domain.IsUnofficialUpload(domain.ReadMusic(c.Response)))
	assert.Len(t, repo.rows, 2)
	assert.Zero(t, audio.calls["FindSameSongCandidates"], "no same-song prompt for uploads")
}

func TestCreateAudioTrack_YouTube_OffersSameSongCandidates(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	linkOnly := repo.add(&domain.Content{Name: "Bohemian Rhapsody", ContentType: domain.ContentTypeAudioTrack,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Queen"}}`)})
	svc := services.NewContentService(repo, ytMeta(audioID), nil,
		services.WithMusicEnrichment(fullTrack(), &fakeMB{err: domain.ErrNotFound}, nil), syncRunner(),
		services.WithAudioTracks(audio, newFakeGenres()))

	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: musicURL, UserID: 7})
	require.NoError(t, err)
	assert.Nil(t, res.Content)
	require.Len(t, res.Candidates, 1)
	assert.Equal(t, linkOnly.ID, res.Candidates[0].ID)
}
```

Create `backend/test/resolvers/audio_track_mocks_test.go`:

```go
package resolvers_test

import (
	"context"
	"slices"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type mockAudioTrackRepository struct {
	createWithLinkFn      func(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error)
	findSameSongFn        func(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error)
	linksByContentIDsFn   func(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
	markLinkUnavailableFn func(ctx context.Context, id int) (*domain.TrackLink, error)
	linksCalls            int
}

func (m *mockAudioTrackRepository) CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
	if m.createWithLinkFn != nil {
		return m.createWithLinkFn(ctx, c, link)
	}
	c.ID = 1
	return c, false, nil
}
func (m *mockAudioTrackRepository) AddLink(context.Context, domain.TrackLink) (bool, error) { return true, nil }
func (m *mockAudioTrackRepository) GetByLink(context.Context, domain.TrackProvider, string) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockAudioTrackRepository) GetByMusicBrainzID(context.Context, string) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockAudioTrackRepository) FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error) {
	if m.findSameSongFn != nil {
		return m.findSameSongFn(ctx, title, artist, limit)
	}
	return nil, nil
}
func (m *mockAudioTrackRepository) ContentByURLs(context.Context, []string) (map[string]*domain.Content, error) {
	return map[string]*domain.Content{}, nil
}
func (m *mockAudioTrackRepository) LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	m.linksCalls++
	if m.linksByContentIDsFn != nil {
		return m.linksByContentIDsFn(ctx, ids)
	}
	return map[int][]domain.TrackLink{}, nil
}
func (m *mockAudioTrackRepository) MarkLinkUnavailable(ctx context.Context, id int) (*domain.TrackLink, error) {
	if m.markLinkUnavailableFn != nil {
		return m.markLinkUnavailableFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

type mockMusicGenreRepository struct {
	list  []domain.MusicGenre
	setFn func(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error)
}

func newMockGenres() *mockMusicGenreRepository {
	parent := 19
	return &mockMusicGenreRepository{list: []domain.MusicGenre{
		{ID: 21, Name: "Rock", AppleName: "Rock"},
		{ID: 19, Name: "Regional & Cultural", AppleName: "Worldwide"},
		{ID: 1188, Name: "Polka", AppleName: "Polka", ParentID: &parent},
	}}
}

func (m *mockMusicGenreRepository) List(context.Context) ([]domain.MusicGenre, error) {
	return slices.Clone(m.list), nil
}
func (m *mockMusicGenreRepository) SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error) {
	if m.setFn != nil {
		return m.setFn(ctx, contentID, genreID, userID, windowDays)
	}
	return &domain.Content{ID: contentID, ContentType: domain.ContentTypeAudioTrack, GenreID: &genreID}, nil
}
```

In `backend/test/resolvers/content_resolver_test.go`, give `setupTestServerWithRepos` a variadic option list. It is passed straight to `NewContentService`, and existing callers are unchanged:

```go
func setupTestServerWithRepos(repo *mockContentRepository, ytClient *mockYouTubeClient, perspectiveRepo *mockPerspectiveRepository, userRepo *mockUserRepository, opts ...services.ContentServiceOption) *httptest.Server {
	categoryRepo := &mockCategoryRepository{}
	wikidataClient := &mockWikidataClient{}
	contentService := services.NewContentService(repo, ytClient, nil, opts...)
	// ... rest unchanged
```

In `backend/test/resolvers/content_music_resolver_test.go`:
- In `TestCreateContentFromYouTubeMusic_Success`, move the row-creating stub to the audio mock and build the server with it:

  ```go
  	audio := &mockAudioTrackRepository{createWithLinkFn: func(_ context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
  		c.ID = 5
  		assert.Equal(t, domain.TrackLinkKindEmbed, link.Kind)
  		return c, false, nil
  	}}
  	server := setupTestServerWithRepos(&mockContentRepository{}, musicYT(), &mockPerspectiveRepository{}, &mockUserRepository{},
  		services.WithAudioTracks(audio, newMockGenres()))
  ```

  (Add the `services` import if missing.)
- In the error-table test, build the server the same way (with an empty `&mockAudioTrackRepository{}`), and change the plain-YouTube expectation to the new message:

  ```go
  		"https://www.youtube.com/watch?v=dQw4w9WgXcQ":       "unsupported music link",
  ```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./internal/adapters/youtube/ ./internal/adapters/ytmusic/ ./test/services/ ./test/resolvers/`
Expected: FAIL to compile with `meta.AgeRestricted undefined`, `toTrack(&v).Explicit undefined` and `unknown field AgeRestricted`.

- [ ] **Step 3: Implement**

Ports:

```go
// youtube_client.go, VideoMetadata:
	// AgeRestricted: contentDetails.contentRating.ytRating == "ytAgeRestricted".
	// Age-restricted tracks are refused (ticket 03).
	AgeRestricted bool
```
```go
// music_clients.go, YTMusicTrack:
	// Explicit: the track carries YouTube Music's explicit badge.
	Explicit bool
```

`backend/internal/adapters/youtube/client.go`. In `YouTubeAPIItem.ContentDetails`:

```go
	ContentDetails struct {
		Duration string `json:"duration"`
		// Pointer + omitempty: absent for almost every video, and then not stored.
		ContentRating *struct {
			YtRating string `json:"ytRating,omitempty"`
		} `json:"contentRating,omitempty"`
	} `json:"contentDetails"`
```

and in the `return &services.VideoMetadata{…}` literal:

```go
		AgeRestricted: item.ContentDetails.ContentRating != nil && item.ContentDetails.ContentRating.YtRating == "ytAgeRestricted",
```

`backend/internal/adapters/ytmusic/client.go`. Add to `videoRenderer`:

```go
	Badges []struct {
		MusicInlineBadgeRenderer struct {
			Icon struct {
				IconType string `json:"iconType"`
			} `json:"icon"`
		} `json:"musicInlineBadgeRenderer"`
	} `json:"badges"`
```

and in `toTrack`, after building `t`:

```go
	for _, b := range v.Badges {
		if b.MusicInlineBadgeRenderer.Icon.IconType == "MUSIC_EXPLICIT_BADGE" {
			t.Explicit = true
		}
	}
```

In `content_music.go`:
- In `enrichMusic`'s success branch, add `m.Explicit = track.Explicit`.
- Replace `linkExistingVideos` with the batched version:

  ```go
  // linkExistingVideos sets ContentID on references that already exist as
  // YOUTUBE rows, in one query for the whole list.
  func (s *ContentService) linkExistingVideos(ctx context.Context, refs []domain.RelatedMedia) []domain.RelatedMedia {
  	if len(refs) == 0 || s.audio == nil {
  		return refs
  	}
  	urls := make([]string, len(refs))
  	for i := range refs {
  		urls[i] = youtube.NormalizeYouTubeURL(refs[i].VideoID)
  	}
  	found, err := s.audio.ContentByURLs(ctx, urls)
  	if err != nil {
  		slog.Warn("failed to look up existing related videos", "error", err)
  		return refs
  	}
  	for i := range refs {
  		if c, ok := found[urls[i]]; ok {
  			id := c.ID
  			refs[i].ContentID = &id
  		}
  	}
  	return refs
  }
  ```

- Delete the exported `CreateAudioTrackFromYouTube` method entirely; its flow moves into `createFromYouTubeLink` below. If other code in `content_music.go` calls it, `go build` will name the call site. Point it at `CreateAudioTrack`.

In `content_audio_track.go`, replace the bridge `createFromYouTubeLink` with:

```go
// createFromYouTubeLink is the YouTube Music flow: Data API (fatal), then
// best-effort InnerTube + MusicBrainz enrichment (ADR 0002).
func (s *ContentService) createFromYouTubeLink(ctx context.Context, in portservices.CreateAudioTrackInput, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	videoID := link.ProviderTrackID
	metadata, err := s.youtubeClient.GetVideoMetadata(ctx, videoID)
	if err != nil {
		slog.Error("failed to fetch YouTube metadata for audio track", "videoID", videoID, "userID", in.UserID, "error", err)
		return nil, fmt.Errorf("failed to fetch video metadata")
	}
	if metadata.AgeRestricted {
		return nil, domain.ErrContentNotAllowed
	}

	enrichCtx, cancel := context.WithTimeout(ctx, musicEnrichTimeout)
	defer cancel()
	e := s.enrichMusic(enrichCtx, videoID, metadata)
	unofficial := domain.IsUnofficialUpload(e.music)

	// Dedupe steps 1-2 (ISRC, MusicBrainz id). Never for unofficial uploads (ADR 0005).
	if !unofficial {
		existing, err := s.existingByIdentifier(ctx, e.music)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			if _, err := s.audio.AddLink(ctx, toTrackLink(existing.ID, link)); err != nil {
				slog.Warn("failed to add YouTube Music link to existing track", "contentID", existing.ID, "error", err)
			}
			return &portservices.CreateAudioTrackResult{Content: existing, AlreadyExisted: true}, nil
		}
	}

	title := e.title
	if title == "" {
		title = metadata.Title
	}
	if !unofficial && !in.CreateNew {
		cands, err := s.audio.FindSameSongCandidates(ctx, title, e.music.Artist, maxSameSongCandidates)
		if err != nil {
			return nil, fmt.Errorf("failed to check same-song candidates: %w", err)
		}
		if len(cands) > 0 {
			return &portservices.CreateAudioTrackResult{Candidates: cands}, nil
		}
	}

	if g := s.suggestGenre(ctx, e.music.Genre); g != nil {
		id := g.ID
		e.music.SuggestedGenreID = &id // suggest, never apply (ADR 0006)
	}
	related := s.linkExistingVideos(ctx, e.relatedMedia)
	response, err := buildMusicResponse(metadata.Response, e.music, related)
	if err != nil {
		return nil, fmt.Errorf("failed to build music response: %w", err)
	}

	lengthUnits := "seconds"
	url := link.CanonicalURL
	created, existed, err := s.audio.CreateWithLink(ctx, &domain.Content{
		Name: title, URL: &url, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: in.UserID,
		Length: &metadata.Duration, LengthUnits: &lengthUnits, Response: response, GenreID: in.GenreID,
	}, toTrackLink(0, link))
	if err != nil {
		return nil, fmt.Errorf("failed to save track: %w", err)
	}
	if existed {
		return &portservices.CreateAudioTrackResult{Content: created, AlreadyExisted: true}, nil
	}

	id := created.ID
	s.runAsync(func() {
		bg, cancel := context.WithTimeout(context.Background(), lyricsCheckTimeout)
		defer cancel()
		if _, err := s.CheckLyrics(bg, id, true); err != nil {
			slog.Warn("background lyrics check failed", "contentID", id, "error", err)
		}
	})
	return &portservices.CreateAudioTrackResult{Content: created}, nil
}

func (s *ContentService) existingByIdentifier(ctx context.Context, m domain.MusicFields) (*domain.Content, error) {
	if m.ISRC != "" {
		c, err := s.repo.GetByISRC(ctx, m.ISRC)
		if err == nil && c != nil {
			return c, nil
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing isrc: %w", err)
		}
	}
	if m.MusicBrainzID != "" {
		c, err := s.audio.GetByMusicBrainzID(ctx, m.MusicBrainzID)
		if err == nil && c != nil {
			return c, nil
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing musicbrainz id: %w", err)
		}
	}
	return nil, nil
}

// suggestGenre maps a provider genre string onto the seeded tree. Source order
// (ADR 0006): the pasted provider (YouTube gives none), Apple (not called in
// v1), then MusicBrainz. No match means no suggestion.
func (s *ContentService) suggestGenre(ctx context.Context, name string) *domain.MusicGenre {
	if name == "" {
		return nil
	}
	genres, err := s.MusicGenres(ctx)
	if err != nil {
		slog.Warn("genre suggestion skipped", "error", err)
		return nil
	}
	return domain.MatchGenre(name, genres)
}
```

Remove `CreateAudioTrackFromYouTube` from the `ContentService` port and from `mockContentService` in `directives/auth_test.go`.

In `backend/internal/adapters/graphql/resolvers/helpers.go`, add:

```go
// audioTrackError maps CreateAudioTrack failures to user-facing messages.
func audioTrackError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotATrack):
		return fmt.Errorf("paste a song link, not an album, playlist, or artist")
	case errors.Is(err, domain.ErrInvalidURL):
		return fmt.Errorf("unsupported music link: paste a YouTube Music, Spotify, Apple Music or Amazon Music song link")
	case errors.Is(err, domain.ErrInvalidInput):
		return err
	case errors.Is(err, domain.ErrNotFound):
		return fmt.Errorf("track not found")
	case errors.Is(err, domain.ErrContentNotAllowed):
		return &gqlerror.Error{Message: domain.ErrContentNotAllowed.Error(), Extensions: map[string]any{"code": "CONTENT_NOT_ALLOWED"}}
	}
	slog.Error("creating audio track failed", "error", err)
	return fmt.Errorf("failed to add track")
}
```

(Import `github.com/vektah/gqlparser/v2/gqlerror`, as `content.resolvers.go` does, plus `errors` and `fmt` if missing.)

In `content.resolvers.go`, `CreateAudioTrack` now reads (old input type, final service call):

```go
func (r *mutationResolver) CreateAudioTrack(ctx context.Context, input model.CreateContentFromYouTubeInput) (*model.CreateContentResult, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	if input.UserID != 0 && input.UserID != authUser.ID {
		return nil, fmt.Errorf("access denied: cannot create content for another user")
	}
	res, err := r.ContentService.CreateAudioTrack(ctx, portservices.CreateAudioTrackInput{URL: input.URL, UserID: authUser.ID, CreateNew: true})
	if err != nil {
		return nil, audioTrackError(err)
	}
	return &model.CreateContentResult{Content: domainToModel(res.Content), AlreadyExisted: res.AlreadyExisted}, nil
}
```

(`CreateNew: true` until Task 10 adds the candidates field. The frontend cannot show a prompt yet.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend vet ./...`
Expected: no output.
Run: `go -C backend test ./internal/... ./test/...`
Expected: `ok` for every package. The roundtrip tests skip without `DATABASE_URL`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): fold YouTube Music into CreateAudioTrack (age, explicit, MBID dedupe, uploads, genre suggestion)"
```

---

### Task 10: GraphQL schema, resolvers, dataloader, wiring, roundtrips

**Files:**
- Modify: `backend/schema.graphql` and `backend/gqlgen.yml`
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go`, `helpers.go` and the query resolver file holding `ContentByID` (for `musicGenres`)
- Modify: `backend/internal/adapters/graphql/dataloader/dataloader.go`
- Modify: `backend/cmd/server/main.go` and `backend/test/roundtrips/harness_test.go`
- Test: `backend/test/resolvers/audio_track_resolver_test.go`, `backend/internal/adapters/graphql/dataloader/track_link_loader_test.go` and `backend/test/roundtrips/audio_track_test.go`

**Interfaces:**
- Consumes: every service method from Tasks 8–9.
- Produces (the GraphQL contract the frontend tasks use):
  ```graphql
  enum TrackLinkKind { LISTEN EMBED }
  enum TrackLinkSource { PASTED MATCHED }
  type TrackLink { id: ID! provider: String! providerTrackId: String! url: String! kind: TrackLinkKind! source: TrackLinkSource! unavailableAt: String }
  type MusicGenre { id: ID! name: String! parentId: ID }
  input CreateAudioTrackInput { url: String! title: String artist: String genreId: IntID sameAsContentId: IntID createNew: Boolean }
  type CreateAudioTrackResult { content: Content alreadyExisted: Boolean! sameSongCandidates: [Content!]! }
  # Content gains: genreId: ID, genre: MusicGenre, trackLinks: [TrackLink!]!
  # Query: musicGenres: [MusicGenre!]!
  # Mutation: createAudioTrack(input: CreateAudioTrackInput!): CreateAudioTrackResult! @auth
  #           setTrackGenre(contentId: IntID!, genreId: IntID!): Content! @auth
  #           markTrackLinkUnavailable(linkId: IntID!): TrackLink! @auth
  ```
- Dataloader: `Loaders.TrackLinksByContentID *dataloadgen.Loader[int, []domain.TrackLink]`. Every requested key resolves, to an empty slice when the content has no links.
- Statement budgets (pinned in roundtrips):

  | Operation | Statements | Breakdown |
  |---|---|---|
  | new link-only `createAudioTrack` | 4 | |
  | repeat paste | 1 | |
  | `setTrackGenre` | 1 | genre cache warm |
  | `musicGenres` | 0 | cache warm |
  | details `contentByID` with `genre` and `trackLinks` | 2 | content + one batched links query |

- [ ] **Step 1: Write the failing tests**

`backend/test/resolvers/audio_track_resolver_test.go`:

```go
package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

func audioServer(t *testing.T, repo *mockContentRepository, audio *mockAudioTrackRepository, genres *mockMusicGenreRepository) func(string) graphqlResponse {
	server := setupTestServerWithRepos(repo, musicYT(), &mockPerspectiveRepository{}, &mockUserRepository{}, services.WithAudioTracks(audio, genres))
	t.Cleanup(server.Close)
	return func(q string) graphqlResponse { return executeGraphQL(t, server, q) }
}

func TestCreateAudioTrack_SpotifyLinkOnly(t *testing.T) {
	audio := &mockAudioTrackRepository{createWithLinkFn: func(_ context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
		assert.Equal(t, domain.ProviderSpotify, link.Provider)
		assert.Equal(t, 21, *c.GenreID)
		c.ID = 40
		return c, false, nil
	}}
	run := audioServer(t, &mockContentRepository{}, audio, newMockGenres())

	res := run(`mutation { createAudioTrack(input: { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "Song", artist: "Queen", genreId: 21 }) {
		content { id name contentType genreId audioTrack } alreadyExisted sameSongCandidates { id } } }`)
	require.Empty(t, res.Errors)
	var data struct {
		Create struct {
			Content struct {
				ID          string         `json:"id"`
				Name        string         `json:"name"`
				ContentType string         `json:"contentType"`
				GenreID     string         `json:"genreId"`
				AudioTrack  map[string]any `json:"audioTrack"`
			} `json:"content"`
			AlreadyExisted bool             `json:"alreadyExisted"`
			Candidates     []map[string]any `json:"sameSongCandidates"`
		} `json:"createAudioTrack"`
	}
	require.NoError(t, json.Unmarshal(res.Data, &data))
	assert.Equal(t, "40", data.Create.Content.ID)
	assert.Equal(t, "AUDIO_TRACK", data.Create.Content.ContentType)
	assert.Equal(t, "21", data.Create.Content.GenreID)
	assert.Equal(t, "Queen", data.Create.Content.AudioTrack["artist"])
	assert.Empty(t, data.Create.Candidates)
}

func TestCreateAudioTrack_ReturnsCandidatesWithoutContent(t *testing.T) {
	audio := &mockAudioTrackRepository{findSameSongFn: func(context.Context, string, string, int) ([]*domain.Content, error) {
		return []*domain.Content{{ID: 3, Name: "Song", ContentType: domain.ContentTypeAudioTrack}}, nil
	}}
	run := audioServer(t, &mockContentRepository{}, audio, newMockGenres())
	res := run(`mutation { createAudioTrack(input: { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "Song" }) {
		content { id } alreadyExisted sameSongCandidates { id name } } }`)
	require.Empty(t, res.Errors)
	assert.JSONEq(t, `{"createAudioTrack":{"content":null,"alreadyExisted":false,"sameSongCandidates":[{"id":"3","name":"Song"}]}}`, string(res.Data))
}

func TestCreateAudioTrack_ErrorMessages(t *testing.T) {
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, newMockGenres())
	cases := map[string]string{
		`{ url: "https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx", title: "x" }`: "paste a song link, not an album, playlist, or artist",
		`{ url: "https://soundcloud.com/a/b", title: "x" }`:                            "unsupported music link",
		`{ url: "https://music.amazon.com/tracks/B07D5J5QX3" }`:                        "a title is required",
		`{ url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "x", genreId: 5 }`: "unknown genre",
	}
	for input, want := range cases {
		res := run(`mutation { createAudioTrack(input: ` + input + `) { alreadyExisted } }`)
		require.NotEmpty(t, res.Errors, input)
		assert.Contains(t, res.Errors[0].Message, want, input)
	}
}

// Review Focus 2.
func TestSetTrackGenre_LockedMessage(t *testing.T) {
	genres := newMockGenres()
	genres.setFn = func(context.Context, int, int, int, int) (*domain.Content, error) { return nil, domain.ErrGenreLocked }
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, genres)
	res := run(`mutation { setTrackGenre(contentId: 5, genreId: 21) { id } }`)
	require.NotEmpty(t, res.Errors)
	assert.Equal(t, "genre can only be changed by the person who added this track, within 30 days of adding it", res.Errors[0].Message)
}

func TestSetTrackGenre_ReturnsGenre(t *testing.T) {
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, newMockGenres())
	res := run(`mutation { setTrackGenre(contentId: 5, genreId: 1188) { id genreId genre { id name parentId } } }`)
	require.Empty(t, res.Errors)
	assert.JSONEq(t, `{"setTrackGenre":{"id":"5","genreId":"1188","genre":{"id":"1188","name":"Polka","parentId":"19"}}}`, string(res.Data))
}

func TestMusicGenres_ListsTheTree(t *testing.T) {
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, newMockGenres())
	res := run(`{ musicGenres { id name parentId } }`)
	require.Empty(t, res.Errors)
	assert.Contains(t, string(res.Data), `{"id":"19","name":"Regional & Cultural","parentId":null}`)
}

func TestContentTrackLinks_OnlyForTracks(t *testing.T) {
	u := "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
	repo := &mockContentRepository{getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
		if id == 1 {
			return &domain.Content{ID: 1, Name: "Song", URL: &u, ContentType: domain.ContentTypeAudioTrack}, nil
		}
		return &domain.Content{ID: 2, Name: "Clip", ContentType: domain.ContentTypeYouTubeVideo}, nil
	}}
	audio := &mockAudioTrackRepository{linksByContentIDsFn: func(_ context.Context, ids []int) (map[int][]domain.TrackLink, error) {
		assert.Equal(t, []int{1}, ids, "non-track rows never reach the links query")
		return map[int][]domain.TrackLink{1: {{ID: 9, ContentID: 1, Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC", URL: u,
			Kind: domain.TrackLinkKindListen, Source: domain.TrackLinkSourcePasted}}}, nil
	}}
	run := audioServer(t, repo, audio, newMockGenres())
	res := run(`{ a: contentByID(id: 1) { trackLinks { id provider kind source unavailableAt } } b: contentByID(id: 2) { trackLinks { id } } }`)
	require.Empty(t, res.Errors)
	assert.JSONEq(t, `{"a":{"trackLinks":[{"id":"9","provider":"spotify","kind":"LISTEN","source":"PASTED","unavailableAt":null}]},"b":{"trackLinks":[]}}`, string(res.Data))
	assert.Equal(t, 1, audio.linksCalls)
}

func TestMarkTrackLinkUnavailable(t *testing.T) {
	audio := &mockAudioTrackRepository{markLinkUnavailableFn: func(_ context.Context, id int) (*domain.TrackLink, error) {
		return &domain.TrackLink{ID: id, Provider: domain.ProviderYouTube, Kind: domain.TrackLinkKindEmbed, Source: domain.TrackLinkSourcePasted}, nil
	}}
	run := audioServer(t, &mockContentRepository{}, audio, newMockGenres())
	res := run(`mutation { markTrackLinkUnavailable(linkId: 9) { id kind unavailableAt } }`)
	require.Empty(t, res.Errors)
	assert.Contains(t, string(res.Data), `"id":"9"`)
}
```

`backend/internal/adapters/graphql/dataloader/track_link_loader_test.go`:

```go
package dataloader

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

type trackLinkService struct {
	portservices.ContentService
	calls int
}

func (s *trackLinkService) TrackLinksByContentIDs(_ context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	s.calls++
	return map[int][]domain.TrackLink{1: {{ID: 9, ContentID: 1}}}, nil
}

func TestTrackLinksByContentID_BatchesAndFillsMissingKeys(t *testing.T) {
	svc := &trackLinkService{}
	l := NewLoaders(Services{Content: svc})
	got, err := l.TrackLinksByContentID.LoadAll(context.Background(), []int{1, 2, 3})
	require.NoError(t, err, "a track with no links is an empty list, not an error")
	assert.Equal(t, 1, svc.calls)
	assert.Len(t, got[0], 1)
	assert.Empty(t, got[1])
	assert.Empty(t, got[2])
}
```

`backend/test/roundtrips/audio_track_test.go`:

```go
package roundtrips

import (
	"fmt"
	"testing"
	"time"
)

const createAudioTrackMutation = `mutation($input: CreateAudioTrackInput!) {
  createAudioTrack(input: $input) { content { id name } alreadyExisted sameSongCandidates { id } }
}`

type createAudioTrackResult struct {
	Content *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"content"`
	AlreadyExisted bool `json:"alreadyExisted"`
}

func TestCreateAudioTrackLinkOnly(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("audio")
	h.warm(token)
	h.gql(token, `{ musicGenres { id } }`, nil) // warm the genre cache

	trackID := fmt.Sprintf("%022d", time.Now().UnixNano())[:22]
	vars := map[string]any{"input": map[string]any{
		"url": "https://open.spotify.com/track/" + trackID, "title": "RT Song " + trackID, "artist": "RT Artist", "genreId": 21,
	}}

	// GetByLink, GetByURL, same-song candidates, one CTE (content + first link)
	data := h.roundTrips(4, token, createAudioTrackMutation, vars)
	created := decode[createAudioTrackResult](t, data, "createAudioTrack")
	if created.Content == nil || created.AlreadyExisted {
		t.Fatalf("first add should create a row: %+v", created)
	}
	h.trackContent(created.Content.ID)

	// GetByLink finds it
	data = h.roundTrips(1, token, createAudioTrackMutation, vars)
	if again := decode[createAudioTrackResult](t, data, "createAudioTrack"); !again.AlreadyExisted {
		t.Fatalf("repeat paste should return the existing row: %+v", again)
	}

	// One owner/window-scoped UPDATE ... RETURNING (the adder, inside 30 days)
	h.roundTrips(1, token, `mutation($id: IntID!) { setTrackGenre(contentId: $id, genreId: 14) { id genreId } }`,
		map[string]any{"id": created.Content.ID})

	// Served from the genre cache
	h.roundTrips(0, token, `{ musicGenres { id name parentId } }`, nil)

	// SELECT content, one batched track_links query; genre comes from the cache
	h.roundTrips(2, token, `query($id: ID!) { contentByID(id: $id) { id genre { name } trackLinks { provider url kind } } }`,
		map[string]any{"id": created.Content.ID})
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go -C backend test ./test/resolvers/ ./internal/adapters/graphql/dataloader/ -run 'AudioTrack|TrackGenre|MusicGenres|TrackLink'`
Expected: FAIL. The resolver tests fail with schema errors such as `Unknown type "CreateAudioTrackInput"` or `Cannot query field "trackLinks"`, and the dataloader test with `l.TrackLinksByContentID undefined`.

- [ ] **Step 3: Implement**

`backend/schema.graphql`. Add the types near `RelatedMedia`:

```graphql
"How a track link is used: EMBED plays inside Perspectize (YouTube), LISTEN opens the provider."
enum TrackLinkKind {
  LISTEN
  EMBED
}

"How a link got onto the track. MATCHED is reserved for the matcher (not built)."
enum TrackLinkSource {
  PASTED
  MATCHED
}

"One link to an AUDIO_TRACK recording (ADR 0005). The first pasted link is also Content.url."
type TrackLink {
  id: ID!
  "youtube | spotify | apple_music | amazon_music"
  provider: String!
  providerTrackId: String!
  url: String!
  kind: TrackLinkKind!
  source: TrackLinkSource!
  "Set when the embed reported error 101 or 150; the link is shown as unavailable here."
  unavailableAt: String
}

"A node of the seeded Apple genre tree (ADR 0006, Option C)."
type MusicGenre {
  id: ID!
  name: String!
  parentId: ID
}

input CreateAudioTrackInput {
  url: String!
  "Required for Spotify, Apple Music and Amazon Music links: no provider lookup is made."
  title: String
  artist: String
  genreId: IntID
  "The user confirmed this is the same song as an existing track: attach the link there."
  sameAsContentId: IntID
  "The user said it is a different song: skip the same-song check."
  createNew: Boolean
}

type CreateAudioTrackResult {
  "Null when sameSongCandidates is non-empty: nothing was created, ask the user."
  content: Content
  alreadyExisted: Boolean!
  sameSongCandidates: [Content!]!
}
```

In `type Content`, after `audioTrack: JSON`:

```graphql
  "AUDIO_TRACK genre (music_genres id); null when unset."
  genreId: ID
  genre: MusicGenre
  "AUDIO_TRACK links (batched per request); empty for other content types."
  trackLinks: [TrackLink!]!
```

In `type Query`:

```graphql
  "The seeded music genre tree, flat; build the tree from parentId."
  musicGenres: [MusicGenre!]!
```

In `type Mutation`, replace the Task 1 `createAudioTrack` line and add two more:

```graphql
  createAudioTrack(input: CreateAudioTrackInput!): CreateAudioTrackResult! @auth
  "Anyone may set an empty genre; the adder may change it within 30 days (ADR 0006)."
  setTrackGenre(contentId: IntID!, genreId: IntID!): Content! @auth
  "Records embed error 101/150 for one EMBED link (ticket 03)."
  markTrackLinkUnavailable(linkId: IntID!): TrackLink! @auth
```

`backend/gqlgen.yml`. Under `models:`, next to the other stored enums:

```yaml
  TrackLinkKind:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.TrackLinkKind
  TrackLinkSource:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.TrackLinkSource
```

In the existing `Content:` → `fields:` block (where `addedBy` and `primaryCategory` are marked `resolver: true`), add:

```yaml
      genre:
        resolver: true
      trackLinks:
        resolver: true
```

Regenerate:

```bash
make -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend graphql-gen
```

Move the new stubs from the stray `schema.resolvers.go`:
- `Genre`, `TrackLinks`, `CreateAudioTrack` (new signature), `SetTrackGenre` and `MarkTrackLinkUnavailable` go into `content.resolvers.go`.
- `MusicGenres` goes into the file holding `ContentByID`.

Then:

```bash
rm /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/internal/adapters/graphql/resolvers/schema.resolvers.go
```

`helpers.go` additions:

```go
func musicGenreToModel(g domain.MusicGenre) *model.MusicGenre {
	out := &model.MusicGenre{ID: strconv.Itoa(g.ID), Name: g.Name}
	if g.ParentID != nil {
		p := strconv.Itoa(*g.ParentID)
		out.ParentID = &p
	}
	return out
}

func trackLinkToModel(l domain.TrackLink) *model.TrackLink {
	out := &model.TrackLink{
		ID: strconv.Itoa(l.ID), Provider: string(l.Provider), ProviderTrackID: l.ProviderTrackID, URL: l.URL,
		Kind: l.Kind, Source: l.Source,
	}
	if l.UnavailableAt != nil {
		s := l.UnavailableAt.UTC().Format(time.RFC3339)
		out.UnavailableAt = &s
	}
	return out
}
```

In `domainToModel`, after `DisplayTitle`:

```go
	if c.GenreID != nil {
		g := strconv.Itoa(*c.GenreID)
		m.GenreID = &g
	}
```

`content.resolvers.go`:

```go
// Genre is the AUDIO_TRACK genre, resolved from the cached genre list (no query when warm).
func (r *contentResolver) Genre(ctx context.Context, obj *model.Content) (*model.MusicGenre, error) {
	if obj.GenreID == nil {
		return nil, nil
	}
	id, err := strconv.Atoi(*obj.GenreID)
	if err != nil {
		return nil, nil
	}
	genres, err := r.ContentService.MusicGenres(ctx)
	if err != nil {
		slog.Error("resolving genre failed", "contentID", obj.ID, "error", err)
		return nil, nil
	}
	for _, g := range genres {
		if g.ID == id {
			return musicGenreToModel(g), nil
		}
	}
	return nil, nil
}

// TrackLinks batches through the per-request loader; non-track rows cost nothing.
func (r *contentResolver) TrackLinks(ctx context.Context, obj *model.Content) ([]*model.TrackLink, error) {
	out := []*model.TrackLink{}
	if obj.ContentType != string(domain.ContentTypeAudioTrack) {
		return out, nil
	}
	id, err := strconv.Atoi(obj.ID)
	if err != nil {
		return out, nil
	}
	var links []domain.TrackLink
	if loaders := dataloader.For(ctx); loaders != nil {
		links, err = loaders.TrackLinksByContentID.Load(ctx, id)
	} else {
		var byID map[int][]domain.TrackLink
		byID, err = r.ContentService.TrackLinksByContentIDs(ctx, []int{id})
		links = byID[id]
	}
	if err != nil {
		slog.Error("resolving track links failed", "contentID", id, "error", err)
		return out, nil
	}
	for _, l := range links {
		out = append(out, trackLinkToModel(l))
	}
	return out, nil
}

// CreateAudioTrack is the resolver for the createAudioTrack field.
func (r *mutationResolver) CreateAudioTrack(ctx context.Context, input model.CreateAudioTrackInput) (*model.CreateAudioTrackResult, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	in := portservices.CreateAudioTrackInput{
		URL: input.URL, UserID: authUser.ID, GenreID: input.GenreID, SameAsContentID: input.SameAsContentID,
		CreateNew: input.CreateNew != nil && *input.CreateNew,
	}
	if input.Title != nil {
		in.Title = *input.Title
	}
	if input.Artist != nil {
		in.Artist = *input.Artist
	}
	res, err := r.ContentService.CreateAudioTrack(ctx, in)
	if err != nil {
		return nil, audioTrackError(err)
	}
	out := &model.CreateAudioTrackResult{AlreadyExisted: res.AlreadyExisted, SameSongCandidates: make([]*model.Content, 0, len(res.Candidates))}
	if res.Content != nil {
		out.Content = domainToModel(res.Content)
	}
	for _, c := range res.Candidates {
		out.SameSongCandidates = append(out.SameSongCandidates, domainToModel(c))
	}
	return out, nil
}

// SetTrackGenre is the resolver for the setTrackGenre field.
func (r *mutationResolver) SetTrackGenre(ctx context.Context, contentID int, genreID int) (*model.Content, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	c, err := r.ContentService.SetTrackGenre(ctx, contentID, genreID, authUser.ID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrGenreLocked):
			return nil, domain.ErrGenreLocked
		case errors.Is(err, domain.ErrNotFound):
			return nil, fmt.Errorf("track not found")
		case errors.Is(err, domain.ErrInvalidInput):
			return nil, fmt.Errorf("unknown genre")
		}
		slog.Error("setting track genre failed", "contentID", contentID, "error", err)
		return nil, fmt.Errorf("failed to set genre")
	}
	return domainToModel(c), nil
}

// MarkTrackLinkUnavailable is the resolver for the markTrackLinkUnavailable field.
func (r *mutationResolver) MarkTrackLinkUnavailable(ctx context.Context, linkID int) (*model.TrackLink, error) {
	if _, err := auth.RequireAuth(ctx); err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	l, err := r.ContentService.MarkTrackLinkUnavailable(ctx, linkID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("track link not found")
		}
		slog.Error("marking track link unavailable failed", "linkID", linkID, "error", err)
		return nil, fmt.Errorf("failed to update track link")
	}
	return trackLinkToModel(*l), nil
}
```

In the query resolver file:

```go
// MusicGenres is the resolver for the musicGenres field.
func (r *queryResolver) MusicGenres(ctx context.Context) ([]*model.MusicGenre, error) {
	genres, err := r.ContentService.MusicGenres(ctx)
	if err != nil {
		slog.Error("listing music genres failed", "error", err)
		return nil, fmt.Errorf("failed to load genres")
	}
	out := make([]*model.MusicGenre, len(genres))
	for i, g := range genres {
		out[i] = musicGenreToModel(g)
	}
	return out, nil
}
```

(gqlgen maps a nullable `IntID` input field to `*int`. If the generated model uses another type, convert to `*int` in the resolver.)

`dataloader.go`. Add to `Loaders`:

```go
	// TrackLinksByContentID batches Content.trackLinks for AUDIO_TRACK rows.
	TrackLinksByContentID *dataloadgen.Loader[int, []domain.TrackLink]
```

In `NewLoaders`, add `tkb := &trackLinkBatcher{service: s.Content}` and `TrackLinksByContentID: dataloadgen.NewMappedLoader(tkb.byContentID),`. At the end of the file:

```go
// trackLinkBatcher resolves the links of many tracks in one query. Every key
// is present in the result, so a track without links is an empty list.
type trackLinkBatcher struct {
	service portservices.ContentService
}

func (b *trackLinkBatcher) byContentID(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	links, err := b.service.TrackLinksByContentIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[int][]domain.TrackLink, len(ids))
	for _, id := range ids {
		out[id] = links[id]
	}
	return out, nil
}
```

Wiring in `backend/cmd/server/main.go`. Use the same `*gorm.DB` the file already passes to `postgres.NewGormContentRepository`, shown here as `db`:

```go
	audioTrackRepo := postgres.NewGormAudioTrackRepository(db)
	musicGenreRepo := cached.NewMusicGenreRepository(postgres.NewGormMusicGenreRepository(db), cached.DefaultMusicGenreTTL)
```

and append `services.WithAudioTracks(audioTrackRepo, musicGenreRepo)` to the `services.NewContentService(…)` option list. Make the same two additions in `backend/test/roundtrips/harness_test.go`'s `newHarness`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go -C backend build ./...`
Expected: no output.
Run: `go -C backend vet -tags perf ./internal/perf/...`
Expected: no output.
Run: `go -C backend test ./...`
Expected: `ok` for every package. `TestCreateAudioTrackLinkOnly` skips without `DATABASE_URL`; Tasks 18 and 19 run it against disposable databases.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add backend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(audio-track): GraphQL for tracks, links, genres and same-song candidates"
```

---
### Task 11: Frontend data layer and cache contracts

**Files:**
- Modify: `frontend/src/lib/queries/content/index.ts`:
  - add the types `TrackLink`, `MusicGenre`, `AudioTrackMeta`, `AudioTrack`, `SameSongCandidate`, `CreateAudioTrackInput` and the new `CreateAudioTrackResponse`;
  - replace the GraphQL documents: `CREATE_AUDIO_TRACK`, `GET_AUDIO_TRACK` (replacing `GET_MUSIC_TRACK`), `LIST_MUSIC_GENRES`, `SET_TRACK_GENRE` and `MARK_TRACK_LINK_UNAVAILABLE`;
  - extend the `LIST_CONTENT` and `GET_CONTENT_DETAILS` selections.
- Modify: `frontend/src/lib/queries/keys.ts`
- Rename and rewrite: `frontend/src/lib/queries/content/useMusicTrack.ts` becomes `useAudioTrack.ts`
- Create: `frontend/src/lib/queries/content/useAddAudioTrack.ts`
- Rewrite: `frontend/src/lib/queries/content/useAddVideo.ts` (videos only)
- Modify: `frontend/src/lib/components/AddVideoDialog.svelte` (refuses music links)
- Test: `frontend/tests/unit/audio-track-cache-contract.test.ts` and `frontend/tests/unit/hooks-useAddAudioTrack.test.ts` (replaces `hooks-useAddVideo-music.test.ts`)

**Interfaces:**
- Consumes: the Task 10 GraphQL contract.
- Produces:
  ```ts
  // queries/content/index.ts
  export interface TrackLink { id: string; provider: string; providerTrackId: string; url: string; kind: 'LISTEN' | 'EMBED'; source: 'PASTED' | 'MATCHED'; unavailableAt: string | null }
  export interface MusicGenre { id: string; name: string; parentId: string | null }
  export interface AudioTrackMeta { provider?: string; videoId?: string; artist?: string; album?: string; videoType?: string; explicit?: boolean; coverImageUrl?: string; suggestedGenreId?: number; releaseDate?: string }
  export interface AudioTrack { id: string; name: string; url: string | null; addedByUserID: string; createdAt: string; genreId: string | null; genre: MusicGenre | null; audioTrack: AudioTrackMeta | null; trackLinks: TrackLink[]; relatedMedia: RelatedMedia[]; lyrics: LyricsAvailability | null }
  export interface SameSongCandidate { id: string; name: string; url: string | null; audioTrack: AudioTrackMeta | null }
  export interface CreateAudioTrackInput { url: string; title?: string; artist?: string; genreId?: number; sameAsContentId?: number; createNew?: boolean }
  export interface CreateAudioTrackResponse { createAudioTrack: { content: (ContentItem & { relatedMedia: RelatedMedia[] }) | null; alreadyExisted: boolean; sameSongCandidates: SameSongCandidate[] } }
  // ContentItem gains: genre?: { id: string; name: string } | null; audioTrack?: AudioTrackMeta | null
  // keys.ts
  queryKeys.content.audioTrack(id)  // replaces queryKeys.content.music(id)
  queryKeys.music.genres()
  // useAudioTrack.ts
  export const AUDIO_TRACK_STALE_TIME = 60_000
  export function audioTrackQuery(id: string): { queryKey; queryFn; staleTime }
  export function musicGenresQuery(): { queryKey; queryFn; staleTime: Infinity }
  export function useAudioTrack(contentId: () => string | null)
  export function useMusicGenres(enabled?: () => boolean)
  export function useSetTrackGenre()          // mutate({ contentId, genreId })
  export function useMarkTrackLinkUnavailable() // mutate({ contentId, linkId })
  export function useRefreshLyrics(), useMarkRelatedMediaUnavailable(), usePromoteRelatedMedia(), promoteRelatedMedia(contentId, videoId)
  export function applyGenreSet(client: QueryClient, track: { id: string; genreId: string | null; genre: MusicGenre | null }): void
  export function applyTrackLinkUnavailable(client: QueryClient, contentId: string, link: { id: string; unavailableAt: string | null }): void
  // useAddAudioTrack.ts
  export type AddAudioTrackResult = CreateAudioTrackResponse['createAudioTrack']
  export function useAddAudioTrack()          // mutate(input: CreateAudioTrackInput, { onSuccess })
  export function applyAudioTrackAdded(client: QueryClient, result: AddAudioTrackResult): void
  export function promotableOfficialVideo(result: AddAudioTrackResult): RelatedMedia | null
  export function audioTrackErrorMessage(err: Error): string
  ```
- Cache rules (`.docs/QUERY_BUDGET.md`):
  - The genre list is fetched once per session (`staleTime: Infinity`).
  - Track details are fresh for 60 s.
  - Saving a genre patches that track's details in place and invalidates only the lists and that row.
  - A new track invalidates only the lists.
  - A link attached to an existing track invalidates only that track's details.
  - A same-song prompt invalidates nothing.

- [ ] **Step 1: Write the failing tests**

`frontend/tests/unit/audio-track-cache-contract.test.ts`:

```ts
/**
 * Cache contract for AUDIO_TRACK (frontend/CLAUDE.md → "Query caching & call
 * budget", .docs/QUERY_BUDGET.md). Real QueryClient, the same keys/staleTimes
 * the hooks use.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import { AUDIO_TRACK_STALE_TIME, applyGenreSet, applyTrackLinkUnavailable } from '$lib/queries/content/useAudioTrack';
import { applyAudioTrackAdded } from '$lib/queries/content/useAddAudioTrack';
import { countingFetch, invalidationOutcome, makeClient, mountConsumers, seed } from '../helpers/queryBudget';

afterEach(() => vi.useRealTimers());

const genresOptions = (fn: () => Promise<unknown>) => ({ queryKey: queryKeys.music.genres(), queryFn: fn, staleTime: Infinity });
const trackOptions = (id: string, fn: () => Promise<unknown>) => ({
	queryKey: queryKeys.content.audioTrack(id),
	queryFn: fn,
	staleTime: AUDIO_TRACK_STALE_TIME,
});

describe('audio track key hygiene', () => {
	it('details are distinct from the other per-content entries', () => {
		const keys = [
			queryKeys.content.audioTrack('9'),
			queryKeys.content.detail('9'),
			queryKeys.content.row('9'),
			queryKeys.content.banner('9'),
		].map(hashKey);
		expect(new Set(keys).size).toBe(4);
	});

	it('genres live outside the content tree, so content invalidations never refetch them', () => {
		expect(hashKey(queryKeys.music.genres()).includes('"content"')).toBe(false);
	});
});

describe('de-duplication and freshness', () => {
	it('three pickers share one genre fetch, and a remount costs nothing', async () => {
		const client = makeClient();
		const fetcher = countingFetch([]);
		(await mountConsumers(client, genresOptions(fetcher), 3))();
		(await mountConsumers(client, genresOptions(fetcher), 1))();
		expect(fetcher.fetches()).toBe(1);
	});

	it('track details are reused inside the stale time and refetched once after', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
		const client = makeClient();
		const fetcher = countingFetch({ id: '9' });
		(await mountConsumers(client, trackOptions('9', fetcher), 2))();
		(await mountConsumers(client, trackOptions('9', fetcher), 1))();
		expect(fetcher.fetches()).toBe(1);
		vi.setSystemTime(new Date(Date.now() + AUDIO_TRACK_STALE_TIME + 1000));
		(await mountConsumers(client, trackOptions('9', fetcher), 1))();
		expect(fetcher.fetches()).toBe(2);
	});
});

describe('mutations evict exactly what they change', () => {
	const list = queryKeys.content.list({ first: 50 });
	const track9 = queryKeys.content.audioTrack('9');
	const track10 = queryKeys.content.audioTrack('10');
	const row9 = queryKeys.content.row('9');
	const genres = queryKeys.music.genres();
	const all = [list, track9, track10, row9, genres];

	function seeded() {
		const client = makeClient();
		for (const k of all) seed(client, k, { id: 'x', trackLinks: [{ id: '1', unavailableAt: null }] });
		return client;
	}

	it('saving a genre patches the details and evicts lists and that row only', () => {
		const client = seeded();
		applyGenreSet(client, { id: '9', genreId: '21', genre: { id: '21', name: 'Rock', parentId: null } });
		const out = invalidationOutcome(client, all);
		expect(out.invalidated.map(hashKey).sort()).toEqual([list, row9].map(hashKey).sort());
		expect(client.getQueryData<{ genreId: string }>(track9)?.genreId).toBe('21');
	});

	it('a new track evicts the lists only', () => {
		const client = seeded();
		applyAudioTrackAdded(client, { content: { id: '11' } as never, alreadyExisted: false, sameSongCandidates: [] });
		expect(invalidationOutcome(client, all).invalidated.map(hashKey)).toEqual([hashKey(list)]);
	});

	it('a link attached to an existing track evicts that track only', () => {
		const client = seeded();
		applyAudioTrackAdded(client, { content: { id: '9' } as never, alreadyExisted: true, sameSongCandidates: [] });
		expect(invalidationOutcome(client, all).invalidated.map(hashKey)).toEqual([hashKey(track9)]);
	});

	it('a same-song prompt evicts nothing', () => {
		const client = seeded();
		applyAudioTrackAdded(client, { content: null, alreadyExisted: false, sameSongCandidates: [{ id: '9', name: 'x', url: null, audioTrack: null }] });
		expect(invalidationOutcome(client, all).invalidated).toEqual([]);
	});

	it('marking a link unavailable patches that track in place and evicts nothing', () => {
		const client = seeded();
		applyTrackLinkUnavailable(client, '9', { id: '1', unavailableAt: '2026-10-11T12:00:00Z' });
		expect(invalidationOutcome(client, all).invalidated).toEqual([]);
		expect(client.getQueryData<{ trackLinks: { unavailableAt: string }[] }>(track9)?.trackLinks[0].unavailableAt).toBe('2026-10-11T12:00:00Z');
	});
});
```

`frontend/tests/unit/hooks-useAddAudioTrack.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { audioTrackErrorMessage, promotableOfficialVideo } from '$lib/queries/content/useAddAudioTrack';

const official = { provider: 'youtube', videoId: 'V', kind: 'official_video', title: 'x', contentId: null, unavailable: false };

describe('promotableOfficialVideo', () => {
	it('offers an official video that is not already its own item', () => {
		const r = { content: { id: '1', relatedMedia: [official] } as never, alreadyExisted: false, sameSongCandidates: [] };
		expect(promotableOfficialVideo(r)?.videoId).toBe('V');
	});

	it('never offers for a duplicate, a prompt, a promoted or a broken video', () => {
		expect(promotableOfficialVideo({ content: { id: '1', relatedMedia: [official] } as never, alreadyExisted: true, sameSongCandidates: [] })).toBeNull();
		expect(promotableOfficialVideo({ content: null, alreadyExisted: false, sameSongCandidates: [] })).toBeNull();
		expect(promotableOfficialVideo({ content: { id: '1', relatedMedia: [{ ...official, contentId: '5' }] } as never, alreadyExisted: false, sameSongCandidates: [] })).toBeNull();
		expect(promotableOfficialVideo({ content: { id: '1', relatedMedia: [{ ...official, unavailable: true }] } as never, alreadyExisted: false, sameSongCandidates: [] })).toBeNull();
	});
});

describe('audioTrackErrorMessage', () => {
	it.each([
		['paste a song link, not an album, playlist, or artist', 'Paste a song link, not an album, playlist, or artist.'],
		['unsupported music link: paste a YouTube Music…', 'Paste a YouTube Music, Spotify, Apple Music or Amazon Music song link.'],
		['invalid input: a title is required for spotify links', 'Add the song title (Spotify, Apple Music and Amazon Music links are not looked up).'],
		['access denied: authentication required', 'Please sign in to add a track'],
		['Failed to fetch', 'Cannot reach the server. Check your connection and try again.'],
		['boom', 'Failed to add track. Please try again.'],
	])('%s', (raw, shown) => {
		expect(audioTrackErrorMessage(new Error(raw))).toBe(shown);
	});
});
```

Remove the old hook test, whose music routing no longer exists:

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track rm frontend/tests/unit/hooks-useAddVideo-music.test.ts
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/audio-track-cache-contract.test.ts tests/unit/hooks-useAddAudioTrack.test.ts`
Expected: FAIL with `Failed to resolve import "$lib/queries/content/useAudioTrack"` and `"$lib/queries/content/useAddAudioTrack"`.

- [ ] **Step 3: Implement**

`frontend/src/lib/queries/keys.ts`. Replace the `music:` entry under `content` with:

```ts
		// AUDIO_TRACK details (links, genre, related media, lyrics); its own key because
		// it selects different fields from detail/row.
		audioTrack: (id: string) => [...queryKeys.content.details(), 'audioTrack', id] as const,
```

and add a top-level group after `bible`:

```ts
	music: {
		all: () => [...queryKeys.all, 'music'] as const,
		// The seeded genre tree; never changes at runtime (staleTime Infinity).
		genres: () => [...queryKeys.music.all(), 'genres'] as const,
	},
```

`frontend/src/lib/queries/content/index.ts`:
- In `ContentItem`, after `movie?`:

  ```ts
  	// AUDIO_TRACK rows only: response.music, and the genre from the seeded tree.
  	audioTrack?: AudioTrackMeta | null;
  	genre?: { id: string; name: string } | null;
  ```
- In `LIST_CONTENT` and `GET_CONTENT_DETAILS`, add these two lines directly under each `movie` selection:

  ```graphql
  				audioTrack
  				genre {
  					id
  					name
  				}
  ```
- Replace the `MusicTrack` interface, `CreateAudioTrackResponse`, `MUSIC_TRACK_FIELDS`, `GET_MUSIC_TRACK` and `CREATE_AUDIO_TRACK` with:

  ```ts
  export interface TrackLink {
  	id: string;
  	provider: string;
  	providerTrackId: string;
  	url: string;
  	kind: 'LISTEN' | 'EMBED';
  	source: 'PASTED' | 'MATCHED';
  	unavailableAt: string | null;
  }

  export interface MusicGenre {
  	id: string;
  	name: string;
  	parentId: string | null;
  }

  /** response.music on an AUDIO_TRACK row (Content.audioTrack). */
  export interface AudioTrackMeta {
  	provider?: string;
  	videoId?: string;
  	artist?: string;
  	album?: string;
  	videoType?: string;
  	explicit?: boolean;
  	coverImageUrl?: string;
  	suggestedGenreId?: number;
  	releaseDate?: string;
  }

  /** The details-modal view of an AUDIO_TRACK row. */
  export interface AudioTrack {
  	id: string;
  	name: string;
  	url: string | null;
  	addedByUserID: string;
  	createdAt: string;
  	genreId: string | null;
  	genre: MusicGenre | null;
  	audioTrack: AudioTrackMeta | null;
  	trackLinks: TrackLink[];
  	relatedMedia: RelatedMedia[];
  	lyrics: LyricsAvailability | null;
  }

  export interface SameSongCandidate {
  	id: string;
  	name: string;
  	url: string | null;
  	audioTrack: AudioTrackMeta | null;
  }

  export interface CreateAudioTrackInput {
  	url: string;
  	title?: string;
  	artist?: string;
  	genreId?: number;
  	sameAsContentId?: number;
  	createNew?: boolean;
  }

  export interface CreateAudioTrackResponse {
  	createAudioTrack: {
  		content: (ContentItem & { relatedMedia: RelatedMedia[] }) | null;
  		alreadyExisted: boolean;
  		sameSongCandidates: SameSongCandidate[];
  	};
  }

  export const CREATE_AUDIO_TRACK = gql`
  	mutation CreateAudioTrack($input: CreateAudioTrackInput!) {
  		createAudioTrack(input: $input) {
  			content {
  				id
  				name
  				url
  				contentType
  				length
  				lengthUnits
  				addedByUserID
  				audioTrack
  				genre {
  					id
  					name
  				}
  				relatedMedia {
  					provider
  					videoId
  					kind
  					title
  					contentId
  					unavailable
  				}
  				createdAt
  				updatedAt
  			}
  			alreadyExisted
  			sameSongCandidates {
  				id
  				name
  				url
  				audioTrack
  			}
  		}
  	}
  `;

  const AUDIO_TRACK_FIELDS = `
  	id
  	name
  	url
  	addedByUserID
  	createdAt
  	genreId
  	genre { id name parentId }
  	audioTrack
  	trackLinks { id provider providerTrackId url kind source unavailableAt }
  	relatedMedia { provider videoId kind title contentId unavailable }
  	lyrics { available lrclibId hasSynced checkedAt }
  `;

  export const GET_AUDIO_TRACK = gql`
  	query GetAudioTrack($id: ID!) {
  		contentByID(id: $id) {
  			${AUDIO_TRACK_FIELDS}
  		}
  	}
  `;

  export const LIST_MUSIC_GENRES = gql`
  	query ListMusicGenres {
  		musicGenres {
  			id
  			name
  			parentId
  		}
  	}
  `;

  export const SET_TRACK_GENRE = gql`
  	mutation SetTrackGenre($contentId: IntID!, $genreId: IntID!) {
  		setTrackGenre(contentId: $contentId, genreId: $genreId) {
  			id
  			genreId
  			genre { id name parentId }
  		}
  	}
  `;

  export const MARK_TRACK_LINK_UNAVAILABLE = gql`
  	mutation MarkTrackLinkUnavailable($linkId: IntID!) {
  		markTrackLinkUnavailable(linkId: $linkId) {
  			id
  			unavailableAt
  		}
  	}
  `;
  ```

  In `REFRESH_LYRICS_AVAILABILITY` and `MARK_RELATED_MEDIA_UNAVAILABLE`, replace `${MUSIC_TRACK_FIELDS}` with `${AUDIO_TRACK_FIELDS}`. Delete `CREATE_CONTENT_FROM_YOUTUBE_MUSIC` if any copy survived Task 2.

Rename the hook file:

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track mv frontend/src/lib/queries/content/useMusicTrack.ts frontend/src/lib/queries/content/useAudioTrack.ts
```

`frontend/src/lib/queries/content/useAudioTrack.ts` (full content):

```ts
import { createMutation, createQuery, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	GET_AUDIO_TRACK,
	LIST_MUSIC_GENRES,
	MARK_RELATED_MEDIA_UNAVAILABLE,
	MARK_TRACK_LINK_UNAVAILABLE,
	PROMOTE_RELATED_MEDIA,
	REFRESH_LYRICS_AVAILABILITY,
	SET_TRACK_GENRE,
	type AudioTrack,
	type MusicGenre,
} from './index';
import { queryKeys } from '../keys';

/** Track details change only through this user's own mutations, which patch the cache. */
export const AUDIO_TRACK_STALE_TIME = 60_000;

export function audioTrackQuery(contentId: string) {
	return {
		queryKey: queryKeys.content.audioTrack(contentId),
		queryFn: async () =>
			(await graphqlRequest<{ contentByID: AudioTrack | null }>(GET_AUDIO_TRACK, { id: contentId })).contentByID,
		staleTime: AUDIO_TRACK_STALE_TIME,
	};
}

export function musicGenresQuery() {
	return {
		queryKey: queryKeys.music.genres(),
		queryFn: async () => (await graphqlRequest<{ musicGenres: MusicGenre[] }>(LIST_MUSIC_GENRES)).musicGenres,
		// Seeded by a migration; never changes while the app runs.
		staleTime: Infinity,
	};
}

/** An AUDIO_TRACK row's links, genre, related media and lyrics availability, for the details modal. */
export function useAudioTrack(contentId: () => string | null) {
	return createQuery(() => {
		const id = contentId();
		return { ...audioTrackQuery(id ?? ''), enabled: browser && id !== null };
	});
}

export function useMusicGenres(enabled: () => boolean = () => true) {
	return createQuery(() => ({ ...musicGenresQuery(), enabled: browser && enabled() }));
}

export function applyGenreSet(client: QueryClient, track: { id: string; genreId: string | null; genre: MusicGenre | null }) {
	client.setQueryData<AudioTrack | null>(queryKeys.content.audioTrack(track.id), (old) =>
		old ? { ...old, genreId: track.genreId, genre: track.genre } : old,
	);
	// The grid's Genre column and a `?open=` row read the genre too.
	client.invalidateQueries({ queryKey: queryKeys.content.lists() });
	client.invalidateQueries({ queryKey: queryKeys.content.row(track.id) });
}

export function applyTrackLinkUnavailable(client: QueryClient, contentId: string, link: { id: string; unavailableAt: string | null }) {
	client.setQueryData<AudioTrack | null>(queryKeys.content.audioTrack(contentId), (old) =>
		old
			? { ...old, trackLinks: old.trackLinks.map((l) => (l.id === link.id ? { ...l, unavailableAt: link.unavailableAt } : l)) }
			: old,
	);
}

/** Saves a genre the user picked. Never called on its own: suggestions are only pre-filled (ADR 0006). */
export function useSetTrackGenre() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; genreId: string }) =>
			(
				await graphqlRequest<{ setTrackGenre: { id: string; genreId: string | null; genre: MusicGenre | null } }>(SET_TRACK_GENRE, {
					contentId: Number(vars.contentId),
					genreId: Number(vars.genreId),
				})
			).setTrackGenre,
		onSuccess: (track: { id: string; genreId: string | null; genre: MusicGenre | null }) => {
			applyGenreSet(queryClient, track);
			toast.success(`Genre saved: ${track.genre?.name ?? ''}`);
		},
		onError: (err: Error) => {
			toast.error(err.message.includes('can only be changed') ? err.message : 'Could not save the genre. Please try again.');
		},
	}));
}

/** Records embed error 101/150 for one EMBED link (ticket 03). */
export function useMarkTrackLinkUnavailable() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; linkId: string }) =>
			(
				await graphqlRequest<{ markTrackLinkUnavailable: { id: string; unavailableAt: string | null } }>(MARK_TRACK_LINK_UNAVAILABLE, {
					linkId: Number(vars.linkId),
				})
			).markTrackLinkUnavailable,
		onSuccess: (link: { id: string; unavailableAt: string | null }, vars: { contentId: string; linkId: string }) => {
			applyTrackLinkUnavailable(queryClient, vars.contentId, link);
		},
	}));
}

/**
 * Re-checks lyrics availability. The backend only calls LRCLIB when the stored
 * result is due (never checked, or "not found" more than 30 days ago).
 */
export function useRefreshLyrics() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (contentId: string) =>
			(await graphqlRequest<{ refreshLyricsAvailability: AudioTrack }>(REFRESH_LYRICS_AVAILABILITY, { contentId: Number(contentId) }))
				.refreshLyricsAvailability,
		onSuccess: (track: AudioTrack) => {
			queryClient.setQueryData(queryKeys.content.audioTrack(track.id), track);
		},
	}));
}

/** Records that a related upload could not be embedded, so it is greyed out next time. */
export function useMarkRelatedMediaUnavailable() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (vars: { contentId: string; videoId: string }) =>
			(
				await graphqlRequest<{ markRelatedMediaUnavailable: AudioTrack }>(MARK_RELATED_MEDIA_UNAVAILABLE, {
					contentId: Number(vars.contentId),
					videoId: vars.videoId,
				})
			).markRelatedMediaUnavailable,
		onSuccess: (track: AudioTrack) => {
			queryClient.setQueryData(queryKeys.content.audioTrack(track.id), track);
		},
	}));
}

/** Plain request, so it can also run from a toast action outside a component. */
export async function promoteRelatedMedia(contentId: string, videoId: string): Promise<{ id: string; name: string }> {
	const data = await graphqlRequest<{ promoteRelatedMedia: { id: string; name: string } }>(PROMOTE_RELATED_MEDIA, {
		contentId: Number(contentId),
		videoId,
	});
	return data.promoteRelatedMedia;
}

/** Explicit user action: add a related video as its own item. */
export function usePromoteRelatedMedia() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: { contentId: string; videoId: string }) => promoteRelatedMedia(vars.contentId, vars.videoId),
		onSuccess: (item: { id: string; name: string }, vars: { contentId: string; videoId: string }) => {
			toast.success(`Added: ${item.name}`);
			queryClient.invalidateQueries({ queryKey: queryKeys.content.audioTrack(vars.contentId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: () => {
			toast.error('Could not add that video. Please try again.');
		},
	}));
}
```

`frontend/src/lib/queries/content/useAddAudioTrack.ts`:

```ts
import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_AUDIO_TRACK, type CreateAudioTrackInput, type CreateAudioTrackResponse, type RelatedMedia } from './index';
import { promoteRelatedMedia } from './useAudioTrack';
import { queryKeys } from '../keys';
import { activityContentHref } from '$lib/utils/contentLinks';
import { contentNotAllowedMessage } from '$lib/utils/movie';

export type AddAudioTrackResult = CreateAudioTrackResponse['createAudioTrack'];

/** Cache effect of an add (see audio-track-cache-contract.test.ts). */
export function applyAudioTrackAdded(client: QueryClient, result: AddAudioTrackResult) {
	if (result.sameSongCandidates.length > 0 || !result.content) return; // the form asks; nothing changed
	if (result.alreadyExisted) {
		// A link may have been attached to that track.
		client.invalidateQueries({ queryKey: queryKeys.content.audioTrack(result.content.id) });
	} else {
		client.invalidateQueries({ queryKey: queryKeys.content.lists() });
	}
}

/**
 * The one official video worth offering after an add: not already its own
 * item and not known to be broken. Never for a duplicate or a prompt.
 */
export function promotableOfficialVideo(result: AddAudioTrackResult): RelatedMedia | null {
	if (!result.content || result.alreadyExisted) return null;
	return result.content.relatedMedia?.find((r) => r.kind === 'official_video' && !r.contentId && !r.unavailable) ?? null;
}

export function audioTrackErrorMessage(err: Error): string {
	const notAllowed = contentNotAllowedMessage(err);
	if (notAllowed) return notAllowed;
	const m = err.message.toLowerCase();
	if (m.includes('load failed') || m.includes('failed to fetch')) return 'Cannot reach the server. Check your connection and try again.';
	if (m.includes('not an album')) return 'Paste a song link, not an album, playlist, or artist.';
	if (m.includes('unsupported music link')) return 'Paste a YouTube Music, Spotify, Apple Music or Amazon Music song link.';
	if (m.includes('title is required')) return 'Add the song title (Spotify, Apple Music and Amazon Music links are not looked up).';
	if (m.includes('access denied') || m.includes('authentication required')) return 'Please sign in to add a track';
	return 'Failed to add track. Please try again.';
}

export function useAddAudioTrack() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		// Always the authenticated wrapper; the server derives the user from the session.
		mutationFn: async (input: CreateAudioTrackInput) =>
			(await graphqlRequest<CreateAudioTrackResponse>(CREATE_AUDIO_TRACK, { input })).createAudioTrack,
		onSuccess: (result: AddAudioTrackResult) => {
			applyAudioTrackAdded(queryClient, result);
			const track = result.content;
			if (!track) return; // same-song prompt: AudioTrackFields asks the user
			const goToTrack = { label: 'Go to track', onClick: () => goto(activityContentHref(track.id)) };
			if (result.alreadyExisted) {
				toast.warning(`This song has already been added: ${track.name}`, { action: goToTrack });
				return;
			}
			toast.success(`Added: ${track.name}`, { action: goToTrack });
			const official = promotableOfficialVideo(result);
			if (official) {
				toast('This song also has an official video.', {
					description: 'Add it separately?',
					action: {
						label: 'Add video',
						onClick: () => {
							promoteRelatedMedia(track.id, official.videoId)
								.then((item) => {
									toast.success(`Added: ${item.name}`);
									queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
								})
								.catch(() => toast.error('Could not add that video. Please try again.'));
						},
					},
				});
			}
		},
		onError: (err: Error) => {
			console.error('[AddAudioTrack] mutation failed:', err);
			toast.error(audioTrackErrorMessage(err));
		},
	}));
}
```

`frontend/src/lib/queries/content/useAddVideo.ts`: replace the whole file. It handles plain YouTube videos only; music goes through `useAddAudioTrack`:

```ts
import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_YOUTUBE, type CreateContentResponse, type CreateContentResult, type ContentResponse } from './index';
import { queryKeys } from '../keys';
import { activityContentHref } from '$lib/utils/contentLinks';

export function useAddVideo() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		// userId: 0 is the "derive from my Clerk session" sentinel — the backend
		// resolves it via auth.RequireAuth when zero.
		mutationFn: async (url: string) =>
			graphqlRequest<CreateContentResponse>(CREATE_CONTENT_FROM_YOUTUBE, { input: { url, userId: 0 } }),
		onSuccess: (data: CreateContentResponse) => {
			const result = data?.createContentFromYouTube ?? null;
			if (!result) {
				queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
				return;
			}
			const newItem = result.content;
			if (result.alreadyExisted) {
				// VIDEO-05: warn that the video already exists, and offer a way to it.
				const existingId = newItem?.id;
				toast.warning('This video has already been added', {
					action: existingId ? { label: 'Go to video', onClick: () => goto(activityContentHref(existingId)) } : undefined,
				});
			} else {
				toast.success(`Added: ${newItem?.name ?? 'video'}`);
			}
			updateListCache(queryClient, result);
		},
		onError: (err: Error) => {
			console.error('[AddVideo] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('invalid youtube') || message.includes('video not found')) {
				toast.error('Invalid YouTube URL or video not found');
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to add a video');
			} else {
				toast.error('Failed to add video. Please try again.');
			}
		},
	}));
}

function updateListCache(queryClient: QueryClient, result: CreateContentResult) {
	const newItem = result?.content;
	if (!newItem) {
		// Fallback: full refetch if the response shape is unexpected
		queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		return;
	}
	// Only insert into the cache if it's a genuinely new item
	if (!result.alreadyExisted) {
		queryClient.setQueriesData<ContentResponse>({ queryKey: queryKeys.content.lists() }, (oldData) => {
			if (!oldData) return oldData;
			return {
				content: {
					...oldData.content,
					items: [newItem, ...oldData.content.items],
					totalCount: (oldData.content.totalCount ?? 0) + 1,
				},
			};
		});
	}
	// Mark stale for eventual consistency
	queryClient.invalidateQueries({ queryKey: queryKeys.content.lists(), refetchType: 'none' });
}
```

`frontend/src/lib/components/AddVideoDialog.svelte`. Replace the `classifyYouTubeUrl(url) === 'musicCollection'` check with:

```ts
		const kind = classifyYouTubeUrl(url);
		if (kind === 'musicTrack' || kind === 'musicCollection') {
			error = 'Music links are added from Add Content, as audio tracks.';
			return;
		}
```

(Keep whatever variable the dialog already uses for its error message. If it is not `error`, use that name.)

Run `grep -rn "useMusicTrack\|queryKeys.content.music\|GET_MUSIC_TRACK\|MusicTrack\b" frontend/src frontend/tests`. Every hit is either `MusicTrackPanel` (Task 16 replaces it) or must be changed to the new names.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/audio-track-cache-contract.test.ts tests/unit/hooks-useAddAudioTrack.test.ts tests/unit/query-cache-contract.test.ts tests/components/AddContentPopover.test.ts`
Expected: PASS. In `AddContentPopover.test.ts`, music-specific video-mutation cases (if any) are rewritten in Task 15. If one fails here because music no longer routes through `useAddVideo`, delete it now and note it for Task 15.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): AUDIO_TRACK queries, hooks and cache contracts"
```

---

### Task 12: `audioLinks`, `detectContentType`, `genreTree`

**Files:**
- Create: `frontend/src/lib/utils/audioLinks.ts`
- Create: `frontend/src/lib/utils/genreTree.ts`
- Modify: `frontend/src/lib/utils/detectContentType.ts`
- Test: `frontend/tests/unit/audioLinks.test.ts`, `frontend/tests/unit/genreTree.test.ts` and `frontend/tests/unit/detectContentType.test.ts`

**Interfaces:**
- Consumes: `classifyYouTubeUrl` from `$lib/utils/youtube`, which returns `'video' | 'musicTrack' | 'musicCollection' | null`. The `MusicGenre` type is declared locally here so this task does not wait for Task 11.
- Produces:
  ```ts
  // audioLinks.ts — mirrors backend musiclinks.Parse
  export type MusicProvider = 'youtube' | 'spotify' | 'apple_music' | 'amazon_music';
  export interface ParsedMusicLink { provider: MusicProvider; providerTrackId: string; canonicalUrl: string; kind: 'LISTEN' | 'EMBED'; suggestedTitle: string }
  export type MusicLinkResult = { ok: true; link: ParsedMusicLink } | { ok: false; reason: 'collection' | 'unsupported' };
  export const PROVIDER_LABEL: Record<MusicProvider, string>;
  export function parseMusicLink(input: string): MusicLinkResult;
  export function providerOfUrl(url: string | null | undefined): MusicProvider | null;
  // detectContentType.ts: DetectionResult gains
  | { type: 'AUDIO_TRACK'; url: string; link: ParsedMusicLink | null } // link null = album/playlist/artist link
  // genreTree.ts
  export interface GenreInput { id: string; name: string; parentId: string | null }
  export interface GenreNode { id: string; name: string; parentId: string | null; path: string[]; children: GenreNode[] }
  export function normalizeGenreText(s: string): string;
  export function buildGenreTree(genres: readonly GenreInput[]): GenreNode[];   // alphabetical at every level
  export function filterGenreTree(roots: GenreNode[], query: string): GenreNode[];
  export function flattenGenres(roots: GenreNode[]): Map<string, GenreNode>;
  export const RECENT_GENRES_KEY = 'perspectize:recent-genres'; export const MAX_RECENT_GENRES = 5;
  export function pushRecent(recent: readonly string[], id: string): string[];
  export function loadRecentGenres(): string[]; export function saveRecentGenres(ids: readonly string[]): void;
  export const GENRE_CHANGE_WINDOW_MS: number;
  export function canChangeGenre(track: { genreId: string | null; addedByUserID: string; createdAt: string }, viewerId: string | null, now?: number): boolean;
  ```

- [ ] **Step 1: Write the failing tests**

`frontend/tests/unit/audioLinks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseMusicLink, providerOfUrl } from '$lib/utils/audioLinks';

describe('parseMusicLink', () => {
	it.each([
		['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc', 'spotify', '4uLU6hMCjMI75M1A2tKUQC', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'LISTEN', ''],
		['https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify', '4uLU6hMCjMI75M1A2tKUQC', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'LISTEN', ''],
		['spotify:track:4uLU6hMCjMI75M1A2tKUQC', 'spotify', '4uLU6hMCjMI75M1A2tKUQC', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'LISTEN', ''],
		['https://music.apple.com/us/song/bohemian-rhapsody/1440650711', 'apple_music', '1440650711', 'https://music.apple.com/us/song/1440650711', 'LISTEN', 'Bohemian Rhapsody'],
		['https://music.apple.com/us/album/a-night-at-the-opera/1440650428?i=1440650711', 'apple_music', '1440650711', 'https://music.apple.com/us/song/1440650711', 'LISTEN', ''],
		['https://music.amazon.co.uk/albums/B07D5HXYZ1?trackAsin=B07D5J5QX3', 'amazon_music', 'B07D5J5QX3', 'https://music.amazon.co.uk/tracks/B07D5J5QX3', 'LISTEN', ''],
		['https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x', 'youtube', 'dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'EMBED', ''],
	])('%s', (input, provider, id, canonical, kind, title) => {
		const r = parseMusicLink(input);
		expect(r).toEqual({ ok: true, link: { provider, providerTrackId: id, canonicalUrl: canonical, kind, suggestedTitle: title } });
	});

	it.each([
		'https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx',
		'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
		'https://music.apple.com/us/album/a-night-at-the-opera/1440650428',
		'https://music.amazon.com/albums/B07D5HXYZ1',
		'https://music.youtube.com/playlist?list=OLAK5uy_x',
	])('collection: %s', (input) => {
		expect(parseMusicLink(input)).toEqual({ ok: false, reason: 'collection' });
	});

	it.each(['', 'John 3:16', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://soundcloud.com/a/b', 'https://open.spotify.com/track/short'])(
		'unsupported: %s',
		(input) => {
			expect(parseMusicLink(input)).toEqual({ ok: false, reason: 'unsupported' });
		},
	);

	it('providerOfUrl reads the provider of a stored url', () => {
		expect(providerOfUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBe('spotify');
		expect(providerOfUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
		expect(providerOfUrl(null)).toBeNull();
	});
});
```

`frontend/tests/unit/genreTree.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
	buildGenreTree,
	canChangeGenre,
	filterGenreTree,
	flattenGenres,
	GENRE_CHANGE_WINDOW_MS,
	loadRecentGenres,
	normalizeGenreText,
	pushRecent,
	saveRecentGenres,
} from '$lib/utils/genreTree';

const genres = [
	{ id: '21', name: 'Rock', parentId: null },
	{ id: '1152', name: 'Hard Rock', parentId: '21' },
	{ id: '19', name: 'Regional & Cultural', parentId: null },
	{ id: '1122', name: 'Brazilian', parentId: '19' },
	{ id: '1223', name: 'Forró', parentId: '1122' },
	{ id: '18', name: 'Hip-Hop/Rap', parentId: null },
	{ id: '5', name: 'Classical', parentId: null },
];

describe('genre tree', () => {
	it('is alphabetical at every level, with full paths', () => {
		const roots = buildGenreTree(genres);
		expect(roots.map((r) => r.name)).toEqual(['Classical', 'Hip-Hop/Rap', 'Regional & Cultural', 'Rock']);
		expect(flattenGenres(roots).get('1223')!.path).toEqual(['Regional & Cultural', 'Brazilian', 'Forró']);
	});

	it('normalizes accents, case and punctuation', () => {
		expect(normalizeGenreText('Forró')).toBe('forro');
		expect(normalizeGenreText('Hip-Hop/Rap')).toBe('hip hop rap');
	});

	it('search keeps matches and their ancestors only', () => {
		const out = filterGenreTree(buildGenreTree(genres), 'forro');
		expect(out.map((r) => r.name)).toEqual(['Regional & Cultural']);
		expect(out[0].children[0].children[0].name).toBe('Forró');
		expect(filterGenreTree(buildGenreTree(genres), 'hip hop').map((r) => r.name)).toEqual(['Hip-Hop/Rap']);
		expect(filterGenreTree(buildGenreTree(genres), '   ')).toHaveLength(4);
	});
});

describe('recent genres', () => {
	beforeEach(() => localStorage.clear());

	it('keeps five, most recent first, without duplicates', () => {
		let r: string[] = [];
		for (const id of ['1', '2', '3', '4', '5', '6', '3']) r = pushRecent(r, id);
		expect(r).toEqual(['3', '6', '5', '4', '2']);
	});

	it('round-trips through localStorage and survives garbage', () => {
		saveRecentGenres(['21', '19']);
		expect(loadRecentGenres()).toEqual(['21', '19']);
		localStorage.setItem('perspectize:recent-genres', '{bad');
		expect(loadRecentGenres()).toEqual([]);
	});
});

describe('canChangeGenre (mirrors ADR 0006)', () => {
	const now = Date.parse('2026-10-11T12:00:00Z');
	const added = new Date(now - 10 * 24 * 3600 * 1000).toISOString();
	it('anyone signed in may set an empty genre', () => {
		expect(canChangeGenre({ genreId: null, addedByUserID: '3', createdAt: added }, '7', now)).toBe(true);
		expect(canChangeGenre({ genreId: null, addedByUserID: '3', createdAt: added }, null, now)).toBe(false);
	});
	it('only the adder may change a set genre, within 30 days', () => {
		expect(canChangeGenre({ genreId: '21', addedByUserID: '3', createdAt: added }, '3', now)).toBe(true);
		expect(canChangeGenre({ genreId: '21', addedByUserID: '3', createdAt: added }, '7', now)).toBe(false);
		const old = new Date(now - GENRE_CHANGE_WINDOW_MS - 1000).toISOString();
		expect(canChangeGenre({ genreId: '21', addedByUserID: '3', createdAt: old }, '3', now)).toBe(false);
	});
});
```

Append to `frontend/tests/unit/detectContentType.test.ts`:

```ts
describe('audio track detection', () => {
	it('detects Spotify, Apple Music, Amazon Music and YouTube Music song links', () => {
		for (const url of [
			'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
			'https://music.apple.com/us/song/bohemian-rhapsody/1440650711',
			'https://music.amazon.com/tracks/B07D5J5QX3',
			'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
		]) {
			const r = detectContentType(url);
			expect(r.type).toBe('AUDIO_TRACK');
		}
	});

	it('marks album/playlist links as audio with no track', () => {
		const r = detectContentType('https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx');
		expect(r).toEqual({ type: 'AUDIO_TRACK', url: 'https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx', link: null });
	});

	it('keeps plain YouTube links as videos', () => {
		expect(detectContentType('https://www.youtube.com/watch?v=dQw4w9WgXcQ').type).toBe('YOUTUBE_VIDEO');
	});
});
```

(If this file imports `detectContentType` under another name, use that. Any existing case expecting a `music.youtube.com` link to be `YOUTUBE_VIDEO` changes to `AUDIO_TRACK`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/audioLinks.test.ts tests/unit/genreTree.test.ts tests/unit/detectContentType.test.ts`
Expected: FAIL. The new modules fail to resolve, and the audio detection cases get `YOUTUBE_VIDEO` or `null`.

- [ ] **Step 3: Implement**

`frontend/src/lib/utils/audioLinks.ts`:

```ts
import { classifyYouTubeUrl } from './youtube';

/** Mirrors backend/internal/adapters/musiclinks (ADR 0002): the same ids and canonical urls. */
export type MusicProvider = 'youtube' | 'spotify' | 'apple_music' | 'amazon_music';

export interface ParsedMusicLink {
	provider: MusicProvider;
	providerTrackId: string;
	canonicalUrl: string;
	kind: 'LISTEN' | 'EMBED';
	/** From an Apple song slug; a hint the user confirms, never trusted. */
	suggestedTitle: string;
}

export type MusicLinkResult = { ok: true; link: ParsedMusicLink } | { ok: false; reason: 'collection' | 'unsupported' };

export const PROVIDER_LABEL: Record<MusicProvider, string> = {
	youtube: 'YouTube Music',
	spotify: 'Spotify',
	apple_music: 'Apple Music',
	amazon_music: 'Amazon Music',
};

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const APPLE_ID = /^[0-9]{5,15}$/;
const ASIN = /^[A-Z0-9]{10}$/;
const COUNTRY = /^[a-z]{2}$/;
const UNSUPPORTED: MusicLinkResult = { ok: false, reason: 'unsupported' };
const COLLECTION: MusicLinkResult = { ok: false, reason: 'collection' };

const ok = (link: ParsedMusicLink): MusicLinkResult => ({ ok: true, link });
const spotify = (id: string): ParsedMusicLink => ({
	provider: 'spotify',
	providerTrackId: id,
	canonicalUrl: `https://open.spotify.com/track/${id}`,
	kind: 'LISTEN',
	suggestedTitle: '',
});
const titleFromSlug = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

export function parseMusicLink(input: string): MusicLinkResult {
	const s = input.trim();
	const uri = SPOTIFY_URI.exec(s);
	if (uri) return ok(spotify(uri[1]));
	if (!/^https?:\/\//i.test(s)) return UNSUPPORTED;
	let url: URL;
	try {
		url = new URL(s);
	} catch {
		return UNSUPPORTED;
	}
	const host = url.hostname.toLowerCase();
	let parts = url.pathname.split('/').filter(Boolean);

	if (host === 'open.spotify.com' || host === 'play.spotify.com') {
		if (parts[0]?.startsWith('intl-')) parts = parts.slice(1);
		if (parts[0] === 'track' && SPOTIFY_ID.test(parts[1] ?? '')) return ok(spotify(parts[1]));
		if (['album', 'playlist', 'artist', 'show', 'episode'].includes(parts[0] ?? '')) return COLLECTION;
		return UNSUPPORTED;
	}

	if (host === 'music.apple.com' || host === 'geo.music.apple.com') {
		const [cc, kind, ...rest] = parts;
		if (!cc || !COUNTRY.test(cc)) return UNSUPPORTED;
		const apple = (id: string, title: string) =>
			ok({ provider: 'apple_music', providerTrackId: id, canonicalUrl: `https://music.apple.com/${cc}/song/${id}`, kind: 'LISTEN', suggestedTitle: title });
		if (kind === 'song') {
			if (rest.length === 1 && APPLE_ID.test(rest[0])) return apple(rest[0], '');
			if (rest.length === 2 && APPLE_ID.test(rest[1])) return apple(rest[1], titleFromSlug(rest[0]));
			return UNSUPPORTED;
		}
		if (kind === 'album') {
			const i = url.searchParams.get('i') ?? '';
			return APPLE_ID.test(i) ? apple(i, '') : COLLECTION;
		}
		if (['playlist', 'artist', 'station', 'music-video'].includes(kind ?? '')) return COLLECTION;
		return UNSUPPORTED;
	}

	if (host.startsWith('music.amazon.')) {
		const amazon = (asin: string) =>
			ok({ provider: 'amazon_music', providerTrackId: asin, canonicalUrl: `https://${host}/tracks/${asin}`, kind: 'LISTEN', suggestedTitle: '' });
		if (parts[0] === 'tracks') return ASIN.test(parts[1] ?? '') ? amazon(parts[1]) : UNSUPPORTED;
		if (parts[0] === 'albums') {
			const t = url.searchParams.get('trackAsin') ?? '';
			return ASIN.test(t) ? amazon(t) : COLLECTION;
		}
		if (['playlists', 'artists', 'user-playlists', 'podcasts'].includes(parts[0] ?? '')) return COLLECTION;
		return UNSUPPORTED;
	}

	if (host === 'music.youtube.com') {
		const kind = classifyYouTubeUrl(s);
		if (kind === 'musicCollection') return COLLECTION;
		const v = url.searchParams.get('v');
		if (kind === 'musicTrack' && v) {
			return ok({ provider: 'youtube', providerTrackId: v, canonicalUrl: `https://music.youtube.com/watch?v=${v}`, kind: 'EMBED', suggestedTitle: '' });
		}
	}
	return UNSUPPORTED;
}

export function providerOfUrl(url: string | null | undefined): MusicProvider | null {
	if (!url) return null;
	const r = parseMusicLink(url);
	return r.ok ? r.link.provider : null;
}
```

`frontend/src/lib/utils/genreTree.ts`:

```ts
/** Option C genre tree helpers (ADR 0006), ported from the picker preview. */
export interface GenreInput {
	id: string;
	name: string;
	parentId: string | null;
}

export interface GenreNode extends GenreInput {
	path: string[];
	children: GenreNode[];
}

/** Lowercase, accents removed, punctuation collapsed: "Forró" → "forro", "Hip-Hop/Rap" → "hip hop rap". */
export function normalizeGenreText(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9&]+/g, ' ')
		.trim();
}

const byName = (a: GenreNode, b: GenreNode) => a.name.localeCompare(b.name);

export function buildGenreTree(genres: readonly GenreInput[]): GenreNode[] {
	const nodes = new Map<string, GenreNode>();
	for (const g of genres) nodes.set(g.id, { id: g.id, name: g.name, parentId: g.parentId, path: [], children: [] });
	const roots: GenreNode[] = [];
	for (const n of nodes.values()) {
		const parent = n.parentId ? nodes.get(n.parentId) : undefined;
		(parent ? parent.children : roots).push(n);
	}
	const finish = (list: GenreNode[], prefix: string[]) => {
		list.sort(byName);
		for (const n of list) {
			n.path = [...prefix, n.name];
			finish(n.children, n.path);
		}
	};
	finish(roots, []);
	return roots;
}

/** Nodes whose name matches, plus every ancestor of a match. A blank query returns the tree. */
export function filterGenreTree(roots: GenreNode[], query: string): GenreNode[] {
	const q = normalizeGenreText(query);
	if (!q) return roots;
	const walk = (list: GenreNode[]): GenreNode[] =>
		list.flatMap((n) => {
			const kids = walk(n.children);
			return normalizeGenreText(n.name).includes(q) || kids.length ? [{ ...n, children: kids }] : [];
		});
	return walk(roots);
}

export function flattenGenres(roots: GenreNode[]): Map<string, GenreNode> {
	const out = new Map<string, GenreNode>();
	const walk = (list: GenreNode[]) => {
		for (const n of list) {
			out.set(n.id, n);
			walk(n.children);
		}
	};
	walk(roots);
	return out;
}

export const RECENT_GENRES_KEY = 'perspectize:recent-genres';
export const MAX_RECENT_GENRES = 5;

export function pushRecent(recent: readonly string[], id: string): string[] {
	return [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT_GENRES);
}

/** Per-viewer convenience only; empty when storage is blocked or garbled. */
export function loadRecentGenres(): string[] {
	try {
		const v: unknown = JSON.parse(localStorage.getItem(RECENT_GENRES_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT_GENRES) : [];
	} catch {
		return [];
	}
}

export function saveRecentGenres(ids: readonly string[]): void {
	try {
		localStorage.setItem(RECENT_GENRES_KEY, JSON.stringify(ids));
	} catch {
		// storage blocked: Recent just won't persist
	}
}

/** Mirror of the backend rule (the UPDATE in GormMusicGenreRepository is the authority). */
export const GENRE_CHANGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function canChangeGenre(
	track: { genreId: string | null; addedByUserID: string; createdAt: string },
	viewerId: string | null,
	now = Date.now(),
): boolean {
	if (!viewerId) return false;
	if (!track.genreId) return true;
	return track.addedByUserID === viewerId && now - Date.parse(track.createdAt) < GENRE_CHANGE_WINDOW_MS;
}
```

`frontend/src/lib/utils/detectContentType.ts`:
- Add the import `import { parseMusicLink, type ParsedMusicLink } from './audioLinks';`.
- Extend the union:

  ```ts
  	/** A music link. `link` is null for an album/playlist/artist link (not addable; the form says so). */
  	| { type: 'AUDIO_TRACK'; url: string; link: ParsedMusicLink | null }
  ```
- Add the following as the first check in `detectContentCandidates`, after the empty-input return. Also change the precedence doc comment to: Music link > YouTube URL > movie link > Bible Gateway URL > typed Bible reference > free-text claim.

  ```ts
  	const music = parseMusicLink(trimmed);
  	if (music.ok) return [{ type: 'AUDIO_TRACK', url: trimmed, link: music.link }];
  	if (music.reason === 'collection') return [{ type: 'AUDIO_TRACK', url: trimmed, link: null }];
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/audioLinks.test.ts tests/unit/genreTree.test.ts tests/unit/detectContentType.test.ts tests/unit/detectContentType.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): music link parsing, audio detection and genre tree helpers"
```

---

### Task 13: `MusicGenrePicker`

This is the Option C picker from the preview, as a Svelte 5 component. Its states:
- open or closed;
- browsing with branches expanded or collapsed;
- searching, where matching branches are open unless closed;
- Recent populated or empty.

Each state has a test.

**Files:**
- Create: `frontend/src/lib/components/MusicGenrePicker.svelte`
- Test: `frontend/tests/components/MusicGenrePicker.test.ts`

**Interfaces:**
- Consumes: `buildGenreTree`, `filterGenreTree`, `flattenGenres`, `pushRecent`, `loadRecentGenres`, `saveRecentGenres` and `GenreInput` (Task 12).
- Produces: `<MusicGenrePicker genres={GenreInput[]} value={string | null} onSelect={(id: string) => void} label?="Genre" disabled?={boolean} />`. The trigger shows the selected path joined with ` › `, or `Choose a genre`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/components/MusicGenrePicker.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MusicGenrePicker from '$lib/components/MusicGenrePicker.svelte';

const genres = [
	{ id: '21', name: 'Rock', parentId: null },
	{ id: '1152', name: 'Hard Rock', parentId: '21' },
	{ id: '19', name: 'Regional & Cultural', parentId: null },
	{ id: '1122', name: 'Brazilian', parentId: '19' },
	{ id: '1223', name: 'Forró', parentId: '1122' },
	{ id: '18', name: 'Hip-Hop/Rap', parentId: null },
	{ id: '1073', name: 'Hip-Hop', parentId: '18' },
	{ id: '5', name: 'Classical', parentId: null },
];

function setup(value: string | null = null) {
	const onSelect = vi.fn();
	render(MusicGenrePicker, { props: { genres, value, onSelect } });
	return { onSelect, trigger: screen.getByRole('button', { name: value ? /›|Rock|Classical/ : 'Choose a genre' }) };
}

const treeNames = () => screen.queryAllByRole('treeitem').map((li) => li.querySelector('.pick')!.textContent!.trim());

describe('MusicGenrePicker', () => {
	beforeEach(() => localStorage.clear());

	it('closed: shows the chosen path, or a prompt', () => {
		render(MusicGenrePicker, { props: { genres, value: '1152', onSelect: vi.fn() } });
		expect(screen.getByRole('button', { name: 'Rock › Hard Rock' })).toBeInTheDocument();
		expect(screen.queryByRole('tree')).not.toBeInTheDocument();
	});

	it('open: roots are alphabetical and collapsed', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		expect(treeNames()).toEqual(['Classical', 'Hip-Hop/Rap', 'Regional & Cultural', 'Rock']);
	});

	it('clicking a parent name toggles it; clicking a leaf picks it and closes', async () => {
		const { trigger, onSelect } = setup();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Rock' }));
		expect(screen.getByRole('button', { name: 'Hard Rock' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Rock' }));
		expect(screen.queryByRole('button', { name: 'Hard Rock' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Expand Rock' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Hard Rock' }));
		expect(onSelect).toHaveBeenCalledWith('1152');
		expect(screen.queryByRole('tree')).not.toBeInTheDocument();
	});

	it('Select picks a parent', async () => {
		const { trigger, onSelect } = setup();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Select Rock' }));
		expect(onSelect).toHaveBeenCalledWith('21');
	});

	// Review Focus 3.
	it('search ignores accents and keeps matching parents', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search genres' }), { target: { value: 'forro' } });
		expect(treeNames()).toEqual(['Regional & Cultural', 'Brazilian', 'Forró']);
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search genres' }), { target: { value: 'hip hop' } });
		expect(treeNames()).toEqual(['Hip-Hop/Rap', 'Hip-Hop']);
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search genres' }), { target: { value: 'zzz' } });
		expect(screen.getByText(/No genre matches/)).toBeInTheDocument();
	});

	it('Expand all and Collapse all', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
		expect(screen.getByRole('button', { name: 'Forró' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
		expect(screen.queryByRole('button', { name: 'Forró' })).not.toBeInTheDocument();
	});

	it('Escape closes', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		await fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search genres' }), { key: 'Escape' });
		expect(screen.queryByRole('tree')).not.toBeInTheDocument();
	});

	it('Recent shows earlier picks and re-picks in one click', async () => {
		const { trigger, onSelect } = setup();
		expect(screen.queryByText('Recent')).not.toBeInTheDocument();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Select Rock' }));
		await fireEvent.click(trigger);
		const chip = screen.getByRole('button', { name: 'Rock', description: undefined });
		expect(screen.getByText('Recent')).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('perspectize:recent-genres')!)).toEqual(['21']);
		await fireEvent.click(screen.getAllByTitle('Rock')[0]);
		expect(onSelect).toHaveBeenLastCalledWith('21');
		expect(chip).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/components/MusicGenrePicker.test.ts`
Expected: FAIL with `Failed to resolve import "$lib/components/MusicGenrePicker.svelte"`.

- [ ] **Step 3: Implement**

`frontend/src/lib/components/MusicGenrePicker.svelte`:

```svelte
<script lang="ts">
	import {
		buildGenreTree,
		filterGenreTree,
		flattenGenres,
		loadRecentGenres,
		pushRecent,
		saveRecentGenres,
		type GenreInput,
		type GenreNode,
	} from '$lib/utils/genreTree';

	let {
		genres,
		value = null,
		onSelect,
		label = 'Genre',
		disabled = false,
	}: {
		genres: readonly GenreInput[];
		value?: string | null;
		onSelect: (id: string) => void;
		label?: string;
		disabled?: boolean;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let expanded = $state(new Set<string>());
	// While searching every matching branch is open, unless the user closed it.
	let closedInSearch = $state(new Set<string>());
	let recent = $state<string[]>(loadRecentGenres());

	const tree = $derived(buildGenreTree(genres));
	const byId = $derived(flattenGenres(tree));
	const visible = $derived(filterGenreTree(tree, query));
	const searching = $derived(query.trim() !== '');
	const selected = $derived(value ? (byId.get(value) ?? null) : null);
	const recentNodes = $derived(recent.map((id) => byId.get(id)).filter((n): n is GenreNode => !!n));

	function isOpen(n: GenreNode) {
		return searching ? !closedInSearch.has(n.id) : expanded.has(n.id);
	}

	function toggle(n: GenreNode) {
		const set = new Set(searching ? closedInSearch : expanded);
		if (set.has(n.id)) set.delete(n.id);
		else set.add(n.id);
		if (searching) closedInSearch = set;
		else expanded = set;
	}

	function expandAll() {
		expanded = new Set(byId.keys());
		closedInSearch = new Set();
	}

	function collapseAll() {
		expanded = new Set();
		if (searching) closedInSearch = new Set(byId.keys());
	}

	function finish(n: GenreNode) {
		recent = pushRecent(recent, n.id);
		saveRecentGenres(recent);
		onSelect(n.id);
		open = false;
		query = '';
		closedInSearch = new Set();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation(); // don't close the surrounding dialog/popover
			open = false;
		}
	}
</script>

<div class="relative" data-testid="music-genre-picker">
	<button
		type="button"
		class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-left text-[13px] hover:bg-muted disabled:opacity-50"
		aria-haspopup="tree"
		aria-expanded={open}
		{disabled}
		onclick={() => (open = !open)}
	>
		{selected ? selected.path.join(' › ') : 'Choose a genre'}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-background p-2 text-[13px] shadow-md"
			role="dialog"
			aria-label="Choose a genre"
			tabindex="-1"
			onkeydown={onKeydown}
		>
			<input
				type="search"
				class="w-full rounded border border-border bg-background px-2 py-1"
				placeholder="Search genres"
				aria-label="Search genres"
				bind:value={query}
				oninput={() => (closedInSearch = new Set())}
			/>
			<div class="mt-1.5 flex gap-2 text-[12px]">
				<button type="button" class="text-primary hover:underline" onclick={expandAll}>Expand all</button>
				<button type="button" class="text-primary hover:underline" onclick={collapseAll}>Collapse all</button>
			</div>
			{#if recentNodes.length}
				<div class="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Recent genres">
					<span class="text-[12px] text-muted-foreground">Recent</span>
					{#each recentNodes as n (n.id)}
						<button type="button" class="rounded-full border border-border px-2 py-0.5 hover:bg-muted" title={n.path.join(' › ')} onclick={() => finish(n)}
							>{n.name}</button
						>
					{/each}
				</div>
			{/if}
			<ul role="tree" aria-label={label} class="mt-2">
				{#each visible as node (node.id)}
					{@render branch(node)}
				{/each}
			</ul>
			{#if visible.length === 0}
				<p class="px-1 py-2 text-muted-foreground">No genre matches “{query}”.</p>
			{/if}
		</div>
	{/if}
</div>

{#snippet branch(n: GenreNode)}
	<li role="treeitem" aria-expanded={n.children.length ? isOpen(n) : undefined} aria-selected={n.id === value}>
		<div class="flex items-center gap-1">
			{#if n.children.length}
				<button type="button" class="h-7 w-6 shrink-0 rounded text-[11px] text-muted-foreground hover:bg-muted" aria-label={(isOpen(n) ? 'Collapse ' : 'Expand ') + n.name} onclick={() => toggle(n)}
					>{isOpen(n) ? '▼' : '▶'}</button
				>
			{:else}
				<span class="h-7 w-6 shrink-0"></span>
			{/if}
			<button type="button" class="pick flex-1 rounded px-1 py-1 text-left hover:bg-muted" class:font-semibold={n.id === value} onclick={() => (n.children.length ? toggle(n) : finish(n))}
				>{n.name}</button
			>
			{#if n.children.length}
				<button type="button" class="rounded px-1.5 text-[12px] text-primary hover:underline" aria-label={'Select ' + n.path.join(' › ')} onclick={() => finish(n)}>Select</button>
			{/if}
		</div>
		{#if n.children.length && isOpen(n)}
			<ul role="group" class="ml-4">
				{#each n.children as child (child.id)}
					{@render branch(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}
```

(The Recent chips have the accessible name `n.name` and `title` = the full path. That is why the test clicks `getAllByTitle('Rock')[0]`. A root's path is just its name.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir frontend exec vitest run tests/components/MusicGenrePicker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): Option C music genre picker"
```

---

### Task 14: Playback safeguards (coordinator, player, setting)

Ticket 03 requirements covered here:
- One active player per tab and across tabs, with an override that is off by default.
- No autoplay and no auto-advance.
- Only 101 and 150 mark a link unavailable; 153 shows a setup message and marks nothing.

The modal-close stop is in Task 16.

**Files:**
- Create: `frontend/src/lib/utils/playerCoordinator.ts`
- Create: `frontend/src/lib/stores/playbackSettings.svelte.ts`
- Create: `frontend/src/lib/components/PlaybackSettingsRow.svelte`
- Modify: `frontend/src/lib/utils/mediaPlayer.ts`
- Modify: `frontend/src/lib/components/MediaPlayer.svelte`
- Modify: `frontend/src/lib/components/SettingsDialog.svelte` (mount the row in the General section)
- Test: `frontend/tests/unit/playerCoordinator.test.ts`, `frontend/tests/unit/mediaPlayer.test.ts`, `frontend/tests/components/MediaPlayer.test.ts` and `frontend/tests/components/PlaybackSettingsRow.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```ts
  // playerCoordinator.ts
  export const PLAYER_CHANNEL = 'perspectize-player';
  export type ChannelLike = Pick<BroadcastChannel, 'postMessage' | 'addEventListener'>;
  export interface PlayerCoordinator { register(playerId: string, pause: () => void): () => void; playing(playerId: string): void }
  export function createPlayerCoordinator(opts: { channel: ChannelLike | null; allowOverlap?: () => boolean; tabId?: string }): PlayerCoordinator;
  export const playerCoordinator: PlayerCoordinator; // app singleton (BroadcastChannel + playbackSettings)
  // playbackSettings.svelte.ts
  export const OVERLAP_SETTING_KEY = 'perspectize:allow-overlapping-playback';
  export const playbackSettings: { readonly allowOverlappingPlayback: boolean; set(v: boolean): void };
  // mediaPlayer.ts
  export type EmbedEvent = { type: 'unplayable'; code: number; markUnavailable: boolean } | { type: 'config'; code: number }
    | { type: 'error'; code: number } | { type: 'playing' } | { type: 'paused' } | { type: 'ended' } | null;
  export const LISTEN_COMMAND: string; export const PAUSE_COMMAND: string;
  // MediaPlayer.svelte: onUnplayable?: (videoId: string, code: number) => void — now called ONLY for 101/150.
  //   The root div carries data-state="idle|playing|paused" (the demo clip reads it).
  ```

- [ ] **Step 1: Write the failing tests**

`frontend/tests/unit/playerCoordinator.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPlayerCoordinator, type ChannelLike } from '$lib/utils/playerCoordinator';

/** Two in-memory "tabs" joined like a BroadcastChannel (no echo to the sender). */
function channelPair(): [ChannelLike, ChannelLike] {
	const a = new EventTarget() as EventTarget & ChannelLike;
	const b = new EventTarget() as EventTarget & ChannelLike;
	a.postMessage = (data: unknown) => void b.dispatchEvent(new MessageEvent('message', { data }));
	b.postMessage = (data: unknown) => void a.dispatchEvent(new MessageEvent('message', { data }));
	return [a, b];
}

describe('player coordinator', () => {
	it('starting one player pauses the others in the tab, never itself', () => {
		const c = createPlayerCoordinator({ channel: null });
		const pauseA = vi.fn();
		const pauseB = vi.fn();
		c.register('a', pauseA);
		c.register('b', pauseB);
		c.playing('b');
		expect(pauseA).toHaveBeenCalledOnce();
		expect(pauseB).not.toHaveBeenCalled();
	});

	it('a player starting in another tab pauses every player here', () => {
		const [chA, chB] = channelPair();
		const tabA = createPlayerCoordinator({ channel: chA, tabId: 'A' });
		const tabB = createPlayerCoordinator({ channel: chB, tabId: 'B' });
		const pauseInA = vi.fn();
		const pauseInB = vi.fn();
		tabA.register('a1', pauseInA);
		tabB.register('b1', pauseInB);
		tabB.playing('b1');
		expect(pauseInA).toHaveBeenCalledOnce();
		expect(pauseInB).not.toHaveBeenCalled();
	});

	it('override on: nothing is paused and nothing is broadcast', () => {
		const [chA, chB] = channelPair();
		const post = vi.spyOn(chB, 'postMessage');
		const tabA = createPlayerCoordinator({ channel: chA, tabId: 'A' });
		const tabB = createPlayerCoordinator({ channel: chB, tabId: 'B', allowOverlap: () => true });
		const pauseInA = vi.fn();
		const pauseInB2 = vi.fn();
		tabA.register('a1', pauseInA);
		tabB.register('b1', vi.fn());
		tabB.register('b2', pauseInB2);
		tabB.playing('b1');
		expect(post).not.toHaveBeenCalled();
		expect(pauseInA).not.toHaveBeenCalled();
		expect(pauseInB2).not.toHaveBeenCalled();
	});

	it('an unregistered player is never paused', () => {
		const c = createPlayerCoordinator({ channel: null });
		const pause = vi.fn();
		const unregister = c.register('a', pause);
		unregister();
		c.register('b', vi.fn());
		c.playing('b');
		expect(pause).not.toHaveBeenCalled();
	});
});
```

Replace the `parseEmbedMessage` cases in `frontend/tests/unit/mediaPlayer.test.ts` with the following. Keep the file's `playbackQueue` and `lyricsNeedRecheck` cases.

```ts
describe('parseEmbedMessage', () => {
	const msg = (event: string, info: unknown) => JSON.stringify({ event, info });

	// Review Focus 4: ticket 03 — only 101 and 150 mark a link unavailable.
	it('only 101 and 150 mark', () => {
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 101))).toEqual({ type: 'unplayable', code: 101, markUnavailable: true });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 150))).toEqual({ type: 'unplayable', code: 150, markUnavailable: true });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 100))).toEqual({ type: 'unplayable', code: 100, markUnavailable: false });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 153))).toEqual({ type: 'config', code: 153 });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 2))).toEqual({ type: 'error', code: 2 });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onError', 5))).toEqual({ type: 'error', code: 5 });
	});

	it('reads play state from onStateChange and infoDelivery', () => {
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onStateChange', 1))).toEqual({ type: 'playing' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onStateChange', 2))).toEqual({ type: 'paused' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('onStateChange', 0))).toEqual({ type: 'ended' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('infoDelivery', { playerState: 1 }))).toEqual({ type: 'playing' });
		expect(parseEmbedMessage(EMBED_ORIGIN, msg('infoDelivery', { currentTime: 3 }))).toBeNull();
	});

	it('ignores other origins and junk', () => {
		expect(parseEmbedMessage('https://evil.example', msg('onError', 150))).toBeNull();
		expect(parseEmbedMessage(EMBED_ORIGIN, 'not json')).toBeNull();
		expect(parseEmbedMessage(EMBED_ORIGIN, { event: 'onError' })).toBeNull();
	});
});

describe('embedUrl', () => {
	it('never autoplays', () => {
		expect(embedUrl('AAAAAAAAAAA', 'http://localhost')).toContain('autoplay=0');
	});
});
```

(Import `embedUrl` alongside `parseEmbedMessage` and `EMBED_ORIGIN`.)

In `frontend/tests/components/MediaPlayer.test.ts`:
- Change the existing expectation `expect(onUnplayable).toHaveBeenCalledWith('AAAAAAAAAAA')` to `expect(onUnplayable).toHaveBeenCalledWith('AAAAAAAAAAA', 150)`.
- Add a generic event helper and these cases:

```ts
function embedEvent(payload: object, frame = document.querySelector('iframe')!) {
	window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload), origin: EMBED_ORIGIN, source: frame.contentWindow }));
}

describe('MediaPlayer safeguards', () => {
	it('153 marks nothing, keeps the upload and explains the setup problem', async () => {
		const onUnplayable = vi.fn();
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'], onUnplayable } });
		embedError(153);
		await tick();
		expect(onUnplayable).not.toHaveBeenCalled();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/AAAAAAAAAAA?');
		expect(screen.getByRole('status')).toHaveTextContent(/error 153/);
	});

	it('100 moves to the next upload without marking anything', async () => {
		const onUnplayable = vi.fn();
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'], onUnplayable } });
		embedError(100);
		await tick();
		expect(onUnplayable).not.toHaveBeenCalled();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/BBBBBBBBBBB?');
	});

	it('the end of a song never advances to anything else', async () => {
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA', 'BBBBBBBBBBB'] } });
		embedEvent({ event: 'onStateChange', info: 0 });
		await tick();
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('/embed/AAAAAAAAAAA?');
		expect(document.querySelector('iframe')!.getAttribute('src')).toContain('autoplay=0');
	});

	it('starting a second player pauses the first', async () => {
		render(MediaPlayer, { props: { ...props, queue: ['AAAAAAAAAAA'] } });
		render(MediaPlayer, { props: { ...props, queue: ['BBBBBBBBBBB'] } });
		const [first, second] = [...document.querySelectorAll('iframe')];
		const pauseFirst = vi.spyOn(first.contentWindow!, 'postMessage');
		embedEvent({ event: 'onStateChange', info: 1 }, first);
		await tick();
		pauseFirst.mockClear();
		embedEvent({ event: 'onStateChange', info: 1 }, second);
		await tick();
		expect(pauseFirst).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), EMBED_ORIGIN);
		const players = document.querySelectorAll('[data-testid="media-player"]');
		expect(players[0].getAttribute('data-state')).toBe('paused');
		expect(players[1].getAttribute('data-state')).toBe('playing');
	});
});
```

`frontend/tests/components/PlaybackSettingsRow.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import PlaybackSettingsRow from '$lib/components/PlaybackSettingsRow.svelte';
import { playbackSettings, OVERLAP_SETTING_KEY } from '$lib/stores/playbackSettings.svelte';

describe('PlaybackSettingsRow', () => {
	beforeEach(() => {
		localStorage.clear();
		playbackSettings.set(false);
	});

	it('is off by default', () => {
		render(PlaybackSettingsRow);
		expect(screen.getByRole('switch', { name: /more than one player/i })).not.toBeChecked();
	});

	it('turning it on persists for this viewer', async () => {
		render(PlaybackSettingsRow);
		await fireEvent.click(screen.getByRole('switch', { name: /more than one player/i }));
		expect(playbackSettings.allowOverlappingPlayback).toBe(true);
		expect(localStorage.getItem(OVERLAP_SETTING_KEY)).toBe('true');
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/playerCoordinator.test.ts tests/unit/mediaPlayer.test.ts tests/components/MediaPlayer.test.ts tests/components/PlaybackSettingsRow.test.ts`
Expected: FAIL. The new modules fail to resolve, `parseEmbedMessage` returns the old shapes, and there is no `autoplay=0`.

- [ ] **Step 3: Implement**

`frontend/src/lib/stores/playbackSettings.svelte.ts`:

```ts
/** Per-viewer playback preference (ticket 03): off by default. localStorage is a convenience only. */
export const OVERLAP_SETTING_KEY = 'perspectize:allow-overlapping-playback';

function read(): boolean {
	try {
		return localStorage.getItem(OVERLAP_SETTING_KEY) === 'true';
	} catch {
		return false;
	}
}

class PlaybackSettings {
	allowOverlappingPlayback = $state(read());

	set(value: boolean) {
		this.allowOverlappingPlayback = value;
		try {
			localStorage.setItem(OVERLAP_SETTING_KEY, String(value));
		} catch {
			// storage blocked: the choice lasts for this page only
		}
	}
}

export const playbackSettings = new PlaybackSettings();
```

`frontend/src/lib/utils/playerCoordinator.ts`:

```ts
import { playbackSettings } from '$lib/stores/playbackSettings.svelte';

/**
 * One active player per tab and across tabs (ticket 03). A player registers a
 * pause callback and reports when it starts playing; every other registered
 * player here is paused, and other tabs hear about it on a BroadcastChannel.
 * With the viewer's override on, nothing is paused or broadcast.
 */
export const PLAYER_CHANNEL = 'perspectize-player';

export type ChannelLike = Pick<BroadcastChannel, 'postMessage' | 'addEventListener'>;

export interface PlayerCoordinator {
	register(playerId: string, pause: () => void): () => void;
	playing(playerId: string): void;
}

type PlayingMessage = { type: 'playing'; tabId: string; playerId: string };

export function createPlayerCoordinator(opts: { channel: ChannelLike | null; allowOverlap?: () => boolean; tabId?: string }): PlayerCoordinator {
	const allowOverlap = opts.allowOverlap ?? (() => false);
	const tabId = opts.tabId ?? Math.random().toString(36).slice(2);
	const players = new Map<string, () => void>();

	const pauseAllExcept = (playerId: string | null) => {
		for (const [id, pause] of players) if (id !== playerId) pause();
	};

	opts.channel?.addEventListener('message', (e: Event) => {
		const msg = (e as MessageEvent).data as PlayingMessage | undefined;
		if (msg?.type !== 'playing' || msg.tabId === tabId || allowOverlap()) return;
		pauseAllExcept(null);
	});

	return {
		register(playerId, pause) {
			players.set(playerId, pause);
			return () => players.delete(playerId);
		},
		playing(playerId) {
			if (allowOverlap()) return;
			pauseAllExcept(playerId);
			opts.channel?.postMessage({ type: 'playing', tabId, playerId } satisfies PlayingMessage);
		},
	};
}

function browserChannel(): ChannelLike | null {
	try {
		return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PLAYER_CHANNEL);
	} catch {
		return null;
	}
}

export const playerCoordinator = createPlayerCoordinator({
	channel: typeof window === 'undefined' ? null : browserChannel(),
	allowOverlap: () => playbackSettings.allowOverlappingPlayback,
});
```

`frontend/src/lib/utils/mediaPlayer.ts`. Replace `UNPLAYABLE`, `EmbedEvent`, `parseEmbedMessage` and `embedUrl` with:

```ts
// Ticket 03: only these mark a link unavailable (per link, never re-checked in v1).
const MARK_UNAVAILABLE = new Set([101, 150]);
// "This upload will not play here": try the next upload of the same song.
const SKIP_TO_NEXT = new Set([100, 101, 150]);
// 153 = the embed got no referrer: our setup, not the song. Never marks anything.
const CONFIG_ERROR = 153;

export type EmbedEvent =
	| { type: 'unplayable'; code: number; markUnavailable: boolean }
	| { type: 'config'; code: number }
	| { type: 'error'; code: number }
	| { type: 'playing' }
	| { type: 'paused' }
	| { type: 'ended' }
	| null;

const STATE_EVENTS: Record<number, EmbedEvent> = { 0: { type: 'ended' }, 1: { type: 'playing' }, 2: { type: 'paused' } };

/** Reads a postMessage from a youtube-nocookie embed (enablejsapi=1). Ignores everything else. */
export function parseEmbedMessage(origin: string, data: unknown): EmbedEvent {
	if (origin !== EMBED_ORIGIN || typeof data !== 'string') return null;
	let msg: { event?: string; info?: unknown };
	try {
		msg = JSON.parse(data);
	} catch {
		return null;
	}
	if (msg?.event === 'onError' && typeof msg.info === 'number') {
		if (msg.info === CONFIG_ERROR) return { type: 'config', code: msg.info };
		if (SKIP_TO_NEXT.has(msg.info)) return { type: 'unplayable', code: msg.info, markUnavailable: MARK_UNAVAILABLE.has(msg.info) };
		return { type: 'error', code: msg.info };
	}
	if (msg?.event === 'onStateChange' && typeof msg.info === 'number') return STATE_EVENTS[msg.info] ?? null;
	if (msg?.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
		const state = (msg.info as { playerState?: unknown }).playerState;
		return typeof state === 'number' ? (STATE_EVENTS[state] ?? null) : null;
	}
	return null;
}

/** Sent on iframe load: the embed only posts events after the parent says it is listening. */
export const LISTEN_COMMAND = JSON.stringify({ event: 'listening', id: 'perspectize-player' });
export const PAUSE_COMMAND = JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] });

export function embedUrl(videoId: string, pageOrigin: string): string {
	// autoplay=0: nothing plays until the user presses play (ticket 03).
	const q = new URLSearchParams({ enablejsapi: '1', origin: pageOrigin, rel: '0', modestbranding: '1', autoplay: '0' });
	return `${EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?${q}`;
}
```

`frontend/src/lib/components/MediaPlayer.svelte`. Replace the `<script>` block and add the status line and `data-state`:

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { embedUrl, parseEmbedMessage, EMBED_ORIGIN, LISTEN_COMMAND, PAUSE_COMMAND } from '$lib/utils/mediaPlayer';
	import { playerCoordinator } from '$lib/utils/playerCoordinator';

	let {
		queue,
		title,
		fallbackUrl,
		fallbackLabel = 'Open in YouTube Music',
		onUnplayable,
	}: {
		/** Video IDs in the order to try them. */
		queue: string[];
		title: string;
		fallbackUrl: string | null;
		fallbackLabel?: string;
		/** Called once per video the embed rejects with 101/150 (ticket 03). Never for 153 or other codes. */
		onUnplayable?: (videoId: string, code: number) => void;
	} = $props();

	const playerId = `player-${Math.random().toString(36).slice(2)}`;
	let index = $state(0);
	let iframe = $state<HTMLIFrameElement | null>(null);
	let playState = $state<'idle' | 'playing' | 'paused'>('idle');
	let configError = $state(false);
	const current = $derived(queue[index] ?? null);
	const origin = typeof window === 'undefined' ? '' : window.location.origin;

	// A new queue (another track opened) starts from the top.
	$effect(() => {
		void queue;
		index = 0;
		configError = false;
	});

	function pause() {
		iframe?.contentWindow?.postMessage(PAUSE_COMMAND, EMBED_ORIGIN);
		playState = 'paused';
	}

	// Removing the player (modal closed, track changed) releases its slot.
	const unregister = playerCoordinator.register(playerId, pause);
	onDestroy(unregister);

	function handleLoad() {
		iframe?.contentWindow?.postMessage(LISTEN_COMMAND, EMBED_ORIGIN);
	}

	$effect(() => {
		const id = current;
		const frame = iframe;
		if (!id || !frame) return;
		const onMessage = (e: MessageEvent) => {
			if (e.source !== frame.contentWindow) return;
			const event = parseEmbedMessage(e.origin, e.data);
			if (!event) return;
			switch (event.type) {
				case 'playing':
					playState = 'playing';
					playerCoordinator.playing(playerId);
					break;
				case 'paused':
				case 'ended': // never auto-advance (ticket 03)
					playState = 'paused';
					break;
				case 'config':
					configError = true;
					break;
				case 'unplayable':
					if (event.markUnavailable) onUnplayable?.(id, event.code);
					playState = 'idle';
					index += 1;
					break;
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});
</script>
```

In the markup, change the root to `<div data-testid="media-player" data-state={playState}>`. Then add the following directly after the `{#if index > 0}…{/if}` note, inside the `{#if current}` branch:

```svelte
		{#if configError}
			<p role="status" class="mt-1.5 text-[12px] text-muted-foreground">
				This song can't start here because of a player setup problem (error 153), not the song. Use the link below.
			</p>
			{#if fallbackUrl}
				<a href={fallbackUrl} target="_blank" rel="noopener noreferrer" class="text-[12px] text-primary hover:underline">{fallbackLabel}</a>
			{/if}
		{/if}
```

`frontend/src/lib/components/PlaybackSettingsRow.svelte`:

```svelte
<script lang="ts">
	import { playbackSettings } from '$lib/stores/playbackSettings.svelte';
</script>

<label class="flex items-start justify-between gap-3" data-testid="playback-overlap-setting">
	<span>
		<span class="block text-sm font-medium">Allow more than one player at a time</span>
		<span class="block text-xs text-muted-foreground">Off: starting a song pauses any other song playing in Perspectize, in any tab.</span>
	</span>
	<input
		type="checkbox"
		role="switch"
		aria-label="Allow more than one player at a time"
		class="mt-1 h-4 w-4"
		checked={playbackSettings.allowOverlappingPlayback}
		onchange={(e) => playbackSettings.set(e.currentTarget.checked)}
	/>
</label>
```

In `frontend/src/lib/components/SettingsDialog.svelte`, import `PlaybackSettingsRow` and render `<PlaybackSettingsRow />` as the last row of the General section.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/playerCoordinator.test.ts tests/unit/mediaPlayer.test.ts tests/components/MediaPlayer.test.ts tests/components/PlaybackSettingsRow.test.ts tests/components/SettingsDialog.test.ts`
Expected: PASS. (If `SettingsDialog.test.ts` does not exist, drop it from the command.)

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): one active player across tabs, no autoplay, 101/150-only unavailability"
```

---
### Task 15: Add flow (paste a link, title/artist, genre, same-song prompt)

**Files:**
- Create: `frontend/src/lib/components/AudioTrackFields.svelte`
- Modify: `frontend/src/lib/components/AddContentPopover.svelte`
- Test: `frontend/tests/components/AudioTrackFields.test.ts` and `frontend/tests/components/AddContentPopover.test.ts`

**Interfaces:**
- Consumes:
  - `useAddAudioTrack` and `useMusicGenres` (Task 11);
  - `ParsedMusicLink` and `PROVIDER_LABEL` (Task 12);
  - `MusicGenrePicker` (Task 13);
  - `DetectionResult` `AUDIO_TRACK` (Task 12).
- Produces:
  - `<AudioTrackFields link bind:title bind:artist bind:genreId genres candidates disabled onSameSong onDifferentSong />`.
  - Popover behaviour:
    - Submitting an audio link sends `{ url: link.canonicalUrl, title?, artist?, genreId? }`.
    - When the result carries `sameSongCandidates`, the popover stays open and shows the prompt.
    - "Same song" re-submits with `sameAsContentId`. "No, it's a different song" re-submits with `createNew: true`.

States covered by tests:
- a link-only provider (title and artist shown, title required);
- a YouTube Music link (no title/artist fields);
- an album link (refused with the collection notice);
- a genre picked (sent with the request);
- a same-song prompt (shown; each answer re-submits);
- success (closes).

- [ ] **Step 1: Write the failing tests**

`frontend/tests/components/AudioTrackFields.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import AudioTrackFields from '$lib/components/AudioTrackFields.svelte';

const spotify = { provider: 'spotify', providerTrackId: '4uLU6hMCjMI75M1A2tKUQC', canonicalUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', kind: 'LISTEN', suggestedTitle: '' } as const;
const ytm = { provider: 'youtube', providerTrackId: 'dQw4w9WgXcQ', canonicalUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'EMBED', suggestedTitle: '' } as const;
const base = { genres: [{ id: '21', name: 'Rock', parentId: null }], candidates: [], disabled: false, onSameSong: vi.fn(), onDifferentSong: vi.fn() };

describe('AudioTrackFields', () => {
	it('link-only providers ask for the title and artist', () => {
		render(AudioTrackFields, { props: { ...base, link: spotify } });
		expect(screen.getByLabelText('Song title')).toBeInTheDocument();
		expect(screen.getByLabelText('Artist')).toBeInTheDocument();
		expect(screen.getByText(/Spotify links are not looked up/)).toBeInTheDocument();
	});

	it('YouTube Music links are looked up, so only the genre is asked', () => {
		render(AudioTrackFields, { props: { ...base, link: ytm } });
		expect(screen.queryByLabelText('Song title')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Choose a genre' })).toBeInTheDocument();
	});

	it('shows the same-song prompt and reports each answer', async () => {
		const onSameSong = vi.fn();
		const onDifferentSong = vi.fn();
		render(AudioTrackFields, {
			props: {
				...base,
				link: spotify,
				onSameSong,
				onDifferentSong,
				candidates: [{ id: '9', name: 'Bohemian Rhapsody', url: 'https://music.youtube.com/watch?v=x', audioTrack: { artist: 'Queen' } }],
			},
		});
		expect(screen.getByRole('group', { name: 'Same song?' })).toHaveTextContent('Bohemian Rhapsody — Queen');
		await fireEvent.click(screen.getByRole('button', { name: 'Same song' }));
		expect(onSameSong).toHaveBeenCalledWith('9');
		await fireEvent.click(screen.getByRole('button', { name: "No, it's a different song" }));
		expect(onDifferentSong).toHaveBeenCalledOnce();
	});
});
```

In `frontend/tests/components/AddContentPopover.test.ts`:
- Add `createQuery: vi.fn(() => ({ data: [] })),` to the `@tanstack/svelte-query` mock.
- Append this block:

```ts
describe('AddContentPopover audio tracks', () => {
	beforeEach(reset);

	async function openWith(value: string) {
		render(AddContentPopover);
		await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
		await tick();
		await fireEvent.input(screen.getByLabelText('Link or reference'), { target: { value } });
		await tick();
	}

	it('detects a Spotify song and requires a title', async () => {
		await openWith('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x');
		expect(screen.getByTestId('type-chip')).toHaveTextContent('Detected: Audio track (Spotify)');
		expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Song title'), { target: { value: 'Bohemian Rhapsody' } });
		await fireEvent.input(screen.getByLabelText('Artist'), { target: { value: 'Queen' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(mocks.mockMutate).toHaveBeenCalledWith(
			{ url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', title: 'Bohemian Rhapsody', artist: 'Queen' },
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);
	});

	it('prefills the title from an Apple Music slug', async () => {
		await openWith('https://music.apple.com/us/song/bohemian-rhapsody/1440650711');
		expect(screen.getByLabelText('Song title')).toHaveValue('Bohemian Rhapsody');
	});

	it('sends a YouTube Music song as an audio track, not a video', async () => {
		await openWith('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(mocks.mockMutate).toHaveBeenCalledWith({ url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' }, expect.anything());
		expect(mocks.mockValidate).not.toHaveBeenCalled();
	});

	it('refuses album links', async () => {
		await openWith('https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx');
		expect(screen.getByTestId('music-collection-notice')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
	});

	it('stays open on a same-song prompt and re-submits the answer', async () => {
		await openWith('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
		await fireEvent.input(screen.getByLabelText('Song title'), { target: { value: 'Bohemian Rhapsody' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		const [, opts] = mocks.mockMutate.mock.calls[0];
		opts.onSuccess({ content: null, alreadyExisted: false, sameSongCandidates: [{ id: '9', name: 'Bohemian Rhapsody', url: null, audioTrack: null }] });
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Same song' }));
		expect(mocks.mockMutate).toHaveBeenLastCalledWith(
			expect.objectContaining({ url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', sameAsContentId: 9 }),
			expect.anything(),
		);
		expect(screen.getByLabelText('Song title')).toBeInTheDocument(); // still open
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/components/AudioTrackFields.test.ts tests/components/AddContentPopover.test.ts`
Expected: FAIL. `AudioTrackFields.svelte` is missing, and the chip shows `Detected: YouTube Music` / `Select a type`.

- [ ] **Step 3: Implement**

`frontend/src/lib/components/AudioTrackFields.svelte`:

```svelte
<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import MusicGenrePicker from '$lib/components/MusicGenrePicker.svelte';
	import { PROVIDER_LABEL, type ParsedMusicLink } from '$lib/utils/audioLinks';
	import type { MusicGenre, SameSongCandidate } from '$lib/queries/content';

	let {
		link,
		title = $bindable(''),
		artist = $bindable(''),
		genreId = $bindable<string | null>(null),
		genres,
		candidates,
		disabled = false,
		onSameSong,
		onDifferentSong,
	}: {
		link: ParsedMusicLink;
		title?: string;
		artist?: string;
		genreId?: string | null;
		genres: readonly MusicGenre[];
		candidates: readonly SameSongCandidate[];
		disabled?: boolean;
		onSameSong: (contentId: string) => void;
		onDifferentSong: () => void;
	} = $props();

	// Only YouTube Music is looked up (InnerTube); the others are link-only in v1 (ADR 0002).
	const linkOnly = $derived(link.provider !== 'youtube');
</script>

<div class="space-y-3" data-testid="audio-track-fields">
	{#if linkOnly}
		<p class="text-[12px] text-muted-foreground">{PROVIDER_LABEL[link.provider]} links are not looked up. Add the song title and artist.</p>
		<div class="space-y-1">
			<Label for="audio-title">Song title</Label>
			<Input id="audio-title" bind:value={title} {disabled} autocomplete="off" />
		</div>
		<div class="space-y-1">
			<Label for="audio-artist">Artist</Label>
			<Input id="audio-artist" bind:value={artist} {disabled} autocomplete="off" />
		</div>
	{/if}

	<div class="space-y-1">
		<span class="text-sm font-medium">Genre (optional)</span>
		<MusicGenrePicker {genres} value={genreId} onSelect={(id) => (genreId = id)} {disabled} />
	</div>

	{#if candidates.length}
		<div role="group" aria-label="Same song?" class="space-y-2 rounded-md border border-border p-2.5 text-[13px]">
			<p class="font-medium">Is this the same song as one already here?</p>
			<ul class="space-y-1.5">
				{#each candidates as c (c.id)}
					<li class="flex items-center justify-between gap-2">
						<span class="min-w-0 truncate">{c.name}{c.audioTrack?.artist ? ` — ${c.audioTrack.artist}` : ''}</span>
						<button type="button" class="flex-none rounded-md border border-primary px-2 py-0.5 text-[12px] font-semibold text-primary" {disabled} onclick={() => onSameSong(c.id)}
							>Same song</button
						>
					</li>
				{/each}
			</ul>
			<button type="button" class="text-[12px] text-primary hover:underline" {disabled} onclick={onDifferentSong}>No, it's a different song</button>
		</div>
	{/if}
</div>
```

`frontend/src/lib/components/AddContentPopover.svelte`. Apply these edits:
1. Imports:

   ```ts
   	import AudioTrackFields from '$lib/components/AudioTrackFields.svelte';
   	import { useAddAudioTrack } from '$lib/queries/content/useAddAudioTrack';
   	import { useMusicGenres } from '$lib/queries/content/useAudioTrack';
   	import { PROVIDER_LABEL } from '$lib/utils/audioLinks';
   	import type { CreateAudioTrackInput, SameSongCandidate } from '$lib/queries/content';
   ```
2. `type ChosenType = 'YOUTUBE_VIDEO' | 'BIBLE_PASSAGE' | 'MOVIE' | 'AUDIO_TRACK';`
3. After `const movieMutation = useAddMovie();`:

   ```ts
   	// Also before useAddVideo, which must stay the last createMutation call.
   	const audioMutation = useAddAudioTrack();
   ```
4. New state next to `input`:

   ```ts
   	let audioTitle = $state('');
   	let audioArtist = $state('');
   	let audioGenreId = $state<string | null>(null);
   	let candidates = $state<SameSongCandidate[]>([]);
   ```
   In the `if (open)` reset effect, add `audioTitle = ''; audioArtist = ''; audioGenreId = null; candidates = [];` and `untrack(() => audioMutation.reset());`.
5. Derived values after `rangeValid`:

   ```ts
   	const audioLink = $derived(detected.type === 'AUDIO_TRACK' ? detected.link : null);
   	const genresQuery = useMusicGenres(() => open && effectiveType === 'AUDIO_TRACK');
   	const genres = $derived(genresQuery.data ?? []);
   	// Prefill the title from an Apple slug once per pasted link; the user can edit it.
   	$effect(() => {
   		const suggested = audioLink?.suggestedTitle ?? '';
   		if (suggested) untrack(() => (audioTitle = suggested));
   	});
   ```
6. Add `audioMutation.isPending` to `isPending`. Change the close effect so a same-song prompt keeps the popover open:

   ```ts
   	$effect(() => {
   		if (videoMutation.isSuccess || passageMutation.isSuccess || movieMutation.isSuccess) open = false;
   		if (audioMutation.isSuccess && untrack(() => candidates.length) === 0) open = false;
   	});
   ```
   (`onSuccess` sets `candidates` synchronously before `isSuccess` is observed. If a browser check shows the effect firing first, move the close into the per-call `onSuccess` and drop this line.)
7. `chipLabel`: add a branch before the `'Claim'` fallback. Also replace the YouTube branch's music sub-case, since music links never reach it now:

   ```ts
   				: effectiveType === 'AUDIO_TRACK'
   					? audioLink
   						? `Audio track (${PROVIDER_LABEL[audioLink.provider]})`
   						: 'Audio track'
   ```
8. `isMusicCollection`: `const isMusicCollection = $derived(detected.type === 'AUDIO_TRACK' && detected.link === null);`
9. `isSubmitDisabled`: add as its first line:

   ```ts
   		if (effectiveType === 'AUDIO_TRACK') {
   			if (!audioLink) return true;
   			return audioLink.provider !== 'youtube' && !audioTitle.trim();
   		}
   ```
10. `clearType` and `handleTypeChange`: include `'AUDIO_TRACK'` in the type lists. In `clearType` for AUDIO_TRACK, also clear `audioTitle`, `audioArtist`, `audioGenreId` and `candidates`.
11. Submit:

    ```ts
    	function audioInput(extra: Partial<CreateAudioTrackInput> = {}): CreateAudioTrackInput {
    		const req: CreateAudioTrackInput = { url: audioLink!.canonicalUrl };
    		if (audioLink!.provider !== 'youtube') {
    			req.title = audioTitle.trim();
    			if (audioArtist.trim()) req.artist = audioArtist.trim();
    		}
    		if (audioGenreId) req.genreId = Number(audioGenreId);
    		return { ...req, ...extra };
    	}

    	function submitAudio(extra: Partial<CreateAudioTrackInput> = {}) {
    		audioMutation.mutate(audioInput(extra), {
    			onSuccess: (r) => {
    				candidates = r.sameSongCandidates;
    			},
    		});
    	}
    ```
    In `handleSubmit`, add the first branch: `if (effectiveType === 'AUDIO_TRACK') { if (!audioLink) return; error = ''; submitAudio(); } else if …`.
12. Markup: after the Movie error paragraph, add:

    ```svelte
    			{#if effectiveType === 'AUDIO_TRACK' && audioLink}
    				<AudioTrackFields
    					link={audioLink}
    					bind:title={audioTitle}
    					bind:artist={audioArtist}
    					bind:genreId={audioGenreId}
    					{genres}
    					{candidates}
    					disabled={isPending}
    					onSameSong={(id) => submitAudio({ sameAsContentId: Number(id) })}
    					onDifferentSong={() => submitAudio({ createNew: true })}
    				/>
    			{/if}
    ```
    Add `<option value="AUDIO_TRACK">Audio track</option>` to the select. Include `'AUDIO_TRACK'` in the select's `value` condition and the Clear-type `disabled` condition. Change the description to `"Paste a YouTube, YouTube Music, Spotify, Apple Music, Amazon Music, TMDB or IMDb link, or type a Bible reference like John 3:16-18."` and the collection notice text to `This is an album, playlist, or artist link. Paste a link to a single song.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/components/AudioTrackFields.test.ts tests/components/AddContentPopover.test.ts tests/components/AddContentPopover.realMovieMutation.test.ts`
Expected: PASS. (`realMovieMutation` may need the same `createQuery` mock line if it mocks `@tanstack/svelte-query`.)

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): add audio tracks from any supported music link"
```

---

### Task 16: `AudioTrackPanel` in the details modal

**Files:**
- Rename and rewrite: `frontend/src/lib/components/MusicTrackPanel.svelte` becomes `AudioTrackPanel.svelte`
- Rename and rewrite: `frontend/tests/components/MusicTrackPanel.test.ts` becomes `AudioTrackPanel.test.ts`
- Modify: `frontend/src/lib/components/ActivityDetailsModal.svelte` (`isMusic` becomes `isAudioTrack` on `'AUDIO_TRACK'`, and the panel gets the new component name)

**Interfaces:**
- Consumes:
  - the Task 11 hooks;
  - `canChangeGenre` (Task 12);
  - `MusicGenrePicker` (Task 13);
  - `MediaPlayer`'s `onUnplayable(videoId, code)` (Task 14);
  - `useMe()` from `$lib/queries/users/useMe.svelte`.
- Produces: `<AudioTrackPanel contentId name url open />` (same props as before). Its states, each tested:
  - modal open: player mounted;
  - modal closed: player removed and coordinator slot released;
  - explicit badge;
  - unofficial upload;
  - a genre that can be changed: picker plus Save;
  - a locked genre: read-only;
  - a suggested genre: pre-filled, never saved until Save;
  - (Age-restricted tracks never reach the panel: Task 9 refuses them at add time with `ErrContentNotAllowed`, which `audioTrackErrorMessage` shows via `contentNotAllowedMessage`.)
  - 101/150 on a track link: marks the link;
  - 101/150 on a related upload: marks the upload.

- [ ] **Step 1: Write the failing test**

Move the old test, then replace its contents:

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track mv frontend/tests/components/MusicTrackPanel.test.ts frontend/tests/components/AudioTrackPanel.test.ts
```

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
	trackData: null as any,
	me: { id: '3' } as { id: string } | null,
	refresh: vi.fn(),
	markRelated: vi.fn(),
	markLink: vi.fn(),
	promote: vi.fn(),
	setGenre: vi.fn(),
	unregister: vi.fn(),
}));

vi.mock('$lib/queries/content/useAudioTrack', () => ({
	useAudioTrack: () => ({
		get data() {
			return h.trackData;
		},
	}),
	useMusicGenres: () => ({ data: [{ id: '21', name: 'Rock', parentId: null }, { id: '14', name: 'Pop', parentId: null }] }),
	useRefreshLyrics: () => ({ mutate: h.refresh, isPending: false }),
	useMarkRelatedMediaUnavailable: () => ({ mutate: h.markRelated }),
	useMarkTrackLinkUnavailable: () => ({ mutate: h.markLink }),
	usePromoteRelatedMedia: () => ({ mutate: h.promote, isPending: false }),
	useSetTrackGenre: () => ({ mutate: h.setGenre, isPending: false }),
}));
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return h.me;
		},
	}),
}));
vi.mock('$lib/utils/playerCoordinator', () => ({
	playerCoordinator: { register: () => h.unregister, playing: vi.fn() },
}));

import AudioTrackPanel from '$lib/components/AudioTrackPanel.svelte';
import { EMBED_ORIGIN } from '$lib/utils/mediaPlayer';

const url = 'https://music.youtube.com/watch?v=AUDIOAUDIO1';
const props = { contentId: '9', name: 'Bohemian Rhapsody', url, open: true };
const ytLink = { id: '41', provider: 'youtube', providerTrackId: 'AUDIOAUDIO1', url, kind: 'EMBED', source: 'PASTED', unavailableAt: null };
const spotifyLink = { id: '42', provider: 'spotify', providerTrackId: '4uLU6hMCjMI75M1A2tKUQC', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', kind: 'LISTEN', source: 'PASTED', unavailableAt: null };

function data(over: Record<string, unknown> = {}) {
	return {
		id: '9',
		name: 'Bohemian Rhapsody',
		url,
		addedByUserID: '3',
		createdAt: new Date().toISOString(),
		genreId: null,
		genre: null,
		audioTrack: { artist: 'Queen', videoType: 'MUSIC_VIDEO_TYPE_ATV' },
		trackLinks: [ytLink, spotifyLink],
		relatedMedia: [],
		lyrics: { available: true, lrclibId: 1, hasSynced: true, checkedAt: '2026-10-01T12:00:00Z' },
		...over,
	};
}

function embedError(code: number) {
	const frame = document.querySelector('iframe')!;
	window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'onError', info: code }), origin: EMBED_ORIGIN, source: frame.contentWindow }));
}

describe('AudioTrackPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.me = { id: '3' };
		h.trackData = data();
	});

	// Review Focus 5.
	it('closing removes the player and releases the claim', async () => {
		const { rerender } = render(AudioTrackPanel, { props });
		expect(document.querySelector('iframe')).not.toBeNull();
		await rerender({ ...props, open: false });
		expect(document.querySelector('iframe')).toBeNull();
		expect(h.unregister).toHaveBeenCalled();
	});

	it('lists listen links by provider', () => {
		render(AudioTrackPanel, { props });
		expect(screen.getByRole('link', { name: 'Spotify' })).toHaveAttribute('href', spotifyLink.url);
	});

	it('shows the explicit badge and the unofficial-upload label', () => {
		h.trackData = data({ audioTrack: { artist: 'Queen', explicit: true, videoType: 'MUSIC_VIDEO_TYPE_UGC' } });
		render(AudioTrackPanel, { props });
		expect(screen.getByLabelText('Explicit')).toHaveTextContent('E');
		expect(screen.getByText('Unofficial upload')).toBeInTheDocument();
	});

	it('101/150 on a track link marks that link; 153 marks nothing', async () => {
		render(AudioTrackPanel, { props });
		embedError(153);
		expect(h.markLink).not.toHaveBeenCalled();
		embedError(150);
		expect(h.markLink).toHaveBeenCalledWith({ contentId: '9', linkId: '41' });
		expect(h.markRelated).not.toHaveBeenCalled();
	});

	it('pre-fills a suggested genre but saves only on Save', async () => {
		h.trackData = data({ audioTrack: { artist: 'Queen', suggestedGenreId: 21 } });
		render(AudioTrackPanel, { props });
		expect(screen.getByRole('button', { name: 'Rock' })).toBeInTheDocument();
		expect(h.setGenre).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Save genre' }));
		expect(h.setGenre).toHaveBeenCalledWith({ contentId: '9', genreId: '21' });
	});

	it('a locked genre is read-only', () => {
		h.me = { id: '7' };
		h.trackData = data({ genreId: '21', genre: { id: '21', name: 'Rock', parentId: null } });
		render(AudioTrackPanel, { props });
		expect(screen.getByTestId('genre-readonly')).toHaveTextContent('Rock');
		expect(screen.queryByRole('button', { name: 'Save genre' })).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/components/AudioTrackPanel.test.ts`
Expected: FAIL with `Failed to resolve import "$lib/components/AudioTrackPanel.svelte"`.

- [ ] **Step 3: Implement**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track mv frontend/src/lib/components/MusicTrackPanel.svelte frontend/src/lib/components/AudioTrackPanel.svelte
```

Replace the `<script>` block of `AudioTrackPanel.svelte`:

```svelte
<script lang="ts">
	import MediaPlayer from '$lib/components/MediaPlayer.svelte';
	import LyricsLinks from '$lib/components/LyricsLinks.svelte';
	import MusicGenrePicker from '$lib/components/MusicGenrePicker.svelte';
	import {
		useAudioTrack,
		useMusicGenres,
		useRefreshLyrics,
		useMarkRelatedMediaUnavailable,
		useMarkTrackLinkUnavailable,
		usePromoteRelatedMedia,
		useSetTrackGenre,
	} from '$lib/queries/content/useAudioTrack';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { playbackQueue, lyricsNeedRecheck } from '$lib/utils/mediaPlayer';
	import { PROVIDER_LABEL, type MusicProvider } from '$lib/utils/audioLinks';
	import { canChangeGenre } from '$lib/utils/genreTree';
	import type { RelatedMedia } from '$lib/queries/content';

	let { contentId, name, url, open }: { contentId: string; name: string; url: string | null; open: boolean } = $props();

	const track = useAudioTrack(() => (open ? contentId : null));
	const genresQuery = useMusicGenres(() => open);
	const refreshLyrics = useRefreshLyrics();
	const markRelated = useMarkRelatedMediaUnavailable();
	const markLink = useMarkTrackLinkUnavailable();
	const promote = usePromoteRelatedMedia();
	const setGenre = useSetTrackGenre();
	const meCtx = useMe();

	const data = $derived(track.data ?? null);
	const meta = $derived(data?.audioTrack ?? null);
	const artist = $derived(meta?.artist ?? null);
	const related = $derived(data?.relatedMedia ?? []);
	const links = $derived(data?.trackLinks ?? []);
	const listenLinks = $derived(links.filter((l) => l.kind === 'LISTEN'));
	const embedLinks = $derived(links.filter((l) => l.kind === 'EMBED' && !l.unavailableAt));
	// Embeddable YouTube links first, then the other uploads of the same song.
	const queue = $derived(playbackQueue(embedLinks[0]?.providerTrackId ?? null, related));
	const unofficial = $derived(meta?.videoType === 'MUSIC_VIDEO_TYPE_UGC');
	const youtubeMusicUrl = $derived(links.find((l) => l.provider === 'youtube')?.url ?? url);

	// Genre: the saved one, else a suggestion pre-filled (never saved without Save, ADR 0006).
	let picked = $state<string | null>(null);
	const suggested = $derived(meta?.suggestedGenreId ? String(meta.suggestedGenreId) : null);
	const shownGenre = $derived(picked ?? data?.genreId ?? suggested);
	const editable = $derived(!!data && canChangeGenre(data, meCtx.me?.id ?? null));
	const dirty = $derived(!!shownGenre && shownGenre !== data?.genreId);

	const refreshed = new Set<string>();
	$effect(() => {
		const current = data;
		if (!open || !current || refreshed.has(current.id)) return;
		if (lyricsNeedRecheck(current.lyrics)) {
			refreshed.add(current.id);
			refreshLyrics.mutate(current.id);
		}
	});

	// Only called for 101/150 (MediaPlayer). Per link, never re-checked in v1 (ticket 03).
	function handleUnplayable(videoId: string) {
		const link = embedLinks.find((l) => l.providerTrackId === videoId);
		if (link) markLink.mutate({ contentId, linkId: link.id });
		else if (related.some((r) => r.videoId === videoId)) markRelated.mutate({ contentId, videoId });
	}

	const KIND_LABEL: Record<string, string> = {
		audio: 'Audio',
		official_video: 'Official video',
		lyric_video: 'Lyric video',
		live: 'Live',
		other: 'Other upload',
	};
	const kindLabel = (r: RelatedMedia) => KIND_LABEL[r.kind] ?? 'Other upload';
	const providerLabel = (p: string) => PROVIDER_LABEL[p as MusicProvider] ?? p;
</script>
```

Replace the top of the markup (keep the related-uploads list as it is) with:

```svelte
<div class="mt-3.5 space-y-4 border-t border-border pt-3.5" data-testid="audio-track-panel">
	<div class="flex flex-wrap items-center gap-2 text-[12px]">
		{#if meta?.explicit}
			<span aria-label="Explicit" title="Explicit" class="rounded-sm bg-muted px-1 font-bold text-foreground">E</span>
		{/if}
		{#if unofficial}
			<span class="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Unofficial upload</span>
		{/if}
	</div>

	{#if open}
		<!-- Unmounting on close stops playback and frees the one-player slot (ticket 03). -->
		<MediaPlayer {queue} title={name} fallbackUrl={youtubeMusicUrl} onUnplayable={handleUnplayable} />
	{/if}

	{#if listenLinks.length}
		<div class="flex flex-wrap gap-2 text-[13px]" data-testid="listen-links">
			<span class="text-muted-foreground">Listen on</span>
			{#each listenLinks as l (l.id)}
				<a href={l.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{providerLabel(l.provider)}</a>
			{/each}
		</div>
	{/if}

	<div class="space-y-1.5 text-[13px]" data-testid="genre-section">
		<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Genre</div>
		{#if editable}
			<MusicGenrePicker genres={genresQuery.data ?? []} value={shownGenre} onSelect={(id) => (picked = id)} disabled={setGenre.isPending} />
			{#if dirty}
				<button
					type="button"
					class="rounded-md border border-primary px-2.5 py-1 text-[12px] font-semibold text-primary disabled:opacity-60"
					disabled={setGenre.isPending}
					aria-label="Save genre"
					onclick={() => setGenre.mutate({ contentId, genreId: shownGenre! })}>Save</button
				>
				{#if !data?.genreId && !picked && suggested}
					<span class="text-[12px] text-muted-foreground">Suggested. Not saved yet.</span>
				{/if}
			{/if}
		{:else}
			<span data-testid="genre-readonly">{data?.genre?.name ?? 'Not set'}</span>
		{/if}
	</div>

	<LyricsLinks title={name} {artist} lyrics={data?.lyrics ?? null} {youtubeMusicUrl} checking={refreshLyrics.isPending} />
```

Keep the existing `{#if related.length}…{/if}` block and the closing `</div>` unchanged. The picker trigger shows the genre's path, so the test's `getByRole('button', { name: 'Rock' })` matches a root genre.

`frontend/src/lib/components/ActivityDetailsModal.svelte`:
- Change the import to `AudioTrackPanel`.
- Change `const isMusic = $derived(content?.contentType === 'AUDIO_TRACK');` (Task 2 already changed the literal) and rename it to `isAudioTrack` at its three uses.
- Render `<AudioTrackPanel contentId={content.id} name={content.name} url={content.url} {open} />`.

In `frontend/tests/components/ActivityDetailsModal.test.ts`, replace every `vi.mock('$lib/queries/content/useMusicTrack', …)` with the same factory against `useAudioTrack`, using the hook names from the panel test above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/components/AudioTrackPanel.test.ts tests/components/ActivityDetailsModal.test.ts tests/components/MediaPlayer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): AudioTrackPanel with listen links, genre, explicit badge and stop-on-close"
```

---

### Task 17: Activity grid: audio columns

This follows the Movie pattern (`movieColumns.test.ts`, `.claude/docs/ADDING_AG_GRID_COLUMN.md`). With the type filter set to exactly AUDIO_TRACK, the audio default set applies:
- xs: Track, Type, ◎
- sm: adds Artist (the `channel` column) and Genre
- md: adds Duration and Listen
- lg: adds Tags

**Files:**
- Modify: `frontend/src/lib/utils/grid-config.ts`:
  - `CONTENT_TYPE_LABELS` gets `AUDIO_TRACK: 'Audio Track'`;
  - add `isAudioOnlyTypeFilter`;
  - `defaultColumnVisibility` gets a third parameter;
  - add the `listen` `ColumnMeta` entry;
  - `itemColumnHeader` returns 'Track';
  - the `channel` meta uses `channelValueGetter`.
- Modify: `frontend/src/lib/utils/columnLayouts.ts` (`ColumnView` gains `'audio'`)
- Modify: `frontend/src/lib/utils/formatting.ts`:
  - `genreValueGetter` prefers `row.genre`;
  - add `channelValueGetter` and `listenCellRenderer`;
  - `itemCellRenderer` adds the cover and the E badge;
  - `typeCellRenderer` maps `AUDIO_TRACK`.
- Modify: `frontend/src/lib/components/ActivityTable.svelte`:
  - add a `listen` colDef with `hide: true`;
  - the channel colDef uses `valueGetter: channelValueGetter`;
  - pass the audio flag through.
- Test: `frontend/tests/unit/audioColumns.test.ts` and `frontend/tests/unit/columnLayouts.test.ts`

**Interfaces:**
- Consumes: `ContentItem.audioTrack` and `ContentItem.genre` (Task 11), and `PROVIDER_LABEL` / `providerOfUrl` (Task 12).
- Produces:
  ```ts
  export function isAudioOnlyTypeFilter(typeFilter: string | undefined): boolean;
  export function defaultColumnVisibility(tier: ResponsiveTier, movieOnly: boolean, audioOnly?: boolean): { visible: string[]; hidden: string[] };
  export type ColumnView = 'movie' | 'audio' | 'general';   // COLUMN_VIEW_LABEL.audio = 'Audio track columns'
  export function channelValueGetter(params: { data?: { channelTitle?: string | null; audioTrack?: { artist?: string } | null } }): string | null;
  export function listenCellRenderer(params: { data?: { url: string | null; contentType?: string } }): HTMLElement | string;
  ```

- [ ] **Step 1: Write the failing tests**

`frontend/tests/unit/audioColumns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultColumnVisibility, isAudioOnlyTypeFilter, itemColumnHeader, capitalizeContentType } from '$lib/utils/grid-config';
import { channelValueGetter, genreValueGetter, itemCellRenderer, listenCellRenderer, typeCellRenderer } from '$lib/utils/formatting';
import { columnViewFor, COLUMN_VIEW_LABEL } from '$lib/utils/columnLayouts';

describe('audio track filter', () => {
	it('is audio-only only for exactly AUDIO_TRACK', () => {
		expect(isAudioOnlyTypeFilter('audio_track')).toBe(true);
		expect(isAudioOnlyTypeFilter('audio_track,movie')).toBe(false);
		expect(isAudioOnlyTypeFilter(undefined)).toBe(false);
		expect(columnViewFor('audio_track')).toBe('audio');
		expect(COLUMN_VIEW_LABEL.audio).toBe('Audio track columns');
		expect(itemColumnHeader('audio_track')).toBe('Track');
		expect(capitalizeContentType('AUDIO_TRACK')).toBe('Audio Track');
	});

	it.each([
		['xs', ['item', 'type', 'perspectize']],
		['sm', ['item', 'type', 'perspectize', 'channel', 'genre']],
		['md', ['item', 'type', 'perspectize', 'channel', 'genre', 'duration', 'listen']],
		['lg', ['item', 'type', 'perspectize', 'channel', 'genre', 'duration', 'listen', 'tags']],
	] as const)('%s default set', (tier, visible) => {
		const out = defaultColumnVisibility(tier, false, true);
		expect(out.visible).toEqual(visible);
		expect(out.hidden).toContain('rated');
		expect(out.hidden).toContain('views');
	});

	it('other views keep the listen column hidden', () => {
		expect(defaultColumnVisibility('lg', false).hidden).toContain('listen');
		expect(defaultColumnVisibility('lg', true).hidden).toContain('listen');
	});
});

describe('audio cells', () => {
	const row = {
		contentType: 'AUDIO_TRACK',
		name: 'Bohemian Rhapsody',
		url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
		channelTitle: null,
		genre: { id: '21', name: 'Rock' },
		audioTrack: { artist: 'Queen', explicit: true, coverImageUrl: 'https://lh3.googleusercontent.com/c=w60' },
	};

	it('artist fills the channel column; the saved genre fills Genre', () => {
		expect(channelValueGetter({ data: row })).toBe('Queen');
		expect(channelValueGetter({ data: { channelTitle: 'Chan', audioTrack: null } })).toBe('Chan');
		expect(genreValueGetter({ data: row })).toBe('Rock');
	});

	it('item cell shows the cover and an E badge', () => {
		const el = itemCellRenderer({ data: row }) as HTMLElement;
		expect(el.querySelector('img')!.getAttribute('src')).toBe(row.audioTrack.coverImageUrl);
		expect(el.querySelector('[aria-label="Explicit"]')!.textContent).toBe('E');
	});

	it('listen cell links the stored url with its provider name', () => {
		const el = listenCellRenderer({ data: row }) as HTMLElement;
		expect(el.querySelector('a')!.textContent).toBe('Spotify');
		expect(listenCellRenderer({ data: { url: 'https://www.youtube.com/watch?v=x', contentType: 'YOUTUBE_VIDEO' } })).toBe('');
	});

	it('type cell has an audio icon and label', () => {
		expect((typeCellRenderer({ data: { contentType: 'AUDIO_TRACK' } }) as HTMLElement).textContent).toContain('Audio Track');
	});
});
```

Add to `frontend/tests/unit/columnLayouts.test.ts`: `expect(columnViewFor('audio_track')).toBe('audio')` and `expect(defaultLayout('md', 'audio').listen).toBe(true)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/unit/audioColumns.test.ts tests/unit/columnLayouts.test.ts`
Expected: FAIL. `isAudioOnlyTypeFilter` and `channelValueGetter` are not exported.

- [ ] **Step 3: Implement**

`grid-config.ts`:

```ts
/** True when the `f.type` URL value names exactly one type and it is AUDIO_TRACK. */
export function isAudioOnlyTypeFilter(typeFilter: string | undefined): boolean {
	if (!typeFilter) return false;
	const types = typeFilter.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
	return types.length === 1 && types[0] === 'audio_track';
}
```

Rewrite `defaultColumnVisibility`. The audio branch comes before the existing `else`, and `'listen'` is added to `managed`:

```ts
export function defaultColumnVisibility(
	tier: ResponsiveTier,
	movieOnly: boolean,
	audioOnly = false,
): { visible: string[]; hidden: string[] } {
	const sm = tier !== 'xs';
	const md = tier === 'md' || tier === 'lg';
	const lg = tier === 'lg';
	const visible: string[] = movieOnly ? ['perspectize', 'item', 'type'] : ['item', 'type', 'perspectize'];
	if (movieOnly) {
		if (sm) visible.push('genre', 'rated');
		if (md) visible.push('cast', 'duration', 'released');
		if (lg) visible.push('boxOffice', 'vsBudget', 'tmdbScore', 'tags');
	} else if (audioOnly) {
		// Track ◎ Type | Artist Genre | Duration Listen | Tags (the channel column carries the artist).
		if (sm) visible.push('channel', 'genre');
		if (md) visible.push('duration', 'listen');
		if (lg) visible.push('tags');
	} else {
		if (sm) visible.push('category', 'channel');
		if (md) visible.push('duration', 'publishDate');
		if (lg) visible.push('views', 'likes', 'percentLiked', 'tags');
	}
	const managed = [
		'type',
		'category',
		'channel',
		'duration',
		'publishDate',
		'views',
		'likes',
		'percentLiked',
		// Picker-only: adding it to the lg set overflows the 1212px grid (movieColumns.test.ts).
		'user',
		'tags',
		'description',
		'listen',
		...MOVIE_DEFAULT_COLS,
		...MOVIE_ONLY_PICKER,
	];
	return { visible, hidden: managed.filter((c) => !visible.includes(c)) };
}
```

Further `grid-config.ts` edits:
- `itemColumnHeader`: `return isMovieOnlyTypeFilter(typeFilter) ? 'Film' : isAudioOnlyTypeFilter(typeFilter) ? 'Track' : 'Item';`
- `CONTENT_TYPE_LABELS`: add `AUDIO_TRACK: 'Audio Track',` (Task 2 may already have added it; keep one).
- `channel` ColumnMeta: `sortValue: (row) => channelValueGetter({ data: row })?.toLowerCase() ?? null`, and the same for `filterValue`. The server sort stays `CHANNEL_TITLE`; artist sorting in All Items mode is listed under the cuts.
- Add after the `genre` entry: `{ colId: 'listen', label: 'Listen', picker: 'data', sortable: false },`.

`columnLayouts.ts`:

```ts
export type ColumnView = 'movie' | 'audio' | 'general';

export const COLUMN_VIEW_LABEL: Record<ColumnView, string> = {
	movie: 'Movie columns',
	audio: 'Audio track columns',
	general: 'standard columns',
};

export function columnViewFor(typeFilter: string | undefined): ColumnView {
	if (isMovieOnlyTypeFilter(typeFilter)) return 'movie';
	return isAudioOnlyTypeFilter(typeFilter) ? 'audio' : 'general';
}
```

and in `defaultLayout`: `defaultColumnVisibility(tier, view === 'movie', view === 'audio')`. Import `isAudioOnlyTypeFilter`.

`formatting.ts`:

```ts
/** AUDIO_TRACK rows carry the artist in `audioTrack`; other rows use the YouTube channel. */
export function channelValueGetter(params: { data?: { channelTitle?: string | null; audioTrack?: { artist?: string } | null } }): string | null {
	return params.data?.channelTitle || params.data?.audioTrack?.artist || null;
}

/** "Listen" column: the stored link of an AUDIO_TRACK row, labelled with its provider. */
export function listenCellRenderer(params: { data?: { url: string | null; contentType?: string } }): HTMLElement | string {
	const provider = params.data?.contentType === 'AUDIO_TRACK' ? providerOfUrl(params.data.url) : null;
	if (!provider || !params.data?.url) return '';
	const a = document.createElement('a');
	a.href = params.data.url;
	a.target = '_blank';
	a.rel = 'noopener noreferrer';
	a.className = 'text-primary hover:underline';
	a.textContent = PROVIDER_LABEL[provider];
	return a;
}
```

(Import `providerOfUrl` and `PROVIDER_LABEL` from `./audioLinks`. Also add `genre?: { name: string } | null` to `MovieRow`.)
- `genreValueGetter`: first line `if (params.data?.genre?.name) return params.data.genre.name;`.
- `itemCellRenderer`: widen the param type to `{ name: string; url: string | null; audioTrack?: { explicit?: boolean; coverImageUrl?: string } | null }`. Before the YouTube thumbnail, use the cover when present:

  ```ts
  	const cover = params.data.audioTrack?.coverImageUrl;
  	const videoId = cover ? null : extractVideoIdFromUrl(params.data.url);
  	if (cover || videoId) {
  		const img = document.createElement('img');
  		img.src = cover ?? `https://i.ytimg.com/vi/${videoId}/default.jpg`;
  		img.alt = '';
  		img.className = 'w-10 h-8 object-cover rounded thumbnail-mobile-hide';
  		container.appendChild(img);
  	}
  ```

  After the title, add:

  ```ts
  	if (params.data.audioTrack?.explicit) {
  		const e = document.createElement('span');
  		e.setAttribute('aria-label', 'Explicit');
  		e.title = 'Explicit';
  		e.className = 'rounded-sm bg-muted px-1 text-[10px] font-bold text-foreground';
  		e.textContent = 'E';
  		container.appendChild(e);
  	}
  ```
- `typeCellRenderer`: the `iconTypes` key `YOUTUBE_MUSIC` (renamed in Task 2) is now `AUDIO_TRACK: { svg: MUSIC_TRACK_ICON_SVG, label: 'Audio Track' }`.

`ActivityTable.svelte`:
- Add a colDef `{ colId: 'listen', headerName: 'Listen', cellRenderer: listenCellRenderer, sortable: false, hide: true, minWidth: 90 }` next to the genre colDef. Find the colDef via `grep -n "colId: 'genre'" frontend/src/lib/components/ActivityTable.svelte`.
- Give the `channel` colDef `valueGetter: channelValueGetter`. The `$effect` that applies `defaultColumnVisibility` gets the audio flag via `columnView === 'audio'`.
- Add `listen` to `headerMinWidth`'s map in `formatting.ts` (90). The audio lg set (8 columns) is narrower than the general lg set (11), so the 1212px budget holds. `movieColumns.test.ts`'s width check covers the general and movie sets; add the audio set to it:

```ts
it('audio lg set fits the 1212px grid', () => {
	const { visible } = defaultColumnVisibility('lg', false, true);
	expect(visible.reduce((sum, c) => sum + headerMinWidth(c), 0)).toBeLessThanOrEqual(1212);
});
```

(Use the existing width helper's real name from `movieColumns.test.ts`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/unit/audioColumns.test.ts tests/unit/columnLayouts.test.ts tests/unit/movieColumns.test.ts tests/unit/column-label-parity.test.ts tests/unit/column-registry-parity.test.ts tests/components/ActivityTable.test.ts`
Expected: PASS. The parity tests require the `listen` ColumnMeta label to equal its colDef `headerName`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track add frontend
```
```bash
git -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track commit -m "feat(frontend): audio track grid columns (artist, genre, listen, explicit badge)"
```

---
### Task 18: Full verification on the local demo Postgres

No code changes. This is the repo's Self-Verification checklist plus the real-SQL tests that skip in CI. Everything here runs against local, disposable databases. **No command in this task touches `DATABASE_URL` from `.env` or the shared Neon DB.**

**Files:** none (results go in the PR body).

- [ ] **Step 1: Backend build, format, vet, tests**

Run each command separately (no `&&`):

```bash
go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend build ./...
```
```bash
gofmt -l /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend
```
```bash
go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend vet ./...
```
```bash
go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend test ./...
```
Expected: build OK; `gofmt -l` prints nothing; vet is clean; every package reports `ok` (roundtrips and the two integration tests report `SKIP`, since there is no DATABASE_URL). Also check that no stray `schema.resolvers.go` is left over from `make graphql-gen`: `git -C <worktree> status --short backend/internal/adapters/graphql/resolvers/`.

- [ ] **Step 2: Frontend type-check and tests**

```bash
pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/frontend run check
```
```bash
pnpm --dir /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/frontend run test:run
```
Expected: `svelte-check found 0 errors` (or the same baseline as `origin/main`; record both numbers), and all tests pass. If `AddVideoDialog.test.ts` flakes on its success-state test, re-run that file alone (known flake) and note it.

- [ ] **Step 3: Stale references**

```bash
grep -rn "YOUTUBE_MUSIC\|youtube_music\|useMusicTrack\|MusicTrackPanel\|CreateContentFromYouTubeMusic\|createContentFromYouTubeMusic\|GET_MUSIC_TRACK\|queryKeys.content.music(" /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/frontend/src /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/frontend/tests --include="*.go" --include="*.ts" --include="*.svelte" --include="*.graphql" --include="*.sql"
```
Expected: only the 000032 down-migration/comments that name the old value deliberately (if any). There should be no code hits.

- [ ] **Step 4: A clean demo stack (applies 000032 through 000035 from scratch)**

An existing demo volume may already have the *old* provisional 000032 recorded, so wipe it first. It is disposable by design.

```bash
make -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track demo-wipe
```
```bash
make -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track demo-up
```
```bash
docker compose -f /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/docker-compose.demo.yml exec -T postgres psql -U demo -d perspectize_demo -tAc "SELECT version, dirty FROM schema_migrations"
```
Expected: `35|f`.
```bash
docker compose -f /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/docker-compose.demo.yml exec -T postgres psql -U demo -d perspectize_demo -tAc "SELECT count(*), count(*) FILTER (WHERE parent_id IS NULL) FROM music_genres"
```
Expected: `523|` followed by the root count that Task 4's reshape test pins.
```bash
docker compose -f /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/docker-compose.demo.yml exec -T postgres psql -U demo -d perspectize_demo -tAc "SELECT name FROM music_genres WHERE id = 19"
```
Expected: `Regional & Cultural`.

- [ ] **Step 5: The down migrations work on the demo DB**

The demo DB is local and disposable, so stepping it down and up is allowed. This is never done on the shared Neon DB.

```bash
docker run --rm -v /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/migrations:/m migrate/migrate:v4.18.3 -path=/m -database "postgres://demo:demo@host.docker.internal:5434/perspectize_demo?sslmode=disable" down 4
```
```bash
docker run --rm -v /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/migrations:/m migrate/migrate:v4.18.3 -path=/m -database "postgres://demo:demo@host.docker.internal:5434/perspectize_demo?sslmode=disable" up
```
Expected: both exit 0, and `schema_migrations` is `35|f` again.

- [ ] **Step 6: Real-SQL tests on a local `testdb`**

```bash
docker compose -f /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/docker-compose.demo.yml exec -T postgres createdb -U demo testdb
```
```bash
docker run --rm -v /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/migrations:/m migrate/migrate:v4.18.3 -path=/m -database "postgres://demo:demo@host.docker.internal:5434/testdb?sslmode=disable" up
```
```bash
DATABASE_URL="postgres://demo:demo@127.0.0.1:5434/testdb?sslmode=disable" go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend test -p 1 ./internal/adapters/repositories/postgres/ -run AudioTrackIntegration -v
```
```bash
DATABASE_URL="postgres://demo:demo@127.0.0.1:5434/testdb?sslmode=disable" go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend test -p 1 ./test/roundtrips/ -run "AudioTrack|TrackLink|MusicGenre" -v
```
Expected: `PASS` with no `SKIP` lines. The roundtrip budgets from Task 10 hold: 4 for create, 1 for the genre list, 1 for the batched trackLinks on a list, 0 for a cached genre list, and 2 for setTrackGenre.

- [ ] **Step 7: Manual check in the browser (demo mode, no credentials)**

Open `http://localhost:4173/?demo_as=alice` in the already signed-in Chrome on :9222 (demo mode needs no sign-in). Then:
1. Add Content → paste `https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x` → chip `Detected: Audio track (Spotify)` → type a title → pick a genre → Add. Expected: the row appears.
2. Paste the same link with a different `?si=`. Expected: the "already been added" toast and no second row.
3. Paste `https://music.youtube.com/watch?v=<a real song id>`, Add, and open the row. Expected: the player, listen links, the genre section with any suggestion pre-filled and not saved, and lyrics links.
4. Press play, open a second track in another tab and press play. Expected: the first tab pauses.
5. Settings → turn on "Allow more than one player at a time" → repeat. Expected: both keep playing.
6. Filter Type = Audio Track. Expected: the Track/Artist/Genre/Duration/Listen columns and the toast "Showing Audio track columns".

Note any differences in the PR. Leave the demo stack up for Task 20.

---

### Task 19: Neon branch `audio-track-verify` (migrations against a copy of production)

This proves 000032–000035 apply, reverse and re-apply on real production-shaped data, using the handoff pattern: the agent creates the branch, and the human writes the connection string to a file the agent never prints. **The shared database (main branch) is never migrated.** The branch carries copies of production rows, so record nothing there (no clip, no screenshots).

**Files:** none.

- [ ] **Step 1: Create the branch (agent)**

```bash
neon branches list --project-id lively-fog-94104513
```
If `audio-track-verify` is not listed:
```bash
neon branches create --project-id lively-fog-94104513 --name audio-track-verify
```
Record the branch id and its read-write endpoint host from the output (the host is not a secret; the password is).

- [ ] **Step 2: Hand-off (human)**

Ask the user to run this in the Claude prompt. The `!` prefix runs it in their shell, so the URL never enters the transcript:

```
! neon connection-string audio-track-verify --project-id lively-fog-94104513 --pooled=false --role-name neondb_owner --database-name neondb > ~/.perspectize-neon-branch.url
```

- [ ] **Step 3: Check the file without printing it (agent)**

```bash
chmod 600 /Users/jamesjordan/.perspectize-neon-branch.url
```
```bash
stat -f %Sm -t %Y-%m-%d /Users/jamesjordan/.perspectize-neon-branch.url
```
Expected: today's date (2026-10-11). An older date means a stale string from another branch, so stop and ask.
```bash
grep -oE '@[^/?:]+' /Users/jamesjordan/.perspectize-neon-branch.url
```
Expected: `@<the endpoint host from Step 1>`. The host is not secret. If it is the main branch's host, **stop**: the file points at the shared DB.

- [ ] **Step 4: Migrate the branch one step at a time (masked output)**

Every `migrate` command reads the URL from the file and pipes its output through `sed` to mask credentials:

```bash
migrate -path /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/migrations -database "$(cat /Users/jamesjordan/.perspectize-neon-branch.url)" version 2>&1 | sed -E 's#//[^@]*@#//***@#g'
```
Expected: `31` (production's latest applied migration). If it is `32`, the old provisional `000032_youtube_music_isrc_index` was applied somewhere. Stop and report, because Task 3 renames that file in place.

Then run this four times. Check `version` after each run and look at the new object in between: `\d music_genres`, `SELECT count(*) FROM music_genres` = 523, `\d content` shows `genre_id`, `\d track_links`.

```bash
migrate -path /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/migrations -database "$(cat /Users/jamesjordan/.perspectize-neon-branch.url)" up 1 2>&1 | sed -E 's#//[^@]*@#//***@#g'
```

Run the checks with `psql "$(cat …)" -tAc "<query>" 2>&1 | sed -E 's#//[^@]*@#//***@#g'`.

- [ ] **Step 5: Reverse and re-apply**

```bash
migrate -path /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend/migrations -database "$(cat /Users/jamesjordan/.perspectize-neon-branch.url)" down 4 2>&1 | sed -E 's#//[^@]*@#//***@#g'
```
Expected: version 31, and `to_regclass('music_genres')` and `to_regclass('track_links')` are NULL. Then repeat Step 4's `up 1` four times. Expected: version 35, dirty false.

- [ ] **Step 6: Data checks on production-shaped rows**

```bash
psql "$(cat /Users/jamesjordan/.perspectize-neon-branch.url)" -tAc "SELECT content_type, count(*) FROM content GROUP BY 1 ORDER BY 1" 2>&1 | sed -E 's#//[^@]*@#//***@#g'
```
Expected: no `youtube_music` rows (none existed; if there are some, stop and report, because the plan assumes none). Also `SELECT count(*) FROM content WHERE genre_id IS NOT NULL` = 0.

- [ ] **Step 7: Round-trip budgets on the branch**

```bash
DATABASE_URL="$(cat /Users/jamesjordan/.perspectize-neon-branch.url)" go -C /Users/jamesjordan/GitHub/perspectize/.claude/worktrees/audio-track/backend test -p 1 ./test/roundtrips/ -run "AudioTrack|TrackLink|MusicGenre" -v 2>&1 | sed -E 's#//[^@]*@#//***@#g'
```
Expected: PASS. The test rows it writes stay on the disposable branch.

- [ ] **Step 8: Leave the branch and the file in place**

Keep `audio-track-verify` and `~/.perspectize-neon-branch.url` (chmod 600; never add a "delete the file" step). Put a masked summary in the PR body: versions before and after, the 523 count, and down/up OK. The `migrations-unapplied` label is set automatically on the open PR (`.docs/PR_WORKFLOW.md`); do not set it by hand. Production rollout follows `.docs/MIGRATION_ROLLOUT.md` after merge, one migration at a time.

---

### Task 20: Demo clip (paste, genre, play, second track pauses the first)

**Files (outside the repo):**
- Create: `~/.claude/tools/video-capture/demos/demo-audio-track/record-audio-track-tour.mjs` (a copy of `demos/demo-movie-content-type/record-movie-tour.mjs`, adapted)
- Create: `~/.claude/tools/video-capture/demos/demo-audio-track/README.md`
- Modify (append one row only): the "Recorders index" table in `~/.claude/tools/video-capture/README.md`
- Output: `~/Downloads/screenshots/sv-audio-track-demo.mp4`

The recorder rules are append-only: never edit `record-movie-tour.mjs` or any other existing recorder. Copy it, then edit only the copy.

- [ ] **Step 1: Copy the recorder**

```bash
mkdir -p /Users/jamesjordan/.claude/tools/video-capture/demos/demo-audio-track
```
```bash
cp /Users/jamesjordan/.claude/tools/video-capture/demos/demo-movie-content-type/record-movie-tour.mjs /Users/jamesjordan/.claude/tools/video-capture/demos/demo-audio-track/record-audio-track-tour.mjs
```

- [ ] **Step 2: Adapt the copy**

Replace the header comment:

```js
/**
 * PURPOSE: AUDIO_TRACK tour for the audio-track PR: paste a Spotify link, type the
 *   title, pick a genre in the Option C picker, add; open a YouTube Music track and
 *   press play; open a second window on another track and press play; the first
 *   player pauses (one active player across tabs, BroadcastChannel).
 * WHAT MAKES IT UNIQUE: drives TWO page targets (Target.createTarget for tab B) and
 *   logs tab A's MediaPlayer `data-state` (playing -> paused) as the pass/fail check;
 *   clicks inside the youtube-nocookie iframe by coordinates (the play button is
 *   cross-origin, so no selector reaches it).
 * INPUTS: --out <mp4> (default ~/Downloads/screenshots/sv-audio-track-demo.mp4)
 *   --base <url> (default http://localhost:4173) --persona alice
 *   --spotify <track url> --track-a <content id> --track-b <content id>
 * PREREQUISITES: `make demo-up` from the PR branch (disposable demo DB; WRITES one
 *   track), a Chrome on :9222 with a tab already open on <base>/?demo_as=<persona>,
 *   internet for the YouTube embed, two AUDIO_TRACK rows with a playable YouTube
 *   link (add them in Task 18 Step 7, or pass their ids).
 * READ-ONLY: no; adds one Spotify track to the demo DB. Never point it at Neon.
 * ORIGIN: copied from demos/demo-movie-content-type/record-movie-tour.mjs (2026-10-11).
 */
```

Keep the copied helpers (`send`, `evalJs`, `moveTo`, `clickAt`, `centerOf`, `key`, `typeText`, `buttonByText`), the 1440px emulation, the cursor dot, the screencast and the ffmpeg encode. Replace the tour body with:

```js
async function tour() {
	// 1. Paste a Spotify link, title, genre, add.
	await clickAt(await buttonByText('Add Content'));
	await clickAt(await centerOf('#content-input'));
	await typeText(args.spotify);
	await sleep(600);
	await clickAt(await centerOf('#audio-title'));
	await typeText('Bohemian Rhapsody');
	await clickAt(await centerOf('#audio-artist'));
	await typeText('Queen');
	await clickAt(await buttonByText('Choose a genre'));
	await clickAt(await centerOf('input[aria-label="Search genres"]'));
	await typeText('rock');
	await sleep(500);
	await clickAt(await buttonByText('Select Rock'));
	await sleep(400);
	await clickAt(await buttonByText('Add'));
	await sleep(1500);

	// 2. Open track A and press play.
	await evalJs(`location.assign('${args.base}/?demo_as=${args.persona}&open=${args.trackA}')`);
	await sleep(2500);
	await clickAt(await centerOf('[data-testid="media-player"] iframe')); // the embed's big play button
	await sleep(4000);
	log('tab A state', await evalJs(`document.querySelector('[data-testid="media-player"]').dataset.state`));

	// 3. Tab B on track B, press play; tab A must pause.
	const { targetId } = await send('Target.createTarget', { url: `${args.base}/?demo_as=${args.persona}&open=${args.trackB}`, newWindow: true });
	const b = await attach(targetId); // same helpers, second session
	await sleep(3000);
	await b.clickAt(await b.centerOf('[data-testid="media-player"] iframe'));
	await sleep(3000);
	await send('Target.activateTarget', { targetId: mainTargetId });
	await sleep(1500);
	const after = await evalJs(`document.querySelector('[data-testid="media-player"]').dataset.state`);
	log('tab A state after tab B played', after);
	log(after === 'paused' ? 'PASS: first player paused' : 'FAIL: first player still ' + after);
	await send('Target.closeTarget', { targetId });
}
```

(`attach(targetId)` wraps the copied helpers around a second `Target.attachToTarget` session id. Write it in the copy only. The screencast stays on tab A, so the pause is visible in the clip: the embed's play icon returns.)

- [ ] **Step 3: README and index entry**

`~/.claude/tools/video-capture/demos/demo-audio-track/README.md`: the header text above, the run command, and the known limits (the iframe play button is clicked by coordinates; Reduce Motion is on, so there are no CSS transitions).

Append one row to the "Recorders index" table:

```
| `demo-audio-track` | AUDIO_TRACK tour (audio-track PR): Spotify link-only add with the Option C genre picker, play a YouTube Music track, start a second track in another window and log the first player's `data-state` going to `paused`. WRITES one track (disposable demo DB only). Needs `make demo-up` from the PR branch, two playable audio tracks and a tab already open on `/?demo_as=alice`. | `demos/demo-audio-track/record-audio-track-tour.mjs` |
```

- [ ] **Step 4: Record**

```bash
node /Users/jamesjordan/.claude/tools/video-capture/demos/demo-audio-track/record-audio-track-tour.mjs --out /Users/jamesjordan/Downloads/screenshots/sv-audio-track-demo.mp4 --spotify "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" --track-a <id> --track-b <id>
```
Expected: the log ends with `PASS: first player paused`, and the mp4 plays and shows all three steps. Watch it once before handing it over. Do not upload it anywhere without asking. If the user later asks for PR evidence, the standing approval to upload `sv-` clips to the `screenshots` release applies.

- [ ] **Step 5: Keep or delete**

Keep `demo-audio-track` (it is reusable for later audio work). Delete throwaway takes from `~/Downloads/screenshots/` that this task made, keeping only the final `sv-audio-track-demo.mp4`.

---

## Out of scope

- The YouTube 30-day data-retention rule (issue #589); this plan stores the same YouTube fields the YOUTUBE_MUSIC path stored before.
- Subscriber/OAuth listening (full-track playback through a user's Spotify/Apple/Amazon account).
- Apple MusicKit playback and Spotify/Amazon embeds: link-only providers show a "Listen on" link, never a player.
- The Spotify, Deezer and SoundCloud provider APIs (lookup, ISRC, cover art for link-only adds).
- Challenge-categorization (disputing or voting on a genre).
- Hosting or displaying lyrics; LyricsLinks still links out.
- Regional re-grouping of the genre tree beyond Option C.

## Cut from this plan (in priority order, last first)

1. **Spotify and Apple embeds.** `kind = EMBED` exists only for YouTube links.
2. **Matcher writes.** `source = MATCHED` exists in the schema and types but nothing writes it (no cross-provider lookup).
3. **The grid's Listen column shows one link** (the row's stored `url`), not every `trackLinks` entry. Loading trackLinks for every grid row would add a batched query per page, which needs its own budget.
4. **The Channel column is not renamed to "Artist"** in the audio view. It shows the artist, but the header stays "Channel", because a per-view header rename touches the label-parity tests. Server-side sort by artist in All Items mode is also cut (it sorts by `channel_title`, which is null for link-only adds).
5. **No toast after a YouTube add asking to confirm the suggested genre.** The suggestion is pre-filled in the details panel instead.
6. **Mobile card fields** (ActivityCardList) for genre, artist and the E badge.
7. **Demo seed of audio tracks** (`cmd/seed-demo`). The clip adds its own.
8. **Server-side genre sort** and a genre facet in the type filter.
9. **Roundtrip budgets for the YouTube Music create path** (InnerTube and MusicBrainz are faked in the service tests; roundtrips cover the link-only path).
10. **An index on `response->'music'->>'mbid'`** (the "index needs evidence" rule; ISRC has one from 000032).
11. **Age restriction for link-only providers.** Those providers give no data without an API, so only YouTube is checked.

## Decisions the docs did not settle (flagged, not guessed)

Each one is implemented as stated below so the plan is executable, and each needs a yes/no from the user before merge.

1. **The 30-day genre window counts from `content.created_at`** (when the adder added it), not from when the genre was first set.
2. **Embed error 100 (video removed) moves to the next upload without marking anything.** The ticket names only 101/150 as marking.
3. **The explicit flag's InnerTube field** (`badges[].musicInlineBadgeRenderer.icon.iconType == "MUSIC_EXPLICIT_BADGE"`) is from observed responses, not documentation. It needs a live check on a known-explicit track.
4. **Apple URLs without a slug, and Amazon URL shapes** (`/tracks/<ASIN>`, `/albums/<ASIN>?trackAsin=`) come from observed links. Regional Amazon hosts are kept as-is in the canonical URL, so `music.amazon.com` and `music.amazon.co.uk` links to the same ASIN dedupe only by provider id. That is intended, but please confirm.
5. **The GraphQL field is `Content.audioTrack`** (JSON). ADR 0004 says `Content.music`, but `music` reads as a list on a Content type that also has `trackLinks`. Rename if the ADR wins.
6. **`track_links` also stores the first (pasted) link**, so every track has one or more rows and `content.url` duplicates the first link.
7. **Link-only adds take the title and artist the user types** (no oEmbed fetch), and the title is required.
8. **Same-song candidates with an empty artist match on title only**, which can over-suggest for common titles. The prompt lets the user say "different song".
9. **`createContentFromYouTube` with a `music.youtube.com` link** still creates a YOUTUBE_VIDEO, as today. Should it redirect to `createAudioTrack` or return an error? The plan leaves it (the frontend no longer sends music links there).
10. **The player subscription:** after the `listening` handshake, the plan expects the embed to post `onStateChange` and `infoDelivery.playerState`. jsdom can't prove this, so it needs a browser check in Task 18 Step 7. If only `infoDelivery` arrives, `parseEmbedMessage` already handles it.
11. **"Mark a listen link unavailable"** in the brief is read as: mark the EMBED link (a YouTube upload) that failed with 101/150. LISTEN links are never played here, so they are never marked.
12. **Existing `youtube_music` rows:** the plan assumes there are none (no data UPDATE in 000032). Task 19 Step 6 checks this on production-shaped data.
13. **The genre suggestion comes from MusicBrainz tags only**, matched through the alias map. There is no Apple API in v1, so the "Apple genre" suggestion the ADR mentions is not available.
14. **The same-song prompt on the YouTube path** re-fetches YouTube and InnerTube metadata when the user answers (one extra quota unit), instead of caching the first lookup.
15. **`CreateWithLink` race:** two simultaneous first adds of the same link conflict on `UNIQUE(provider, provider_track_id)`. The loser gets `alreadyExisted: true`, but its content row may be left without a link if the CTE is split across statements by a future refactor. The single-statement CTE avoids that today.
16. **The demo DB volume must be wiped** (`make demo-wipe`) on any machine that ran the earlier provisional 000032, since its version number is reused.
17. **Demo mode and InnerTube:** the demo backend uses the offline YouTube fixture but the *real* InnerTube/MusicBrainz clients. The YouTube Music part of the clip therefore needs internet, and fails offline.

## Self-Review

- **Spec coverage:**
  - Rename → Tasks 1–2.
  - `track_links`, link-only adds, dedupe order (ISRC → MBID → provider+id → URL), same-song candidates and prompt → Tasks 3, 6, 7, 8, 9, 10, 11, 15.
  - Genres:
    - seed generator and compact snapshot → Task 4;
    - Option C (MOVE_TO_WORLDWIDE / DROP_FROM_C / SUBGENRES_TO_WORLDWIDE, id 19 as "Regional & Cultural") → Task 4;
    - FK with ON DELETE SET NULL → Task 5;
    - lock rule → Tasks 5, 8, 10;
    - suggest without applying → Task 9;
    - picker in the add flow and the details view → Tasks 13, 15, 16.
  - Safeguards → Task 14 (coordinator, no autoplay or advance, 101/150 only, 153 message), Task 16 (stop on close), Task 9 (age refusal), Tasks 9/16/17 (E badge).
  - Grid and details → Tasks 16–17.
  - Verification:
    - unit, integration, query-count and cache-contract tests → Tasks 5–11 and 18;
    - Neon branch → Task 19;
    - demo stack → Task 18;
    - clip → Task 20.
- **Review Focus:** each of the 5 lines names a test that exists in its owning task (Tasks 7/8, 5/10, 13, 14, 16).
- **Placeholder scan:** `grep -nE "TBD|TODO|implement later|similar to Task|add appropriate"` over this file returns nothing. The `<id>` arguments in Task 20 are runtime values the operator reads from the demo DB.
- **Type consistency:**
  - Backend `CreateAudioTrackInput{URL, Title, Artist, GenreID, SameAsContentID, CreateNew}` ↔ GraphQL `CreateAudioTrackInput{url,title,artist,genreId,sameAsContentId,createNew}` ↔ frontend `CreateAudioTrackInput`.
  - `TrackLinkKind` LISTEN/EMBED and `TrackLinkSource` PASTED/MATCHED are the same in SQL CHECKs, domain, schema and TS.
  - `queryKeys.content.audioTrack` and `queryKeys.music.genres` are used consistently in Tasks 11, 15 and 16.
  - `onUnplayable(videoId, code)` matches between Tasks 14 and 16.
  - `defaultColumnVisibility(tier, movieOnly, audioOnly)` matches between Task 17 and `columnLayouts.defaultLayout`.
- **Migration numbers:** 000032 (renamed in place, provisional), then 000033 genres, 000034 genre_id and 000035 track_links. All are provisional until merge, and nothing is applied to the shared DB.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-11-audio-track-implementation-plan.md`. Two ways to run it:

1. **Subagent-driven (recommended).** `superpowers:subagent-driven-development` runs a fresh subagent per task with review between tasks. Use the lanes in the Task Map: Tasks 4, 7, 12, 13 and 14 start immediately; the backend chain is 1 → 3 → 5 (also needs 4) → 6 → 8 → 9 → 10; the frontend chain is 2 → 11 → 15/16/17; then 18 → 19/20.
2. **Inline.** `superpowers:executing-plans` runs the tasks in this session in batches, with checkpoints.

# Rename `youtube` content type to `youtube_video` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the content type `YOUTUBE`/`youtube` to `YOUTUBE_VIDEO`/`youtube_video` (displayed "YouTube Video") so `youtube_channel`, `youtube_playlist`, etc. can be added later.

**Architecture:** The domain enum is upper-case (`YOUTUBE_VIDEO`, exposed over GraphQL) and the repository lower-cases it for the DB column (`youtube_video`), so the backend rename is a constant/enum rename plus a data migration. The frontend gains a single label map so the display name ("YouTube Video") isn't derived by naive capitalization.

**Tech Stack:** Go, gqlgen, Postgres (golang-migrate), SvelteKit, AG Grid, vitest.

**Spec:** none — requirements from the user's request (2026-09-18).

## Global Constraints

- Display name: `YouTube Video`. Non-display value: `youtube_video` (DB), `YOUTUBE_VIDEO` (GraphQL enum / domain).
- **Do NOT run any migration** (`make migrate-up/down`, `migrate ...`). Write the SQL only. The user will say when to apply it to each environment.
- No `&&` chaining in shell commands.
- Migration 000022 (000021 is the latest; no other branch claims 000022).
- The mutation `createContentFromYouTube` and the `YouTubeClient`/`youtube` adapter package are unrelated to the content-type value and are NOT renamed.

---

### Task 1: Backend enum + constant rename

**Files:**
- Modify: `backend/internal/core/domain/content.go:12`
- Modify: `backend/internal/core/services/content_service.go:70`
- Modify: `backend/schema.graphql:192`
- Regenerate: `backend/internal/adapters/graphql/generated/generated.go`, `backend/internal/adapters/graphql/model/models_gen.go` (via `make graphql-gen`)
- Test: `backend/test/domain/content_test.go:13`, `backend/test/resolvers/content_resolver_test.go` (lines 373, 495, 986, 1004, 1027), `backend/internal/adapters/repositories/postgres/helpers_test.go:62,66`, `gorm_content_repository_test.go` and `gorm_mappers_test.go` (`"youtube"` row values)

**Interfaces:**
- Produces: `domain.ContentTypeYouTubeVideo ContentType = "YOUTUBE_VIDEO"`; GraphQL enum value `YOUTUBE_VIDEO`; DB value `youtube_video` (via existing `strings.ToLower` in `gorm_mappers.go:140`).

- [ ] **Step 1: Update tests first** — replace `domain.ContentTypeYouTube` → `domain.ContentTypeYouTubeVideo`, `"YOUTUBE"` → `"YOUTUBE_VIDEO"`, `contentType: YOUTUBE` → `contentType: YOUTUBE_VIDEO`, and the DB-row `"youtube"` → `"youtube_video"` in the test files listed above.
- [ ] **Step 2: Run tests, expect compile failure/FAIL** — `go test ./...` in `backend/`.
- [ ] **Step 3: Implement** — rename the constant in `content.go` and its use in `content_service.go`; change `YOUTUBE` → `YOUTUBE_VIDEO` in `schema.graphql`.
- [ ] **Step 4: Regenerate** — `make graphql-gen` in `backend/`.
- [ ] **Step 5: Verify** — `go build ./...`, `gofmt -l .` (empty), `go test ./...`.
- [ ] **Step 6: Commit** — `refactor(backend): rename YOUTUBE content type to YOUTUBE_VIDEO`.

### Task 2: Data migration (write only — NOT applied)

**Files:**
- Create: `backend/migrations/000022_rename_youtube_content_type.up.sql`
- Create: `backend/migrations/000022_rename_youtube_content_type.down.sql`

- [ ] **Step 1: Write up migration** (idempotent):

```sql
-- Rename content_type 'youtube' -> 'youtube_video' so youtube_channel / youtube_playlist etc. can follow.
-- Must be applied manually per environment, in lockstep with the backend deploy that uses YOUTUBE_VIDEO.
UPDATE content SET content_type = 'youtube_video' WHERE content_type = 'youtube';
```

- [ ] **Step 2: Write down migration**:

```sql
UPDATE content SET content_type = 'youtube' WHERE content_type = 'youtube_video';
```

- [ ] **Step 3: Commit** — `chore(db): add migration 000022 renaming youtube content_type to youtube_video`. **Do not run it.**

### Task 3: Frontend display label + filter mapping

**Files:**
- Modify: `frontend/src/lib/utils/grid-config.ts:42-45`
- Modify: `frontend/src/lib/components/ActivityTable.svelte:509-511`
- Modify: `frontend/src/lib/utils/gridUrlState.ts:492`
- Test: `frontend/tests/unit/grid-config.test.ts:122-145`, `frontend/tests/unit/gridUrlState.test.ts`, `frontend/tests/unit/formatting.test.ts:561-566`

**Interfaces:**
- Produces: `capitalizeContentType(contentType)` returns `'YouTube Video'` for `YOUTUBE_VIDEO`/`youtube_video` (case-insensitive), `'Claim'` for `CLAIM`, and falls back to first-letter-capitalize for unknown values. `toContentTypeEnum(value: string): string` in `gridUrlState.ts` maps a user-typed/URL type filter to the GraphQL enum (`youtube`, `youtube_video` → `YOUTUBE_VIDEO`; else upper-cased).

- [ ] **Step 1: Write failing tests**

```ts
// grid-config.test.ts
expect(capitalizeContentType('YOUTUBE_VIDEO')).toBe('YouTube Video');
expect(capitalizeContentType('youtube_video')).toBe('YouTube Video');
expect(capitalizeContentType('CLAIM')).toBe('Claim');
// gridUrlState.test.ts — legacy bookmarked ?type=youtube still works
expect(toGraphQLFilter({ type: 'youtube' }).contentType).toBe('YOUTUBE_VIDEO');
expect(toGraphQLFilter({ type: 'youtube_video' }).contentType).toBe('YOUTUBE_VIDEO');
expect(toGraphQLFilter({ type: 'claim' }).contentType).toBe('CLAIM');
```
(Use the actual exported function name found around `gridUrlState.ts:480`.)

- [ ] **Step 2: Run** `pnpm run test:run` in `frontend/` — expect FAIL.
- [ ] **Step 3: Implement** — label map in `grid-config.ts` (`{ youtube_video: 'YouTube Video', claim: 'Claim' }` keyed by lower-cased value, fallback to existing capitalization); make `ActivityTable.svelte` valueGetter call `capitalizeContentType`; in `gridUrlState.ts` map `youtube`/`youtube_video` → `YOUTUBE_VIDEO` before falling back to `toUpperCase()`.
- [ ] **Step 4: Update fixtures** — `'YOUTUBE'` → `'YOUTUBE_VIDEO'` in `grid-config.test.ts:30`, `formatting.test.ts:561-566`.
- [ ] **Step 5: Verify** — `pnpm run test:run`, `pnpm run check`, prettier on changed files.
- [ ] **Step 6: Commit** — `feat(frontend): display youtube_video content type as "YouTube Video"`.

### Task 4: Docs + stale-reference sweep

**Files:**
- Modify: docs mentioning the enum value (`.claude/docs/ADDING_CONTENT_TYPE.md`, `.docs/DOMAIN_GUIDE.md`, `backend/CLAUDE.md`, `.claude/skills/db-perspectize-queries` if it lists enum values)

- [ ] **Step 1: Grep** for `YOUTUBE\b`, `'youtube'`, `ContentTypeYouTube\b`, `content_type.*youtube` across repo (excluding node_modules, .planning, graphify-out, worktrees) and fix any stale reference to the *content type value*. Leave migration 000012 as-is (historical).
- [ ] **Step 2: Note in PR body** that migration 000022 must be applied manually per environment, **before/with** the backend deploy (old rows `youtube` won't map to any enum value otherwise).
- [ ] **Step 3: Commit** — `docs: update content type references to youtube_video`.

## Rollout order (for later, on user's go-ahead)

1. Apply `000022` up to the target DB.
2. Deploy backend + frontend together (GraphQL enum value changes — old frontend querying `YOUTUBE` would break).

## Self-Review

- Coverage: enum, constant, DB value, display label, URL filter compatibility, docs — all have tasks.
- Types consistent: `ContentTypeYouTubeVideo`, `YOUTUBE_VIDEO`, `youtube_video`, `capitalizeContentType` used consistently.

# Private Claims via Add Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user add a CLAIM from the existing universal Add Content popover. The claim is just its text, has an optional parent content link, and is **private by default**: visible only to its owner until a future public gate exists.

**Architecture:** Add a `privacy` column to `content` (default `public`, so every existing row keeps today's behaviour) and mirror the perspective-privacy pattern: the domain `Privacy` enum, list queries restricted to "public OR owned by viewer", and `contentByID` returning null for someone else's private row. `CreateClaim` derives the owner from the session, makes `parentContentID` optional, and always writes `PRIVATE`. On the frontend, `AddContentPopover` (which already autodetects CLAIM but disables submit) gains a claim submit path through the existing `useCreateClaim` hook.

**Tech Stack:** Go 1.25+, gqlgen, GORM, golang-migrate SQL, Svelte 5 runes, TanStack Svelte Query.

**Context:** Direction set in session on 2026-09-12 → 2026-09-27. The earlier elaborate claim metadata (stance, verdict, confidence, claimant…) seeded in `tools/content-type-designer` is explicitly **out of scope**.

## Global Constraints

- Branch: `claude/claim-content-type-html-form-17cx78`.
- Migration `000031_add_content_privacy` (renumbered from 000028 after main took 000028–000029 and an open branch claimed 000030). Idempotent DDL. **Never run `make migrate-up`.** The PR must say it needs a manual `migrate up` per environment.
- Existing content stays public: the column defaults to `'public'`.
- Stored lowercase, exposed as the existing `Privacy` GraphQL enum (`PUBLIC`/`PRIVATE`), converted with the existing `privacyToDBValue`/`privacyFromDBValue` helpers.
- After `schema.graphql` edits: `make graphql-gen`, then delete the stray `resolvers/schema.resolvers.go` after diffing it (see backend/CLAUDE.md).
- Svelte 5 runes only; TanStack function-wrapper pattern.

## Out of Scope (Deferred)

- **Public gate:** a claim becomes public only after a conceptual-uniqueness check against other claims (AI-assisted). Design TBD; not planned here.
- Category pre-pick inside Add Content.
- Promoting Add Content to a large modal.
- Other read paths that resolve content by ID for a *different* primary object (e.g. `perspective.content`, dataloaders). A private claim can only have perspectives if someone sees it, and today only its owner can, so the leak surface is the owner's own data. Revisit alongside the public gate.

---

## Tasks

### Task 1: Migration — content.privacy

**Files:** Create `backend/migrations/000031_add_content_privacy.up.sql` and `.down.sql`.

- [x] Up: `ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public'`; `DROP CONSTRAINT IF EXISTS content_privacy_check`; `ADD CONSTRAINT content_privacy_check CHECK (privacy IN ('public','private'))`; add a partial index on `(added_by_user_id) WHERE privacy = 'private'` for the owner branch of the filter.
- [x] Down: drop the index, constraint and column (`IF EXISTS`).

### Task 2: Domain + GORM + mappers

**Files:** `backend/internal/core/domain/content.go`, `.../postgres/gorm_models.go`, `.../postgres/gorm_mappers.go`, mapper tests.

- [x] `domain.Content.Privacy Privacy`. Zero value is treated as PUBLIC when writing.
- [x] `ContentModel.Privacy string gorm:"column:privacy;not null;default:public"`.
- [x] Mappers convert both ways; an empty domain value maps to `public`.
- [x] Test: mapper round-trip for PUBLIC, PRIVATE and empty.

### Task 3: List visibility

**Files:** `domain/pagination.go` (or wherever `ContentListParams` lives), `services/content_service.go`, `postgres/gorm_content_repository.go`, `resolvers/content.resolvers.go`, tests.

- [x] Add `ViewerID *int` to `ContentListParams`.
- [x] Repository `List`: always apply `privacy = 'public' OR (added_by_user_id = viewer)`, or `privacy = 'public'` when there's no viewer. Apply it to both the page query and the total count.
- [x] Resolver `Content`: set `ViewerID` from `auth.ForContext`.
- [x] Tests: service/repository tests assert that the predicate is applied (integration test skips without a DB).

### Task 4: contentByID visibility

**Files:** `resolvers/content.resolvers.go`, resolver test.

- [x] If `content.Privacy == PRIVATE` and the viewer isn't the owner, return `nil, nil` (same non-disclosure convention as `PerspectiveByID`).
- [x] Tests: owner sees it; another user and an anonymous caller get null.

### Task 5: Schema + CreateClaim

**Files:** `backend/schema.graphql`, generated code, `ports/services/content_service.go`, `services/content_service.go`, `resolvers/content.resolvers.go`, `test/services/content_service_test.go`.

- [x] Schema: `Content.privacy: Privacy!`; `CreateClaimInput.parentContentID: IntID` (nullable); `userID` stays `IntID!` with the 0-means-derive convention used by `CreateContentFromPassage`.
- [x] `CreateClaimInput.ParentContentID *int`. Validate only when non-nil (> 0 and exists). Omit `parentContentId` from `response` when nil.
- [x] Service sets `Privacy: domain.PrivacyPrivate` on every claim; trims text and rejects it when empty.
- [x] Resolver: `auth.RequireAuth`; a non-zero `userID` must match the session; the session user is always the owner.
- [x] `domainToModel` maps `Privacy`.
- [x] Tests: create without a parent → PRIVATE, response has no parent key; with a valid parent; with a missing parent → not found; empty text → invalid input.

### Task 6: Frontend — claim path in Add Content

**Files:** `frontend/src/lib/queries/content/claims.ts`, `useCreateClaim.ts`, `frontend/src/lib/components/AddContentPopover.svelte`, their tests.

- [x] `CreateClaimInput`: `{ text: string; userID: number; parentContentID?: number }`. Callers send `userID: 0`. Add `privacy` to the response selection.
- [x] Success toast: "Claim saved (private)".
- [x] `AddContentPopover`: add CLAIM to the type select; submit enabled when the claim text has at least two words; submit calls `claimMutation.mutate({ text, userID: 0 })`; close on success; replace the "can't be added yet" note with "Claims are private — only you can see them for now."; update the description and label copy to mention claims. Keep YouTube as the last `createMutation` call if the existing tests depend on that order (check the test file first).
- [x] Tests: CLAIM detected → submit enabled → mutate called with the text; single word → nothing detected; note shown.

### Task 7: Verify + ship

- [x] `go build ./...`, `go test ./...` (backend), `pnpm run test:run` (frontend), `pnpm run check`.
- [x] Run prettier on changed frontend files; gofmt.
- [x] Commit per logical change; push the branch.

# Content Relationship Perspectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Design agreed 2026-09-27. **First trial runs against the local Docker Postgres approach being introduced in a separate PR.** Do not apply this migration to the shared Sevalla database until that trial has validated the model.

**Goal:** Let each user record their perspective on how two pieces of content relate: how relevant and how important one is to the other, which typed relationships hold (each rated 0–10000), user-named custom ratings, and an HTML review. This powers a future claim view listing related claims and questions, ranked by these ratings.

**Tech Stack:** Go 1.25+, gqlgen, GORM, golang-migrate SQL, Svelte 5 runes, TanStack Svelte Query.

**Depends on:** `2026-09-27-private-claims-plan.md` (content.privacy, migration 000028).

## Agreed Design

### New content type: QUESTION
- A separate type from CLAIM. A claim is concluded on through ordinary perspectives (like / agreement / confidence). A question is not; it is answered and weighed through relationship perspectives.
- Created private by default, like claims.
- Add Content autodetects free text ending in `?` as a question.
- No question-status or "concluded" view (decided: not building).

### Table: `content_relationship_perspectives`
Mirrors the `perspectives` table's patterns.

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `user_id` | int NOT NULL FK users ON DELETE CASCADE | |
| `content_id` | int NOT NULL FK content ON DELETE CASCADE | the item being considered (anchor) |
| `related_content_id` | int NOT NULL FK content ON DELETE CASCADE | |
| `relevance` | int NULL, 0–10000 | |
| `importance` | int NULL, 0–10000 | how much `related_content_id` matters **to** `content_id` (asymmetric) |
| `relationship_types` | jsonb NOT NULL DEFAULT `'{}'` | fixed vocabulary, lowercase keys → 0–10000 |
| `custom_fields` | jsonb NOT NULL DEFAULT `'{}'` | user-named, lowercase keys → 0–10000 (same as `perspectives.custom_fields`) |
| `review` | text NULL | HTML, sanitized with the same sanitizer as `perspectives.review` |
| `privacy` | text NOT NULL DEFAULT `'public'` CHECK public/private | same as `perspectives.privacy` |
| `created_at` / `updated_at` | timestamptz | |

- Unique `(user_id, content_id, related_content_id)`; CHECK `content_id <> related_content_id`.
- Index on `related_content_id` for reverse lookups.

**How to read a row:** from `content_id`'s point of view, `related_content_id` is this relevant, this important, and relates to it as these types.
- **Empty `relationship_types` means related in an unspecified way.**
- **Rows are ordered on purpose:** importance is not symmetric.

### Relationship type vocabulary (read "related ___ content")

| group | types |
|---|---|
| Evidential | `proves`, `disproves`, `supports`, `undermines`, `prerequisite`, `contradicts`* |
| Sourcing / interpretation | `source`, `explains` |
| Scope | `duplicates`*, `overlaps`*, `broader`, `narrower` |
| Question fit | `would_settle`, `answers`, `too_broad`, `too_narrow`, `loaded` |

\* symmetric.
- The vocabulary lives in a Go enum, validated in the service.
- Adding a type is a code change, not a migration.

### Visibility and aggregation
- A row is readable when the viewer can read **both** content endpoints and the row is public or owned by the viewer.
- A content item's related list comes from rows anchored on it. Rows anchored the other way contribute to relevance, and symmetric types count either way.
- Default ranking is by average relevance × average importance.
- Averages are exposed per relationship type and per custom field.

### Worked examples
The design conversation used five scenarios as acceptance examples:
1. **O.J. Simpson:** a claim with glove and motive/means/ability questions.
2. **Coffee and health:** scope, overlap, a too-broad question.
3. **Faith and works:** Bible passages as related content, `explains`.
4. **EV ownership cost:** a YouTube source, duplicates, one-way importance.
5. **Moon landing:** unspecified relatedness, a loaded question, both sides agreeing a claim would disprove the landing if true.

Use them as seed data for the local Docker trial and as test fixtures.

## Tasks

### Task 1: QUESTION content type
- [ ] `domain.ContentTypeQuestion = "QUESTION"`.
- [ ] `createQuestion` mutation, mirroring `createClaim`: private, owner from the session, trimmed text.
- [ ] Add Content: detect text ending in `?`, add Question to the type picker, and add a `useCreateQuestion` hook.
- [ ] Tests for each layer.

### Task 2: Migration (local Docker first)
- [ ] `backend/migrations/0000NN_add_content_relationship_perspectives.{up,down}.sql`. Take the next free number at execution time and check other branches for collisions.
- [ ] Write idempotent DDL.
- [ ] Apply to the local Docker Postgres only; manual `migrate up` elsewhere after the trial.

### Task 3: Domain, ports, repository
- [ ] Add a `RelationshipType` enum with an `IsSymmetric()` method, plus the `ContentRelationshipPerspective` struct.
- [ ] Repository:
  - `Upsert` on the unique key
  - `GetByID`
  - `ListForContent(contentID, viewerID, limit)`: includes both orientations, applies the visibility joins, and returns aggregates
  - `Delete` (owner only)
- [ ] GORM model and mappers (JSONB maps like `CustomFields`).
- [ ] sqlmock tests.

### Task 4: Service
- [ ] Both endpoints must exist and be readable by the caller (not found otherwise).
- [ ] Reject self-links.
- [ ] Validate that ratings and all map values are 0–10000.
- [ ] Validate `relationship_types` keys against the vocabulary.
- [ ] Lowercase `custom_fields` keys.
- [ ] Sanitize `review`.
- [ ] Unit tests built from the scenario fixtures.

### Task 5: GraphQL
- [ ] Add a `ContentRelationshipPerspective` type.
- [ ] Add a `relatedContent(contentID)` query returning related items with aggregates and `myPerspective`.
- [ ] Mutations, all `@auth`:
  - `upsertContentRelationshipPerspective`
  - `deleteContentRelationshipPerspective` (owner only)
- [ ] Add a new `content_relationship.resolvers.go`; wire the service in `main.go`.
- [ ] Resolver tests.

### Task 6: Frontend data layer (no UI yet)
- [ ] gql documents, types and hooks for the query and mutations.
- [ ] Unit tests.

### Task 7: Seed + verify
- [ ] Seed script loading the five scenarios into the local Docker DB.
- [ ] Run the headless checklist: `go build`, `gofmt -l .`, `go test ./...`, `pnpm run test:run`, `pnpm run check`.

## Out of Scope
- Claim/question view UI and rating UI.
- The public/uniqueness gate for claims (`duplicates` data will feed it later).
- AI-suggested relationships.
- Cursor pagination.

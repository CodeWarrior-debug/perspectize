# Content Relationships (Bridge Table) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** DRAFT — awaiting review. Do not execute until the Open Questions are answered.

**Goal:** Let users link two pieces of content (initially claim ↔ claim, where "questions" are simply claims phrased as questions) and let each user rate every link for **relevance** and **importance** on the 0–10000 scale. A claim's default view (built later) can then list its related claims, ranked by those ratings.

**Architecture:** Two new tables behind a new port and service. Links are generic (any content ↔ any content) so future types reuse them. Ratings are per user per link. Aggregates are computed at read time. Visibility follows content privacy: a link is readable only when the viewer can read **both** endpoints.

**Tech Stack:** Go 1.25+, gqlgen, GORM, golang-migrate SQL, Svelte 5 runes, TanStack Svelte Query.

**Depends on:** `2026-09-27-private-claims-plan.md` (content.privacy, migration 000028), which is on the same branch.

## Design Decisions

1. **Bridge tables, not perspectives.** A perspective is one user's view of one content row. A relationship rating is one user's view of a *link between two rows*. Making each link a content row would pollute content lists, so a dedicated table is used.
2. **Content-generic, not claim-only.** Columns are `from_content_id` / `to_content_id` referencing `content`. Nothing restricts endpoints to CLAIM at the DB level; the service decides which type pairs are allowed (initially CLAIM ↔ CLAIM, see Open Question 1).
3. **Extensible `kind`.** A text column with a CHECK constraint, bound to a Go enum and a GraphQL enum. The initial kind is `related`. Adding a kind is a one-line enum plus constraint change. Future candidates: `supports`, `contradicts`, `refines`, `duplicates`.
4. **Direction.** Each kind declares whether it is symmetric. `related` is symmetric, so the service stores it in canonical order (`from < to`) and the unique key `(from, to, kind)` prevents A→B and B→A duplicates. Directional kinds (e.g. `supports`) keep the order as given.
5. **Idempotent create.** Linking an already-linked pair returns the existing link rather than an error, the same pattern as `CreateContentFromPassage`.
6. **Ratings are nullable per dimension.** A user may set only relevance or only importance. Values are CHECKed to 0–10000 (same range as perspective ratings).
7. **Ratings stay private to their author; averages are public.** Readers see averages and counts; only your own rating comes back as `myRating`. This mirrors how perspective aggregates count everything but expose no individual private rows.
8. **Ranking.** Default order is by average relevance × average importance, descending, then by link id. Links with no ratings sort last. Computed in SQL.
9. **Cascades.**
   - Deleting a content row deletes its links, and deleting a link deletes its ratings.
   - Deleting a user deletes that user's ratings. The links they created stay, with `created_by_user_id` set to NULL, because other users' ratings depend on those links.

## Schema (migration `000029_add_content_relationships`)

Confirm the number at execution time: `ls backend/migrations | tail`, and check other branches for a colliding migration.

```sql
CREATE TABLE IF NOT EXISTS public.content_relationships (
    id                 serial PRIMARY KEY,
    from_content_id    int  NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    to_content_id      int  NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    kind               text NOT NULL,
    created_by_user_id int  NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT content_relationships_no_self CHECK (from_content_id <> to_content_id),
    CONSTRAINT content_relationships_kind_check CHECK (kind IN ('related')),
    CONSTRAINT content_relationships_unique UNIQUE (from_content_id, to_content_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_content_relationships_to ON public.content_relationships (to_content_id);
-- (from_content_id, …) is covered by the unique index.

CREATE TABLE IF NOT EXISTS public.content_relationship_ratings (
    relationship_id int NOT NULL REFERENCES public.content_relationships(id) ON DELETE CASCADE,
    user_id         int NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    relevance       int NULL CHECK (relevance  BETWEEN 0 AND 10000),
    importance      int NULL CHECK (importance BETWEEN 0 AND 10000),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (relationship_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_content_relationship_ratings_user ON public.content_relationship_ratings (user_id);
```

The down migration drops both tables (ratings first). Nothing is backfilled. The migration must be applied manually per environment; never run `make migrate-up`.

## GraphQL (sketch)

```graphql
enum ContentRelationshipKind { RELATED }

type ContentRelationship {
  id: ID!
  kind: ContentRelationshipKind!
  fromContent: Content!
  toContent: Content!
  # Convenience: the endpoint that isn't the content you queried from (null when not queried from one side).
  otherContent: Content
  createdByUserID: ID
  ratingCount: Int!
  averageRelevance: Float
  averageImportance: Float
  myRating: ContentRelationshipRating   # null when anonymous or unrated
  createdAt: String!
}

type ContentRelationshipRating {
  relevance: Int
  importance: Int
  updatedAt: String!
}

input CreateContentRelationshipInput {
  fromContentID: IntID!
  toContentID: IntID!
  kind: ContentRelationshipKind = RELATED
}

input RateContentRelationshipInput {
  relationshipID: IntID!
  relevance: Int      # omitted = unchanged; explicit null = clear
  importance: Int
}

extend type Query {
  contentRelationships(contentID: IntID!, kind: ContentRelationshipKind, first: Int = 20): [ContentRelationship!]!
}

extend type Mutation {
  createContentRelationship(input: CreateContentRelationshipInput!): ContentRelationship! @auth
  rateContentRelationship(input: RateContentRelationshipInput!): ContentRelationship! @auth
  deleteContentRelationship(id: ID!): Boolean! @auth   # creator only, and only while no one else has rated it (Open Question 3)
}
```

Endpoint `Content` fields resolve through the existing content lookup with the privacy rule applied. Consider a dataloader if N+1 shows up. The list is capped (`first` ≤ 100); full cursor pagination is deferred until someone needs it.

## Tasks

### Task 1: Migration
- [ ] Write `000029_add_content_relationships.{up,down}.sql` as above (idempotent).

### Task 2: Domain + ports
- [ ] `domain/content_relationship.go`:
  - `ContentRelationshipKind` enum (UPPERCASE) with an `IsSymmetric()` method
  - `ContentRelationship` struct, including aggregate fields and an optional `MyRating`
  - `ContentRelationshipRating` struct
  - `ContentRelationshipListParams` (ContentID, Kind, Limit, ViewerID)
- [ ] `ports/repositories/content_relationship_repository.go`:
  - `GetOrCreate`
  - `GetByID(id, viewerID)`
  - `ListForContent(params)`
  - `UpsertRating`
  - `Delete`
  - `CountRatingsByOthers`
- [ ] `ports/services/content_relationship_service.go`: `Create`, `Rate`, `List`, `Delete`.
- [ ] Bind the kind enum in `gqlgen.yml`, with a DB converter (lowercase ↔ UPPERCASE).

### Task 3: Repository (GORM)
- [ ] GORM models and mappers.
- [ ] `ListForContent`:
  - select links where the content is either endpoint
  - JOIN both endpoints' content rows and apply the "public OR owned by viewer" predicate to **each**
  - LEFT JOIN a ratings aggregate (count, avg relevance, avg importance)
  - LEFT JOIN the viewer's own rating
  - order by the ranking rule
- [ ] `GetOrCreate` with `ON CONFLICT (from, to, kind) DO NOTHING`, then re-read.
- [ ] `UpsertRating` with `ON CONFLICT (relationship_id, user_id) DO UPDATE`, touching `updated_at`.
- [ ] sqlmock tests, mirroring `gorm_content_repository_test.go`.

### Task 4: Service
- [ ] `Create`:
  - reject self-links
  - both endpoints must exist **and be readable by the caller** (otherwise not found, never "forbidden", so private rows aren't disclosed)
  - enforce allowed type pairs
  - normalize order for symmetric kinds
  - idempotent
- [ ] `Rate`: the link must be readable; each value 0–10000; at least one field present.
- [ ] `Delete`: creator only, blocked when others have rated it.
- [ ] Unit tests with mock repositories.

### Task 5: Schema + resolvers
- [ ] Add the schema above, run `make graphql-gen`, and move stubs from the stray `schema.resolvers.go` into a new `content_relationship.resolvers.go`.
- [ ] Resolvers read the viewer from `auth.ForContext`; mutations use `auth.RequireAuth`.
- [ ] Wire the service in `cmd/server/main.go`. Add it to `Resolver` without breaking the existing `NewResolver` callers in tests: an option or setter, or update every call site (decide at execution time).
- [ ] Resolver tests:
  - someone else's private endpoint hides the link
  - `myRating` comes back only for the viewer
  - rating range validation
  - idempotent create returns the same id

### Task 6: Frontend data layer (no UI)
- [ ] `frontend/src/lib/queries/content/relationships.ts`: gql documents and types.
- [ ] Hooks:
  - `useContentRelationships(contentId)`, using a query key mirroring its variables
  - `useCreateContentRelationship`
  - `useRateContentRelationship`, which invalidates that content's relationship list
- [ ] Unit tests in the style of `hooks-useCreateClaim.test.ts`.

### Task 7: Verify + ship
- [ ] `go build ./...`, `gofmt -l .`, `go test ./...`, `pnpm run test:run`, `pnpm run check`.
- [ ] Commit per logical change and push. The PR notes the manual `migrate up` for 000028 and 000029.

## Out of Scope

- The claim default view that renders related claims and questions (separate UI plan).
- Rating UI.
- Suggesting related claims automatically (AI or similarity).
- The public gate for claims.
- Question status / concluded views (decided: not building).
- Cursor pagination for relationships.

## Open Questions (need answers before execution)

1. **Allowed endpoints:** CLAIM ↔ CLAIM only at first, or also claim ↔ any content (e.g. a claim related to a YouTube video)? The tables support both, so this is a service-level rule.
2. **Kinds at launch:** only `RELATED`, or also directional `SUPPORTS` / `CONTRADICTS` now?
3. **Deleting links:** allow the creator to delete while unrated by others (as planned), or no deletes at all in v1?
4. **Who can create links:** any signed-in user between any two readable rows, or only owners of at least one endpoint?
5. **Rating visibility:** are averages and counts public to anyone who can read the link (as planned), or visible only after N ratings?

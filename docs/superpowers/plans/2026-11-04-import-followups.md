# Import follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Written with superpowers:writing-plans.

**Goal:** After #619 (import staging backend, merged) and #620 (`/import` UI, open): show admins a live progress display while an import is being *built* (listed), record which import created each content row (#654), and let a request carry a rich-text description with optional sources (#655).

**Architecture:** Backend work is one new branch `feature/import-followups-backend` off `main` (worktree `.claude/worktrees/import-followups-backend`), three commits, one per backend task. Frontend work is new commits on `feature/import-staging-frontend` (#620's branch, worktree `.claude/worktrees/import-staging-facts-fe`). The frontend commits call schema fields that exist only once the backend branch merges: backend first (dark backend), or #620's CI breaks on unknown fields. Listing progress copies the importing path's design: in-memory tracker, 500 ms throttle, latest-wins subscriber channel, no DB query per tick.

**Tech Stack:** Go, gqlgen (schema-first), GORM + pgx, golang-migrate SQL; SvelteKit (Svelte 5 runes), TanStack Query, graphql-ws, Tiptap (`CommentsEditor`), Vitest.

**Spec:** Issues #654 and #655 (GitHub), plus the 2026-11-04 session decisions below. There is no separate spec doc.

## Session decisions (verbatim intent)

- One backend branch, three commits (listing progress, #654, #655).
- #655 is **not a comment thread**. It is the **description of the original request**. Only the user who made the request may create or edit it. No comments table, no `import_job_comments`.
- The listing-progress display is **admin-only** (enforced server-side, not only hidden in the UI).
- The demo video waits until all of this has landed; it will be recorded by hand.

## Global Constraints

- Migrations are written and reviewed only. **Never** run `make migrate-up/down` or `migrate ... up/down` (`DATABASE_URL` is the shared Neon DB). Local verification uses a throwaway Postgres (`testdb`) or the demo stack's Postgres on :5434.
- Next free migration numbers on `main` are `000036` (#654) and `000037` (#655). They are provisional; rename to the next free number on `main` as the last step before merge. Note `feature/audio-track-content-type` holds 38–41 after its renumbering.
- Idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`); verify up → up → down → up on a local Postgres.
- Every DB-touching change carries a query-count test (`internal/perf/querycount`) and, for new GraphQL operations, a round-trip count in `backend/test/roundtrips/import_test.go`. Frontend: cache-contract tests (`imports-cache-contract.test.ts` style).
- Rating-style numeric fields use `valid_integer_range`; none are added here.
- A `Content` field with per-row data goes through a dataloader (no per-row query).
- User-supplied HTML: sanitized with bluemonday on the backend and `sanitizeHtml` / `SafeHtml` on the frontend; keep the two tag sets in step (`.docs/SECURITY.md#user-supplied-html`).
- Nav label is one word (`Import`).
- Commit messages are conventional (`feat`, `fix`, `test`, `docs`). No chained shell commands. `make graphql-gen` ends with a colliding `schema.resolvers.go`: diff it, move the new stubs to `import.resolvers.go` / `content.resolvers.go`, then `rm` it.
- Verification before PR: `go build ./...`, `gofmt -l .` (empty), `go vet ./...`, `go test ./...`; `pnpm run test:run` in `frontend/`.

## Review Focus

1. A non-admin subscribes to listing progress → `ErrForbidden`, no channel (Task 1 test).
2. A source that fails mid-listing leaves the final snapshot with that source `FAILED` and `Listing=false`, so the panel stops spinning (Task 1 test).
3. Content imported by hand, and every pre-existing row, has a null `importedFrom`; a closed import's link is null for a non-admin (Task 2 tests).
4. A request with a description and **zero** sources is accepted; one with neither a description nor a source is rejected; a non-owner (including an admin) cannot edit the description; HTML is sanitized (`<script>` stripped) (Task 3 tests).
5. A declined/approved request with no sources: approving lists nothing and does not error (Task 3 test).

---

## File Structure

**Backend (new branch):**
- Create `backend/internal/core/services/import_listing_progress.go`: the listing tracker.
- Modify `backend/internal/core/services/import_service.go`: wire the tracker into `listSource`; `SubscribeListingProgress`; description + optional sources in `CreateImportJob`; `UpdateImportJobDescription`; pass the import job id into content creation.
- Modify `backend/internal/core/domain/import_job.go`: new types and fields.
- Modify `backend/internal/core/services/content_service.go`: read the import job id from context on create.
- Modify ports `ports/services/import_service.go`, `ports/repositories/import_job_repository.go`, content repository mapper/model (`gorm_models.go`, `gorm_mappers.go`).
- Modify `backend/schema.graphql`, `backend/gqlgen.yml`, `resolvers/import.resolvers.go`, `resolvers/content.resolvers.go`, `dataloader/dataloader.go`.
- Create `backend/migrations/000036_add_content_import_job_id.{up,down}.sql`, `000037_add_import_job_description.{up,down}.sql`.
- Tests under `backend/test/services/`, `backend/test/roundtrips/`, `backend/internal/adapters/repositories/postgres/gorm_import_job_integration_test.go`, `dataloader_test.go`.

**Frontend (#620's branch):**
- Create `frontend/src/lib/queries/imports/useImportListingProgress.svelte.ts`, `frontend/src/lib/components/imports/ImportListingProgress.svelte`.
- Modify `Header.svelte`, `ActivityDetailsModal.svelte`, `ImportRequestForm.svelte`, `ImportSourceList.svelte`, `queries/imports/*` documents and types, `queries/keys.ts` if needed, the content query documents.
- Tests under `frontend/tests/`.

---

## Task 1: Admin-only live listing progress (backend)

**Files:**
- Create: `backend/internal/core/services/import_listing_progress.go`
- Modify: `backend/internal/core/domain/import_job.go`, `backend/internal/core/services/import_service.go` (`listSource`, new `SubscribeListingProgress`), `backend/internal/core/ports/services/import_service.go`, `backend/schema.graphql`, `backend/gqlgen.yml`, `backend/internal/adapters/graphql/resolvers/import.resolvers.go`, `backend/internal/adapters/graphql/resolvers/helpers.go`
- Test: `backend/test/services/import_listing_progress_test.go`, `backend/test/services/import_service_test.go`, `backend/test/roundtrips/import_test.go`

**Interfaces:**
- Produces (domain):
  ```go
  type ImportSourceListingProgress struct {
      SourceID int
      Staged   int // rows upserted so far
      Batches  int // batches received so far
      Status   ImportSourceStatus // LISTING | READY | FAILED
  }
  type ImportListingProgress struct {
      JobID     int
      Sources   []ImportSourceListingProgress // ordered by SourceID
      Listing   bool                          // any source still LISTING
      UpdatedAt time.Time
  }
  ```
- Produces (service): `func (s *ImportService) SubscribeListingProgress(ctx context.Context, actor *domain.AuthenticatedUser, jobID int) (<-chan domain.ImportListingProgress, error)` and the same method on the `ports/services` interface.
- Produces (tracker, unexported): `newListingTracker(interval time.Duration, now func() time.Time) *listingTracker` with `begin(jobID, sourceID int)`, `staged(jobID, sourceID, rows int)`, `finish(jobID, sourceID int, status domain.ImportSourceStatus)`, `subscribe(ctx context.Context, jobID int) <-chan domain.ImportListingProgress`.
- Produces (GraphQL): `type ImportListingProgress { jobId: ID!  listing: Boolean!  sources: [ImportSourceListingProgress!]!  updatedAt: String! }`, `type ImportSourceListingProgress { sourceId: ID!  staged: Int!  batches: Int!  status: ImportSourceStatus! }`, and `extend type Subscription { importListingProgress(jobId: ID!): ImportListingProgress! @auth }`.

- [ ] **Step 1: Write the failing tracker tests** in `import_listing_progress_test.go`, modelled on `import_progress_test.go`: `TestListingTracker_ImmediateSnapshotOnSubscribe`, `TestListingTracker_ThrottlesBurst` (1,000 `staged` calls in a burst produce at most a handful of messages), `TestListingTracker_LatestWinsForSlowSubscriber`, `TestListingTracker_FailedSourceEndsListing` (assert final snapshot has `Listing == false` and that source's `Status == FAILED`), `TestListingTracker_UnsubscribeClosesChannel`.
- [ ] **Step 2: Run** `go test ./test/services -run ListingTracker -race` — Expected: FAIL (undefined).
- [ ] **Step 3: Implement `listingTracker`** in `import_listing_progress.go`, copying the `importProgressTracker` shape (mutex, per-job state, one ticker goroutine per running job, `sendLatest` reuse). `begin` and `finish` publish at once; `staged` only marks dirty.
- [ ] **Step 4: Run** the same command — Expected: PASS, repeated with `-count=30`.
- [ ] **Step 5: Write the failing service tests** in `import_service_test.go`: `TestSubscribeListingProgress_NonAdminForbidden`, `TestSubscribeListingProgress_UnknownJobNotFound`, `TestListSource_PublishesStagedCountsThenReady`, `TestListSource_FailurePublishesFailed`.
- [ ] **Step 6: Implement** `listSource` calls: `tracker.begin` at start, `tracker.staged(jobID, srcID, len(batch))` after each successful upsert, `tracker.finish` after the final `UpdateSource` with the final status. `SubscribeListingProgress` checks `actor.Role == domain.UserRoleAdmin` (else `fmt.Errorf("%w: only an admin may watch listing progress", domain.ErrForbidden)`), then `repo.GetJob` (1 query), then subscribes. Add the field `listing *listingTracker` to `ImportService`, built where `progress` is.
- [ ] **Step 7: Schema + resolver:** add the types and subscription to `schema.graphql`, bind `ImportListingProgress` / `ImportSourceListingProgress` to the domain types in `gqlgen.yml`, `make graphql-gen`, move the stub into `import.resolvers.go` (mirror `ImportProgress`), delete the stray `schema.resolvers.go`.
- [ ] **Step 8: Query count + round trip:** repository-level count is unchanged (assert `SubscribeListingProgress` costs exactly 1 statement in `test/roundtrips/import_test.go`, and that 1,000 `staged` calls cost 0).
- [ ] **Step 9: Run** `go build ./...` and `go test ./... -race -run 'Import|Listing'` — Expected: PASS.
- [ ] **Step 10: Commit** `feat(backend): admin-only live progress while an import is being built`.

---

## Task 2: Record the import a content row came from (#654, backend)

**Files:**
- Create: `backend/migrations/000036_add_content_import_job_id.up.sql`, `.down.sql`
- Modify: `backend/internal/core/domain/` (Content gets `ImportJobID *int`), `gorm_models.go`, `gorm_mappers.go`, `backend/internal/core/services/content_service.go`, `import_service.go` (`importOne`), `ports/repositories/import_job_repository.go`, `gorm_import_job_repository.go`, `backend/schema.graphql`, `gqlgen.yml`, `dataloader/dataloader.go`, `resolvers/content.resolvers.go`
- Test: `backend/test/services/content_service_test.go` (or the existing content create test file), `backend/internal/adapters/repositories/postgres/gorm_import_job_integration_test.go`, `backend/internal/adapters/graphql/dataloader/dataloader_test.go`, `backend/test/roundtrips/import_test.go`

**Interfaces:**
- Produces (migration): `content.import_job_id integer REFERENCES import_jobs(id) ON DELETE SET NULL`, nullable, **no index**. Up: `ALTER TABLE content ADD COLUMN IF NOT EXISTS import_job_id ...`. Down: `DROP COLUMN IF EXISTS`.
- Produces (services): `func WithImportJobID(ctx context.Context, jobID int) context.Context` and `func importJobIDFrom(ctx context.Context) (int, bool)` in package `services`. The content create path (`CreateFromYouTube` / `CreateFromMovie`) sets `Content.ImportJobID` when the context carries one. *Reason for a context value:* it leaves the `ContentService` port and its ~20 mocks and the `slowImportCreator` wrapper unchanged; only `importOne` sets it.
- Produces (repository): `GetJobsByIDs(ctx context.Context, ids []int) (map[int]*domain.ImportJob, error)` — 1 statement for any number of ids, 0 for empty, `= ANY(CAST(? AS bigint[]))` with `intsToArray`.
- Produces (GraphQL): `type ImportJobRef { id: ID!  name: String! }` and `Content.importedFrom: ImportJobRef` (nullable, `resolver: true`, via `dataloader.For(ctx).ImportJobByID`).

- [ ] **Step 1: Write the migration** and check it locally: up → up → down → up on a throwaway Postgres 17; assert the column is nullable with no default.
- [ ] **Step 2: Failing tests:** `TestCreateFromYouTube_RecordsImportJobWhenContextCarriesOne`, `TestCreateFromYouTube_NoContextLeavesImportJobNull`, `TestImportOne_PassesJobIDToContentCreate` (fake content creator records the context), `TestGetJobsByIDs_OneStatementForAnyCount` (querycount 1 for 1 and 50 ids, 0 for empty).
- [ ] **Step 3: Implement** domain field, GORM model/mapper, the context helpers, `importOne` wrapping `ctx` with `WithImportJobID(ctx, it.JobID)`, and `GetJobsByIDs`.
- [ ] **Step 4: Failing dataloader + visibility tests:** `TestImportJobLoader_NLoadsOneServiceCall`; `TestContentImportedFrom_NullWhenClosedAndViewerNotAdmin`; `TestContentImportedFrom_NullForHandAddedContent`; `TestContentImportedFrom_AdminSeesClosedImport`.
- [ ] **Step 5: Implement** the loader (`ImportJobByID`), the `Content.importedFrom` resolver (closed + non-admin → nil; a missing job → nil, not an error), schema + `gqlgen.yml` (`extraFields` carries `ImportJobID` onto the `Content` model), `make graphql-gen`, move stubs.
- [ ] **Step 6: Round trip:** `contents` list of N rows that all came from imports costs the same number of statements as one row plus exactly 1 for the loader (pin it in `test/roundtrips/import_test.go`).
- [ ] **Step 7: Run** `go build ./...`, `gofmt -l .`, `go vet ./...`, `go test ./...` against a local `testdb` with migrations applied — Expected: PASS.
- [ ] **Step 8: Commit** `feat(backend): record which import created a content row (#654)`.

---

## Task 3: Request description and optional sources (#655, backend)

**Files:**
- Create: `backend/migrations/000037_add_import_job_description.up.sql`, `.down.sql`
- Modify: `domain/import_job.go` (`ImportJob.Description *string`, `CreateImportJobInput.Description *string`), `gorm_models.go`, `gorm_mappers.go`, `gorm_import_job_repository.go`, `import_service.go` (`CreateImportJob`, `ReviewImportJob`, new `UpdateImportJobDescription`), ports, `schema.graphql`, `resolvers/import.resolvers.go`
- Test: `backend/test/services/import_service_test.go`, `gorm_import_job_integration_test.go`, `backend/test/roundtrips/import_test.go`

**Interfaces:**
- Produces (migration): `ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS description text` (nullable; no CHECK). Down drops it.
- Produces (rules): description is trimmed, sanitized with the repo's existing bluemonday policy (find it with `grep -rn bluemonday backend/`; reuse that function, do not add a second policy), and at most 20,000 characters (`ErrInvalidInput` beyond). `CreateImportJob` now requires a name **and** (a non-empty description **or** at least one source); `len(Sources) > MaxImportSourcesPerJob` still rejects. A request with zero sources is created with `RequestStatus` from the actor's role as before and starts no listing.
- Produces (service): `func (s *ImportService) UpdateImportJobDescription(ctx context.Context, actor *domain.AuthenticatedUser, jobID int, description string) (*domain.ImportJob, error)` — only `job.UserID == actor.ID` (an admin who is not the requester gets `ErrForbidden`); the import must not be closed; sanitizes as above. One UPDATE scoped `WHERE id = ? AND user_id = ? AND closed_at IS NULL`, `clause.Returning{}`; on zero rows, read the job once to tell not-found from forbidden from closed.
- Produces (GraphQL): `ImportJob.description: String`, `CreateImportJobInput { name: String!  description: String  sources: [CreateImportSourceInput!]! }` (list stays required, may be empty), `updateImportJobDescription(input: UpdateImportJobDescriptionInput!): ImportJob! @auth` with `UpdateImportJobDescriptionInput { jobId: IntID!  description: String! }`.
- Approving a request with zero sources: `ReviewImportJob` already loops over `job.Sources`; assert it starts nothing and returns the approved job (no change if the loop is empty).

- [ ] **Step 1: Write the migration**; verify up → up → down → up locally.
- [ ] **Step 2: Failing service tests:** `TestCreateImportJob_DescriptionOnlyIsAccepted`, `TestCreateImportJob_NeitherNameDescriptionNorSourcesRejected` (name only, no sources, no description → `ErrInvalidInput`), `TestCreateImportJob_DescriptionSanitized` (`<script>` and `onclick` stripped, `<p><strong>` kept), `TestCreateImportJob_DescriptionTooLong`, `TestUpdateImportJobDescription_OwnerOnly` (other user and an admin → `ErrForbidden`), `TestUpdateImportJobDescription_ClosedImportRejected`, `TestUpdateImportJobDescription_UnknownJobNotFound`, `TestReviewImportJob_ApproveWithNoSourcesStartsNothing`.
- [ ] **Step 3: Implement** the service changes and repository support.
- [ ] **Step 4: Query counts:** `updateImportJobDescription` costs 1 statement on success (2 on a miss); pin both in `test/roundtrips/import_test.go`; `createImportJob` count is unchanged for a request with sources.
- [ ] **Step 5: Schema + resolver:** add fields, `make graphql-gen`, move stubs to `import.resolvers.go`, delete the stray file.
- [ ] **Step 6: Run** the full backend verification list under Global Constraints — Expected: PASS.
- [ ] **Step 7: Commit** `feat(backend): rich-text description and optional sources on an import request (#655)`.

---

## Task 4: Admin listing-progress display (frontend, #620's branch)

**Files:**
- Create: `frontend/src/lib/queries/imports/useImportListingProgress.svelte.ts`, `frontend/src/lib/components/imports/ImportListingProgress.svelte`
- Modify: `frontend/src/lib/queries/imports/index.ts` (document + types), `ImportSourceList.svelte`, `frontend/src/routes/import/[id]/+page.svelte`, `frontend/src/lib/queries/keys.ts` only if a key is needed
- Test: `frontend/tests/components/ImportListingProgress.test.ts`, `frontend/tests/unit/imports-cache-contract.test.ts`

**Interfaces:**
- Consumes: the `importListingProgress(jobId)` subscription from Task 1; `useMe().isAdmin`.
- Produces: `useImportListingProgress(jobId: () => number | null, enabled: () => boolean)` returning `{ progress, status }` (state shape mirrors `useImportProgress`); `ImportListingProgress.svelte` props `{ jobId: number; sources: ImportSourceSummary[] }`.

States that need a test each (stateful component): hidden for a non-admin; hidden when no source is listing and no snapshot is live; listing (per-source staged count and batch count, aggregate "Building: N rows from M sources"); one source ready while another still lists; a source failed (reason shown, spinner stops); all done (shows "Built N rows" then clears after dismissal); socket disconnected (falls back to the existing 3 s poll; no error banner).

- [ ] **Step 1: Failing component tests** for each state above (`render`, mocked hook).
- [ ] **Step 2: Failing cache-contract test:** a run ending refetches the sheet and the imports lists exactly once, and the subscription is not opened for a non-admin.
- [ ] **Step 3: Implement** the hook (graphql-ws, copy `useImportProgress.svelte.ts`) and the component. Gate by `isAdmin` in the component and do not open the subscription for non-admins.
- [ ] **Step 4: Place it** on the Imports list (beside each listing import) and above the sheet on `/import/[id]`.
- [ ] **Step 5: Run** `pnpm run test:run -- ImportListingProgress imports-cache-contract` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(frontend): admin-only progress display while an import is being built`.

## Task 5: Import nav link and "Imported from" (#654, frontend)

**Files:**
- Modify: `frontend/src/lib/components/Header.svelte:19-24` (`navLinks`), `ActivityDetailsModal.svelte`, the content GraphQL documents that feed the modal (add `importedFrom { id name }`), their types
- Test: `frontend/tests/components/Header.test.ts` (or existing), `frontend/tests/components/ActivityDetailsModal.test.ts`

**Interfaces:**
- Consumes: `Content.importedFrom: ImportJobRef | null` from Task 2.

- [ ] **Step 1: Failing tests:** Header renders an `Import` link to `/import`, `aria-current="page"` on `/import` and `/import/12`; details modal shows "Imported from <name>" linking to `/import/<id>` when `importedFrom` is set, and shows nothing when null.
- [ ] **Step 2: Implement** the nav entry `{ href: '/import', label: 'Import' }` and the modal row.
- [ ] **Step 3: Run** `pnpm run test:run -- Header ActivityDetailsModal` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(frontend): Import in the nav, and an "Imported from" link in content details (#654)`.

## Task 6: Request description and optional sources (#655, frontend)

**Files:**
- Modify: `ImportRequestForm.svelte`, `ImportSourceList.svelte` (show the description), `queries/imports/index.ts` (create-job input, `ImportJob.description`), `useImportJobMutations.ts` (new `useUpdateImportJobDescription`), the Imports list page
- Test: `frontend/tests/components/ImportRequestFlow.test.ts`, `frontend/tests/unit/imports-cache-contract.test.ts`

**Interfaces:**
- Consumes: `description` on `ImportJob`, `createImportJob(input.description)`, `updateImportJobDescription` from Task 3; `CommentsEditor` (`value`, `onChange`, `toolbar="basic"`), `SafeHtml`.
- Produces: `useUpdateImportJobDescription()` mutation; on success it evicts the imports-list variants and that sheet only.

States to test: submit disabled with a name and no description and no filled source; enabled with a name and a description only; enabled with a name and a source only; the editor emits sanitized HTML on submit; a source row left blank is dropped rather than blocking (only when a description exists); the description renders sanitized on the list for everyone who can see the import; the Edit control shows only for the requester (not for an admin who is not the requester); saving shows the toast and the new text; a closed import hides Edit.

- [ ] **Step 1: Failing tests** for the states above.
- [ ] **Step 2: Implement** the form change (optional description via `CommentsEditor`, `canSubmit` becomes name AND (description OR at least one filled source)), the mutation hook, and the description display + owner-only edit.
- [ ] **Step 3: Run** `pnpm run test:run -- ImportRequestFlow imports-cache-contract` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(frontend): rich-text description and optional sources on an import request (#655)`.

---

## Self-review notes

- Spec coverage: listing progress → Tasks 1, 4; #654 → Tasks 2, 5; #655 (description, optional sources, requester-only edit) → Tasks 3, 6; session decisions → Global Constraints and Review Focus.
- Deliberately out of scope (YAGNI, not decided by the user): an admin adding sources to a request after the fact (the admin creates their own import), a total/ETA for listing, backfilling `import_job_id`.
- Ordering: Tasks 1–3 (backend branch) must merge before Tasks 4–6 can pass CI on #620.
- Demo: the user records the video by hand after everything lands; nothing in this plan records one.

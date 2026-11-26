# Phase 1 task spec (nine past commits, user-approved)

Conditions: A = ticket only. B = A + files and interfaces touched. C = B + exact build/test commands.
Scoring per attempt: compiles / typechecks, repo's existing tests pass, the real commit's tests pass against the attempt
("hidden tests"; a failure caused only by a new name the condition did not reveal is tagged `name-mismatch`), would-accept
(my review against the real diff), tool calls, tokens, first-failure tag.

Hidden-test rule: copy only the real commit's changed test files into the attempt worktree AFTER the agent finishes.

## Backend (Go) - worktree base = parent commit

### T1 82330470 (parent dd05a963)
A: Sorting or filtering the content list by statistics counts fails the whole list when a stored count is an empty string
(YouTube can store an empty string for hidden likes). The like-count sort was already made safe, but the view-count sort, the
percent-liked sort and the min/max view-count and like-count filters still cast the stored statistics value straight to BIGINT,
which Postgres rejects. Make those paths treat an empty or non-numeric stored count as unknown, the way the like-count sort does,
without repeating the cast logic in each place.
B adds: files `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` (List), `.../postgres/helpers.go`
(contentSortRule and the sort-expression constants); new shared helper `func statCountExpr(key string) string`; tests in
`.../postgres/helpers_test.go` and `.../postgres/gorm_content_sort_integration_test.go`.
Hidden tests: postgres/gorm_content_sort_integration_test.go (skips without DATABASE_URL), postgres/helpers_test.go.
Test cmd (C): `go -C backend build ./...` ; `go -C backend test ./internal/adapters/repositories/postgres/...` ; `gofmt -l backend`.

### T2 984e6b7d (parent 7c6f349e)
A: Sorting the content list by LIKE_COUNT fails the whole list ("failed to list content") when a stored statistics.likeCount is an
empty string (YouTube can store an empty string for hidden likes); Postgres rejects the bare ::BIGINT cast. Values that are not all
digits should sort as unknown (0), matching how the GraphQL field shows an empty count.
B adds: files `backend/internal/adapters/repositories/postgres/helpers.go` (contentSortRule); tests `helpers_test.go`,
`gorm_content_repository_test.go`, `gorm_content_sort_integration_test.go` in the same package. No new interface.
Hidden tests: postgres/gorm_content_repository_test.go, postgres/gorm_content_sort_integration_test.go, postgres/helpers_test.go.
Test cmd (C): same as T1.

### T3 d1c2fd65 (parent c9dc6402)
A: Two changes to the import progress code. (1) The import tracker and the listing tracker each keep a `jobs` alias that exists only
for older tests; remove the aliases and update the tests. (2) The generic progress hub keeps one entry per key forever. Bound it:
keep at most 256 idle keys and evict the one that went idle longest ago when over the limit. A key that is running or has a
subscriber must never be evicted.
B adds: files under `backend/internal/core/services/`: `latest_hub.go` (latestHub, hubEntry, newLatestHub, update, tick, subscribe),
`import_progress.go` (importProgressTracker, newImportProgressTracker), `import_listing_progress.go` (listingTracker,
newListingTracker); new `const defaultMaxIdleEntries = 256`, new methods `(h *latestHub[K,V,S]) settleLocked(e *hubEntry[V,S])` and
`evictOldestIdleLocked() bool`; tests `latest_hub_test.go`, `import_progress_test.go`, `import_listing_progress_test.go`, plus the two
`*_semantics_test.go`.
Hidden tests: services/{latest_hub_test,import_progress_test,import_progress_semantics_test,import_listing_progress_test,import_listing_progress_semantics_test}.go
Test cmd (C): `go -C backend build ./...` ; `go -C backend test ./internal/core/services/...` ; `gofmt -l backend`.

### T4 8cc5035e (parent d1c2fd65)
A: When an import batch hits its time limit, rows still waiting for a slot stay in `queued` status and cannot be selected again until
the next server restart. The batch should fail the rows it did not save (one UPDATE scoped to the job, the named rows and the queued
status) and count them in its progress. A server shutdown must still leave unsent rows queued so RecoverInterrupted can pick them up.
B adds: files `backend/internal/core/services/import_service.go` (ImportService, NewImportService, runImports, importOne,
importFailureDetail, workersFor), port `backend/internal/core/ports/repositories/import_job_repository.go`, adapter
`backend/internal/adapters/repositories/postgres/gorm_import_job_repository.go`; new port method
`FailQueuedItems(ctx context.Context, jobID int, ids []int, detail string) (int, error)`; new `WithImportBatchTimeout(d time.Duration)
ImportServiceOption`; new const `cutShortDetail`; tests `backend/test/services/import_limiter_test.go`, `import_service_test.go`,
`.../postgres/gorm_import_job_integration_test.go`.
Hidden tests: test/services/import_limiter_test.go, test/services/import_service_test.go, postgres/gorm_import_job_integration_test.go.
Test cmd (C): `go -C backend build ./...` ; `go -C backend test ./internal/core/services/... ./test/services/...` ; `gofmt -l backend`.

## Frontend (SvelteKit) - worktree base = parent commit

### T5 6d227da1 (parent fff92579)
A: In the Library list the order comes from the server (default sort updatedAt desc). After the user edits a row and the list
refetches, the edited row can come back first and jump out of view, so the user loses their place. Keep the displayed order for as
long as the list's query key is unchanged. New rows still lead, matching the default sort; a new sort, filter, search or page starts
from the server order. Placeholder data is neither applied nor recorded. Scope: the default Loaded mode and the mobile card list.
B adds: files `frontend/src/lib/components/ActivityTable.svelte`, new `frontend/src/lib/utils/rowOrder.ts` exporting
`type RowWithId`, `keepRowOrder<T extends RowWithId>(rows: T[], ids: string[]): T[]`, `createRowOrderMemory()`; test
`frontend/tests/unit/rowOrder.test.ts`.
Hidden tests: tests/unit/rowOrder.test.ts.
Test cmd (C): `pnpm --dir frontend run check` ; `pnpm --dir frontend exec vitest run --project unit tests/unit/rowOrder.test.ts` ;
`pnpm --dir frontend run test:run`.

### T6 af2aa79f (parent f90309ae)
A: The Berean Standard Bible stores 16 verses with empty text (their content sits in footnotes). PassageText renders only non-empty
verses, so those verses show no number and no text, and a passage made only of one of them renders blank apart from its
attribution. Show the verse number with an "omitted in the BSB" marker inline, and replace a passage made only of omitted verses with
a short explanation and a Bible Gateway link (ESV, the default version). Do not synthesize verse text.
B adds: file `frontend/src/lib/components/PassageText.svelte`; test `frontend/tests/components/PassageText.test.ts`. No new interface.
Hidden tests: tests/components/PassageText.test.ts.
Test cmd (C): `pnpm --dir frontend run check` ; `pnpm --dir frontend exec vitest run --project unit tests/components/PassageText.test.ts` ;
`pnpm --dir frontend run test:run`.

### T7 8d89d811 (parent af2aa79f)
A: Library: when exactly one content type is shown (a single type filter is active), offer one-click switches to the other types.
(The original commit has no body; this is the whole ticket.)
B adds: files `frontend/src/lib/components/TypePills.svelte`, `frontend/src/lib/utils/gridUrlState.ts`,
`frontend/src/routes/content-library/+page.svelte`; new export `otherTypeOptionsWhenOne(filters: Record<string, string>): readonly
{ value: string; label: string }[]`; tests `frontend/tests/components/TypePills.test.ts`, `frontend/tests/unit/otherTypeOptions.test.ts`.
Hidden tests: tests/components/TypePills.test.ts, tests/unit/otherTypeOptions.test.ts.
Test cmd (C): `pnpm --dir frontend run check` ; `pnpm --dir frontend exec vitest run --project unit tests/components/TypePills.test.ts tests/unit/otherTypeOptions.test.ts` ;
`pnpm --dir frontend run test:run`.

### T8 f90309ae (parent b582f9e3)
A: On the Plan grid the sortable headings can truncate to an ellipsis: Priority (84px wide, needs about 103px) and % Complete
(100px, needs about 133px), because each column's minWidth is set by hand. Apply the same minimum-header-width floor the Activity
grid uses, derived from the Plan theme's own header chrome, to both width and minWidth, for both list modes.
B adds: files `frontend/src/lib/components/plan/PlanTable.svelte`, `frontend/src/lib/utils/grid-theme.ts`,
`frontend/src/lib/utils/plan-grid-config.ts` (buildPlanColumnDefs); new exports `PLAN_GRID_THEME` and
`PLAN_HEADER_CHROME: HeaderChrome` in grid-theme (PlanTable and the header measurement share one theme definition); test
`frontend/tests/unit/plan-grid-config.test.ts`.
Hidden tests: tests/unit/plan-grid-config.test.ts.
Test cmd (C): `pnpm --dir frontend run check` ; `pnpm --dir frontend exec vitest run --project unit tests/unit/plan-grid-config.test.ts` ;
`pnpm --dir frontend run test:run`.

### T9 92c03c5f (parent c7bc5e80)
A: A claim has no video, poster, cover or url, so the mobile card list and the details modal render its thumbnail slot as an empty
grey bg-muted box. Show the message-square-text icon (the same bubble-with-text glyph the grid's Type column uses) in that slot for
claims, on the card colour like the Bible passage icon.
B adds: files `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/ActivityDetailsModal.svelte`; tests
`frontend/tests/components/ActivityCardList.test.ts`, `frontend/tests/components/ActivityDetailsModal.test.ts`. No new interface.
Hidden tests: tests/components/ActivityCardList.test.ts, tests/components/ActivityDetailsModal.test.ts.
Test cmd (C): `pnpm --dir frontend run check` ; `pnpm --dir frontend exec vitest run --project unit tests/components/ActivityCardList.test.ts tests/components/ActivityDetailsModal.test.ts` ;
`pnpm --dir frontend run test:run`.

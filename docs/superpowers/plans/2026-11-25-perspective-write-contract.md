# Perspective write contract (P1) Implementation Plan

> **For agentic workers:** execute task by task, test first (red, then green).

**Goal:** one domain module owns what a valid perspective is, for both create and update, and one resolver mapping turns typed kinds into GraphQL codes. Closes #871 (custom-field-only saves), #872 (owner self-approval via reviewStatus), #874 (duplicate private/public perspective shows a retry that can never succeed).

**Base:** `chore/content-creation-pipeline` (#869). Reuses `domain.ErrorKind` / `domain.KindOf` and the `extensions.code` mapping from #869.

**Vocabulary:** module = `domain/perspective_contract.go` (interface: `ValidatePerspective`, `RelatedIDCap`), seam = the service's `LinkedPerspectiveReader` option, adapter = the GORM repository's `VisibleIDs`. Leverage: create and update share one validator instead of two copies. Locality: each rule is written once.

## Decisions

1. **Non-empty rule** counts quality, agreement, importance, confidence, like, review, description, feelings, custom fields, categorized ratings and labels (the old list plus three). Applied to the resulting state of both create and update, so the create/update parity table holds.
2. **reviewStatus**: owner writes that set it are rejected with `domain.ErrReviewStatusLocked` (wraps `ErrForbidden`, code `FORBIDDEN`). Reason: `UserRoleAdmin` exists, but no moderation mutation or admin-scoped write path exists, so an admin check would add a user lookup with no caller. Reject is the smallest correct rule; a future moderation mutation gets its own role check.
3. **Linked perspectives** (`primaryPerspectiveID`, `relatedPerspectiveIDs`): only newly attached IDs are checked, in one batched query (`VisibleIDs`). Readable = the list predicate (public or own) and, when content is attached, visible content. Unreadable and missing are the same error (`ErrLinkedPerspectiveNotFound`, wraps `ErrNotFound`), so the response does not reveal existence (ADR 0002 section 8, threat 3).
4. **Kinds**: add `KindForbidden` ("FORBIDDEN"), `KindDuplicate` ("ALREADY_EXISTS"). Map `ErrInvalidRating` to `KindInvalid`, `ErrForbidden` to `KindForbidden`, `ErrDuplicatePerspective` to `KindDuplicate` in `KindOf`.
5. **Duplicate**: `domain.ErrDuplicatePerspective` wraps `ErrAlreadyExists`, so existing `errors.Is(ErrAlreadyExists)` tests still pass.
6. **Messages**: every existing client-facing message text is kept.
7. **Frontend**: the two hooks classify by `extensions.code` first, then fall back to the existing substring checks. A duplicate becomes a non-retryable error toast.

## Tasks

### Task 1: domain contract (test first)
- `backend/test/domain/perspective_contract_test.go`: table of valid and invalid perspectives (ratings out of range, categorized out of range, feelings over cap or empty emoji, related over 50, empty with only custom fields, empty with only labels, empty with only categorized ratings, empty when all fields absent).
- Implement `backend/internal/core/domain/perspective_contract.go`: `MaxRelatedPerspectiveIDs = 50`, `ValidatePerspective(*Perspective) error` (same messages as today), `ErrReviewStatusLocked`, `ErrLinkedPerspectiveNotFound`, `ErrDuplicatePerspective`, `hasContent`.
- Add the kinds in `content_errors.go` and extend `KindOf`.

### Task 2: service (test first)
- Rewrite Create to build the Perspective then call `ValidatePerspective`.
- Rewrite Update to merge input into existing, reject ReviewStatus, validate the merged state, and check newly attached linked IDs through the new reader.
- `backend/test/services/perspective_write_parity_test.go`: same input valid or invalid for create and update, custom-field-only save succeeds, owner reviewStatus rejected, linked unreadable rejected with the same error as missing.
- Update `backend/test/services/perspective_service_update_fields_test.go:18` (pinned owner self-approval) to assert rejection.

### Task 3: repository and wiring
- `VisibleIDs(ctx, ids, viewerID)` on the GORM repo, one query, empty input issues 0 queries. Query-count test in `internal/adapters/repositories/postgres`.
- Repo duplicate returns `ErrDuplicatePerspective` (both Create and Update).
- `LinkedPerspectiveReader` interface in `core/ports/repositories`; `WithLinkedPerspectiveReader` option; wire in `cmd/server/main.go`.

### Task 4: resolvers
- New `resolvers/error_kinds.go`: `kindedError(msg, kind)` shared by content create and perspective create/update. Perspective create/update errors map through `domain.KindOf` with their existing messages.
- Resolver test: duplicate, linked not found, review status locked, custom-field-only create each produce the expected code.

### Task 5: frontend (test first)
- `frontend/src/lib/queries/perspectives/writeError.ts`: `classifyPerspectiveWriteError(err)` returns `{ kind: 'duplicate' | 'noUser' | 'invalidRating' | 'emptyPerspective' | 'retryable', message }`, using `extensions.code` first, then the substring fallbacks.
- Use it in `useCreatePerspective.ts` and `useUpdatePerspective.ts` (only their onError changes).
- Tests in `frontend/tests/unit/perspectives/writeError.test.ts` and a hook-level test for the duplicate toast.

### Task 6: verification
- `go build ./...`, `gofmt -l .`, `go test ./...` in backend; `pnpm run check`, `pnpm run test:run` in frontend.
- Query budget: `VisibleIDs` batch test. Roundtrip count if Update changes its statement count.
- File size: no existing file grows; new files under 500 lines.

## Open items for review
- Update now enforces the non-empty rule on the resulting state. A perspective with only privacy/category set can no longer be cleared to empty.
- Linked-read check mirrors the list predicate (public or own, plus visible content).

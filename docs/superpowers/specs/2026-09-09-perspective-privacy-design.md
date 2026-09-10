# Perspective Privacy (Public / Private) — Design

**Date:** 2026-09-09
**Branch / worktree:** `feature/perspective-privacy` in the main worktree (`/Users/jamesjordan/GitHub/perspectize`)
**Type:** feature
**Tracking issue:** none (no pre-existing issue; not manufacturing one per repo conventions)
**Execution sub-skill:** `superpowers:subagent-driven-development`

## Problem

A perspective has no meaningful visibility control. The `privacy` column, the
`domain.Privacy` enum (`PUBLIC` / `PRIVATE`), and the GraphQL `enum Privacy` plus
`privacy` fields on `CreatePerspectiveInput` / `UpdatePerspectiveInput` /
`PerspectiveFilter` already exist and the service already defaults new perspectives
to `PUBLIC` — but:

1. **Nothing enforces it.** The `perspectives` query has no `@auth` and passes the
   caller-supplied `PerspectiveFilter` straight through; `perspectiveByID` is
   unguarded. Any client can list or fetch any user's `PRIVATE` rows.
2. **There is no UI to set it.** `PerspectivePopover.svelte` (add + edit) has no
   privacy control, and `useCreatePerspective` hardcodes `privacy: 'public'` in its
   optimistic row while never sending the field.

## Goals

1. A user can mark their own perspective **Private** or **Public** at creation and
   later via the edit form, defaulting to Public.
2. `PRIVATE` means owner-only **everywhere** on the backend:
   - `perspectives` returns another user's `PRIVATE` rows to nobody but the owner
     (anonymous callers and other signed-in users alike).
   - `perspectiveByID` returns `null` (not a `FORBIDDEN` error) for a `PRIVATE` row
     when the caller is not the owner — no disclosure that the id exists.
3. The `perspectives` query stays open (no `@auth`) so a future public
   activity-browsing page can read other users' `PUBLIC` perspectives.
4. `privacy` is a hardened column: `NOT NULL`, defaulted, `CHECK`-constrained.
5. The repository filter implementation (WHERE vs UNION) is chosen from a measured
   benchmark on real data, not by guess.

## Non-goals

- **No public activity-browsing UI.** The frontend still only ever lists the
  signed-in user's own perspectives. Building a route to view another user's
  perspectives is a follow-up that sits on top of the now-correct backend.
- **No share / copy-link feature and no per-perspective route.** None exists today.
  The requirement "warn (toast) when copying/sharing a link to a private
  perspective" is captured here as a constraint on that future feature, not built
  now.
- **No in-grid inline privacy toggle.** Editing privacy happens only through the
  `PerspectivePopover` edit form. No new AG Grid cell UI.
- **No new index.** Index choices for the privacy predicate are deferred to the
  post-Neon performance-tuning pass (`docs/superpowers/plans/2026-09-03-neon-performance-tuning-plan.md`).
- No new privacy states (`UNLISTED`, `SHARED`, etc.). Exactly `PUBLIC` / `PRIVATE`.

## Design

### Component 1 — Migration `000017_harden_perspective_privacy`

`up`:
```sql
UPDATE public.perspectives SET privacy = 'public' WHERE privacy IS NULL;
ALTER TABLE public.perspectives ALTER COLUMN privacy SET DEFAULT 'public';
ALTER TABLE public.perspectives ALTER COLUMN privacy SET NOT NULL;
ALTER TABLE public.perspectives
  ADD CONSTRAINT perspectives_privacy_check CHECK (privacy IN ('public', 'private'));
```

`down`: drop the constraint, drop `NOT NULL` (`DROP DEFAULT` optional — keep the
pre-existing `DEFAULT 'public'` from `000004`). No index added or removed.

Values are stored lowercase (`'public'` / `'private'`) — matches the existing
`privacyToDBValue` / `privacyFromDBValue` converters and current column data.

### Component 2 — Backend read authorization

**Viewer identity.** Both resolvers already run behind the Clerk middleware, which
puts an optional `*domain.AuthenticatedUser` in context via
`auth.ForContext(ctx)`. Neither resolver requires auth; a missing user just means
"anonymous viewer".

**`perspectives` (list).** The service gains an explicit *viewer* parameter
(the resolver passes `auth.ForContext` result, or `nil`). Enforcement rule applied
in `PerspectiveService.ListPerspectives` (not the resolver, so it is covered by
service tests and can't be bypassed by a second call site):

> If `viewerID == nil` **or** `filter.UserID == nil` **or** `*filter.UserID != *viewerID`,
> the effective query must additionally satisfy `(privacy = 'public' OR user_id = <viewerID>)`
> (the `user_id = <viewerID>` disjunct is dropped entirely when `viewerID == nil`).
> When `filter.UserID != nil && viewerID != nil && *filter.UserID == *viewerID`
> (owner viewing their own list), no privacy predicate is added.

A caller-supplied `filter.privacy` still applies on top (e.g. an owner asking only
for their `PRIVATE` rows). A non-owner asking for `filter.privacy = PRIVATE` gets
an empty page — the enforcement predicate and the caller predicate are ANDed.

**`perspectiveByID`.** After loading, if `perspective.Privacy == PRIVATE` and
(`viewerID == nil` or `*viewerID != perspective.UserID`), the resolver returns
`(nil, nil)`. Otherwise unchanged.

**Schema.** No `@auth` added anywhere. No `schema.graphql` change is required for
enforcement; the viewer comes from context. (If a `viewer`-carrying signature is
cleaner in Go, that is an internal port change only — no generated-code impact
beyond what already exists.)

### Component 3 — Repository filter: WHERE vs UNION (benchmark-decided)

The list goes through `gorm-cursor-paginator`, which accepts any chainable
`*gorm.DB` that renders a selectable relation.

- **WHERE shape** (default / fallback):
  `Model(&PerspectiveModel{}).Where("user_id = ?", target).Where("privacy = 'public' OR user_id = ?", viewer)`
  (the second `Where` omitted for owner-viewing-self; reduced to
  `Where("privacy = 'public'")` when `viewer == nil`).
- **UNION shape:**
  `r.db.Table("(? UNION ?) AS perspectives", subPublic, subOwn)` with
  `subPublic` = filtered rows where `privacy = 'public'` and `subOwn` = filtered
  rows where `user_id = <viewer>`; sort `Rule.SQLRepr` set explicitly (as
  `buildContentSortRules` already does) since there is no bound model.

**Benchmark (run during execution, before the repo code is finalized):**
`EXPLAIN (ANALYZE, BUFFERS)` via the `db-perspectize-queries` skill against the
live Sevalla PG17 database, 10 runs each, for the representative non-owner-viewing
case (`filter.userID = <some user>`, `viewer` = a different user; also the
anonymous variant). Report median / p95 latency and the chosen plan for both
shapes in the plan's benchmark task, then implement the winner. UNION is adopted
only if it wins by a clear margin; otherwise WHERE (simpler, no raw-SQL surface).
Either way the chosen shape is documented in a code comment referencing this spec.

### Component 4 — Frontend: the Private toggle

**New primitive.** `npx shadcn-svelte@latest add switch` → `$lib/components/shadcn/switch/`.

**`PerspectivePopover.svelte`.** Add a labeled row — `Switch` + `Label` "Private"
with a short helper line ("Only you can see private perspectives") — near the
bottom of the form, above the submit button. Backed by a `let isPrivate = $state(false)`;
in edit mode it initialises from `existingPerspective.privacy === 'private'`.
`handleSubmit` includes `privacy: isPrivate ? 'PRIVATE' : 'PUBLIC'` in both the
create and update input. The switch is not gated by the "at least one field"
validation (privacy alone is not "content").

**`useCreatePerspective.ts`.** Add `privacy?: 'PUBLIC' | 'PRIVATE'` to
`CreatePerspectiveInput`; send it in the mutation; the optimistic row uses the
submitted value (lowercased to match `PerspectiveItem.privacy: string`) instead of
the hardcoded `'public'`.

**`useUpdatePerspective.ts`.** Add `privacy?: 'PUBLIC' | 'PRIVATE'` to
`UpdatePerspectiveInput`; send it; carry it through `applyEdit` (lowercased) so the
optimistic patch reflects the new value; `onSuccess` server reconciliation already
overwrites it.

**Display.** The shared `PerspectiveFields` fragment already selects `privacy`; no
list/query change. A small lock indicator on private rows is out of scope for this
PR (noted as a nice-to-have follow-up).

### Error handling

- Migration `up` is safe to re-run logically (the `UPDATE` is idempotent); the
  `CHECK` add fails loudly if unexpected values exist — acceptable, means data to
  clean first.
- Backend: an unauthenticated caller is normal, not an error. No new error types.
- Frontend: no new failure modes; existing `onError` rollback + `toast.error` in
  both hooks already cover a rejected mutation.

### Testing

**Backend (`go test ./...` in `backend/`):**
- Service tests for `ListPerspectives` enforcement matrix: owner-sees-own-private;
  other-user-hidden-from-private; anonymous-hidden-from-private; caller
  `filter.privacy=PRIVATE` as non-owner → empty; caller `filter.privacy=PUBLIC`
  unaffected.
- Resolver test for `perspectiveByID`: owner gets private row; non-owner gets
  `nil`; anonymous gets `nil`; public row unaffected.
- Repository test for the chosen shape: pagination/cursor still correct with the
  privacy predicate / UNION wrapper (sort order + tie-break by id preserved
  across a page boundary).
- Migration up/down applies cleanly against a scratch DB (existing migration test
  harness).

**Frontend (`pnpm run test:run` in `frontend/`):**
- `PerspectivePopover.test.ts`: switch renders; toggling + submit sends
  `privacy: 'PRIVATE'`; default submit sends `'PUBLIC'`; edit mode initialises the
  switch from `existingPerspective.privacy`.
- `useCreatePerspective` test: `privacy` forwarded; optimistic row reflects the
  chosen value.
- `useUpdatePerspective` test: `privacy` forwarded and `applyEdit` patches it.

**Manual (local, hand back to a local session):** create a private perspective,
confirm it still shows in the owner's own activity list (owner-viewing-self path).

## Deferred scope (captured, not built)

- Public activity-page browsing UI (view another user's `PUBLIC` perspectives),
  including cross-user / anonymous query wiring and cache keying.
- Share / copy-link affordance + per-perspective route, **with** a
  `toast.warning(...)` when the target perspective is `PRIVATE`.
- Lock/"private" visual indicator on perspective rows and in `ActivityDetailsModal`.
- In-grid one-click privacy toggle.
- Post-Neon index analysis for the `(user_id, privacy)` access path.

## File touch list

**Backend:**
- Create: `backend/migrations/000017_harden_perspective_privacy.up.sql` / `.down.sql`
- Modify: `backend/internal/core/services/perspective_service.go` — viewer-aware `ListPerspectives`
- Modify: `backend/internal/core/ports/...` + `backend/internal/adapters/graphql/resolvers/perspective.resolvers.go` — pass viewer from `auth.ForContext`; `perspectiveByID` nil-for-non-owner
- Modify: `backend/internal/adapters/repositories/postgres/gorm_perspective_repository.go` (+ `helpers.go` if UNION) — chosen filter shape
- Create/Modify: service + resolver + repo tests under `backend/test/...`

**Frontend:**
- Create: `frontend/src/lib/components/shadcn/switch/*` (generated)
- Modify: `frontend/src/lib/components/PerspectivePopover.svelte`
- Modify: `frontend/src/lib/queries/perspectives/useCreatePerspective.ts`, `useUpdatePerspective.ts`, `index.ts` (mutation documents add `$privacy`)
- Modify: `frontend/tests/components/PerspectivePopover.test.ts` + the two hook tests

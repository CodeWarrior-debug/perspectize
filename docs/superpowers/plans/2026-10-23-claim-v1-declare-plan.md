# Claim v1: Declare Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claims are created and managed on a new **Declare** page (`/declare`). Add Content no longer creates claims. Claims carry an effective date and an evaluate-by date in `content.custom_fields`. The Activity table gets a claim-only view.

**Architecture:** Claims stay `content` rows with `content_type = 'claim'`, `privacy = 'private'`. Raw text is `name` and `response.text`; sanitised HTML is `response.html`. Dates are `custom_fields.effectiveDate` and `custom_fields.evaluateBy` (ISO `YYYY-MM-DD`, day precision). Declare is a frontend route backed by the existing claim mutations plus one new update mutation.

**Tech Stack:** Go (gqlgen, GORM, golang-migrate), SvelteKit 5 runes, TanStack Query, AG Grid, Vitest, `go test`.

**Spec:** `docs/superpowers/specs/2026-10-23-claim-content-type-design.md` (decisions and amendments dated 2026-10-23). Where this plan and the spec differ, this plan wins for v1 scope; the spec's amendments are the source of truth for behaviour.

## Global Constraints

- Migrations are written and reviewed only. Never run `make migrate-up` or `migrate-down` in dev. Migrations 000032, 000033 and 000034 are already written on this branch.
- Optional JSONB columns are nullable with no default. NULL means unset (`backend/CLAUDE.md`, JSONB convention).
- Claim text: trimmed, 2 or more words, at most 300 characters (service-enforced).
- Rating-style integer fields use the 0 to 10000 range (`valid_integer_range`). Not used by v1 claim fields.
- Conventional commits; one logical change per commit. No `&&` chained shell commands.
- Self-verification before any push: `go build ./...`, `gofmt -l .`, `go test ./...` in `backend/`; `pnpm run test:run` in `frontend/`.
- No browser verification in this plan. Label the PR `needs-demo-video`.

## Review Focus

1. A date pair where evaluate-by is earlier than effective: rejected with a clear message, not stored.
2. A claim text that is only whitespace or punctuation: rejected, not saved as an empty claim.
3. Another user asks for a private claim by id: returns not-found, not the text.
4. A claim with no dates set (legacy row, id 189): renders with empty date cells, no error.
5. Declare opened signed out: shows the sign-in prompt, does not render an empty list as "no claims".

## File Structure

- Backend domain: `backend/internal/core/domain/content.go` (add `CustomFields json.RawMessage`).
- Backend GORM: `backend/internal/adapters/repositories/postgres/gorm_models.go` (content model), `gorm_mappers.go` (both directions).
- Backend service: `backend/internal/core/services/content_service.go` (CreateClaim, new UpdateClaim, validation).
- Backend ports: `backend/internal/core/ports/services/` (CreateClaimInput gains dates; new UpdateClaimInput).
- GraphQL: `backend/schema.graphql`, `backend/gqlgen.yml` if needed, `backend/internal/adapters/graphql/resolvers/content.resolvers.go`.
- Frontend: `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/claims.ts`, `frontend/src/lib/queries/content/useCreateClaim.ts`, new `frontend/src/lib/queries/content/useUpdateClaim.ts`, new route `frontend/src/routes/declare/+page.svelte`, new component `frontend/src/lib/components/declare/ClaimForm.svelte`, `frontend/src/lib/utils/grid-config.ts` (`columnViewFor` gains `'claim'`), `frontend/src/lib/utils/formatting.ts` (claim renderers).
- Demo: `backend/internal/demo/` (seed the O.J. Simpson demo claim).

---

### Task 1: Wire `content.custom_fields`

**Files:**
- Modify: `backend/internal/core/domain/content.go`, `backend/internal/adapters/repositories/postgres/gorm_models.go`, `backend/internal/adapters/repositories/postgres/gorm_mappers.go`, `backend/schema.graphql`
- Test: `backend/internal/adapters/repositories/postgres/gorm_mappers_test.go`

**Interfaces:**
- Produces: `domain.Content.CustomFields json.RawMessage` (nil means unset). GORM column `custom_fields`, no default tag. GraphQL `Content.customFields: JSON`.

- [ ] **Step 1: Write the failing mapper test.** Round-trip a `domain.Content` with `CustomFields = json.RawMessage(`{"effectiveDate":"2026-10-23"}`)` through the mapper and back; also a `nil` case that must come back `nil`, not `{}`.
- [ ] **Step 2: Run it.** `go test ./internal/adapters/repositories/postgres/ -run CustomFields -v`. Expected: FAIL, field not defined.
- [ ] **Step 3: Add the field** to the domain struct, the GORM content model (`gorm:"type:jsonb;column:custom_fields"`), and both mapper directions.
- [ ] **Step 4: Add `customFields: JSON` to `type Content`** in `schema.graphql`, then run `make graphql-gen` in `backend/`. Delete the stray `schema.resolvers.go` after diffing it for new stubs (see `backend/CLAUDE.md`, GraphQL).
- [ ] **Step 5: Run the tests.** Same command as step 2, plus `go build ./...`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(content): add custom_fields to the content model`

---

### Task 2: Claim service: text, dates, HTML, update

**Files:**
- Modify: `backend/internal/core/services/content_service.go` (CreateClaim, new UpdateClaim), `backend/internal/core/ports/services/` (inputs), `backend/internal/adapters/graphql/resolvers/content.resolvers.go`, `backend/schema.graphql` (`CreateClaimInput` gains `effectiveDate`, `evaluateBy`; new `updateClaim(id: ID!, input: UpdateClaimInput!): Content! @auth`).
- Test: `backend/test/services/content_service_claim_test.go`

**Interfaces:**
- Consumes: `domain.Content.CustomFields` (Task 1); the existing sanitiser in `services/sanitize.go` (bluemonday, the same policy as reviews).
- Produces: `CreateClaimInput{Text, UserID, ParentContentID *int, EffectiveDate *string, EvaluateBy *string}`; `UpdateClaimInput{ContentID, ActorUserID, Text, EffectiveDate, EvaluateBy}`; `ContentService.UpdateClaim(ctx, UpdateClaimInput) (*domain.Content, error)`.

Rules (table-driven test cases, one row each):
- Text trimmed; fewer than 2 words, or over 300 characters, returns `domain.ErrInvalidInput`.
- `effectiveDate` defaults to today (UTC date) on create when absent. Must parse as `2006-01-02`.
- `evaluateBy` optional. When set, must parse and must not be before `effectiveDate`, else `ErrInvalidInput`.
- `response.html` is the sanitised form of the text; `name` and `response.text` stay the raw trimmed text.
- `UpdateClaim` returns `domain.ErrNotFound` when the claim is not owned by `ActorUserID`, the same as a missing row.

- [ ] **Step 1: Write the failing table test** covering each rule above, including the not-found case for a non-owner.
- [ ] **Step 2: Run it.** `go test ./test/services/ -run Claim -v`. Expected: FAIL.
- [ ] **Step 3: Implement** validation, date handling, sanitising, and `UpdateClaim` with an owner-scoped SQL update (`WHERE id = ? AND user_id = ?`, per `backend/CLAUDE.md`).
- [ ] **Step 4: Add the resolver for `updateClaim`** and regenerate with `make graphql-gen`.
- [ ] **Step 5: Run `go test ./test/services/ ./internal/adapters/graphql/...`.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(claims): dates, sanitised html and updateClaim`

---

### Task 3: Remove Claim from Add Content

**Files:**
- Modify: `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/utils/detectContentType.ts`
- Test: `frontend/tests/components/AddContentPopover.test.ts`, `frontend/tests/unit/detectContentType.test.ts`, `frontend/tests/unit/detectContentType.integration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `detectContentType(text)` no longer returns a `CLAIM` candidate. Free text with no link or reference returns no candidates.

States to cover (each one a test):
- Popover with free text only: submit disabled, no claim mutation called.
- Popover with a YouTube link, movie link or Bible reference: unchanged behaviour.
- The type select no longer offers Claim.

- [ ] **Step 1: Update the tests first** to the new states above. Run them. Expected: FAIL.
- [ ] **Step 2: Remove** the claim candidate from `detectContentType.ts`, the Claim option and claim mutation branch from the popover, and the claim-only hint text.
- [ ] **Step 3: Run `pnpm exec vitest run --project unit` for the three files.** Expected: PASS.
- [ ] **Step 4: Commit.** `feat(add-content): stop creating claims from the popover`

---

### Task 4: Declare page

**Files:**
- Create: `frontend/src/routes/declare/+page.svelte`, `frontend/src/lib/components/declare/ClaimForm.svelte`, `frontend/src/lib/queries/content/useUpdateClaim.ts`
- Modify: `frontend/src/lib/queries/content/claims.ts` (add `UPDATE_CLAIM`, dates on `CREATE_CLAIM`), `frontend/src/lib/queries/content/useCreateClaim.ts`, `frontend/src/lib/queries/keys.ts`
- Test: `frontend/tests/components/declare/ClaimForm.test.ts`, `frontend/tests/unit/useUpdateClaim.test.ts`

**Interfaces:**
- Consumes: `CREATE_CLAIM` and `UPDATE_CLAIM` with `effectiveDate` and `evaluateBy` (Task 2).
- Produces: `useUpdateClaim()` returning `{ mutate, isPending }`; `ClaimForm` props `{ claim?: ClaimRow }`.

States to cover:
- Create: empty text shows the 2-word hint; a valid claim submits and invalidates the claim list key only.
- Create with evaluate-by before effective: inline error, no mutation.
- Edit: pre-fills from the claim; an unchanged form does not call the mutation.
- Signed out: sign-in prompt, not an empty list.
- Empty list: "No claims yet", not the loading state.

- [ ] **Step 1: Write the failing component tests** for the states above.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the route** with the sign-in gate (`AuthShow` facade, per `frontend/CLAUDE.md`), the list (existing content query filtered to `CLAIM`, own rows), and `ClaimForm`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(declare): claim page with create and edit`

---

### Task 5: Activity claim-only view

**Files:**
- Modify: `frontend/src/lib/utils/grid-config.ts` (`columnViewFor` gains `'claim'`, `defaultColumnVisibility` gets a claim branch), `frontend/src/lib/utils/formatting.ts` (date renderers for claim rows), `frontend/src/lib/components/ActivityTable.svelte` (colDefs for the new columns, per `.claude/docs/ADDING_AG_GRID_COLUMN.md`).
- Test: `frontend/tests/unit/grid-config.test.ts`, `frontend/tests/unit/formatting.test.ts`, `frontend/tests/unit/column-registry-parity.test.ts`.

**Interfaces:**
- Consumes: `customFields.effectiveDate`, `customFields.evaluateBy` on `Content`.
- Produces: `columnViewFor(filter)` returns `'claim'` when the type filter is exactly Claim. Claim view default columns: `perspectize`, `item` (header "Claim"), `category` (sm and up), `effectiveDate` (md and up), `evaluateBy` (md and up), `createdAt` (lg only). Type hidden when solo, for every type.

States to cover: claim-only filter, mixed filter, no filter; a claim row with and without dates.

- [ ] **Step 1: Write the failing grid tests** for each filter and tier.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the view, the two date columns (sortable on the custom field, per the column guide's sort decision), and the renderers.
- [ ] **Step 4: Run `column-registry-parity` and the grid tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(activity): claim-only columns with effective and evaluate-by dates`

---

### Task 6: Privacy fixes (PR 1 items from the spec)

**Files:**
- Modify: `backend/internal/adapters/graphql/resolvers/category.resolvers.go`, `backend/internal/core/services/category_service.go` (`SetPrimaryCategory` owner and privacy check), `backend/internal/core/services/perspective_service.go` (`createPerspective`, content privacy on read), `backend/internal/core/services/content_service.go` (`updateContentSourceData`).
- Test: `backend/test/services/category_service_test.go` (new), `backend/test/services/perspective_privacy_test.go` (new).

**Interfaces:**
- Produces: each write path first loads the content and returns `domain.ErrNotFound` when the caller cannot read it (private and not owner).

States to cover: owner allowed; other signed-in user refused for private content; other user allowed for public content; anonymous refused.

- [ ] **Step 1: Write the failing service tests** for each state, per write path.
- [ ] **Step 2: Run them.** Expected: FAIL for the private-content cases.
- [ ] **Step 3: Implement** the checks in the service, with the resolver deriving the actor from `auth.RequireAuth(ctx)`.
- [ ] **Step 4: Run `go test ./test/services/`.** Expected: PASS.
- [ ] **Step 5: Commit.** `fix(privacy): owner and privacy checks on category, perspective and source writes`

---

### Task 7: O.J. Simpson demo claim and final checks

**Files:**
- Modify: `backend/internal/demo/` (seed one claim, "The glove did not fit O.J. Simpson", owned by a demo persona, private, effective 1995-10-03, evaluate-by empty).
- Test: `backend/internal/demo/` seed test (new).

**Interfaces:**
- Consumes: Task 1 (custom fields), Task 2 (claim create path).

- [ ] **Step 1: Write the failing seed test:** after seeding, one claim row exists with the expected privacy and `customFields.effectiveDate`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Add the seed** following the existing persona seeding pattern in `internal/demo`.
- [ ] **Step 4: Run the full checks:** `go build ./...`, `gofmt -l .`, `go test ./...` in `backend/`; `pnpm run test:run` in `frontend/`. Report the output summary.
- [ ] **Step 5: Commit.** `feat(demo): O.J. Simpson claim seed`

---

## Self-Review

- Spec coverage: decisions 1 to 9 and the v1 scope amendment map to Tasks 1 to 7. Related claims, semantic search, the Declare view's relationship features and QUESTION are deferred (spec and relationships plan).
- Type consistency: `CustomFields`, `EffectiveDate`, `EvaluateBy`, `UpdateClaimInput` are named once and used the same way in Tasks 1, 2, 4 and 5.
- Migrations: 000032, 000033, 000034 are on the branch; the rollout steps stay manual.

# Wikipedia Topic Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give every `Category` (topic) a standard, clickable Wikipedia link, derived automatically from its Wikidata QID at the moment a category is set as a content's primary category — no manual entry, no separate lookup step for the user.

**Root cause recap:** There is no Wikipedia integration anywhere in the codebase today. The existing `wikidata` adapter only calls `wbsearchentities` (search-by-text), which never returns sitelinks. The `categories` table, `domain.Category`, GORM model/mapper, and GraphQL schema all carry `wikidataQid` only — there is no column, field, or resolver for a Wikipedia URL. This isn't a broken fetch; it's an unbuilt feature.

**Architecture:** Extend the Wikidata adapter with a second API call — `wbgetentities` (action=wbgetentities, props=sitelinks, sitefilter=enwiki) — to resolve a QID to its English Wikipedia page title, then build the canonical `https://en.wikipedia.org/wiki/<title>` URL. Call this resolver inside `CategoryServiceImpl.SetPrimaryCategory`, right after building the `domain.Category` and before upsert, so the URL is persisted alongside the QID. Store it as a new `wikipedia_url` column on `categories`. Expose it on the GraphQL `Category` type and render it as a link in `CategoryTypeahead.svelte` / wherever `Category` is displayed (e.g. `ActivityTable.svelte`).

If a QID has no `enwiki` sitelink (rare, but possible for very obscure Wikidata items), store an empty string / null rather than failing the whole `SetPrimaryCategory` call — a missing Wikipedia page must never block setting a category.

**Tech Stack:** Go 1.25+, gqlgen (schema-first), GORM (Hex-Clean Separate Model Pattern), golang-migrate, Svelte 5 runes, `@tanstack/svelte-query`.

**Spec:** No separate spec doc exists for this; this plan is self-contained given the investigation above.

## Decision: Category label casing

Category labels come from Wikidata verbatim (e.g. "iPhone", "NASA", "photosynthesis" as a lowercase common noun, "Mercury (planet)"), and are inconsistent in casing across topics as a result. **Decision: do not renormalize casing — display the Wikidata label as-is.** Wikidata's stored casing is the canonical/correct form for that specific entity; a blanket rule breaks recognizable names — Title Case mangles acronyms and mixed-case proper nouns (e.g. "iPhone" → "Iphone"), and forced lowercase does the same to acronyms.

If the resulting visual inconsistency across a list/table is a problem, the acceptable fallback is a **presentational-only** `text-transform: capitalize` in CSS (uppercases just the first character of the *rendered* string, leaves the rest untouched) — never a data transform, and never full Title Case. This is a UI/CSS decision, not a backend one; it is out of scope for this plan's tasks and left to whichever component renders the category label to apply if/when the inconsistency is judged worth addressing.

## Global Constraints

- **Migration numbering:** Latest existing migration is `000026_add_bible_interlinear_tables`. Re-check `ls backend/migrations | tail -5` and `git log --all --oneline -- 'backend/migrations/*'` immediately before creating the new migration — another in-flight branch may have already claimed `000027`.
- **No `make migrate-up`/`migrate-down` during dev** — `DATABASE_URL` points at the shared Sevalla dev database. Write and review the migration SQL only; the PR must state it needs a manual `migrate up` per environment.
- Prefer idempotent DDL: `ADD COLUMN IF NOT EXISTS wikipedia_url TEXT`.
- After any `schema.graphql` edit: run `make graphql-gen` from `backend/`, then check for (and correctly split) the stray regenerated `resolvers/schema.resolvers.go` per `backend/CLAUDE.md`.
- Frontend: Svelte 5 runes only, TanStack Query v6 function-wrapper pattern.
- New external HTTP call (`wbgetentities`) must reuse the existing `Client`'s retry/backoff and `APIError` conventions in `backend/internal/adapters/wikidata/client.go` — don't introduce a second HTTP client.
- Wikipedia URL derivation must not block or fail `SetPrimaryCategory` on API errors — log and store empty, don't return an error, so category-setting stays reliable even if Wikidata's API is briefly down.

---

## File Structure

**Backend:**
- Create: `backend/migrations/00002X_add_category_wikipedia_url.up.sql` / `.down.sql`
- Modify: `backend/internal/core/domain/category.go` — add `WikipediaURL string` field
- Modify: `backend/internal/core/ports/services/wikidata_client.go` — add `GetSitelinkURL(ctx, qid) (string, error)` (or similar) to the port interface
- Modify: `backend/internal/adapters/wikidata/client.go` — implement `wbgetentities` call + URL construction
- Modify: `backend/internal/core/services/category_service.go` — call the resolver in `SetPrimaryCategory`, tolerate errors
- Modify: `backend/internal/adapters/repositories/postgres/gorm_models.go` — add `WikipediaURL` column to GORM model
- Modify: `backend/internal/adapters/repositories/postgres/gorm_mappers.go` — map the new field both directions
- Modify: `backend/schema.graphql` — add `wikipediaUrl: String` to `type Category`
- Modify (generated): `backend/internal/adapters/graphql/generated/*.go`, `model/models_gen.go` via `make graphql-gen`
- Modify: category resolver's `domainToModel` mapping (wherever `Category` → `model.Category` happens)
- Modify/create test mocks implementing `WikidataClient` port (check `test/` per backend/CLAUDE.md gotcha on interface changes)
- Test: `backend/test/adapters/wikidata_client_test.go` (or existing file) — sitelink resolution, missing-sitelink fallback
- Test: `backend/test/services/category_service_test.go` — `SetPrimaryCategory` persists URL, tolerates resolver error

**Frontend:**
- Modify: `frontend/src/lib/queries/categories/index.ts` — add `wikipediaUrl` to the `Category` GraphQL fragment/type
- Modify: `frontend/src/lib/components/CategoryTypeahead.svelte` — render Wikipedia link if present
- Modify: `frontend/src/lib/components/ActivityTable.svelte` — render Wikipedia link in the category cell/column if present
- Modify relevant `.test.ts` files for the above two components

---

## Task 1: Backend — migration + domain field

**Files:**
- Create: `backend/migrations/00002X_add_category_wikipedia_url.up.sql` / `.down.sql`
- Modify: `backend/internal/core/domain/category.go`

- [x] **Step 1:** Confirm the next free migration number (`ls backend/migrations | tail -5` + check open branches/PRs for collisions), then create the migration:
  ```sql
  -- up
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS wikipedia_url TEXT DEFAULT '';
  -- down
  ALTER TABLE categories DROP COLUMN IF EXISTS wikipedia_url;
  ```
- [x] **Step 2:** Add `WikipediaURL string` to `domain.Category` in `category.go`.

## Task 2: Backend — Wikidata sitelink resolver

**Files:**
- Modify: `backend/internal/core/ports/services/wikidata_client.go`
- Modify: `backend/internal/adapters/wikidata/client.go`
- Test: sitelink resolution unit test

- [x] **Step 1:** Add a method to the `WikidataClient` port, e.g. `GetWikipediaURL(ctx context.Context, qid string) (string, error)`.
- [x] **Step 2:** Implement it in `client.go` using `action=wbgetentities&ids=<qid>&props=sitelinks&sitefilter=enwiki&format=json`. Parse `entities.<qid>.sitelinks.enwiki.title`, and build `https://en.wikipedia.org/wiki/<url-escaped title with spaces as underscores>`. Return `""` (no error) if the `enwiki` sitelink is absent.
- [x] **Step 3:** Reuse the existing retry/backoff (`doSearch`-style helper) for the new request path; add an `APIError` on non-200.
- [x] **Step 4:** Unit test: known QID with sitelink, QID without `enwiki` sitelink, HTTP error.

## Task 3: Backend — wire into `SetPrimaryCategory`

**Files:**
- Modify: `backend/internal/core/services/category_service.go`

- [x] **Step 1:** After validating input and before/around building `domain.Category`, call `s.wikidataClient.GetWikipediaURL(ctx, input.QID)`. On error, log via `slog` and proceed with an empty string — never fail the mutation because of this lookup.
- [x] **Step 2:** Set `category.WikipediaURL` from the result before `Upsert`.
- [x] **Step 3:** Test: `SetPrimaryCategory` persists a non-empty URL for a resolvable QID, and still succeeds (URL empty) when the resolver returns an error — update/add a mock `WikidataClient` in `test/` implementing the new port method.

## Task 4: Backend — persistence + GraphQL exposure

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/gorm_models.go`
- Modify: `backend/internal/adapters/repositories/postgres/gorm_mappers.go`
- Modify: `backend/schema.graphql`
- Modify: category resolver's domain→model mapping

- [x] **Step 1:** Add `WikipediaURL string \`gorm:"column:wikipedia_url"\`` to the GORM category model.
- [x] **Step 2:** Update both mapper directions (domain↔GORM) for the new field.
- [x] **Step 3:** Add `wikipediaUrl: String` to `type Category` in `schema.graphql`, run `make graphql-gen`, resolve the stray `schema.resolvers.go` per the known gotcha (diff for any new stub before deleting).
- [x] **Step 4:** Populate `wikipediaUrl` in the resolver's `domainToModel`/equivalent for `Category`.
- [x] **Step 5:** Resolver/integration test confirming `wikipediaUrl` round-trips through a `setPrimaryCategory` mutation + category query.

## Task 5: Frontend — surface the link

**Files:**
- Modify: `frontend/src/lib/queries/categories/index.ts`
- Modify: `frontend/src/lib/components/CategoryTypeahead.svelte`
- Modify: `frontend/src/lib/components/ActivityTable.svelte`
- Modify corresponding test files

- [x] **Step 1:** Add `wikipediaUrl` to the `Category` GraphQL selection/type in `categories/index.ts`.
- [x] **Step 2:** In `CategoryTypeahead.svelte`, when a category is selected/displayed, render its label as a link to `wikipediaUrl` (opens in new tab) when present; fall back to plain text when empty.
- [x] **Step 3:** In `ActivityTable.svelte`, same treatment for the primary-category cell.
- [x] **Step 4:** Update/add component tests to assert the link renders (and gracefully doesn't, when `wikipediaUrl` is empty).

---

## Verification

1. `go build ./...` and `gofmt -l .` in `backend/`
2. `go test ./...` in `backend/`
3. `pnpm run test:run` in `frontend/`
4. Manual note in PR: migration requires a manual `migrate up` against each environment (per repo policy — do not run it in this session)
5. Browser verification of the rendered link is local-only per repo policy; hand off to a local session per `.docs/VERIFICATION.md`

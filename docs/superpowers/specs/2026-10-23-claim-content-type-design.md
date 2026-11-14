# Claim content type (`CLAIM`) - Design

Status: **draft for review, every decision taken.** Designed in `tools/content-type-designer`: open `tools/content-type-designer/index.html` (serve it, see the tool's README), pick **Claim** under **Single-type view**, and the columns, tooltips, Add Content card and details view below are live there. Output -> **Single-type views** emits the column table in section 6 from the tool state.

**Owner pointers convention.** This doc is the single source for the claim type. It **replaces** the claim rows of the designer seed (stance, verdict, confidence, claimant, asserted date, context) and **absorbs** `docs/superpowers/plans/2026-09-27-private-claims-plan.md` (what is already built). It **defers** to `docs/superpowers/plans/2026-09-27-content-relationships-plan.md` for the QUESTION type and the relationship table, and to a future Declare spec for the claim view. Where this doc and an earlier doc disagree on a claim point, this doc wins. Owner pointers given after review are recorded as dated amendments at the end ("Amendments"), the way the Movie spec amended the TMDB spec, so the decision history stays readable.

Owner pointers already given (2026-09-12 -> 2026-10-23), which this doc treats as settled:

1. A claim is just its text, an owner and an optional parent. No stance, verdict, confidence, claimant or asserted date.
2. Claims are **private by default**: visible only to their owner until a future public gate.
3. A claim's parent link is optional. A claim can stand alone.
4. QUESTION is its own type, not a claim with a question mark. Answers are never a content type.
5. A new type joins the single Add Content window (autodetect + type select), never its own button (Movie, 2026-10-08).
6. A single-type view hides the Type column and shows no columns from another type's source (no YouTube Channel, Duration, Views, Likes for claims).

## Problem

`CLAIM` exists in the enum, the database and the API, and branch `feature/claim-content-type` (PR #612) lets a signed-in user add one privately from Add Content. Everything a claim looks like *after* it is added is borrowed from YouTube: filtering the Activity table to Claim shows the YouTube layout (Channel, Duration, Date, Views, Likes, % Liked, Tags all "-"), the Item cell draws an empty video thumbnail with a play overlay, and the details modal shows Views / Likes / Duration tiles and an "Update source data" button that can only fail. Privacy is enforced on the list and on `contentByID`, but not on three other paths that return or attach to a content row by id. This doc decides what a claim is, how it is added, who can see it, how it looks in every surface, and how it ships.

## Scope

In: the `CLAIM` type as a private, text-only item: data model, Add Content behaviour, visibility on every read and write path, the claim-only Activity view, cell renderers, tooltips, details modal, mobile card, filter, tests, query budget, migration rollout and PR order.

Out (each named with where it goes):

| Out of scope | Where it lives |
|---|---|
| The public gate (a claim becoming public) | Its own spec, after the relationship table ships. Section 5 fixes its contract so that spec cannot drift. |
| QUESTION type and `content_relationship_perspectives` | `2026-09-27-content-relationships-plan.md` |
| The Declare view (a claim with its related claims and questions, ranked) | Its own spec, after QUESTION (section 14) |
| Editing or deleting a claim | Follow-up. Rule fixed now: edit only while private, owner only. There is no delete-content flow for any type yet. |
| AI-suggested relationships, near-duplicate detection | Public-gate spec |
| Discover | Not on Discover (section 10) |

## Decisions

### 1. Identity and data model

A claim is one `content` row. No new table, no new column beyond `privacy` (migration 000032). Verified on the `pr-612` Neon preview branch (row id 189, the only claim):

| Column | Claim value | Rule |
|---|---|---|
| `content_type` | `claim` | DB lowercase; `CLAIM` in Go, GraphQL and TS (existing converter). |
| `name` | the trimmed claim text | **Canonical.** Display, sort (NAME), search (NAME scope) all read it. Stored raw: `@this` / `@here` tokens are kept, resolved at display time. |
| `response` | `{"text": "<same text>"}`, plus `"parentContentId": N` only when a parent was given | `response.text` is always identical to `name`. Kept so the JSONB is self-describing and old clients keep working; never read by the grid. No other keys. |
| `privacy` | `private` | Set by `ContentService.CreateClaim`, not by a column default. The column default stays `'public'` so every other type and every existing row is unchanged. |
| `added_by_user_id` | the session user | Never client-supplied. `CreateClaimInput.userID` is `0` (derive) or must equal the session user. |
| `url` | `NULL` | A claim has no URL. `UNIQUE(url)` allows any number of NULLs, so the global constraint needs no change. |
| `length`, `length_units`, `length_display` | `NULL` | A claim has no length. The designer's "what is Length for a claim" question is answered: nothing; Length is not a claim column. |
| `primary_category_id` | `NULL` until the owner sets one | Category is the one optional enrichment a claim gets (section 6). |
| `verse_start_id`, `verse_end_id`, `display_title` | `NULL` | Bible-only. |

**Text rules (enforced in the service, mirrored in the UI):**
- Trimmed; internal whitespace runs collapsed to one space before storing.
- At least two words (the detection rule, section 2). The service enforces "contains whitespace after trimming", so the API and the UI agree.
- **At most 300 characters** after trimming. The column is unbounded `varchar`; the cap is a product rule (a proposition, not an essay) enforced in `CreateClaim`, so no migration. The Add Content input shows a counter from 240 characters and refuses past 300.
- `@this` / `@here` require a parent. Text containing either token with no `parentContentID` is `ErrInvalidInput` ("@this and @here need a parent item"). Add Content never sets a parent, so it blocks submit with that message instead of letting the server refuse.

**Duplicates.** There is no global identity until the public gate. **Per owner, an exact duplicate is refused**: if the owner already has a claim whose normalised text matches (lowercase, whitespace collapsed, trailing `. ! ?` stripped), `CreateClaim` returns `ErrAlreadyExists` and the UI toasts "You already have this claim." This catches double submits and re-adds, costs one indexed lookup (`idx_content_private_owner` covers it while all claims are private), and needs no migration. Two different owners may hold the same text; cross-owner duplicates are the public gate's job. `createClaim` keeps returning `Content!` (no `alreadyExisted` payload like YouTube's): a claim duplicate is the user's own row, so an error toast is the honest answer.

**Parent (`parentContentId`).** Stays an **API-only, optional JSONB key**, not a column:
- Add Content never sets it, and v1 shows it nowhere. It exists so `@this` / `@here` have something to resolve to, which is its only job.
- The parent must exist **and be visible to the creator** (public, or the creator's own private row). Otherwise `ErrNotFound`, the same answer as a missing id, so a parent id cannot be used to probe for someone else's private claim.
- It is **not** a hierarchy link like the TMDB doc's `parent_content_id`. When that column is added (TV seasons/episodes), claims do **not** move to it: a claim's parent is "the item `@this` refers to", not "the larger work it belongs to". Sourcing ("this claim was drawn from that video") is a relationship row of type `source` in the relationships table, not the parent.

### 2. Add Content behaviour

Built on #612 (`AddContentPopover.svelte`, `detectContentType.ts`); this section records it and adds the hardening.

**Detection precedence** (unchanged, `detectContentCandidates`): YouTube URL > TMDB/IMDb movie link > Bible Gateway URL > typed Bible reference > free-text claim. Any other `http(s)` link is never guessed. Consequences, all intended:
- "John 3:16" is a passage, never a claim. "John 3 is the clearest gospel summary" is a claim, because the reference parser rejects trailing words.
- A single word is not detected as anything ("Select a type"). Picking Claim by hand on one word keeps Add disabled with "Write the claim as a statement of at least two words."
- Text with a scheme (`ftp://x y`) is never a claim. A bare host followed by words ("example.com is down") is a claim.
- **Text ending in `?` is detected as Claim until QUESTION ships.** Then the QUESTION rule (text ending `?`) is inserted immediately before the claim rule and takes those inputs. Existing claims ending in `?` are not migrated. While QUESTION is unbuilt, a `?`-ending claim shows a muted hint: "This reads as a question. Questions will get their own type; it will be saved as a claim for now."

**States of the claim branch** (each one is a test, section 11):

| State | Chip | Add button | Helper line |
|---|---|---|---|
| Empty input | "Select a type" | disabled | none |
| One word, autodetect | "Select a type" | disabled | none |
| One word, Claim chosen by hand | "Type: Claim" | disabled | "Write the claim as a statement of at least two words." |
| Two+ words, under 240 chars | "Detected: Claim" | enabled | "Claims are private. Only you can see them for now." |
| 240 to 300 chars | "Detected: Claim" | enabled | the private line + counter "N / 300" |
| Over 300 chars | "Detected: Claim" | disabled | counter in destructive colour, "Shorten the claim to 300 characters." |
| Contains `@this` / `@here` | "Detected: Claim" | disabled | "@this and @here need a parent item; claims added here stand alone." |
| Ends in `?` | "Detected: Claim" | enabled | the private line + the question hint |
| Pending | unchanged | "Adding..." | input disabled |
| Success | - | - | popover closes; toast "Claim saved - private to you for now" |
| Duplicate | unchanged | enabled | toast "You already have this claim." popover stays open |
| Other error | unchanged | enabled | toast "Failed to create claim. Please try again." |

- **Private-by-default messaging** is shown before submit (the helper line) and after (the toast), and never offers a public option: there is no public path until the gate.
- The popover description and input label already name claims ("Link, reference, or claim"); no change.
- "Clear Type" on a claim keeps Claim pinned and empties the text (existing behaviour, now tested).
- Signed-out users never see Add Content (it sits behind sign-in today); `createClaim` is `@auth` regardless.

### 3. Backend create path

`CreateClaim(ctx, {Text, UserID, ParentContentID})`, in order:
1. Normalise text; reject empty, single-word, > 300 chars (`ErrInvalidInput`).
2. Reject `@this`/`@here` with no parent (`ErrInvalidInput`).
3. If a parent is given: `GetByID`, then `ErrNotFound` unless visible to `UserID`.
4. Duplicate lookup by owner + normalised text -> `ErrAlreadyExists`.
5. Insert with `Privacy: PRIVATE`, `RETURNING` the row.

Resolver: `auth.RequireAuth`; a non-zero `userID` must equal the session user; errors map to `invalid input: ...`, `content not found`, `you already have this claim`, or the generic `failed to create claim` (details logged, never returned). Already built except steps 1's word/length checks, 2, 3's visibility check and 4.

### 4. Visibility rules (today: owner-only)

**Rule:** a private content row is readable and attachable only by its owner. "Not visible" is always answered exactly like "does not exist" (null for a by-id read, `content not found` for a write), so a private id is never confirmed to anyone else. Content privacy **dominates** perspective privacy: a public perspective on a private claim is visible only to the claim's owner.

Every path that touches a content row by id, and what it does:

| Path | Today on #612 | Decision |
|---|---|---|
| `content(...)` list (Activity, Plan's picker, search) | public OR own (`applyContentVisibility`), page and count agree | Keep. |
| `contentByID` (full and id-only fast path) | null for someone else's private row | Keep. |
| `Content.perspectiveCount` / `averageRating` | via `contentByID` | Keep. |
| `setPrimaryCategory(contentID)` | **No check: any signed-in user can set the category of another user's private claim, and the mutation returns the row, claim text included.** | Fix in PR 1: scope the `UPDATE` with `AND (privacy = 'public' OR added_by_user_id = :actor)`, `RETURNING`; zero rows -> `content not found`. No extra statement. |
| `createPerspective` / `updatePerspective` with a `contentID` | No content check beyond the FK | Fix in PR 1: refuse (`content not found`) when the content is private and not the actor's. One indexed lookup on create/update only when `contentID` is set (budget +1, section 12). |
| `perspectives(...)` list, `perspectiveByID`, Compare page | perspective privacy only | Fix in PR 1: add `content.privacy = 'public' OR content.added_by_user_id = :viewer` to the perspective visibility predicate (a join already on the query, or an `EXISTS`; no extra statement). |
| `Perspective.content` (dataloader `ContentByID`) | returns the row | Fix in PR 1: resolve `null` when not visible (filter after the batch load; no extra statement). Mostly unreachable once the two rows above are fixed; this is the backstop. |
| `updateContentSourceData(contentID)` | claims fail with "no source URL", which confirms the id exists | Fix in PR 1: return `content not found` for a row the caller cannot see, and `invalid input: this content type has no source to refresh` for the owner's own claim. The modal never offers the button for a claim (section 8). |
| `feelingStats` / `customFieldStats` with a `contentID` | aggregates over perspectives | Covered by the perspective predicate above. |
| `createClaim(parentContentID)` | parent must exist | Parent must be visible (section 1). |

Aggregates in `Content.perspectiveCount` keep counting all perspectives (the schema's documented rule); for a private claim those can only be the owner's.

### 5. The public gate: decided contract, deferred build

The gate **waits**, for one exact reason: its core check ("is this claim conceptually unique among public claims?") needs data that does not exist yet. The relationships table's `duplicates` / `overlaps` rows are the training and evaluation set for that check, and an AI-assisted check with no evaluation set cannot be tuned or trusted. Building the gate before that table has real rows would mean shipping an unmeasured classifier as a publishing gate.

What is fixed now, so the gate's own spec only has to design the check:
- **One-way:** private -> public. A public claim never returns to private (others may have perspectives on it).
- **Owner-only:** `publishClaim(id: ID!): Content! @auth`, ownership in the service and the `UPDATE ... WHERE added_by_user_id = :actor AND privacy = 'private'`.
- **Two stages:** (a) exact normalised-text match against public claims blocks publication and links to the existing public claim; (b) the conceptual check returns a ranked list of near-duplicates the owner must review before confirming. Only (b) waits.
- **Perspectives keep their own privacy** on publish. The owner's private perspective stays private.
- **No schema change** is needed for the gate itself: `content.privacy` already exists.

Until then, nothing in the UI suggests a claim can be made public.

### 6. Activity table: the claim-only view

Applied when the Type filter is **exactly** Claim (`f.type=claim`), the same mechanism as Movie: `columnViewFor` returns a new view `'claim'`, with its own saved layout under the existing `perspectize:activityColumns:v1` key (one more key in the stored record, no version bump) and the existing "Showing Claim columns" switch toast.

**Default columns** (designer tool, Claim single-type view):

| # | colId | Header | Tiers | Notes |
|---|---|---|---|---|
| 1 | `perspectize` | (glasses) | all | unchanged |
| 2 | `item` | **Claim** | all | header reads "Claim" when solo, like "Film" for Movie |
| 3 | `category` | Category | sm and up | the only enrichment a claim gets; "-" until set |
| 4 | `createdAt` | Date Added | md and up | a claim's only meaningful date is when you wrote it. Movie keeps Date Added in the picker; claims default it on because there is no other date column. |

Four columns, on purpose: a claim has nothing else. At `lg` the Claim column takes the freed width (flex), so long claims clamp at two lines less often.

**Hidden and picker-only in the claim view** (still listed in the global column picker, rendering "-" for claims):
- Picker-only, meaningful for claims: `type` (hidden when solo, below), `updatedAt` (Updated), `user` (always you while claims are private), admin `id`, `addedByUserID`.
- Forced hidden, no claim value: `channel`, `duration`, `publishDate`, `views`, `likes`, `percentLiked`, `tags`, `description` (YouTube); `genre`, `rated`, `cast`, `released`, `boxOffice`, `vsBudget`, `tmdbScore`, `budget`, `votes`, `collection`, `synopsis`, `tmdbId` (Movie); admin `url` (always NULL).

**Type is hidden whenever exactly one type is filtered in** (`hideWhenSolo`, the TMDB doc's rule). This is a general rule in `defaultColumnVisibility(tier, soloType)`, not a claim special case, so it also applies to YouTube-only, Bible-only and Movie-only filters. The Movie spec (section 6) already said "Type is hidden when solo", but `grid-config.ts` keeps `type` visible in the movie set; this PR makes the code match both specs. Type stays visible in the general (no filter / several types) view.

**The bug this fixes:** today `columnViewFor` knows only `'movie' | 'general'`, so `f.type=claim` gets the general YouTube layout and claim rows fill seven YouTube columns with "-".

**Mixed views** (claims alongside other types, general view): claims render "-" in YouTube and Movie columns and the Item cell carries the type (icon tile, section 7). No mixed-unit concerns: claims bind no Length, Date or count column.

### 7. Cell renderers, icon and tooltips

**Type cell (`typeCellRenderer`).** Keeps the shipped speech-bubble glyph (outline, `var(--color-muted-foreground)` stroke; not the designer's old "scales"). Add `title="Claim"` and an `sr-only` "Claim" label, matching Movie; today the hidden text is the raw `CLAIM` enum.

**Item cell (`activityItemCellRenderer`, new `renderClaimCell`).**
- A 40x32 icon tile (`bg-muted`, speech-bubble glyph in `text-primary`), the same slot every row has, so titles stay aligned. **No play overlay, no outbound link** (no URL): clicking the tile or the title opens the details modal.
- Title: `name` verbatim (tokens unresolved in v1; there is no parent to resolve against), serif 13px, `line-clamp-2`, `whitespace-normal` (the AG Grid `nowrap` gotcha).
- Subtitle: a lock glyph + "Private" in 11px muted text when `privacy === 'PRIVATE'`; nothing when public (a branch that is unreachable until the gate, but rendered and tested now so the gate needs no grid work).
- Needs `privacy` in `LIST_CONTENT` and `GET_CONTENT_DETAILS` (one scalar column, no extra query).

**Tooltips** (`activityTooltipSpecs.ts` and colDef `headerTooltip`):

| Where | Header tooltip | Cell popover | Copy copies |
|---|---|---|---|
| Claim (item) | "The claim as you wrote it. Private claims are visible only to you." | the full text, unclamped, then "Private - only you can see this" or "Public" | the raw text (`name`), never the clamped display |
| Category | existing | existing | existing |
| Date Added | existing | full date and time | ISO timestamp |
| Type (picker) | existing | "Claim" | `CLAIM` |

**Mobile card (`ActivityCardList.svelte`).** Icon tile instead of an empty grey thumb; tapping it opens details (no URL to open). Subtitle line: "Private · <Date Added>", plus the category chip when set. No views/likes line.

### 8. Details view (`ActivityDetailsModal`)

Layout in `tools/content-type-designer/src/details.ts` (`claim`).

- **Header band:** "CLAIM" (already special-cased).
- **No media box.** The 120x68 thumbnail slot is dropped for claims; the text is the content.
- **Title:** the full claim text, serif 17px bold, `whitespace-pre-wrap`, no clamp.
- **Privacy line** under the title: lock glyph + "Private - only you can see this claim." (muted 13px). When public (post-gate): "Public".
- **No URL row** (no URL).
- **Tiles (4):** Perspectives, Avg. Rating, Category (with the Wikipedia link when set), Date Added. Views, Likes, Duration and Date are not shown.
- **Actions:** Compare, Add to plan (signed-in). **No "Update source data"** and no cooldown note: a claim has no source.
- **No Description or Tags sections.**
- **Parent:** not shown in v1 (no UI sets one).
- **Not visible / missing** (deep link `?open=<id>` to someone else's private claim): `contentByID` is null, and the modal shows the existing not-found state. Covered by a test.

### 9. Filter and search

- **Type filter:** `CONTENT_TYPE_LABELS.CLAIM = 'Claim'` is already offered (#612 commit `57c4cd5e`); URL value `f.type=claim`; server filter `contentTypes: [CLAIM]`. The list predicate still applies, so a claim filter only ever returns your own claims.
- **Empty state for the claim filter:** signed in with no claims: "No claims yet. Add one from Add Content - it stays private to you." Signed out: "Claims are private. Sign in to see yours." (one `{#if}` on the existing empty state, keyed on `columnView === 'claim'` and auth).
- **Search:** the Name scope already matches claim text (`name`). No new `ContentSearchField`.
- **Sort:** Claim sorts by NAME (A-Z on the text), Date Added by CREATED_AT. Both exist server- and client-side.

### 10. Discover

**Not on Discover.** Claims are private, so there is nothing to browse; a claim is written, not found. Revisit with the public gate, where "recently published claims" (feed kind `recent`, backend) is the natural feed.

## Backend change list (touch points)

| Layer | File | Change |
|---|---|---|
| Domain | `core/domain/content.go` | `Privacy` on `Content` (built). Add `const ClaimMaxLength = 300`. |
| Port | `core/ports/services/content_service.go` | `CreateClaimInput.ParentContentID *int` (built). |
| Service | `core/services/content_service.go` | `CreateClaim`: collapse whitespace, two-word rule, 300 cap, `@this` guard, parent visibility, per-owner duplicate lookup. `UpdateSourceData`: not-found for invisible rows, invalid-input for a claim. |
| Service | `core/services/category_service.go` | `SetPrimaryCategory` takes the actor id. |
| Service | `core/services/perspective_service.go` | create/update with `contentID`: refuse invisible content. |
| Repo | `postgres/gorm_content_repository.go` | `FindClaimByOwnerAndText(ctx, ownerID, normalised)`; visibility (built). |
| Repo | `postgres/gorm_content_repository.go` (the `primary_category_id` write) | owner/public-scoped `UPDATE ... RETURNING`; the content port's set-category method gains a `viewerID`. |
| Repo | `postgres/gorm_perspective_repository.go` | content-privacy term in the perspective visibility predicate. |
| Resolver | `resolvers/content.resolvers.go` | `CreateClaim` maps `ErrAlreadyExists` -> "you already have this claim". `UpdateContentSourceData` passes the viewer. |
| Resolver | `resolvers/category.resolvers.go` | pass `auth.RequireAuth` actor. |
| Resolver | `resolvers/perspective.resolvers.go` | `Perspective.content` -> null when `!canViewContent`. |
| Schema | `schema.graphql` | `Content.privacy`, optional `parentContentID` (built). No other change. |
| Migration | `000032_add_content_privacy` | written, applied to `pr-612` only (section 13). |

No new adapter, port, sort enum or search field.

## Frontend change list (touch points)

| File | Change |
|---|---|
| `components/AddContentPopover.svelte` | counter (240+), 300 cap, `@this` block, `?` hint, duplicate toast path. |
| `queries/content/useCreateClaim.ts` | `already` / "you already have this claim" -> "You already have this claim." |
| `utils/detectContentType.ts` | none now; QUESTION rule slot documented in the precedence comment. |
| `queries/content/index.ts` | `privacy` in `LIST_CONTENT`, `GET_CONTENT_DETAILS`, `ContentItem`. |
| `utils/grid-config.ts` | `defaultColumnVisibility(tier, soloType)` with the claim set and `hideWhenSolo` for Type; generalise `isMovieOnlyTypeFilter` to `soloTypeFilter(f.type)`; item header "Claim" when solo. |
| `utils/columnLayouts.ts` | `ColumnView = 'movie' \| 'claim' \| 'general'`; `COLUMN_VIEW_LABEL.claim = 'Claim columns'`. |
| `components/ActivityTable.svelte` | item `headerName` from the solo type; empty-state copy for the claim view. |
| `utils/activityItemCellRenderer.ts` | `renderClaimCell` (icon tile, clamp, lock subtitle, opens details). |
| `utils/formatting.ts` | `typeCellRenderer` claim `title` + `sr-only` label. |
| `utils/activityTooltipSpecs.ts` | claim item popover (full text, privacy, copy raw text). |
| `components/ActivityCardList.svelte` | claim card branch. |
| `components/ActivityDetailsModal.svelte` | `isClaim` branch: no media/URL row, privacy line, 4 tiles, no Update source data, no Description/Tags. |

`ADDING_AG_GRID_COLUMN.md` checklist: no new column is added; the claim view is a new default set over existing columns, so only "responsive tier lists" (now per view), the label parity tests and the card/modal lists are touched. `ADDING_CONTENT_TYPE.md` decisions: ingestion = manual; metadata = text only (universal `name` + `response.text`); no new sortable fields; no new shared column except `privacy` (shared by all types, hence a column); URL not required, `UNIQUE(url)` kept; form = unified Add Content; table display = section 6-7; Discover = not on Discover.

## Test plan

Per the testing rules: every stateful surface has each state named and tested; the static icon is not unit-tested beyond its label.

**Backend (`go test ./...`):**
- `test/services/content_service_claim_test.go`: trim + whitespace collapse; empty; one word; exactly 300 and 301 chars; `@this` / `@here` with and without parent; parent missing; parent another user's private row -> not found; parent own private row -> ok; duplicate same owner (case, whitespace, trailing `?` variants) -> `ErrAlreadyExists`; same text other owner -> created; always `PRIVATE`; `response` has no `parentContentId` key without a parent.
- `test/resolvers/content_privacy_test.go` (extend): `setPrimaryCategory` on another user's private claim -> not found and the row is unchanged; own -> ok; `updateContentSourceData` on another's private claim -> not found, on own claim -> invalid input; `Perspective.content` null for a non-owner; `createPerspective` on another's private claim -> not found; a public perspective on a private claim is absent from another user's `perspectives` list and from Compare.
- `postgres` sqlmock: the scoped category `UPDATE`, the duplicate lookup SQL, the perspective predicate.
- `test/roundtrips/content_test.go`: budgets in section 12.

**Frontend (`pnpm run test:run`):**
- `AddContentPopover.detection.test.ts` / `AddContentPopover.test.ts`: every row of the section 2 state table (12 states), plus "Clear Type keeps Claim pinned".
- `hooks-useCreateClaim.test.ts`: success toast and list invalidation (real `QueryClient`, `invalidationOutcome`: content lists invalidated, details and aggregates untouched); duplicate, invalid, generic error toasts.
- `grid-config.test.ts` / `columnLayouts.test.ts`: claim view at xs/sm/md/lg; Type hidden for each solo type (youtube, bible_passage, movie, claim) and visible for none and for two types; `columnViewFor('claim')`; switch general -> claim toasts, claim -> claim does not, a saved claim layout wins over defaults; header label "Claim" / "Film" / "Item".
- `activityItemCellRenderer` tests: claim private (lock + "Private"), claim public (no lock), long text keeps `line-clamp-2` + `whitespace-normal`, no `img`, no play overlay, click on tile and title both call `onOpenDetails`.
- `formatting.test.ts`: claim type cell `title` and `sr-only` "Claim".
- `ActivityDetailsModal.test.ts`: claim (no media, privacy line, exactly 4 tiles, no Update source data, no Description/Tags); public claim privacy line; null content -> not-found state.
- `ActivityCardList` test: claim card (icon tile, "Private · date", tap opens details).
- Empty state: claim view signed in vs signed out copy.
- Parity tests unchanged and green.

**Browser (local only, demo evidence for `needs-demo-video`):** add a claim, filter to Claim (four columns, header "Claim", no Type), open details, switch back to all types (toast), mobile card at 375px.

## Query budget

Backend (`test/roundtrips`, asserted exactly; middleware statements already pinned by `h.warm` are excluded):

| Operation | Statements | Was |
|---|---|---|
| `createClaim`, no parent | 2: duplicate lookup, INSERT RETURNING | 1 |
| `createClaim`, duplicate | 1: duplicate lookup | - |
| `createClaim`, with parent | 3: parent SELECT, duplicate lookup, INSERT | 2 (current test) |
| `content(...)` list with viewer | 1: page with the inline count subquery; the visibility term adds no statement | 1 |
| `contentByID` (full / id-only) | 1 / 1 (privacy rides on the aggregate row) | unchanged |
| `setPrimaryCategory` | unchanged count; the WHERE gains the scope | unchanged |
| `createPerspective` with `contentID` | +1 indexed content lookup | +1 |
| `perspectives(...)` list | unchanged; predicate only | unchanged |

Frontend (`tests/helpers/queryBudget.ts`): creating a claim costs one mutation and invalidates `queryKeys.content.lists()` only; the claim view reuses the existing `LIST_CONTENT` key (the type filter is already in the key); opening a claim's details costs the existing `GET_CONTENT_DETAILS` (skipped when the row is loaded) plus the lazy aggregates query. No new query.

## Migration and rollout

- `000032_add_content_privacy` (up: `ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public'`, `CHECK (privacy IN ('public','private'))`, partial index `idx_content_private_owner (added_by_user_id) WHERE privacy = 'private'`; down drops all three). Idempotent. Adding a column with a constant default is metadata-only on Postgres 17, so it is safe on the live table.
- **Applied:** the `pr-612` Neon preview branch only (verified: `schema_migrations` version 32, not dirty; all non-claim rows `public`, claim 189 `private`). **Not applied** to production or any other branch.
- **Order matters: apply before merge.** The backend's GORM model selects and writes `content.privacy`, so a backend deployed without the column fails every content query. Sevalla deploys the backend when `backend/` reaches `main`. Rollout: re-check that 000032 is still the next free number on `main` (rename if not); snapshot production; apply `up 1` per `.docs/MIGRATION_ROLLOUT.md`; verify (`SELECT privacy, count(*) FROM content GROUP BY 1` all `public`); then merge; then swap the PR label `migrations-unapplied` -> `migrations-applied`.
- The frontend deploys per commit and can run ahead of the backend: until the backend is live, the preview's Add Content claim path and the `privacy` field fail GraphQL validation. Expected, preview only.
- Never `make migrate-up` from a dev machine.

## PR and rollout sequencing

| PR | Content | Migration | Ships |
|---|---|---|---|
| **1 - #612** (in flight) | Built: privacy column, list/by-id visibility, `createClaim` owner from session, optional parent, Add Content claim path, Claim type filter. **Add:** this spec, the designer seed, section 3 hardening, section 4 leak fixes (category, perspectives, Perspective.content, source refresh). | 000032 | after the manual production migration |
| **2 - claim view** | Sections 6-9: claim column view, `hideWhenSolo` Type for every solo type, Item cell, type label, tooltips, details modal, mobile card, `privacy` in list queries, empty states, Add Content counter/hints. Frontend only. | none | after PR 1's backend is live |
| **3 - QUESTION + relationships** | `2026-09-27-content-relationships-plan.md` (its `000031` reference is stale; it depends on 000032). | next free | own review |
| **4 - Declare view** | Own spec (below). | none expected | after 3 |
| **5 - public gate** | Own spec, contract in section 5. | none | after 3 has real `duplicates` data |

PR 1 is user-visible (Add Content) and PR 2 is user-visible (grid, modal): both need `needs-demo-video` from a cloud session or a local demo before `ready for review`.

## The Declare view (separate phase, separate spec)

The Declare view is the claim's own page: one claim with its related claims and questions, ranked by the relationship ratings (average relevance x average importance, per the relationships plan), each user's conclusion coming from their ordinary perspective on the claim. It is **not** part of this spec, because everything it shows comes from the relationships table, which does not exist yet. What this spec guarantees it: a claim row with a stable id, owner-scoped visibility it can reuse, and a details modal that leaves room for a "Related" section without a layout change. Its spec starts after PR 3 and must settle the relationships plan's open question 1 (single-rater items dominating the ranking) first.

## Designer tool

`tools/content-type-designer/src/catalog.ts`: the `claim` profile is renamed "Claim" and its bindings are cut to the decided set (Claim, Category, Date Added, Updated, Content ID, an API-only "About" for the parent); stance, verdict, confidence, claimant, asserted date and context are removed. Four sample rows (id 189's text among them). `src/details.ts` gains the claim layout from section 8. The Add Content mock no longer says claims cannot be added. Rebuilt with `npx tsc -p tsconfig.json`.

## Decisions to confirm (judgment calls)

1. **300-character cap**, service-enforced, no migration.
2. **Per-owner exact-duplicate refusal** as an error (no `alreadyExisted` payload).
3. **`@this` / `@here` without a parent are refused**, not stored literally.
4. **Parent stays JSONB, API-only**, and never moves to a hierarchy `parent_content_id`.
5. **Content privacy dominates perspective privacy** (a public perspective on a private claim is hidden from others).
6. **Type hidden whenever exactly one type is filtered**, for every type, which also changes the Movie and YouTube-only views.
7. **Date Added is a claim default**, unlike Movie.
8. **The four leak fixes ship in PR 1**, not PR 2, because #612 is what creates private rows.
9. **Text ending `?` stays a claim** until QUESTION ships, with a hint.

## Amendments

Owner pointers after review are added here, dated, each naming the section it changes.

**2026-10-23, owner review of duplicates and related claims.** Changes decision 2 and the "Duplicates" paragraph in section 1.

- **Replaces the duplicate refusal.** No per-owner refusal at add time. Before a claim is submitted, Add Content runs a **semantic search** over existing claims. If a close match exists, the user is offered the existing claim and can attach their own perspective to it instead of creating a new row. The reason is the public gate: the same claim should end up as one row with many perspectives, not many rows. The semantic search technology, threshold and index are **not decided** here (see open questions).
- **No "matching claims" in this spec.** The only claim-to-claim link is a **related claim**, picked by users. Related claims are stored as an **array** of claim content IDs. The relationship table in the content-relationships plan is a separate, later design; this array must not be quietly merged into it without a spec amendment.
- **Related claims section, every claim.** The section is always shown on a claim's page. When there are none it reads "None yet".

**2026-10-23, owner review, second pass.** Changes section 1 (data model), section 7 (renderers) and section 8 (details), and sets the search direction.

- **Semantic search gets its own spec.** It is not a launch blocker. The claim type ships with normalised-text lookup; semantic search is added later without changing claim data. The new spec is to be written.
- **Claims store raw text and HTML as separate entries.** The HTML complements the raw text; it does not replace it. The raw text stays canonical for search, matching and sorting, and the plain-text rule in section 1 stands. The `@this` / `@here` display-time idea also stands. The HTML is the display form, sanitised like perspective reviews, and adds links from words to content: the owner's example is linking "Bible" to the Protestant Bible content item, so the claim is not ambiguous between Protestant and Catholic Bibles.
- **Same text in the grid and in the details view.** The HTML is shown in both places the claim appears: the main Activity view and the detail view. The grid therefore renders sanitised HTML too, not `textContent`.
- **Related claims stay an array for now.** The content-relationships table does not exist: it is in a plan only, with no code on `main` or this branch and no table on the `pr-612` branch. The array is the only option until that table is built. When it is built, the array moves into it.

**Open questions for the next spec pass:**
1. **Link format:** what the HTML link carries, e.g. a content ID attribute, and how it is validated server-side.
2. **Linked content visibility:** a claim can link to content another user can't see. What does the reader see?
3. **Sanitiser allow-list:** which tags and attributes, mirrored in the backend the way reviews are.
4. **Raw and HTML consistency:** who or what produces the HTML from raw text, and what happens when the raw text is edited.

**2026-10-23, owner review, scope of v1.** Changes section 2 (Add Content behaviour), section 3 (backend create path) and the Declare section.

- **Claims are not added through Add Content in v1.** The Add form is too crowded for claim dates and the other claim fields. Claims are created and managed on a dedicated claim page, **Declare**. Add Content stops offering the Claim type. The autodetect rule that turns free text into a claim is removed from Add Content, so text that looks like a claim is treated as no match, not saved as one.
- **Consequence for PR #612:** its popover claim path is out of scope for v1 and must be removed or disabled before merge. The backend `createClaim` mutation, the privacy migration and the leak fixes stay.
- **Dates and other claim fields are entered on Declare**, which can hold a full form. The form owns create and edit, so the spec must now say how dates are stored and updated (see open questions).

**Open for the next pass:**
1. **Date storage, now that editing exists:** the form can update claims, so `response` (JSON, set at create) is no longer enough on its own. Choose dedicated columns, or `response` with a defined update path.
2. **Declare route and name:** confirm the URL and page name.
3. **Existing claim rows:** the one row on `pr-612` (id 189) and any rows on production, and whether they appear on Declare or stay as Activity-only.

**2026-10-23, owner decision: claims are public by default, and private is a choice.** Supersedes the private-by-default rule in the Summary (point 2), section 4 (visibility, the owner-only rule for new claims), the "private for now" wording in section 2, and section 5 (the public gate).

- **No gate and no one-way publish.** `publishClaim` and the two-stage duplicate check are not built and are not planned for v1. Nothing waits on the relationships table.
- **Create takes an optional `privacy`.** `CreateClaimInput.privacy` is `PUBLIC` or `PRIVATE`; omitted means `PUBLIC`. Any other value is `ErrInvalidInput`.
- **Edit takes an optional `privacy`.** `UpdateClaimInput.privacy` is nil to keep the stored value; an explicit value replaces it. The owner can switch either way, at any time.
- **Declare shows the choice.** The form has a Private switch (off by default). The list shows Public or Private per row, and the copy no longer says claims are private.
- **Visibility is the normal content rule.** A public claim is readable by everyone and can take perspectives and plan items from other users. A private claim is owner-only, and "not visible" still answers as "does not exist".
- **Delete (see the delete commit).** The owner can delete a claim only while no other user has a perspective or plan item on it. Otherwise "keep as anonymous" reassigns it to `[deleted]` and keeps its privacy as it is.
- **Existing rows keep their stored privacy.** Claims created before this change are `private` in the database. Owners can change them from Declare; nothing is rewritten in bulk.

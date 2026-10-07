# Phase 4: Add Perspective Flow - Context

**Gathered:** 2026-02-18 (updated)
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create perspectives on content (ratings, Like, Review) AND create claims as new content entries — all from the Activity table row action. Includes perspective schema evolution (simplified reference columns, optional fields, JSONB custom fields), claim content type, and @reference system for inline content references.

</domain>

<decisions>
## Implementation Decisions

### Domain Model — Content vs Perspective (LOCKED)

- **Content** = things that exist independently (YouTube video, article, claim, team, player, etc.). External source material. Content hierarchy (team → players) is modeled as separate content items.
- **Perspective** = always a user's subjective take. Ratings, thumbs up/down, review text. Can reference one content item, one primary perspective, and optionally other related perspectives.
- **Claim** = a **Content entry** (type `claim`), NOT a perspective. "Bo Jackson ran 22.3 mph in game" is factual/assertional content that others can then create perspectives on (agree/disagree, rate confidence).
- A perspective-on-perspective is the correct term (not "reply") — e.g., critiquing someone's rating style, consistency, or thoroughness.

### Action Flow from Activity Table (LOCKED)

1. **No existing perspective:** Row shows "+" icon in the perspective column (header = Perspectize glasses icon)
2. **Click "+":** Opens perspective popover/dialog for that content item → user sets ratings, thumbs, text → **INSERT into `perspectives`** with `content_id`
3. **Has existing perspective:** Row shows silhouette-with-glasses icon instead of "+"
4. **Click on silhouette:** Opens the centered modal pre-populated with existing perspective data → edits are **UPDATE to existing `perspectives` row**
5. **Adding a claim** from within the form: Creates a **new `content` row** (type `claim`), not a perspective. The claim is associated with the parent content via @reference.

### Claim Creation (LOCKED)

- Claims are content entries with `content_type = 'claim'`
- Created from within the perspective form UI (exact trigger: Claude's discretion)
- A claim references its parent content (the video/item the user was looking at)
- Claims appear in the Activity table as their own rows (type: claim) — they're content like anything else
- Anyone can create perspectives (rate, agree/disagree) on a claim

### @Reference System (LOCKED)

Inline content references in claim text using `@it` / `@here` tokens:

- **Input:** User types `@it ran 22.3 mph in the 1987 game`
- **Storage:** Raw token preserved in text: `@it ran 22.3 mph in the 1987 game`
- **Display:** Token resolved to parent content name: `Bo Jackson ran 22.3 mph in the 1987 game`
- **Hover:** Hovering over resolved text shows it's a dynamic reference to the parent content

**Purpose:** Avoids redundant typing and keeps claims concise while maintaining the link to context. The parent content's name can change without updating claim text.

**Scope:** `@it` / `@here` references the parent content item only. More complex @mention patterns (referencing arbitrary content) are deferred.

### Reference Architecture — Simplified FK + Array (LOCKED)

**Replaces the former many-to-many join table decision.**

Columns on `perspectives` table:
- **`content_id`** (int FK, optional) — references one content item. Already exists in current schema.
- **`primary_perspective_id`** (int FK, optional, NEW) — references one other perspective as the primary relationship.
- **`related_perspective_ids`** (int array, optional, NEW) — additional related perspective IDs. Max 50 entries (application-level cap, revisit if needed).

**Why this over a join table:**
- Single atomic INSERT (no transactional coupling between perspective + reference rows)
- Zero JOINs for the common case (all reference data on the row itself)
- Real FK constraints on `content_id` and `primary_perspective_id` (PostgreSQL enforces referential integrity)
- No polymorphic `ref_id` column (which can't have FK constraints)
- Native PostgreSQL array with GIN index for reverse lookups

**No bridge tables needed.** All reference data lives on the perspective row.

**Supports all use cases:**
- Rate a video: set `content_id` (existing behavior, unchanged)
- Perspective-on-perspective: set `primary_perspective_id`
- Both: set `content_id` + `primary_perspective_id`
- Synthesis ("these takes together..."): set `primary_perspective_id` + populate `related_perspective_ids`

**Stale reference handling:** If a perspective in `related_perspective_ids` is deleted, the ID remains in the array. Resolver returns null for deleted IDs; frontend skips them. No cleanup job needed. The FK on `primary_perspective_id` gets standard PostgreSQL cascade behavior.

**GIN index required** on `related_perspective_ids` for reverse lookups (`WHERE X = ANY(related_perspective_ids)`).

### What We Are NOT Supporting

1. **No content-to-content relationships** in the perspective model — content hierarchy is a separate domain concern for a future phase
2. **No perspective threading/chains UI** — perspectives can reference each other, but no conversation view or tree rendering
3. **No cross-referencing picker UI** — no "select 3 perspectives to synthesize" interface
4. **No metadata on references** — no "type of relationship" between perspectives (rebuttal vs endorsement). Just "related."
5. **No recursive queries** — we won't walk chains of perspective→perspective→perspective
6. **No arbitrary @mentions** — `@it`/`@here` only references parent content, not arbitrary content items

### Key Type — int (unchanged)

- Keep integer primary keys for perspectives (consistent with users and content)
- No need for UUID — not distributed, auth gates access (Phase 12), well within int4 capacity
- Migrate to bigint later if needed

### Perspective Fields — All Optional + JSONB

- All standard fields (Quality, Agreement, Importance, Confidence, Like, Review) are OPTIONAL
- JSONB custom fields column for user-defined fields
- **Validation:** At least one field must be non-empty to submit (any rating OR any text)
- Ratings stored as integer 0–10000 in DB (hundredths precision), displayed as 0.00–10.00 to user

### Rating Input

- Number input with stepper/clicker control for quick adjustment without typing
- Display: 0.00 to 10.00 (two decimal places)
- Storage: integer 0 to 10000
- Step granularity: Claude's discretion (user deferred this)

### Form Location & Trigger

- Custom popover, bigger than Add Video's (needs room for ratings + text)
- Consistent with existing popover pattern but larger
- Becomes dialog at <768px (existing mobile pattern from FormPopover)
- **New row (no perspective):** "+" icon → click opens empty form → INSERT
- **Existing perspective row:** Silhouette-with-glasses icon → click opens pre-populated centered modal → UPDATE
- Column header: Perspectize glasses icon

### Schema Migration Strategy

- **Additive migration** — add `primary_perspective_id` and `related_perspective_ids` columns to existing `perspectives` table
- Add `claim` to `content_type` enum/values
- Existing `content_id` column unchanged — no migration risk for current data
- Add GIN index on `related_perspective_ids`
- Zero impact on existing frontend queries and components

### Claude's Discretion

- ~~Stepper click granularity (0.10, 0.25, or 0.50)~~ — **RESOLVED: 0.25 per click** (see Figma Make reference)
- ~~Exact popover sizing and layout~~ — **RESOLVED: centered modal dialog** (see Figma Make reference)
- Loading skeleton design
- Error state handling
- ~~`ON DELETE` behavior for `primary_perspective_id` FK (SET NULL vs CASCADE)~~ — **RESOLVED: SET NULL** (see 04-RESEARCH.md)
- ~~Claim creation trigger within the perspective form (button, tab, or section)~~ — **RESOLVED: "+ Add More..." expansion button** (see Figma Make reference)
- @reference token parsing implementation (regex, custom parser, etc.)
- **Rating decimal storage reconciliation needed:** The Figma Make prototype displays 0–10 with 3 decimal places (e.g., 9.234), while the backend stores integers 0–10000. The current context says "hundredths precision" (0.00–10.00 → 0–10000), but 3 decimal places implies thousandths (9.234 → 9234). Confirm whether the integer maps as `display * 1000` (0–10000 = 3 decimals) or `display * 100` (0–1000 = 2 decimals). The Figma Make prototype assumes `display * 1000` mapping.

### Figma Make Design Reference (LOCKED)

Design decisions captured from the Figma Make prototype session. Reference code is React/TSX — must be adapted to Svelte 5 + shadcn-svelte for implementation.

**1. Form positioning:**
- Always centered on screen as a modal dialog (not anchored to the table cell)
- Uses portal rendering with backdrop overlay (semi-transparent black)
- Click outside to dismiss, ESC key to dismiss
- Body scroll locked when open
- Fade-in animation on open

**2. Rating input UX (LOCKED):**
- Compact 2x2 grid layout for Quality, Agreement, Importance, Confidence
- Each rating block: label centered above, then `[v] 5.000 [^]` stepper row, then thin progress bar below
- Default starting value: 5.000 (centered, shown in gray/muted until user interacts)
- 3 decimal places supported (e.g., 7.125, 9.234)
- Step granularity: 0.25 per click
- Hold-to-repeat: 300ms initial delay, then repeats every 75ms
- Clickable progress bar: clicking a position on the bar jumps the rating to that value
- Smart decimal auto-insertion: typing "93" auto-converts to "9.3", "105" to "10.5"
- Progress bar color: gray when uninteracted, green (>7), amber (3–7), red (<3)
- Number text is gray/muted until first interaction, then primary color

**3. Like field replaced with thumbs up/down:**
- No text input for "Like" — replaced with thumbs-up and thumbs-down icon toggle buttons
- Neither selected by default. User taps one or the other (or neither). Toggle behavior (click again to deselect).
- Thumbs up: green highlight when selected. Thumbs down: red highlight when selected.
- Maps to the existing `like` field in the perspective model (store as "up", "down", or null)

**4. "+ Add More..." expansion point:**
- Replaces the old "Add a Claim" collapsible
- Button labeled "+ Add More..." centered below the review textarea
- When expanded, reveals the claim creation section (and potentially future additions like tags)
- Claim section: textarea with `@it` reference helper text

**5. No "(optional)" labels:** Everything in the form is optional — no labels needed to say so.

**6. Form layout order (top to bottom):**
- Header: centered title ("Add Perspective" / "Edit Perspective") with info tooltip icon
- Subtitle: video title in muted text, truncated with ellipsis
- Separator
- 2x2 rating grid (Quality, Agreement, Importance, Confidence)
- Separator
- "Like" label + thumbs up/down buttons (centered)
- Separator
- Review textarea
- "+ Add More..." button
- Cancel + Submit buttons (centered)

**7. Modal behavior:**
- Click outside to dismiss
- ESC key to dismiss
- Body scroll locked when open
- Fade-in animation on open

### Resolved Blockers (2026-02-27)

**A. Rating Decimal Precision (LOCKED)**
- Storage: integer 0-10000 in PostgreSQL
- Display: 0.000 to 10.000 (3 decimal places)
- Conversion: `display * 1000 = storage` (e.g., 9.234 → 9234)
- Inverse: `storage / 1000 = display` (e.g., 9234 → 9.234)
- Step granularity: 0.250 (250 integer units per click)
- This supersedes the 2-decimal spec in 04-RESEARCH.md — plans and utilities must use 3 decimals

**B. Edit Trigger: Click-Based for Both Create and Edit (LOCKED)**
- Clicking "+" on a row with no perspective → opens centered modal in CREATE mode
- Clicking silhouette-with-glasses on a row with existing perspective → opens centered modal in EDIT mode
- NO hover-to-open behavior — hover only changes cursor and icon opacity
- This supersedes the hover-to-edit decision in the original context (line ~28) and 04-02-PLAN's `onCellMouseOver` handler
- Rationale: centered modal (Figma Make decision) is incompatible with hover triggers; click is simpler, more accessible

**C. Default Rating Display (LOCKED)**
- Create mode: all ratings display 5.000 in gray/muted text as a visual anchor
- Internal tracking: `hasInteracted` boolean per rating field
- Submission: if `hasInteracted === false`, submit as `null` (not 5000)
- If `hasInteracted === true`, submit the current value
- Edit mode: pre-populated values display in primary color (hasInteracted = true from start for non-null fields)
- Small X button per rating to clear back to null/unset state (resets hasInteracted to false, shows gray 5.000)

**D. Like Field: LikeValue Enum (LOCKED)**
- Add GraphQL enum: `enum LikeValue { THUMBS_UP, THUMBS_DOWN }`
- Change `like: String` → `like: LikeValue` on Perspective type and inputs
- Backend stores as string "THUMBS_UP" or "THUMBS_DOWN" (varchar column unchanged)
- Frontend: two toggle buttons, neither selected by default, toggle behavior (click again to deselect)
- Green highlight for THUMBS_UP, red for THUMBS_DOWN

**E. Text Fields: Title + Body Architecture (LOCKED)**
- Rename existing `description` column → `title` (migration: `ALTER TABLE perspectives RENAME COLUMN description TO title`)
- Add new `body` column (TEXT type) for rich HTML content (multi-paragraph reviews)
- `title` default: `@it` — resolves to parent content name via the existing @reference system
- `title` is optional to customize — if user doesn't provide one, it stays as `@it`
- `body` stores HTML — sanitization required on input (backend validation)
- **Phase 4 scope:** Neither title nor body fields appear in the Add Perspective form yet
- **Future (perspectives page):** Both become editable; title shown as headline, body as rich text review
- Update GraphQL schema: rename `description` → `title`, add `body: String` to Perspective type and inputs
- Update all resolvers, domain model, GORM model, and mappers accordingly

**F. Form Layout for Phase 4 (LOCKED)**
- The Add Perspective form contains ONLY:
  1. Header (title + info tooltip + video name)
  2. 2×2 ratings grid (Quality, Agreement, Importance, Confidence) with clear X buttons
  3. Thumbs up/down toggle (THUMBS_UP / THUMBS_DOWN)
  4. "+ Add More..." expansion (reveals claim creation)
  5. Cancel + Submit buttons
- NO text inputs (no Review textarea, no Title input) in Phase 4
- Title defaults to `@it` silently on perspective creation
- Body is null

**G. Claim Trigger (LOCKED)**
- The "+ Add More..." button is the trigger for claim creation
- This overrides any "Claude's discretion" noted in 04-03-PLAN — the button label and behavior are fixed

**H. Perspectize Column Icon (LOCKED)**
- "+" icon for rows with no perspective (create trigger)
- Simple Perspectize glasses SVG icon (filled) for rows where user has a perspective (edit trigger)
- Same glasses icon used in column header
- On-brand, consistent with product identity

**I. Keyboard Navigation for Rating Inputs (LOCKED)**
- Up/Down arrow keys increment/decrement the focused rating (same as stepper buttons)
- Tab key moves focus between rating inputs in reading order (Quality → Agreement → Importance → Confidence)
- Standard a11y: inputs are focusable, labeled, and keyboard-operable

**J. Claim Creation Timing (LOCKED)**
- Claim mutation fires independently when user submits a claim via "+ Add More..."
- New claim row appears in Activity table immediately via cache invalidation
- The perspective popover stays open — user can continue filling out their perspective
- Claim creation and perspective creation are separate mutations, not bundled

**K. Loading State (DEFERRED)**
- Follow existing FormPopover pattern (isPending + disabled button) as baseline
- Revisit later whether loading indicators add value or make the interface too busy

</decisions>

<specifics>
## Specific Ideas

- The "Perspectize glasses" icon is the column header; "+" icon per row is the add trigger
- Silhouette-with-glasses icon replaces "+" when user already has a perspective on that row
- Clicking on silhouette-with-glasses opens the centered modal pre-populated (edit mode)
- Term "perspective-on-perspective" preferred over "reply" or "response"
- Sarah's scenario: critiquing James's inconsistent ratings across two videos — set `primary_perspective_id` to James's first perspective, add his second to `related_perspective_ids`
- Content hierarchy (team → players) modeled as separate content items, not perspective references
- Bo Jackson example: video = content, "ran 22.3 mph" = claim (content type), user's agreement with that claim = perspective
- `@it ran 22.3 mph in the 1987 game` → displays as `Bo Jackson ran 22.3 mph in the 1987 game` with hover showing the reference link
- Figma Make reference prototype at `.planning/phases/04-add-perspective-flow/figma-make-ref/` — React/TSX code as behavioral reference, must be adapted to Svelte 5 + shadcn-svelte
- Key reference files: `RatingInput.tsx` (stepper + progress bar logic), `AddPerspectiveForm.tsx` (form structure + TanStack Form field pattern), `AddPerspectivePopover.tsx` (centered modal with backdrop)

</specifics>

<deferred>
## Deferred Ideas

- Perspective threading UI (viewing chains of perspective-on-perspectives) — future phase
- Cross-referencing UI (selecting multiple items to compare) — future phase
- Custom field definitions/schema per user or community — future phase
- Content-to-content relationships (team → players, playlist → videos) — future content hierarchy phase
- Metadata on perspective references (rebuttal vs endorsement classification) — future phase if needed
- Array cap revisit (currently 50, may adjust based on usage patterns)
- Arbitrary @mentions referencing any content item (not just parent) — future enhancement
- Claim-specific fields beyond text (e.g., source URL, evidence type) — future phase

</deferred>

## Outstanding TODOs

- **Re-enable '+ Add More...' claim creation in perspective modal** — The "+ Add More..." button and claim creation section were commented out during Phase 4 polish (Task #8). Needs:
  - Restore the UI component (expandable "+ Add More..." button below review textarea)
  - Wire claim mutation to trigger when user submits a claim
  - Implement @reference system for claim content (see Figma reference in this context)
  - UX review and polish before shipping to production
  - Priority: medium (feature-complete but deferred for post-Phase 4 launch)

---

*Phase: 04-add-perspective-flow*
*Context gathered: 2026-02-18*

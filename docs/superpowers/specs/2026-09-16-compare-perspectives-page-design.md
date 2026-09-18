# Compare Perspectives Page — Design Spec

**Status:** Approved (design handoff already high-fidelity; user pre-authorized proceeding straight to implementation planning — see Origin below)
**Execution:** superpowers:writing-plans → superpowers:subagent-driven-development

## Origin

Design handoff delivered at `/Users/jamesjordan/Downloads/design_handoff_compare_page/` (`README.md`, `Compare.dc.html` static HTML/JS prototype, 3 screenshots). The handoff README is itself a high-fidelity spec (layout, tokens, interactions, state, data sources, file references) written against this exact codebase's real component/query names. This document adapts that handoff into an implementation-ready design, resolves the two things it left as decisions, and calls out the one accessibility bug in the prototype to fix rather than port.

User feedback on the handoff: "look and feel is 80% right, take as high quality guidance but not law." Explicit correction: **some grays in the prototype are hard to read — fix, don't copy verbatim.**

## Problem / Goal

Let a signed-in user deep-dive-compare their own perspective on a piece of content against one other user's perspective on that same content: which rating dimensions align, diverge, or conflict; differences in overall thumbs reaction; differences in feelings; and the two written reviews side by side.

## Accessibility fix (resolves user's "gray fonts hard to read" note)

Audited the prototype's own CSS: text color `#a3a3a3` (contrast ratio ~2.3:1 on white — fails WCAG AA at any size) is used for the "TAKE" / "UNIQUE FEELINGS" eyebrow labels and the "X% different" delta text, all at 10.5px. This is a plain contrast bug, not an intentional design choice — the rest of the prototype's grays (`#525252`, `#171717`) already match this codebase's real tokens (`--color-muted-foreground`, `--color-foreground`) and pass. **Fix:** replace every `#a3a3a3` occurrence with `--color-muted-foreground` (`#525252`, ~7.5:1 contrast). No other color changes — the rest of the palette is already sourced correctly from `app.css` per the handoff's own Design Tokens section.

## Non-goals

- Comparing more than 2 users at once (the 3-participant hue-extension note in the handoff is documented for the future, not built now).
- Persisting `sortDesc`/picker selections across sessions.
- New backend/GraphQL work — see Data section, everything needed already exists.
- Configurable similarity thresholds as an app-level setting — hardcode the three constants (see Comparison Logic) per the handoff's "hardcode at first ship" note.

## Route & Entry Points

- New route: `frontend/src/routes/compare/+page.svelte`, URL `/compare?contentId=<id>&left=<userId>&right=<userId>`. Query params are the shareable/bookmarkable state for the two pickers; both are optional (see Defaults).
- `Header.svelte`: add `{ href: '/compare', label: 'Compare' }` to `navLinks`. No conditional hiding when signed out — the page itself gates on `useMe()` (see Auth/Empty States) the same way other authed-only affordances do elsewhere in the app; being logged out just means "no left-side default" and no way to open it from the details modal, not a route redirect.
- `ActivityDetailsModal.svelte`: add a "Compare" button/link (next to "Update source data", in the same action row) that navigates to `/compare?contentId=<content.id>` — no explicit user params, so the compare page defaults both.

## Layout & Components

Single new top-level component `Compare.svelte` in `frontend/src/lib/components/`, thin `+page.svelte` wrapper reading `page.url.searchParams`. Sub-components, each independently testable:

- `ComparePickerRow.svelte` — the 3-column `1fr auto 1fr` grid: avatar+select per side, swap button in the middle.
- `CompareOverallRow.svelte` — the bordered "OVERALL" box (reuses `Thumbs.svelte`'s icon paths in read-only/display form — see Overall Row below, not the interactive component itself).
- `CompareRatingTable.svelte` — sort toggle + the per-dimension diverging-bar rows + "Filled in differently" sublist.
- `CompareTakeColumn.svelte` — one user's review quote + unique-feelings chips (used twice, left/right, mirrored via a `side: 'left' | 'right'` prop rather than duplicated markup).

All of these live under `frontend/src/lib/components/` (not a `compare/` subfolder) to match the existing flat convention (`ActivityDetailsModal.svelte`, `UserActivityView.svelte` sit at the same level, not nested).

Reuses as-is (no forking): `Header.svelte` (nav entry only), `ActivityDetailsModal.svelte` (opened unmodified for the content banner click, plus the one new Compare button), `Thumbs.svelte`'s SVG path data for the read-only overall-row icons (the interactive component itself takes an `onChange`, wrong shape for a display-only badge — copy the two `<path>`s into a tiny local render, not the whole component).

## Data / GraphQL

No schema or resolver changes. Existing queries cover everything:

- `contentByID(id: ID!)` — the content banner (name, url→thumbnail, channelTitle, length, lengthUnits). Reuses `ActivityDetailsModal`'s `ModalContent` shape.
- `users` (`LIST_USERS`) — full user list, to resolve display names/usernames for the pickers' initial candidate set before privacy-filtering.
- `perspectives(filter: { contentID })` — **new query variant of the existing `perspectives` field**, not a new field: add `LIST_PERSPECTIVES_BY_CONTENT` alongside `LIST_PERSPECTIVES_BY_USER` in `frontend/src/lib/queries/perspectives/index.ts`, reusing the same `PERSPECTIVE_FIELDS` fragment, filtered by `contentID` instead of `userID`. The backend's default read-authorization (`RestrictToPublicOrOwner`) already returns only public rows + the viewer's own private ones — this is exactly the picker's privacy-gating rule from the handoff ("a perspective private to someone else is never listed"), enforced server-side, so the frontend does zero additional privacy filtering — the fetched set IS the eligible set.

Client-side, from the one `perspectives(filter:{contentID})` result:

- Picker options = users who have a row in that result (their `userID`), each mapped to a display name via the `users` query, "You" label when `userID === me.id`.
- Selected left/right perspectives = the two matching rows by id, looked up client-side (mirrors the handoff's "recompute comparison rows client-side" instruction and the existing `PerspectiveAggregate`-style client aggregation pattern in `UserActivityView.svelte`).

## State

- `leftId`, `rightId` — from URL query params, synced back to the URL on change (`goto` with `replaceState: true`, no history spam) so the comparison is shareable/refresh-safe. Not `$state` alone — the URL is the source of truth, component state is derived from `page.url.searchParams`.
- `sortDesc` — local `$state`, default `false` ("Most similar first" = ascending by `|Δ|`).
- `detailsOpen` — local `$state` boolean, drives `ActivityDetailsModal`.

### Defaults (resolves handoff's "default: viewer on left, most-recently-interacted other user on right")

- `left` param absent → default to `me.id` if the viewer has a perspective in the fetched set, else the first available id.
- `right` param absent → default to the *other* user whose perspective on this content was most recently updated (max `updatedAt` among the fetched perspectives, excluding whichever id ended up on the left) — this data is already in hand from the same `perspectives(filter:{contentID})` fetch, no extra query needed for "most-recently-interacted."
- If only one perspective exists total (no comparison possible), render an empty state: "No other perspectives on this content yet to compare against" instead of the picker/comparison UI, with a link back to the content.

## Comparison Logic (`frontend/src/lib/utils/comparePerspectives.ts`, new pure-function module — unit tested in isolation)

Given two `PerspectiveItem`s:

- **Rating dimensions**: for each of `quality/agreement/importance/confidence` (plus shared keys of `customFields` where both sides have a value — customFields values coerced to number, non-numeric/missing entries skipped), where **both** sides are non-null: compute `delta = |left - right|` in display units (`ratingToDisplay`), `pctDiff = delta / 10 * 100` (10.0 being the display-scale max, matching the handoff's `0.0% different` example format at 1 decimal place), and a status:
  - `delta <= 1.0` → `similar`
  - `delta <= 3.0` → `diverges`
  - else → `conflict`
  (Exact thresholds from the handoff's Design Tokens section.)
- **Filled in differently**: dimensions where exactly one side is non-null.
- **Summary counts**: count of similar/diverges/conflict across the computed rows (feeds the "N similar / N diverge / N conflict" indicator line).
- **Overall (thumbs)**: `like` field, `'THUMBS_UP' | 'THUMBS_DOWN' | null` per side; "agree overall" when equal and non-null, "different" otherwise (including either side null — handoff's "—" case).
- **Feelings**: match by `label` (falling back to `emoji` when label is null) — shared → "Matching feelings"/"Similar" chip set (this codebase's dedupe key, since the handoff prototype's mock data didn't need to specify one); left-only / right-only → each side's "Unique feelings" list.
- **Sort**: rows ordered by `delta` ascending or descending per `sortDesc`.

## Visual Details Carried Over Verbatim From Handoff

(No changes beyond the one contrast fix above.) 3-col responsive grid via `grid-template-columns: repeat(auto-fit, minmax(200px,1fr))`; diverging bar per row with each user's own avatar color as the marker fill and a 55%-opacity connecting segment; avatar colors: `--color-primary` (`#1a365d`) for the viewer's own avatar wherever "you" is on either side, `--color-logo-purple` (`#8b5cf6`) for the other participant (single fixed pair — no third-hue logic needed since 2-user comparison is the whole scope); serif (`Charter`, via the existing `font-[family-name:var(--font-family-serif)]` utility already used in `ActivityDetailsModal`) for the review quotes and content title, `Geist` (default) elsewhere; status dot colors from `--color-rating-positive/neutral/negative`.

## Testing

- `comparePerspectives.ts`: unit tests per Testing Principles — this module has real branching state (similar/diverges/conflict thresholds, filled-in-differently, feelings matching, sort direction) so each branch gets a case: both-null (excluded), one-null (filled-in-differently), delta at each threshold boundary, thumbs agree/differ/either-null, feelings shared/left-only/right-only, sort asc vs desc.
- `Compare.svelte` / sub-components: component tests for the stateful pieces only (per Testing Principles) — picker exclusion (can't pick same user twice), swap button, sort toggle direction + label/chevron, empty state (single-perspective content), privacy gating showing only the actual fetched set as options. The static visual layout (spacing, colors) is not unit-tested — verified visually.
- No backend test changes (no backend changes).

## Open Items Explicitly Decided (nothing left TBD)

1. **Sub-1.0-delta "similar" but only one side present** → filed under "filled in differently," never contributes to similar/diverge/conflict counts (matches handoff: those rows are for "rating dimension that **both** users filled in").
2. **Feelings match key** → `label` first, `emoji` fallback (handoff didn't specify; documented here as the concrete rule the plan implements).
3. **Signed-out access** → page loads, but with no `me.id` for the "You" default/label; picker still works against whatever's public. No redirect.

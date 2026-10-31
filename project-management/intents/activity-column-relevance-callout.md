# Activity column relevance callout

Status: draft <!-- draft | accepted | done | superseded by <link> -->

<!-- Drafted by Claude from a conversation; the product owner corrects it. Commit as `accepted` only after human sign-off on the *why* — that triggers the spec. -->

## Problem

The Activity grid shows one set of columns for every row. When the type filter is empty or names several types, the columns are not relevant to every row: Budget, Box Office, TMDB Score and Cast mean nothing for a YouTube video, and View Count or Likes mean nothing for a Bible passage. Those cells render empty, so the grid looks broken or sparse and the user can't tell why.

Today the only handling is `columnViewFor` (`columnLayouts.ts`), which picks the **Movie** column set when the filter is exactly MOVIE and the **general** set for everything else (YouTube, Bible passage, several types, no filter). The general set is a compromise, and nothing tells the user that a single-type view would serve them better.

## Proposed outcome

When the type filter is empty or has two or more types selected, a callout sits above the Activity table:

> For the most relevant information, pick one content type at a time or select custom columns.

- "pick one content type at a time" links to (or opens) the content-type filter.
- "select custom columns" opens the column picker (`ColumnPickerDialog`).
- It does not show when exactly one type is selected.
- This is a first step. It points users at the existing fixes; it does not change which columns appear. Smarter defaults for mixed views are a later piece of work.

## Affected users and systems

- **Users:** anyone on the Activity page with no type filter or a multi-type filter (the default landing state).
- **Frontend:**
  - `ActivityTable.svelte` (renders the callout above the grid/card list; owns `columnPickerOpen` and the filter state);
  - `grid-config.ts` (`CONTENT_TYPE_OPTIONS`, `isMovieOnlyTypeFilter`; likely a sibling helper that counts selected types);
  - the type column's `ContentTypeFilter` (`contentTypeFilter.ts`) and `gridUrlState.ts` (`f.type=` URL key), whichever the link drives;
  - `ColumnPickerDialog.svelte`.
- **Backend / DB:** none.

## Constraints

- Frontend only; no schema or GraphQL change.
- Must work in both data modes (Loaded / All Items) and in the mobile card list, where the grid, its filter popup and the Columns button are unmounted (`cardMode`, <860px).
- Colours come from theme tokens, not hex (pre-commit colour guard). Use the existing UI conventions (`border-border`, muted tokens).
- Reserve no extra width: the grid is already sized to the 1212px container.
- The callout must not push the grid or pagination bar off screen on short viewports.
- Tests: the visibility rule is a pure function in `grid-config.ts`, unit-tested; the component gets a render test.

## Decisions

- **Visibility:** shows when the type filter is empty or names 2+ types; hidden for exactly one type. Based on the filter only, not on loaded rows.
- **"Pick one content type" link:** opens the Type column's filter popup. No new filter UI.
- **"Select custom columns" link:** opens `ColumnPickerDialog`.
- **Mobile card list (<860px):** callout hidden, since the filter popup and Columns button don't exist there. Revisit with inline type chips later.
- **Dismissal:** none. Always shown while the condition holds, even if a custom layout is saved (so no localStorage).
- **Copy:** the quoted sentence verbatim, with the two phrases as inline links, in a muted info banner with an info icon.

## Open questions

<!-- Options are numbered, sub-options lettered, so answers can be given as "1b", "3a2", etc. -->

1. **Placement relative to filter chips.** `FilterChips` already renders above the grid (and moves itself into the page header on desktop). Callout above the chips, between chips and grid (leading candidate), or inside the grid card's top edge?
2. **Does a saved custom layout make "select custom columns" misleading?** With no dismissal, a user who already customised still sees the advice. Accepted for v1; revisit if it reads as nagging.

## Downstream

- Spec: <!-- docs/superpowers/specs/YYYY-MM-DD-activity-column-relevance-callout-design.md -->
- Plan(s): <!-- link(s) -->
- PRs (one line each, add as they open; tick on merge):
  - [ ] <!-- title — PR link — open | merged -->

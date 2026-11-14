---
name: discover-preview
description: Build a throwaway Discover-page preview (one self-contained HTML page showing the source tabs, result cards, and any lookup/resolve flow) for a proposed or changed Perspectize content type's Discover integration. Use when a content-type design needs a visual of how its Discover page tabs will behave, e.g. "create the discover preview", "build a discover page mock for book", or after changing a type's Discover tabs/sources. Sibling to content-type-preview, which covers the Activity table instead — build both when a design touches both.
---

# Discover-page preview

Hand-builds `tools/content-type-designer/previews/<type>-discover.html`: the Discover
page's source tabs and sub-tabs (Search / Trending / whatever lookup mode the design
defines) for one content type, as the app would show it, with real fetched data. It is a
design artifact, not product code. There is no generator (unlike `content-type-preview`'s
`build.mjs`) — copy the closest existing `<type>-discover.html` and edit it by hand.

**Reference example:** `tools/content-type-designer/previews/book-discover.html` (from
`docs/superpowers/specs/2026-11-09-book-content-type-discover-design.md`). Start there.

## When to use this vs. content-type-preview

- **content-type-preview** (`.claude/skills/content-type-preview/`): the Activity table —
  grid columns, cell tooltips, the details modal, the Add-perspective form.
- **discover-preview** (this skill): the Discover page — how a type's data sources
  (search, trending, a lookup-by-id flow, etc.) look and behave *before* a row exists in
  the Activity table at all.

A design that adds a Discover source needs both previews; a design that only changes
Activity columns needs just the first.

## Required structure

1. **Top banner**: a one-line disclaimer that nothing on the page is built yet, linking
   the design doc it mocks.
2. **Source tabs row**: every top-level Discover source (currently YouTube, Movies,
   whatever this preview adds), with every source *except* the one being previewed
   rendered `disabled` and visually dim — this is a mock of one source, not a functioning
   multi-source page.
3. **Sub-tabs for this type's own data modes**: whatever the type's design doc actually
   defines (Search + Trending is the common pair; add more only if the design doc does —
   Book's third ISBN tab exists because its design doc gives it one). Wire tab-switching
   with plain `onclick`/`classList` JS — no framework, no build step.
4. **Real data only, with citations.** Every card's title, author/creator, cover, and
   numbers come from a live API call made while building the preview, not invented.
   Note the fetch date in a comment or caption. Reuse whatever rows the matching
   `content-type-preview` spec.json already fetched where they overlap (e.g. Book's
   preview reuses the East of Eden cover/rating already pulled for the Activity preview).
5. **Any stateful flow gets its states shown, not just the happy path.** If the design
   doc describes a resolving/found/not-found/malformed sequence (an ISBN or ID lookup,
   a paste-a-link flow), the preview must let a reader trigger each state — small example
   buttons plus vanilla JS that simulates the transition (a `setTimeout` for "resolving",
   a regex check for "malformed"), never a real network call. This is the single biggest
   value this preview adds over the Activity-table one: it's the only place a lookup
   flow's error/empty states get seen before any code exists.
6. **Footer attribution** matching the real app's convention (e.g. "Book data from Open
   Library").

## Visual conventions (copy these from book-discover.html)

- **Color tokens**: copy the `:root` CSS variable block verbatim from the app's default
  theme (`frontend/src/app.css`, the first `--color-*` block) so the preview reads as the
  real app, not a generic mock. Re-copy it fresh each time rather than trusting a stale
  paste — tokens do change.
- **Fonts**: `ui-serif, Georgia, "Times New Roman", serif` (class `.serif`) for titles and
  any book/article/long-form text, matching `content-type-preview/template.html`; default
  `ui-sans-serif` stack for UI chrome (buttons, tabs, meta text). Same split both previews
  use, so a type's two previews read as one system.
- **Cards**: cover thumbnail (real image URL, not inlined — this preview isn't rendered
  as a Claude artifact, so remote URLs are fine, unlike `content-type-preview`'s
  `thumbs.ts` inlining requirement) + title (serif, links to the real source URL) +
  author/creator line + a meta line (numbers, rating) + optional tag chips + an action
  button on the right (`Add to Perspectize` / `In Library`, disabled, matching the real
  button states).

## Output and linking

- Path: `tools/content-type-designer/previews/<type>-discover.html` (sibling to
  `<type>-activity.html`).
- Add a one-line pointer in the design doc's `Status:` line, next to the Activity
  preview's pointer, e.g. `Preview of the intended Discover page: tools/content-type-
  designer/previews/<type>-discover.html — hand-built; no skill generates this one.`
- Check it the same way as the Activity preview: open it in a browser, click through
  every tab and every example button, confirm there are no console errors.

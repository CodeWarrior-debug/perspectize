# Cell Popover Tooltips — Design

Status: draft for review. Scope: activity table only (exploratory; B/C decided afterward).

## Problem

1. 2–3 ActivityTable columns render tooltips with a different font/appearance. Suspected cause: plain cell tooltips use `.ag-tooltip` (15px, 4×8 padding, 4px radius) while `TagsTooltip`/`DescriptionTooltip` use `.tags-tooltip`/`.description-tooltip` (13px, 10px padding, 6px radius) nested inside `.ag-tooltip`. To be confirmed in the browser before fixing.
2. Tooltips are read-only. We want copy-to-clipboard, configurable per column (e.g. Likes copies raw `1234`, not `1.2K`), and a multiselect/copy-all picker for Tags (nothing copied by default).

## Decision: no new package

bits-ui `^2.19.0` is already installed. Its **Popover** is the correct ARIA role for interactive content (Tooltip is non-interactive). AG Grid has no Svelte tooltip support and its tooltips are mouse-only. Tippy.js is a poor Svelte 5 fit; Floating UI is already bits-ui's engine.

## Design

### 1. Shared look
One `.tip-surface` style carrying the current tooltip values (`rgba(45,45,45,.9)`, 6px radius, shadow, 13px text, 10px padding). Used by the popover, Tags, Description and plain-text tooltips so all match.

### 2. Shared popover
A single `CellPopover.svelte` (bits-ui Popover) mounted once outside the grid, anchored to the hovered/focused cell via `customAnchor`.
- Opens after a delay on hover; stays open while pointer is on the cell or popover.
- Enter/Space on a focused cell opens it; Esc closes.
- Header hover keeps static `headerTooltip` (no copy).

### 3. Defaults with per-column override
`defaultColDef.tooltipSpec` applies to every column: popover with the shared look, the cell's displayed text, and a copy icon copying raw `params.value`.
- **Override:** column sets only what differs, shallow-merged over the default (e.g. `{ copyValue: p => p.data.likeCount }`).
- **Opt out:** `tooltipSpec: false` (thumbnail, Actions columns).
- **Multi mode:** `{ mode: 'multi', items: p => p.data.tags }` shows a checklist with "Copy selected" and "Copy all"; nothing copied by default.
- `TooltipSpec` is one exported TS type.
- Copy via `navigator.clipboard` + `svelte-sonner` toast.

### 4. Testing (states to cover)
Popover closed/open; single copy copies the raw value not the display value; multi with none/some/all selected; Copy all; keyboard open + Esc close; default-spec column gets a popover; `tooltipSpec: false` gets none. Static styling needs no unit test.

### 5. Boundary
Activity table only. After trying it, decide whether to extend to `hover-tooltip` spots (B) or all tooltip mechanisms (C).

## Open items
- Confirm which columns show the mismatch (browser check at implementation start).
- Clipboard failure handling (permission denied): toast an error.

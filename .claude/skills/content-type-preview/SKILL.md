---
name: content-type-preview
description: Build a throwaway single-type Activity preview (one self-contained HTML page) for a proposed or changed Perspectize content type, from a spec JSON. Use when a content-type spec needs a visual of its default columns, header and cell tooltips, details view and Add-perspective form, e.g. "create the preview html", "rebuild the movie preview", or after changing a type's columns.
---

# Content-type preview

Writes `tools/content-type-designer/previews/<type>-activity.html`: the Activity table with
only one type filtered in, as the app would show it, plus the details and Add-perspective
mockups. It is a design artifact, not product code. Never hand-edit the HTML: edit the spec and rebuild.

```bash
node .claude/skills/content-type-preview/build.mjs \
  .claude/skills/content-type-preview/examples/<type>.spec.json \
  tools/content-type-designer/previews/<type>-activity.html
```

Exit `0` built, `1` spec invalid (each error listed), `2` usage or IO error. Warnings
(`!`) don't fail the build but usually mean a missing tooltip or an empty cell with no reason.

## Files

| File | Purpose |
|---|---|
| `build.mjs` | Validates the spec, inlines thumbnails, fills `template.html` |
| `template.html` | The renderer (CSS + JS). Slots: `/*@SPEC@*/`, `/*@TITLE@*/`, `/*@ACCENT@*/` |
| `examples/*.spec.json` | One spec per type: `movie`, `food-item`. Start a new type by copying the closest one |

## Writing a spec

- **`type`**: `label`, `enumValue` (UPPER_SNAKE), `icon` (`book film music image tv file quote food`), `accent` (`#rrggbb`).
- **`meta`**: `date`, `sources` (the spec doc first), and a `note` that says which values are real and which are illustrative.
- **`columns`**: at most **10**, the designer's crowding threshold. Put the rest in the column picker or the details view, and say so in `meta.note`.
  - Each column has an `id`, a `kind` (`perspectize item pill text num tags date`) and a `status` (`shipped planned proposed`).
  - `header.body` is the header tooltip and `header.src` is where the value comes from.
  - `cell.whenEmpty` says what a blank cell means. Missing is not zero ([ADDING_CONTENT_TYPE.md, Decision 8](../../docs/ADDING_CONTENT_TYPE.md#decision-8-import-preview--enough-for-an-informed-decision)).
- **`rows`**: real records where you can get them, and at least one `"fill": "sparse"` row so empty states are visible.
  - Cell values are either plain values or `{value, tip:{v,src,extra,empty}, flag, suffix}`. A `text` cell ignores `suffix`, so put the unit in the value.
  - The item cell is `{title, sub, thumb, thumbShape: poster|contain}`.
  - `details` holds the modal: `title`, `subtitle`, `media`, `mediaFit: contain`, `text`, `links`, `tiles`, `tags` and `footer`.
- **`perspective`**: `{ ratings, addFieldHint, extension? }`.

## Images

Artifacts block remote images. `build.mjs` replaces any `thumb` or `details.media` URL found in
`tools/content-type-designer/src/thumbs.ts` with its inline data URI. To add images, first add
them as `img:` on the type's sample rows in the designer's `src/catalog.ts`. Then run
`python3 scripts/build_thumbs.py` and `npx tsc -p tsconfig.json` in
`tools/content-type-designer/`, and rebuild the preview. An unmatched URL is kept and
reported as a warning.

## Check it

Open the output in Chromium (Playwright is preinstalled in cloud sessions). Check the page
for console errors, then hover a header and open a row's details. Then link the preview
from the type's design spec.

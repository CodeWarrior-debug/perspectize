# Library export and print

Status: approved by the owner 2026-11-14; implementation not started (plan: `docs/superpowers/plans/2026-11-14-library-export-print.md`). Terms follow [Browsing](../../glossary/browsing/GLOSSARY.md): **Library**, **Item column**, **Column picker**, **Column view**, **Data mode**, **Card mode**.

## Intent and why

A person keeps a list of favourite recipes in the Library. They want to put it on the fridge as paper, and send the same list to a friend who has no Perspectize account. So they print it, and export it and email the spreadsheet.

Today nothing leaves the Library page. This adds an **Export** menu that gets the rows on the page out in three ways: a CSV download, a copy-to-clipboard for pasting into a spreadsheet, and print (which also covers Save as PDF through the system dialog).

The same need applies to any content type, not only recipes (recipes are web pages for now: the Web Page spec lists Recipe as a later subtype).

## Goals

- Export what is on the page, as seen: the rows currently displayed, in the columns currently shown, in on-screen order. Close to "what you see is what you get", not byte-for-byte.
- CSV and Copy output that a non-Perspectize friend can use: it carries each row's source link.
- Print through the system print dialog, so the person previews there. Save as PDF comes from the same dialog.
- Two print modes: **As seen** (the live grid) and **As list** (a plain table that repeats its header on every page, with a title and a spacing option).
- Make adding Excel later a small step.

## Non-goals

- Mass export of every row matching the filters (the follow-up; it needs a server-side or streamed path).
- `.xlsx`: deferred until the AG Grid Enterprise licence. AG Grid's `@ag-grid-enterprise/excel-export` is licensed "Commercial"; we will not add a second spreadsheet library in its place.
- Pushing to Google Sheets through its API (needs Google OAuth and app verification). The Copy button covers the paste case.
- Our own PDF generator. The system dialog already offers Save as PDF.
- Export from Plan, Compare or Discover.
- Export in Card mode (narrow screens).
- Sharing by link or public page: that is the sharing model in ADR #709, a different decision.

## Anti-goals

- A CSV that opens as garbage in Excel (lost accents) or runs a formula from a cell's text.
- An export that quietly differs from the screen: a column on screen but missing from the file, or the reverse, with no stated reason.
- Any new network request. Export reads rows already loaded.

## Constraints

- **Rows on the page are capped.** All mode pages at 10, 25 or 50 rows; Loaded mode works within the loaded page. "What is on the page" is therefore at most 50 rows.
- **AG Grid does not render in jsdom.** Grid logic that needs testing must be a pure function.
- **Export is offered on the desktop grid only** (decided by the owner). **Card mode** (under 860px, which includes portrait tablets and narrow windows) unmounts the grid and shows no Export button.
- Frontend rules: icons are per-icon `@lucide/svelte` imports; colours come from theme tokens, never raw hex; toasts use svelte-sonner via `$lib/utils/toast.ts`; shadcn components live in `src/lib/components/shadcn/`.
- No print styles exist in the frontend today.

## Approaches considered

**Print**

| | What | Trade-off |
|---|---|---|
| P1 | Print the live grid with print CSS | Truest to the screen. Header appears only on page 1, rows can split across pages, little room for title and spacing. |
| P2 | A print-only plain table built from the shown columns and rows | Header repeats on every page, rows never split, title and spacing are easy. Rich cells print as text. |
| P3 | Generate our own PDF | Dropped: the system dialog already saves as PDF, so this is more code with no extra preview. |

**Chosen (by the owner): offer both P1 and P2** and let the person pick each time. PDF is the system dialog's Save as PDF.

**Export**

| | What | Decision |
|---|---|---|
| E1 | CSV download | Now |
| E2 | `.xlsx` | Deferred (Enterprise licence) |
| E3 | Copy as tab-separated text | Now |
| E4 | Google Sheets API push | Deferred |

## Design

### The Export menu

A button in the Library's bottom toolbar, beside **Columns** and **Edit sorts** (that row already holds the page's grid controls).

```
[ Columns ] [ Edit sorts ] [ Clear sorts ] [ Export ▾ ]
                                           ├ Download CSV
                                           ├ Copy for spreadsheet
                                           ├ Print as seen…
                                           └ Print as list…
```

States to build and test: menu closed / open; items disabled while the grid is not ready, while rows are loading, and when there are no rows.

### One table behind every output

A pure module (for example `$lib/utils/exportTable.ts`) turns the displayed rows plus the shown columns into one table: a header row and rows of plain strings. CSV, Copy and print-as-list all read that same table, so they cannot disagree with each other. A later Excel export plugs into it too.

- **Rows:** the rows displayed after any client-side filter and sort (the grid's post-filter-and-sort node order).
- **Columns:** the shown columns in on-screen order, minus the action column (the one with the empty header).
- **Cell text:** the same formatting functions the grid's `valueFormatter`s already call (`formatCount`, `formatReleased`, and so on). The six renderer columns (perspective, item, type, category, cast, author) need a text form; Item uses the display title if set, otherwise the name.
- **DECIDED BY TRIAL: own serializer or AG Grid's `@ag-grid-community/csv-export` module for CSV and Copy.** Card mode is no longer a reason for either. Either way the cell-text function, the table builder, the injection guard and the print-as-list table are written by us, so they are built once on the shared base. Only the CSV and Copy step forks: two short spikes on separate branches off the shared base, one per path. The owner approved this plan on 2026-11-14.

### Deciding between the two CSV spikes

Compare on: (1) whether the Link column works without a hidden grid column outside `COLUMNS`; (2) whether the logic is testable in jsdom or needs a browser; (3) the measured production-build size delta (the module is about 10.5 KB gzipped on its own); (4) any other wrinkle found while building. Keep the path with fewer problems and delete the other branch. Known facts: the module's file download adds a byte-order mark and quotes fields, has no formula-injection guard, is MIT, and pulls in no new transitive dependency; the Svelte wrapper pins AG Grid to the v32 line.
- **Drift guard:** a test fails if any entry in `COLUMNS` has no export text and is not explicitly excluded. `ADDING_AG_GRID_COLUMN.md` gains a step for it.

### CSV and Copy

Both add one trailing **Link** column holding each row's `url`. It is not on screen, so this is a deliberate departure from WYSIWYG, decided by the owner so a friend's spreadsheet is usable. Print leaves it out: paper cannot be clicked.

CSV:

- UTF-8 with a byte-order mark so Excel keeps accents; RFC 4180 quoting; CRLF line endings.
- A guard against formula injection: a text cell starting with `=`, `+`, `-` or `@` is neutralised, but a plain negative number or percentage (a negative ROI, say) is left alone. *(Builder to settle the exact rule and test both sides.)*
- File name like `perspectize-library-2026-11-14.csv`.

Copy:

- Tab-separated, header row included, via the clipboard API. Tabs and line breaks inside a cell become spaces.
- A toast on success ("Copied N rows") and on failure (clipboard refused).

### Print

Both modes open the system print dialog (`window.print()`), so preview, paper size, orientation and Save as PDF all come from it.

**As list:** a print-only table from the shared table (no Link column), hidden on screen. Its header row repeats on every page, rows do not split across pages, and the page chrome (nav, toolbar, pagination) is hidden. Options before printing: a **title** (default "Library", editable) and **spacing** (compact, standard, roomy). Item names are links, harmless on paper and clickable in a saved PDF. *(My call; a title and spacing are the adjustments the owner asked for.)*

**As seen:** print CSS hides everything but the grid and switches it to its print layout for the print, restoring afterwards. Known limit, accepted: the header prints on page 1 only, so people who need a repeating header use As list.
State to get right: the grid's layout must be restored after the dialog closes, including when the person cancels.

## Testing

Per the project's testing rules, each state is exercised:

- Pure unit tests: the table builder (rows, shown columns, Item text, empty cells), CSV serialiser (BOM, quoting, injection both ways, Link column), TSV serialiser (tabs and newlines in cells).
- The `COLUMNS` completeness test.
- Component tests for the Export menu: closed, open, each item disabled state, Copy success and failure toasts, the print-as-list options (title empty and filled, each spacing).
- Print behaviour is checked by emulating print media and rendering to PDF (Chrome DevTools or Playwright), looking for the repeating header, no split rows and the hidden chrome. The system dialog itself cannot be captured.
- Query budget: no change. Export reads already-loaded rows, so no cache-contract test applies.

## Left to the builder

- The exact formula-injection rule.
- The text form of each of the six renderer columns.
- Whether the shadcn dropdown menu is already installed or must be added.
- Print page orientation (landscape for wide column sets) and how As seen handles pinned columns that overflow the page.
- Behaviour of rows with no `url` (leave the Link cell empty).

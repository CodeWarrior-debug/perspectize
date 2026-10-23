# Numeric column charts in the movie grid: design

Status: draft for review. Not yet approved for build.

## Intent

People browsing movies in the grid can't see how a numeric column is distributed without exporting the data or doing the math themselves. Per-column charts let them see the shape of a column (typical value, spread, outliers, how many values are missing) without leaving the grid.

## Goals

- Every eligible numeric column can open a chart popover from its header.
- The chart is off by default. Turning it on for a column is a per-user, per-browser choice.
- Inside the popover, the user can pick one of ten chart types. Picking one re-renders the chart immediately, with no reload and no refetch.
- Each column has a default chart type, set by the developer in code. It is the type shown when the popover first opens.
- Ten chart types ship at launch (listed below).
- Charts appear only for movie-type content and only in loaded client mode.

## Non-goals

- Charts for content types other than movies.
- Charts in server "all" mode. The client holds only part of the data there, so any chart or statistic would be partial.
- Saving the user's chosen chart type. A type picked in the popover changes only the current view. It resets on reload.
- Editing data from a chart, or filtering the grid by clicking a chart. These are possible later and are out of scope.
- A chart library for the first release, unless the builder finds the hand-built approach below is unworkable (see Decisions).

## Anti-goals (would make this a failure even if it works)

- A chart that silently shows partial data. Any chart shown in a mode where the data is incomplete is a bug.
- Charts on by default, or charts that slow the grid when they are off.
- A chart that disagrees with the grid's own numbers for the same visible rows.

## Eligible columns

Numeric movie columns, as they appear in the main grid: views (viewCount), likes (likeCount), percentLiked, duration, boxOffice, vsBudget, tmdbScore, budget, votes. The released column is a date and is excluded.

## Chart types (all ten ship at launch)

1. **Histogram:** bars of how many rows fall in each range.
2. **Line (frequency curve):** the same binned counts joined by a line.
3. **Pie:** each range's share of the rows. Show at most 5 slices, then "other."
4. **Box plot:** median, middle half, whiskers, and outliers.
5. **Cumulative curve:** the share of rows at or below each value.
6. **Summary stats:** count, min, median, mean, max, and sample standard deviation, as plain text.
7. **Density curve:** a smoothed distribution.
8. **Strip plot:** one dot per row on a number line.
9. **Top and bottom 10 bar:** the 10 highest and 10 lowest values, labeled with the movie title.
10. **Coverage donut:** rows with a value versus rows empty for this column.

Rows with an empty value are left out of every chart except the coverage donut, which counts them. Their number is shown beside every chart.

## Standard deviation

Sample standard deviation (n−1) over the loaded rows. It appears only in the summary stats type. It is shown only in loaded client mode, which is the same restriction that applies to every chart.

## Interaction

- The header has a chart icon on each eligible column. Clicking it opens the popover.
- The popover has the chart-type picker and the chart. Changing the type re-renders the chart in place.
- The popover shows the rows the grid currently shows: filters and sort apply, as they do to the grid.
- The on/off state for each column is saved in the browser with the existing column settings (localStorage). Default is off.
- The chart type is not saved. Each open starts from the column's developer-set default.

## Decisions

These are my calls. The builder may change them if the reason is clear, and the reason should be written down.

- **Rendering:** hand-built SVG for all ten types, with no new dependency. The types are simple to draw, and this avoids license questions, bundle size, and the server-rendering determinism problem noted for TanStack Charts. If a type proves much harder to draw by hand than expected, the builder may propose a library for that type alone, with reasons.
- **Default chart type:** histogram for every column at launch. The developer can change any column's default in code.
- **Pie cap:** 5 slices plus "other." Slices come from the equal-width bins.
- **Data source:** charts read the rows the grid currently shows (after filters and sort), using the same value getters the grid uses for display, so the numbers match the grid. They do not read raw query data.
- **Hidden columns:** the header icon appears only while its column is visible. Hiding the column keeps its saved on/off flag but hides the icon.
- **Mobile tiles and cards:** no charts. They have no grid header.
- **Too little data:** zero non-empty rows shows "no values yet" in place of the chart. One row, or all values identical, shows the summary stats and a short note in place of the other charts.
- **Top and bottom 10:** with fewer than 20 rows, the two lists are cut to half the rows each, so they don't repeat a movie. Ties break by title.
- **Saved settings:** the on/off flag joins the existing column settings object in localStorage. It needs a version guard so existing saved settings are read and kept, never wiped. The builder confirms the exact stored shape in `grid-config.ts` before writing this.
- **Loaded rows only:** charts and std dev cover the rows loaded on the page (currently the first 100 in loaded mode, `ActivityTable.svelte` line 430). Each popover shows "based on N loaded movies" so the scope is visible. This is my call, pending the user's confirmation.
- **Zero values:** a zero is a real value everywhere. Missing budget or revenue is NULL, and only NULL counts as empty. Checked in the database (read-only, 28 movie rows with budget or revenue): 0 budget rows, 0 zero-revenue rows, 8 budget NULLs, 6 revenue NULLs. The `vs_budget` calculation (`backend/internal/adapters/repositories/postgres/helpers.go` lines 208–214) still returns NULL for budget 0, which is a separate existing rule and does not change the charts.
- **Empty values:** excluded from charts, counted in the coverage donut and shown next to each chart.
- **Where the code lives:** the builder should find the existing column definitions and column-state code and extend them, not add a parallel system.

## Constraints

- AG Grid Community 32.3.9 is in use. It has no built-in charts, and sparklines are Enterprise-only.
- Svelte 5 (runes), with the grid through ag-grid-svelte5.
- Column settings already persist in localStorage. The chart on/off state joins them.
- Movie content type and loaded client mode are the only places the feature runs. The builder must find how the app identifies both.
- Numeric rating fields use the valid_integer_range domain (0–10000), per the repo's CLAUDE.md.

## Testing

The popover and the chart are stateful, so each state needs a test:

- Chart off, and chart on for each of the ten types.
- Changing the type re-renders the chart and does not refetch.
- The chart type resets to the column's default on the next open.
- Charts are absent in server "all" mode and for non-movie content types.
- Std dev is shown only in summary stats and only in loaded mode.
- Empty values are excluded from charts and counted in the donut.

## Left to the builder

- The binning rule for histogram, line, and pie (bin count or bin width).
- The density smoothing method and bandwidth.
- The exact way to find the movie content type and loaded mode in the code.
- How the popover is positioned and dismissed.
- Keyboard and screen-reader support for the picker and the chart.

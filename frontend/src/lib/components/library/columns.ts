/**
 * Builds the Library grid's ColDefs from the column module. Each column's grid props come from its
 * definition; this adds what only the grid knows: right alignment, the header width floor, the
 * header's chart button, and the perspective header component (a Svelte component, so it lives here
 * rather than in the module).
 *
 * The chart header hooks come from the component because they read its live state
 * (which columns are chart-eligible in the current view).
 */
import type { ColDef } from '@ag-grid-community/core';
import type { ContentItem } from '#lib/queries/content/index.js';
import { PerspectiveHeaderRenderer } from '#lib/utils/formatting.js';
import { headerMinWidth } from '#lib/utils/grid-header-width.js';
import { GRID_COLUMNS, initiallyHidden } from '#lib/utils/libraryColumns/index.js';

export interface LibraryColumnHooks {
	/** Header template params for a chart-eligible column; re-read on every header refresh. */
	chartHeaderParams: (colId: string, label: string) => { template?: string };
	/** Keeps header keyboard events on the chart button from reaching the grid. */
	suppressChartKeyboard: (params: { event: KeyboardEvent }) => boolean;
}

/** Header components a definition can name (the Svelte components the module cannot import). */
const HEADER_COMPONENTS = { perspective: PerspectiveHeaderRenderer } as const;

// flex = clamp-like: proportional sizing with min/max constraints
// minWidth is auto-derived from headerName unless explicitly set (e.g. Item = 200)
export function buildLibraryColumnDefs({
	chartHeaderParams,
	suppressChartKeyboard,
}: LibraryColumnHooks): ColDef<ContentItem>[] {
	return GRID_COLUMNS.map((def) => {
		const colId = def.colId;
		const headerName = def.label;
		const grid = def.grid as ColDef<ContentItem>;
		const sortable = def.sort === false ? false : grid.sortable;
		const charted = (def.chart?.length ?? 0) > 0;
		return {
			colId,
			headerName,
			hide: initiallyHidden(colId),
			...(def.numeric ? { type: 'rightAligned' } : {}),
			...(def.sort === false ? { sortable: false } : {}),
			...grid,
			...(def.headerComponent ? { headerComponent: HEADER_COMPONENTS[def.headerComponent] } : {}),
			...(def.tooltip !== undefined ? { context: { tooltipSpec: def.tooltip } } : {}),
			// Never narrower than the whole heading + sort arrow + funnel. An explicit minWidth only
			// raises the floor (for cell content, e.g. Item's thumbnail and title); it can't lower it.
			minWidth: Math.max(
				grid.minWidth ?? 0,
				headerMinWidth(headerName, { filter: grid.filter !== false, sortable: sortable !== false }),
			),
			// Columns that can chart in some view keep the stock grid header, with a chart button added
			// to its template (outside the label, so it never sorts). The params are re-evaluated whenever
			// the header is rebuilt (refreshHeader).
			...(charted
				? {
						headerComponentParams: () => chartHeaderParams(colId, headerName),
						suppressHeaderKeyboardEvent: suppressChartKeyboard,
					}
				: {}),
		} as ColDef<ContentItem>;
	});
}

import type { CellClassParams, ValueFormatterParams } from '@ag-grid-community/core';
import { EMPTY_VALUE } from './formatting';

/** Class on any cell or inline text showing the empty marker; styled once in app.css. */
export const EMPTY_CLASS = 'empty-marker';

export function isEmptyMarker(v: unknown): boolean {
	return v === EMPTY_VALUE;
}

/**
 * AG Grid `cellClassRules` for `defaultColDef`. A cell class rule only receives the raw `value`
 * (no formatted value), so run the column's own `valueFormatter` to learn what the user will
 * see; a column without a formatter is judged on its raw value.
 */
export const emptyCellClassRules: Record<string, (p: CellClassParams) => boolean> = {
	[EMPTY_CLASS]: (p) => {
		const format = p.colDef?.valueFormatter;
		const shown = typeof format === 'function' ? format(p as unknown as ValueFormatterParams) : p.value;
		return isEmptyMarker(shown);
	},
};

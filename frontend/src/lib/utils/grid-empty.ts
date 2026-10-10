import { EMPTY_VALUE } from './formatting';

/** Class on any cell or inline text showing the empty marker; styled once in app.css. */
export const EMPTY_CLASS = 'empty-marker';

export function isEmptyMarker(v: unknown): boolean {
	return v === EMPTY_VALUE;
}

/** AG Grid `cellClassRules` for `defaultColDef`: a valueFormatter can only return text, so the style rides a class. */
export const emptyCellClassRules: Record<string, (p: { value?: unknown; formattedValue?: unknown }) => boolean> = {
	[EMPTY_CLASS]: (p) => isEmptyMarker(p.formattedValue ?? p.value),
};

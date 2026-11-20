/**
 * Plain-text table behind the Library's export and print actions. Pure functions, no DOM: the grid
 * supplies its visible columns and rows, and this turns them into strings a spreadsheet or a
 * printed page can show.
 */
import type { ContentItem } from '#lib/queries/content/index.js';
import { bookAuthors } from './bookFormatting';
import { EMPTY_VALUE, moviePeople } from './formatting';
import { webPageRoleLabel, webPageRolesOf } from './webPage';

export type ExportMode = 'spreadsheet' | 'print';

export interface ExportColumn {
	colId: string;
	header: string;
}

export interface ExportTable {
	/** Aligned with `headers`; the Link column's id is `'link'`. */
	columnIds: string[];
	headers: string[];
	rows: string[][];
	/** Each row's `url` (null when it has none), in both modes. */
	rowUrls: (string | null)[];
}

/** Columns whose grid cell is drawn by a renderer with no value to read; their text comes from the row. */
export const RENDERED_TEXT_COLIDS = ['item', 'category', 'cast', 'webRoles', 'author'] as const;

/** Columns that are controls, not data, and never appear in an export. */
export const EXPORT_EXCLUDED_COLIDS = ['perspectize', 'listen'] as const;

/**
 * Columns whose raw number is not a quantity to sum, so a spreadsheet keeps the grid's text:
 * Length's raw value is seconds (the cell reads "2:41"); My quality, importance and agreement are
 * stored 0-10000 but shown 0-100; TMDB ID is an identifier.
 */
export const SPREADSHEET_FORMATTED_COLIDS = ['duration', 'myQuality', 'myImportance', 'myAgreement', 'tmdbId'] as const;

const LINK_COLID = 'link';
const LINK_HEADER = 'Link';
const URL_COLID = 'url';

const FORMULA_START = /^[=+\-@\t\r]/;
// Signed numbers and percentages read as numbers, not formulas, so they keep their sign.
const NUMERIC_TEXT = /^[-+]?\d+([.,]\d+)*%?$/;

/** Prefixes a single quote when a spreadsheet would otherwise run the text as a formula. */
export function neutralizeFormula(text: string): string {
	if (!FORMULA_START.test(text) || NUMERIC_TEXT.test(text)) return text;
	return `'${text}`;
}

/** The text a cell shows: renderer-only columns read it from the row, the rest from the grid value. */
export function exportCellText(row: ContentItem, colId: string, gridValue: unknown): string {
	switch (colId) {
		case 'item':
			return row.displayTitle || row.name;
		case 'category':
			return row.primaryCategory?.label ?? '';
		case 'cast':
			return moviePeople(row)
				.map((p) => p.name)
				.join(', ');
		case 'author':
			return bookAuthors(row)
				.map((a) => a.name)
				.join(', ');
		case 'webRoles':
			return webPageRolesOf(row).map(webPageRoleLabel).join(', ');
		default: {
			if (gridValue === null || gridValue === undefined) return '';
			const text = String(gridValue);
			return text === EMPTY_VALUE ? '' : text;
		}
	}
}

/**
 * A spreadsheet cell's plain number (no grouping, units or abbreviation), or null when the cell keeps
 * its formatted text: a non-number, a non-finite number, or a column in SPREADSHEET_FORMATTED_COLIDS.
 * % Liked, vs budget and the money columns hold the number their header names (percent, whole
 * dollars), so they pass through unscaled.
 */
export function spreadsheetNumberText(colId: string, rawValue: unknown): string | null {
	if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null;
	const keepFormatted: readonly string[] = [...SPREADSHEET_FORMATTED_COLIDS, ...RENDERED_TEXT_COLIDS];
	return keepFormatted.includes(colId) ? null : String(rawValue);
}

export function buildExportTable(input: {
	columns: ExportColumn[];
	rows: ContentItem[];
	cellText: (row: ContentItem, colId: string) => string;
	mode: ExportMode;
}): ExportTable {
	const { columns, rows, cellText, mode } = input;
	const spreadsheet = mode === 'spreadsheet';
	const addLink = spreadsheet && !columns.some((c) => c.colId === URL_COLID);
	const format = spreadsheet ? neutralizeFormula : (text: string) => text;

	const columnIds = columns.map((c) => c.colId);
	const headers = columns.map((c) => c.header);
	if (addLink) {
		columnIds.push(LINK_COLID);
		headers.push(LINK_HEADER);
	}

	return {
		columnIds,
		headers,
		rows: rows.map((row) => {
			const cells = columns.map((c) => format(cellText(row, c.colId)));
			if (addLink) cells.push(format(row.url ?? ''));
			return cells;
		}),
		rowUrls: rows.map((row) => row.url ?? null),
	};
}

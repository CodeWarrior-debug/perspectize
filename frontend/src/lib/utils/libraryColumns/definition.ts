/**
 * The shape of one Library column. Every fact about a column (its label, how it reads a row,
 * how it sorts and filters on the server, what it is worth in an export, which default views
 * show it) is written once, on a `LibraryColumn`. The modules below derive every list and map the
 * Library uses from these entries (see index.ts).
 */
import type { ColDef } from '@ag-grid-community/core';
import type { ContentItem } from '#lib/queries/content/index.js';
import type { ColTooltipSpec } from '#lib/utils/tooltipSpec.js';
import type { ColumnView, ResponsiveTier } from '#lib/utils/grid-config.js';
import type { ContentFilterInput } from './filterCodec';

/** A row value a sort or filter reads: the number or text the column orders and matches by. */
export type RowValue = string | number | null;

/** How a column sorts. `false` on the column means it has no sort at all. */
export interface SortRule {
	/** Backend ContentSortBy value for "All Items" mode; omitted when the server cannot sort it. */
	server?: string;
	/** Row value for client-side sorting ("Loaded" mode and the mobile card list). */
	client?: (row: ContentItem) => RowValue;
	/**
	 * Client-side only: the backend has no matching sort key, so the column is disabled in
	 * "All Items" mode, where a header click or picker entry would otherwise do nothing.
	 */
	clientOnly?: boolean;
	/** False when the grid can sort on it (a header click) but the sort picker does not offer it. */
	pickable?: boolean;
}

/** How a column's header filter reads a value from the URL and how it matches rows client-side. */
export interface FilterRule {
	/** URL `f.<key>=` param. */
	key: string;
	/** Which filter the column's header offers; selects the URL value syntax. */
	kind: 'text' | 'number' | 'date' | 'set';
	/** Row value matched client-side (the mobile card list in "Loaded" mode). Absent: not matched client-side. */
	client?: (row: ContentItem) => RowValue;
	/** Date filters only: the URL keeps the day (`YYYY-MM-DD`) instead of the month. */
	day?: boolean;
	/**
	 * Turns this column's URL value into GraphQL ContentFilter fields for "All Items" mode.
	 * Absent with `clientOnly` set means the filter is applied in "Loaded" mode only.
	 */
	server?: (value: string) => Partial<ContentFilterInput>;
	/** Explicitly client-only (no server field yet). The URL value is kept, but never sent to the server. */
	clientOnly?: boolean;
}

/** Default visibility tier per view: the column shows from this responsive tier up. */
export type ViewTiers = Partial<Record<ColumnView, ResponsiveTier>>;

export interface LibraryColumn {
	colId: string;
	/** Header text ('' for the chrome column). */
	label: string;
	/** Column-picker visibility: 'data' (every user), 'admin' (admins only), 'none' (never offered). */
	picker: 'data' | 'admin' | 'none';
	/** Grid column props (widths, renderers, value getters, comparators, header tooltip). colId and headerName come from above. */
	grid: Omit<ColDef<ContentItem>, 'colId' | 'headerName'>;
	/** Hover popover spec (`false` = no popover). */
	tooltip?: ColTooltipSpec;
	sort: SortRule | false;
	filter?: FilterRule;
	/** Right-aligned cells and header, and eligible for `type: 'rightAligned'`. */
	numeric?: boolean;
	/** Views whose Loaded-mode header offers a chart button for this column. */
	chart?: readonly ColumnView[];
	/**
	 * The grid's `hide` flag before the responsive effect runs on gridReady. Only set where it differs
	 * from `initiallyHidden` (the derived value): set explicitly so the flag does not flip on first paint.
	 */
	initialHide?: boolean;
	/** Shows in the CSV and copy exports (default true). */
	exported?: boolean;
	/** Export text for a renderer-only column: its cell has no value to read, so the text comes from the row. */
	exportText?: (row: ContentItem) => string;
	/** Spreadsheet export keeps the grid's formatted text rather than the raw number. */
	spreadsheetFormatted?: boolean;
	/** Default visibility per view. Absent views never show it by default. */
	views?: ViewTiers;
	/** Hidden by default in a view that names one type (Type column). */
	soloHidden?: boolean;
	/**
	 * The layout never forces this column on or off (the row chrome, the ids and the timestamp
	 * the user can always reach from the picker). Every other column is forced to its view's default.
	 */
	unmanaged?: boolean;
	/** Header component key (the chrome column's perspective header); resolved by the grid builder. */
	headerComponent?: 'perspective';
}

/** Every view a column can belong to, in the order the defaults are listed. */
export const LIBRARY_VIEWS: readonly ColumnView[] = ['general', 'movie', 'book', 'webpage', 'claim'];

export type { ColumnView, ResponsiveTier };

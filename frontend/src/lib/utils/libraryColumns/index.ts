/**
 * The Library column module: the one interface the grid, the pickers, the URL codec, the chart
 * and the exports ask about a column. Every list and map here is derived from LIBRARY_COLUMNS,
 * which lists each column once (see definition.ts for what a column carries).
 */
import type { ContentItem } from '#lib/queries/content/index.js';
import { EMPTY_VALUE } from '#lib/utils/formatting.js';
import { columnViewFor, type ColumnView, type ResponsiveTier } from '#lib/utils/grid-config.js';
import type { LibraryColumn } from './definition';
import {
	perspectizeColumn,
	itemColumn,
	typeColumn,
	categoryColumn,
	effectiveDateColumn,
	evaluateByColumn,
	myQualityColumn,
	myImportanceColumn,
	myAgreementColumn,
	publishDateColumn,
	channelColumn,
	userColumn,
	tagsColumn,
	descriptionColumn,
	durationColumn,
	viewsColumn,
	likesColumn,
} from './columnsGeneral';
import {
	genreColumn,
	ratedColumn,
	castColumn,
	releasedColumn,
	boxOfficeColumn,
	vsBudgetColumn,
	tmdbScoreColumn,
	budgetColumn,
	votesColumn,
	collectionColumn,
	synopsisColumn,
	tmdbIdColumn,
} from './columnsMovie';
import {
	authorColumn,
	publishedColumn,
	pagesColumn,
	bookRatingColumn,
	editionsColumn,
	readersColumn,
	webSiteColumn,
	webPublishedColumn,
	webRolesColumn,
	webAuthorColumn,
} from './columnsBookWeb';
import {
	createdAtColumn,
	updatedAtColumn,
	contentIdColumn,
	addedByUserIdColumn,
	sourceUrlColumn,
} from './columnsInternal';

export type { LibraryColumn, RowValue, SortRule, FilterRule, ViewTiers } from './definition';
export type { ContentFilterInput } from './filterCodec';

/**
 * Every Library column, in column-picker order. The grid's own column order is this same order.
 * `perspectize` and `item` are the always-visible pinned columns (picker `none`).
 */
export const LIBRARY_COLUMNS: readonly LibraryColumn[] = [
	perspectizeColumn,
	itemColumn,
	typeColumn,
	categoryColumn,
	effectiveDateColumn,
	evaluateByColumn,
	myQualityColumn,
	myImportanceColumn,
	myAgreementColumn,
	genreColumn,
	ratedColumn,
	castColumn,
	durationColumn,
	viewsColumn,
	likesColumn,
	releasedColumn,
	boxOfficeColumn,
	vsBudgetColumn,
	tmdbScoreColumn,
	publishDateColumn,
	channelColumn,
	userColumn,
	tagsColumn,
	descriptionColumn,
	authorColumn,
	publishedColumn,
	pagesColumn,
	bookRatingColumn,
	webSiteColumn,
	webPublishedColumn,
	webRolesColumn,
	webAuthorColumn,
	editionsColumn,
	readersColumn,
	budgetColumn,
	votesColumn,
	collectionColumn,
	synopsisColumn,
	tmdbIdColumn,
	createdAtColumn,
	updatedAtColumn,
	contentIdColumn,
	addedByUserIdColumn,
	sourceUrlColumn,
];

const BY_ID: ReadonlyMap<string, LibraryColumn> = new Map(LIBRARY_COLUMNS.map((c) => [c.colId, c]));

/**
 * Left-to-right order of the grid's columns. It is not the picker order: Web columns sit before
 * Author, and updatedAt before createdAt. The export follows this order too.
 */
const GRID_ORDER: readonly string[] = [
	'perspectize',
	'item',
	'type',
	'category',
	'effectiveDate',
	'evaluateBy',
	'myQuality',
	'myImportance',
	'myAgreement',
	'genre',
	'rated',
	'cast',
	'duration',
	'views',
	'likes',
	'released',
	'boxOffice',
	'vsBudget',
	'tmdbScore',
	'publishDate',
	'channel',
	'user',
	'tags',
	'description',
	'webSite',
	'webPublished',
	'webRoles',
	'webAuthor',
	'author',
	'published',
	'pages',
	'rating',
	'editions',
	'readers',
	'budget',
	'votes',
	'collection',
	'synopsis',
	'tmdbId',
	'updatedAt',
	'createdAt',
	'id',
	'addedByUserID',
	'url',
];

/** Every column in grid order (the order of the ColDefs and of the export). */
export const GRID_COLUMNS: readonly LibraryColumn[] = GRID_ORDER.map((colId) => {
	const def = BY_ID.get(colId);
	if (!def) throw new Error(`GRID_ORDER names an unknown column: ${colId}`);
	return def;
});

if (GRID_COLUMNS.length !== LIBRARY_COLUMNS.length) {
	throw new Error('GRID_ORDER must list every column exactly once');
}

/** The definition for a grid colId, or undefined for an unknown or retired one. */
export function libraryColumn(colId: string): LibraryColumn | undefined {
	return BY_ID.get(colId);
}

/** Removed columns that saved links and column setups may still name; they are dropped on load. */
export const RETIRED_COL_IDS: ReadonlySet<string> = new Set(['percentLiked']);

// ---------------------------------------------------------------------------
// Picker lists
// ---------------------------------------------------------------------------

/** Column-picker registry entry: the fields ColumnPickerDialog and SortPickerDialog need. */
export interface TogglableColumn {
	colId: string;
	label: string;
}

const asTogglable = (c: LibraryColumn): TogglableColumn => ({ colId: c.colId, label: c.label });

/** Data columns every user can show/hide, in column-picker order. */
export const DATA_COLUMNS: readonly TogglableColumn[] = LIBRARY_COLUMNS.filter((c) => c.picker === 'data').map(
	asTogglable,
);

/** Internal columns, offered only to admins. All hidden by default. */
export const INTERNAL_COLUMNS: readonly TogglableColumn[] = LIBRARY_COLUMNS.filter((c) => c.picker === 'admin').map(
	asTogglable,
);

/** Every colId the user may toggle, given their admin status. */
export function togglableColIds(isAdmin: boolean): string[] {
	return [...DATA_COLUMNS.map((c) => c.colId), ...(isAdmin ? INTERNAL_COLUMNS.map((c) => c.colId) : [])];
}

/** Every column the sort picker can add to a multi-column sort, with its label. */
export const SORTABLE_COLUMNS: readonly TogglableColumn[] = LIBRARY_COLUMNS.filter(
	(c) => c.sort && c.sort.pickable !== false,
).map(asTogglable);

/** Columns with no server sort key: sortable in "Loaded" mode only. */
export const CLIENT_ONLY_SORT_COLS: readonly string[] = LIBRARY_COLUMNS.filter((c) => c.sort && c.sort.clientOnly).map(
	(c) => c.colId,
);

/** The sort picker's columns for a data mode; client-only columns are offered in "Loaded" mode alone. */
export function sortableColumnsFor(mode: 'all' | 'loaded'): readonly TogglableColumn[] {
	return mode === 'loaded'
		? SORTABLE_COLUMNS
		: SORTABLE_COLUMNS.filter((c) => !CLIENT_ONLY_SORT_COLS.includes(c.colId));
}

/** colId → canonical label, for every column with a non-empty label (FilterChips' chip text). */
export const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
	LIBRARY_COLUMNS.filter((c) => c.label.length > 0).map((c) => [c.colId, c.label]),
);

// ---------------------------------------------------------------------------
// Sort and filter maps
// ---------------------------------------------------------------------------

/** AG Grid colId → GraphQL ContentSortBy, for every column with a server sort (including `type` → NAME). */
export const COL_TO_SORT: Record<string, string> = Object.fromEntries(
	LIBRARY_COLUMNS.filter((c) => c.sort && c.sort.server).map((c) => [c.colId, (c.sort as { server: string }).server]),
);

/**
 * GraphQL ContentSortBy → AG Grid colId. The first colId per server key in column order wins, so an
 * aliased column (`type`, after `item`, both → NAME) never takes the canonical one.
 */
export const SORT_TO_COL: Record<string, string> = (() => {
	const map: Record<string, string> = {};
	for (const c of LIBRARY_COLUMNS) {
		const server = c.sort && c.sort.server;
		if (server && !(server in map)) map[server] = c.colId;
	}
	return map;
})();

/** AG Grid colId → URL `f.*` param key, for every column with a URL filter. */
export const COL_TO_FILTER_KEY: Record<string, string> = Object.fromEntries(
	LIBRARY_COLUMNS.filter((c) => c.filter).map((c) => [c.colId, c.filter!.key]),
);

/** Columns whose `f.*` params are number ranges, date ranges, or checkbox lists. */
export const NUMBER_RANGE_COLS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.filter?.kind === 'number').map((c) => c.colId),
);
export const DATE_RANGE_COLS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.filter?.kind === 'date').map((c) => c.colId),
);
export const SET_FILTER_COLS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.filter?.kind === 'set').map((c) => c.colId),
);
/** Date-range columns whose URL values keep the day (`YYYY-MM-DD`) instead of the month. */
export const DAY_DATE_COLS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.filter?.day).map((c) => c.colId),
);

/** Filterable colIds that have no GraphQL field and are applied in "Loaded" mode only. */
export const CLIENT_ONLY_FILTER_COLS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.filter?.clientOnly).map((c) => c.colId),
);

// ---------------------------------------------------------------------------
// Right alignment, charts, export
// ---------------------------------------------------------------------------

/** Columns whose cells are numbers: right-aligned, header included, so digits line up down the column. */
export const NUMERIC_COL_IDS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.numeric).map((c) => c.colId),
);

/** Columns that can chart in some view; their headers carry the chart button. */
export const CHART_ELIGIBLE_COLS: ReadonlySet<string> = new Set(
	LIBRARY_COLUMNS.filter((c) => c.chart && c.chart.length > 0).map((c) => c.colId),
);

/** Whether a column charts in the view the type filter names (Movie for the TMDB columns, Book for pages and rating). */
export function isChartEligible(colId: string, typeFilter: string | undefined): boolean {
	return libraryColumn(colId)?.chart?.includes(columnViewFor(typeFilter)) ?? false;
}

/** Columns that charts can show for the type filter, in column order. */
export function chartableColIds(typeFilter: string | undefined): string[] {
	return [...CHART_ELIGIBLE_COLS].filter((c) => isChartEligible(c, typeFilter));
}

/** Columns left out of the CSV and copy exports (the row's perspective control). */
export const EXPORT_EXCLUDED_COLIDS: readonly string[] = LIBRARY_COLUMNS.filter((c) => c.exported === false).map(
	(c) => c.colId,
);

/** Columns whose export text comes from the row, since their grid cell has no value to read. */
export const RENDERED_TEXT_COLIDS: readonly string[] = LIBRARY_COLUMNS.filter((c) => c.exportText).map((c) => c.colId);

/** Columns whose spreadsheet cell keeps the grid's formatted text (length as "2:41", identifiers, 0-100 ratings). */
export const SPREADSHEET_FORMATTED_COLIDS: readonly string[] = LIBRARY_COLUMNS.filter(
	(c) => c.spreadsheetFormatted,
).map((c) => c.colId);

/** The text a cell shows in an export: renderer-only columns read it from the row, the rest from the grid value. */
export function exportCellText(row: ContentItem, colId: string, gridValue: unknown): string {
	const exportText = libraryColumn(colId)?.exportText;
	if (exportText) return exportText(row);
	if (gridValue === null || gridValue === undefined) return '';
	const text = String(gridValue);
	return text === EMPTY_VALUE ? '' : text;
}

// ---------------------------------------------------------------------------
// Default visibility (responsive tiers x default views)
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ResponsiveTier, number> = { xs: 0, sm: 1, md: 2, lg: 3 };

/**
 * The columns a view shows at a responsive tier. The Movie set applies with the type filter exactly
 * MOVIE, and so on. A solo view (or an explicit solo type) hides the Type column, since it is
 * redundant once the filter names one type. Managed columns outside `visible` are forced off.
 */
export function defaultColumnVisibility(
	tier: ResponsiveTier,
	view: ColumnView,
	soloType: string | null = null,
): { visible: string[]; hidden: string[] } {
	// A solo view implies its solo type, so Type is hidden even when the caller passes none.
	const solo = soloType ?? (view === 'general' ? null : view);
	const visible = LIBRARY_COLUMNS.filter((c) => {
		const shownFrom = c.views?.[view];
		if (!shownFrom || TIER_RANK[tier] < TIER_RANK[shownFrom]) return false;
		return !(c.soloHidden && solo !== null);
	}).map((c) => c.colId);
	const shown = new Set(visible);
	const hidden = LIBRARY_COLUMNS.filter((c) => !c.unmanaged && !shown.has(c.colId)).map((c) => c.colId);
	return { visible, hidden };
}

const GENERAL_LG_VISIBLE: ReadonlySet<string> = new Set(defaultColumnVisibility('lg', 'general').visible);

/**
 * Whether a column starts hidden, before the responsive visibility effect runs on grid ready: hidden
 * unless the general set shows it at the widest tier.
 */
export function initiallyHidden(colId: string): boolean {
	const def = BY_ID.get(colId);
	if (def?.initialHide !== undefined) return def.initialHide;
	return !GENERAL_LG_VISIBLE.has(colId);
}

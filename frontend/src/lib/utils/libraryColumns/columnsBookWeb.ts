/**
 * Book (Open Library) and Webpage columns. BOOK rows read their `book` JSON (bookFormatting.ts);
 * WEB_PAGE rows read their shaped `webPage` JSON (webPage.ts). Each set is shown by default only
 * when the type filter is exactly that type.
 */
import { EMPTY_VALUE } from '#lib/utils/formatting.js';
import {
	authorCellRenderer,
	authorValueGetter,
	bookAuthors,
	editionsValueGetter,
	formatBookRating,
	formatReaders,
	hasLowRatingCount,
	pagesValueGetter,
	publishedValueGetter,
	ratingValueGetter,
	readersValueGetter,
} from '#lib/utils/bookFormatting.js';
import { unknownLastComparator } from '#lib/utils/grid-config.js';
import { WebRoleFilter } from '#lib/utils/contentTypeFilter.js';
import {
	webAuthorCellRenderer,
	webPublishedFilterValueGetter,
	webPublishedValueGetter,
	webRolesCellRenderer,
	webSiteCellRenderer,
	formatWebPublished,
} from '#lib/utils/webPageFormatting.js';
import {
	WEB_PAGE_ROLE_OPTIONS,
	webPageAuthor,
	webPagePublished,
	webPageRoleLabel,
	webPageRolesOf,
	webPageSite,
} from '#lib/utils/webPage.js';
import type { WebPageRole } from '#lib/queries/content/index.js';
import { TIP } from './tooltips';
import { numberRangeFields, parseSetValue, textField, type ContentFilterInput } from './filterCodec';
import type { LibraryColumn } from './definition';

/** Known web role set values: lowercased in the URL; the server gets the enum name, and rejects anything else. */
function webRoleFields(value: string): Partial<ContentFilterInput> {
	const known = new Set(WEB_PAGE_ROLE_OPTIONS.map((o) => o.value.toLowerCase()));
	const roles = parseSetValue(value)
		.filter((v) => known.has(v))
		.map((v) => v.toUpperCase() as WebPageRole);
	return roles.length > 0 ? { webPageRoles: roles } : {};
}

const lowerOrNull = (value: string | null | undefined): string | null => value?.toLowerCase() ?? null;

// Book columns. Author sorts on the server (AUTHOR); the rest sort in "Loaded" mode only.
export const authorColumn: LibraryColumn = {
	colId: 'author',
	label: 'Author',
	picker: 'data',
	sort: { server: 'AUTHOR', client: (row) => lowerOrNull(authorValueGetter({ data: row })) },
	filter: {
		key: 'author',
		kind: 'text',
		client: (row) => lowerOrNull(authorValueGetter({ data: row })),
		server: textField('authorContains'),
	},
	views: { book: 'sm' },
	tooltip: TIP.author,
	exportText: (row) =>
		bookAuthors(row)
			.map((a) => a.name)
			.join(', '),
	grid: {
		flex: 2,
		minWidth: 140,
		filter: 'agTextColumnFilter',
		valueGetter: authorValueGetter,
		filterValueGetter: (params) => authorValueGetter({ data: params.data }) ?? '',
		cellRenderer: authorCellRenderer,
		headerTooltip: 'Author(s) from Open Library',
	},
};

/** The first published year as a number (sorts and filters numerically); the grid shows the plain year. */
const publishedYear = (row: Parameters<typeof publishedValueGetter>[0]['data']): number | null => {
	const year = publishedValueGetter({ data: row });
	return year === null ? null : Number(year);
};

export const publishedColumn: LibraryColumn = {
	colId: 'published',
	label: 'Published',
	picker: 'data',
	sort: { clientOnly: true, client: (row) => publishedYear(row) },
	filter: {
		key: 'published',
		kind: 'number',
		client: (row) => publishedYear(row),
		server: numberRangeFields('minPublishYear', 'maxPublishYear'),
	},
	views: { book: 'md' },
	grid: {
		flex: 0.8,
		minWidth: 105,
		// Raised to fit the header floor ("Published" + sort arrow, order number and funnel).
		maxWidth: 140,
		filter: 'agNumberColumnFilter',
		valueGetter: (params) => publishedYear(params.data),
		comparator: unknownLastComparator,
		valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
		headerTooltip: 'First published year',
	},
};

export const pagesColumn: LibraryColumn = {
	colId: 'pages',
	label: 'Pages',
	picker: 'data',
	sort: { clientOnly: true, client: (row) => pagesValueGetter({ data: row }) },
	filter: {
		key: 'pages',
		kind: 'number',
		client: (row) => pagesValueGetter({ data: row }),
		server: numberRangeFields('minPages', 'maxPages'),
	},
	numeric: true,
	chart: ['book'],
	views: { book: 'md' },
	grid: {
		flex: 0.6,
		minWidth: 70,
		// Raised to fit the header floor ("Pages" + sort arrow, order number and funnel).
		maxWidth: 120,
		filter: 'agNumberColumnFilter',
		valueGetter: pagesValueGetter,
		comparator: unknownLastComparator,
		valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
		headerTooltip: 'Median page count across editions',
	},
};

export const bookRatingColumn: LibraryColumn = {
	colId: 'rating',
	label: 'Book rating',
	picker: 'data',
	sort: { clientOnly: true, client: (row) => ratingValueGetter({ data: row }) },
	filter: {
		key: 'bookrating',
		kind: 'number',
		client: (row) => ratingValueGetter({ data: row }),
		server: numberRangeFields('minBookRating', 'maxBookRating'),
	},
	numeric: true,
	chart: ['book'],
	views: { book: 'lg' },
	tooltip: TIP.rating,
	grid: {
		flex: 0.7,
		minWidth: 128,
		// Raised to fit the header floor ("Book rating" + sort arrow, order number and funnel).
		maxWidth: 160,
		filter: 'agNumberColumnFilter',
		valueGetter: ratingValueGetter,
		comparator: unknownLastComparator,
		valueFormatter: (params) => formatBookRating(params.value),
		// Muted when the rating rests on fewer than 5 ratings. A colDef `cellClass` replaces the one
		// `type: 'rightAligned'` adds, so the alignment class is repeated here.
		cellClass: (params) => [
			'ag-right-aligned-cell',
			...(hasLowRatingCount({ data: params.data }) ? ['text-muted-foreground'] : []),
		],
		headerTooltip: 'Open Library community rating out of 5. Muted when fewer than 5 ratings.',
	},
};

export const editionsColumn: LibraryColumn = {
	colId: 'editions',
	label: 'Editions',
	picker: 'data',
	sort: false,
	grid: {
		flex: 0.6,
		minWidth: 80,
		maxWidth: 110,
		sortable: false,
		filter: false,
		valueGetter: editionsValueGetter,
		valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
		headerTooltip: 'Number of editions',
	},
};

// Open Library "want to read" count; the hover popover has the full breakdown. Picker-only,
// sorts in "Loaded" mode only, no filter (the server has no field for it).
export const readersColumn: LibraryColumn = {
	colId: 'readers',
	label: 'Readers',
	picker: 'data',
	sort: { clientOnly: true, client: (row) => readersValueGetter({ data: row }) },
	tooltip: TIP.readers,
	grid: {
		flex: 0.6,
		minWidth: 90,
		maxWidth: 120,
		filter: false,
		valueGetter: readersValueGetter,
		comparator: unknownLastComparator,
		valueFormatter: (params) => formatReaders(params.value),
		headerTooltip: 'Open Library members who want to read this. Open Library users only, not readers in general.',
	},
};

// Webpage columns. Site and Published show from sm and md up. Site, Published and Author are
// client-only filters until the server fields land (see the PR's follow-up note).
export const webSiteColumn: LibraryColumn = {
	colId: 'webSite',
	label: 'Site',
	picker: 'data',
	sort: { client: (row) => lowerOrNull(webPageSite(row)) },
	filter: {
		key: 'site',
		kind: 'text',
		client: (row) => lowerOrNull(webPageSite(row)),
		clientOnly: true,
	},
	views: { webpage: 'sm' },
	tooltip: TIP.webSite,
	grid: {
		flex: 1,
		maxWidth: 200,
		filter: 'agTextColumnFilter',
		valueGetter: (params) => webPageSite({ url: params.data?.url ?? null, webPage: params.data?.webPage }),
		filterValueGetter: (params) => webPageSite({ url: params.data?.url ?? null, webPage: params.data?.webPage }) ?? '',
		cellRenderer: webSiteCellRenderer,
		headerTooltip: 'Site name the page declares, or its domain',
	},
};

export const webPublishedColumn: LibraryColumn = {
	colId: 'webPublished',
	label: 'Published',
	picker: 'data',
	// Same backend key as the YouTube Date column: publishedAt sorts every type.
	sort: { server: 'PUBLISHED_AT', client: (row) => webPagePublished(row) },
	filter: {
		key: 'webdate',
		kind: 'date',
		client: (row) => webPagePublished(row),
		clientOnly: true,
	},
	views: { webpage: 'md' },
	tooltip: TIP.webPublished,
	grid: {
		flex: 0.8,
		minWidth: 105,
		maxWidth: 150,
		filter: 'agDateColumnFilter',
		valueGetter: (params) => webPublishedValueGetter({ data: params.data }),
		filterValueGetter: (params) => webPublishedFilterValueGetter({ data: params.data }),
		valueFormatter: (params) => formatWebPublished(params.value),
		headerTooltip: 'Date the page declares it was published',
	},
};

// Server filter only (f.webrole): a page can carry both roles, which the client cannot match on the card list.
export const webRolesColumn: LibraryColumn = {
	colId: 'webRoles',
	label: 'Roles',
	picker: 'data',
	sort: false,
	filter: { key: 'webrole', kind: 'set', server: webRoleFields },
	tooltip: TIP.webRoles,
	exportText: (row) => webPageRolesOf(row).map(webPageRoleLabel).join(', '),
	grid: {
		flex: 1,
		maxWidth: 220,
		sortable: false,
		filter: WebRoleFilter,
		cellRenderer: webRolesCellRenderer,
		headerTooltip: 'What the page is for, as set by whoever added it',
	},
};

export const webAuthorColumn: LibraryColumn = {
	colId: 'webAuthor',
	label: 'Author',
	picker: 'data',
	sort: { clientOnly: true, client: (row) => lowerOrNull(webPageAuthor(row)) },
	filter: {
		key: 'webauthor',
		kind: 'text',
		client: (row) => lowerOrNull(webPageAuthor(row)),
		clientOnly: true,
	},
	tooltip: TIP.webAuthor,
	grid: {
		flex: 1.2,
		minWidth: 120,
		filter: 'agTextColumnFilter',
		valueGetter: (params) => webPageAuthor({ url: params.data?.url ?? null, webPage: params.data?.webPage }),
		filterValueGetter: (params) =>
			webPageAuthor({ url: params.data?.url ?? null, webPage: params.data?.webPage }) ?? '',
		cellRenderer: webAuthorCellRenderer,
		headerTooltip: 'Author the page declares',
	},
};

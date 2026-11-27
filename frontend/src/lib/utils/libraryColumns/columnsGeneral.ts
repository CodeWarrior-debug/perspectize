/**
 * General (YouTube and other non-single-type views) and claim columns. Column order within this
 * file is not the registry order; index.ts lists the columns in picker order.
 */
import {
	typeCellRenderer,
	categoryCellRenderer,
	perspectiveCellRenderer,
	durationValueGetter,
	durationFilterValueGetter,
	parseDurationInput,
	formatDurationSeconds,
	formatCount,
	formatPublishDate,
	formatClaimDate,
	formatRatingScore,
	formatTags,
	contentTags,
	truncateDescription,
} from '#lib/utils/formatting.js';
import {
	capitalizeContentType,
	durationComparator,
	labelComparator,
	perspectiveRating,
	releasedComparator,
	CONTENT_TYPE_OPTIONS,
} from '#lib/utils/grid-config.js';
import { libraryItemCellRenderer } from '#lib/utils/libraryItemCellRenderer.js';
import { ContentTypeFilter } from '#lib/utils/contentTypeFilter.js';
import { TIP } from './tooltips';
import { numberRangeFields, dateRangeFields, parseSetValue, textField, type ContentFilterInput } from './filterCodec';
import type { LibraryColumn } from './definition';

/** Known content-type set values: lowercased in the URL, upper-cased for the server, which rejects anything else. */
export function setTypeFields(value: string): Partial<ContentFilterInput> {
	const known = new Set(CONTENT_TYPE_OPTIONS.map((o) => o.value));
	const types = parseSetValue(value)
		.filter((v) => known.has(v))
		.map((v) => v.toUpperCase());
	return types.length > 0 ? { contentTypes: types } : {};
}

export const perspectizeColumn: LibraryColumn = {
	colId: 'perspectize',
	label: '',
	picker: 'none',
	headerComponent: 'perspective',
	unmanaged: true,
	sort: false,
	exported: false,
	views: { general: 'xs', movie: 'xs', book: 'xs', webpage: 'xs', claim: 'xs' },
	tooltip: TIP.perspectize,
	grid: {
		pinned: 'left', // stays visible when the grid scrolls horizontally
		lockPinned: true,
		flex: 0,
		width: 50,
		minWidth: 50,
		maxWidth: 50,
		sortable: false,
		filter: false,
		resizable: false,
		cellRenderer: perspectiveCellRenderer,
		cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },
		headerTooltip: 'Perspectize — add or edit your perspective',
	},
};

export const itemColumn: LibraryColumn = {
	colId: 'item',
	label: 'Item',
	picker: 'none',
	unmanaged: true,
	sort: { server: 'NAME', client: (row) => row.name?.toLowerCase() ?? null },
	exportText: (row) => row.displayTitle || row.name,
	views: { general: 'xs', movie: 'xs', book: 'xs', webpage: 'xs', claim: 'xs' },
	tooltip: TIP.item,
	grid: {
		pinned: 'left', // keeps row identity visible while scrolling right
		lockPinned: true,
		flex: 2,
		minWidth: 175, // a floor only: Item is flex 2 and grows; 10px less keeps the YouTube lg set inside 1212px
		filter: 'agTextColumnFilter',
		filterValueGetter: (params) => params.data?.name ?? '',
		cellRenderer: libraryItemCellRenderer,
		cellStyle: { padding: 0 },
		headerTooltip: 'Video title and thumbnail from YouTube API',
	},
};

export const typeColumn: LibraryColumn = {
	colId: 'type',
	label: 'Type',
	picker: 'data',
	// Sorts the grid by NAME (a header click), but the sort picker does not offer it: Item is the
	// independently sortable column for that field.
	sort: { server: 'NAME', pickable: false },
	filter: {
		key: 'type',
		kind: 'set',
		client: (row) => row.contentType?.toLowerCase() ?? null,
		server: (value) => setTypeFields(value),
	},
	views: { general: 'xs', movie: 'xs', book: 'xs' },
	soloHidden: true,
	grid: {
		flex: 0.5,
		// The cell is a single icon; minWidth comes from the header (text, sort arrow, funnel).
		maxWidth: 110,
		filter: ContentTypeFilter,
		valueGetter: (params) => capitalizeContentType(params.data?.contentType),
		cellRenderer: typeCellRenderer,
		headerTooltip: 'Content type',
	},
};

// Wikidata category label (primaryCategory). No backend sort key, so it sorts client-side only
// ("Loaded" mode and the mobile card list); disabled in "All Items" mode like the other client-only columns.
export const categoryColumn: LibraryColumn = {
	colId: 'category',
	label: 'Category',
	picker: 'data',
	initialHide: true,
	sort: { client: (row) => row.primaryCategory?.label?.toLowerCase() ?? null, clientOnly: true },
	views: { general: 'sm', webpage: 'sm', claim: 'sm' },
	tooltip: TIP.category,
	exportText: (row) => row.primaryCategory?.label ?? '',
	grid: {
		headerTooltip: 'Wikidata category',
		width: 150,
		filter: false,
		valueGetter: (params) => params.data?.primaryCategory?.label ?? null,
		comparator: labelComparator,
		cellRenderer: categoryCellRenderer,
	},
};

// Claim date columns (customFields JSON, see Content.customFields). Client-side sort only:
// the backend has no sort on custom fields, so in "All Items" mode they are not sortable.
export const effectiveDateColumn: LibraryColumn = {
	colId: 'effectiveDate',
	label: 'Effective',
	picker: 'data',
	sort: { client: (row) => row.customFields?.effectiveDate ?? null },
	views: { claim: 'md' },
	tooltip: TIP.effectiveDate,
	grid: {
		headerTooltip: 'The date the claim takes effect.',
		width: 120,
		sortable: true,
		filter: 'agDateColumnFilter',
		filterValueGetter: (params) => {
			const v = params.data?.customFields?.effectiveDate;
			return v ? new Date(`${v}T00:00:00`) : null;
		},
		comparator: releasedComparator,
		valueGetter: (params) => params.data?.customFields?.effectiveDate ?? null,
		valueFormatter: (params) => formatClaimDate(params.value),
	},
};

export const evaluateByColumn: LibraryColumn = {
	colId: 'evaluateBy',
	label: 'Evaluate by',
	picker: 'data',
	sort: { client: (row) => row.customFields?.evaluateBy ?? null },
	views: { claim: 'md' },
	tooltip: TIP.evaluateBy,
	grid: {
		headerTooltip: 'The date by which the claim should be evaluated.',
		width: 120,
		sortable: true,
		filter: 'agDateColumnFilter',
		filterValueGetter: (params) => {
			const v = params.data?.customFields?.evaluateBy;
			return v ? new Date(`${v}T00:00:00`) : null;
		},
		comparator: releasedComparator,
		valueGetter: (params) => params.data?.customFields?.evaluateBy ?? null,
		valueFormatter: (params) => formatClaimDate(params.value),
	},
};

// The viewer's own ratings on each row, read from the perspective map (perspectiveRating), not from
// the row, so they are never client-sorted.
export const myQualityColumn: LibraryColumn = {
	colId: 'myQuality',
	label: 'My overall',
	picker: 'data',
	sort: false,
	views: { claim: 'lg' },
	grid: {
		headerTooltip: 'Your overall rating of this claim (0-100).',
		width: 110,
		sortable: false,
		filter: 'agNumberColumnFilter',
		valueGetter: (params) => perspectiveRating(params.context?.perspectivesByContentId, params.data?.id, 'quality'),
		valueFormatter: (params) => formatRatingScore(params.value),
	},
	spreadsheetFormatted: true,
};

export const myImportanceColumn: LibraryColumn = {
	colId: 'myImportance',
	label: 'My importance',
	picker: 'data',
	sort: false,
	views: { claim: 'lg' },
	spreadsheetFormatted: true,
	grid: {
		headerTooltip: 'Your importance rating of this claim (0-100).',
		width: 120,
		sortable: false,
		filter: 'agNumberColumnFilter',
		valueGetter: (params) => perspectiveRating(params.context?.perspectivesByContentId, params.data?.id, 'importance'),
		valueFormatter: (params) => formatRatingScore(params.value),
	},
};

export const myAgreementColumn: LibraryColumn = {
	colId: 'myAgreement',
	label: 'My agreement',
	picker: 'data',
	sort: false,
	views: { claim: 'lg' },
	spreadsheetFormatted: true,
	grid: {
		headerTooltip: 'Your agreement rating with this claim (0-100).',
		width: 120,
		sortable: false,
		filter: 'agNumberColumnFilter',
		valueGetter: (params) => perspectiveRating(params.context?.perspectivesByContentId, params.data?.id, 'agreement'),
		valueFormatter: (params) => formatRatingScore(params.value),
	},
};

export const durationColumn: LibraryColumn = {
	colId: 'duration',
	label: 'Duration',
	picker: 'data',
	sort: { server: 'LENGTH', client: (row) => row.length },
	filter: {
		key: 'duration',
		kind: 'number',
		client: (row) => row.length,
		server: numberRangeFields('minLengthSeconds', 'maxLengthSeconds'),
	},
	numeric: true,
	chart: ['movie'],
	spreadsheetFormatted: true,
	views: { general: 'md', movie: 'md' },
	tooltip: TIP.duration,
	grid: {
		flex: 0.7,
		maxWidth: 140,
		filter: 'agNumberColumnFilter',
		filterParams: {
			allowedCharPattern: '\\d\\:',
			numberParser: parseDurationInput,
			numberFormatter: (value: number | null) => (value == null ? null : formatDurationSeconds(value)),
		},
		valueGetter: durationValueGetter,
		filterValueGetter: durationFilterValueGetter,
		comparator: durationComparator,
		headerTooltip: 'Length of the item.',
	},
};

export const viewsColumn: LibraryColumn = {
	colId: 'views',
	label: 'Views',
	picker: 'data',
	sort: { server: 'VIEW_COUNT', client: (row) => row.viewCount },
	filter: {
		key: 'views',
		kind: 'number',
		client: (row) => row.viewCount,
		server: numberRangeFields('minViewCount', 'maxViewCount'),
	},
	numeric: true,
	chart: ['movie'],
	views: { general: 'lg' },
	tooltip: TIP.views,
	grid: {
		field: 'viewCount',
		flex: 0.8,
		maxWidth: 130,
		filter: 'agNumberColumnFilter',
		valueFormatter: (params) => formatCount(params.value),
		headerTooltip: 'View count from YouTube API',
	},
};

export const likesColumn: LibraryColumn = {
	colId: 'likes',
	label: 'Likes',
	picker: 'data',
	sort: { server: 'LIKE_COUNT', client: (row) => row.likeCount },
	filter: {
		key: 'likes',
		kind: 'number',
		client: (row) => row.likeCount,
		server: numberRangeFields('minLikeCount', 'maxLikeCount'),
	},
	numeric: true,
	chart: ['movie'],
	views: { general: 'lg' },
	tooltip: TIP.likes,
	grid: {
		field: 'likeCount',
		flex: 0.8,
		maxWidth: 130,
		filter: 'agNumberColumnFilter',
		valueFormatter: (params) => formatCount(params.value),
		headerTooltip: 'Like count from YouTube API',
	},
};

export const publishDateColumn: LibraryColumn = {
	colId: 'publishDate',
	label: 'Date',
	picker: 'data',
	sort: { server: 'PUBLISHED_AT', client: (row) => row.publishedAt },
	filter: {
		key: 'date',
		kind: 'date',
		client: (row) => row.publishedAt,
		server: dateRangeFields('publishedAfter', 'publishedBefore'),
	},
	views: { general: 'md' },
	grid: {
		field: 'publishedAt',
		flex: 1,
		maxWidth: 150,
		minWidth: 130, // fits "Sep 9, 2023"-style formatted dates, not just the "Date" header label
		filter: 'agDateColumnFilter',
		filterValueGetter: (params) => {
			const val = params.data?.publishedAt;
			return val ? new Date(val) : null;
		},
		valueFormatter: (params) => formatPublishDate(params.value),
		headerTooltip: 'Publish date from YouTube API',
	},
};

export const channelColumn: LibraryColumn = {
	colId: 'channel',
	label: 'Channel',
	picker: 'data',
	sort: { server: 'CHANNEL_TITLE', client: (row) => row.channelTitle?.toLowerCase() ?? null },
	filter: {
		key: 'channel',
		kind: 'text',
		client: (row) => row.channelTitle?.toLowerCase() ?? null,
		server: textField('channelTitle'),
	},
	views: { general: 'sm' },
	grid: {
		field: 'channelTitle',
		flex: 1.2,
		maxWidth: 200,
		filter: 'agTextColumnFilter',
		headerTooltip: 'Channel name from YouTube API',
	},
};

export const userColumn: LibraryColumn = {
	colId: 'user',
	label: 'User',
	picker: 'data',
	initialHide: false,
	sort: { server: 'ADDED_BY', client: (row) => row.addedByUsername?.toLowerCase() ?? null },
	filter: {
		key: 'user',
		kind: 'text',
		client: (row) => row.addedByUsername?.toLowerCase() ?? null,
		server: textField('addedByUsername'),
	},
	grid: {
		field: 'addedByUsername',
		flex: 0.8,
		maxWidth: 160,
		filter: 'agTextColumnFilter',
		headerTooltip: 'User who added this item',
	},
};

export const tagsColumn: LibraryColumn = {
	colId: 'tags',
	label: 'Tags',
	picker: 'data',
	sort: false,
	filter: {
		key: 'tags',
		kind: 'text',
		client: (row) => formatTags(contentTags(row)).toLowerCase(),
		server: textField('tagContains'),
	},
	views: { general: 'lg', movie: 'lg', book: 'lg' },
	tooltip: TIP.tags,
	grid: {
		flex: 1.5,
		maxWidth: 250,
		sortable: false,
		filter: 'agTextColumnFilter',
		// YouTube tags, or TMDB keywords for a Movie (see contentTags).
		valueGetter: (params) => contentTags(params.data),
		filterValueGetter: (params) => formatTags(contentTags(params.data)),
		valueFormatter: (params) => formatTags(params.value),
		headerTooltip: 'Tags from YouTube API, or TMDB keywords for movies',
	},
};

export const descriptionColumn: LibraryColumn = {
	colId: 'description',
	label: 'Description',
	picker: 'data',
	sort: false,
	filter: {
		key: 'desc',
		kind: 'text',
		client: (row) => row.description?.toLowerCase() ?? null,
		server: textField('descriptionSearch'),
	},
	tooltip: TIP.description,
	grid: {
		field: 'description',
		flex: 2,
		sortable: false,
		filter: 'agTextColumnFilter',
		valueFormatter: (params) => truncateDescription(params.value, 80),
		headerTooltip: 'Video description from YouTube API',
	},
};

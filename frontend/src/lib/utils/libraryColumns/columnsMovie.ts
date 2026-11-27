/**
 * Movie (TMDB) columns. MOVIE rows read their `response` JSON (see formatting.ts). The Movie set
 * is shown by default only when the type filter is exactly MOVIE; index.ts's visibility rules use
 * the `views` tiers below.
 */
import {
	textOrEmpty,
	genreValueGetter,
	ratedValueGetter,
	moviePeople,
	castCellRenderer,
	releasedValueGetter,
	releasedFilterDate,
	formatReleased,
	boxOfficeValueGetter,
	formatBoxOffice,
	vsBudgetValueGetter,
	formatVsBudgetCell,
	tmdbScoreValueGetter,
	formatTmdbScore,
	hasLowVoteCount,
	budgetValueGetter,
	votesValueGetter,
	collectionValueGetter,
	synopsisValueGetter,
	tmdbIdValueGetter,
	formatCount,
	truncateDescription,
	movieResponse,
	ageRatingRank,
	EMPTY_VALUE,
} from '#lib/utils/formatting.js';
import { ratedComparator, releasedComparator, unknownLastComparator } from '#lib/utils/grid-config.js';
import { AgeRatingFilter } from '#lib/utils/contentTypeFilter.js';
import { TIP } from './tooltips';
import { dateRangeFields, numberRangeFields, parseSetValue, textField, type ContentFilterInput } from './filterCodec';
import type { LibraryColumn } from './definition';

/** Rated values: lowercased in the URL, upper-cased for the server (certifications are stored in capitals). */
function ratedFields(value: string): Partial<ContentFilterInput> {
	const ratings = parseSetValue(value).map((v) => v.toUpperCase());
	return ratings.length > 0 ? { ageRating: ratings } : {};
}

export const genreColumn: LibraryColumn = {
	colId: 'genre',
	label: 'Genre',
	picker: 'data',
	sort: false,
	filter: {
		key: 'genre',
		kind: 'text',
		client: (row) => genreValueGetter({ data: row })?.toLowerCase() ?? null,
		server: textField('genreContains'),
	},
	views: { movie: 'sm' },
	grid: {
		flex: 1,
		maxWidth: 180,
		sortable: false,
		filter: 'agTextColumnFilter',
		valueGetter: genreValueGetter,
		valueFormatter: (params) => textOrEmpty(params.value),
		headerTooltip: 'TMDB genres',
	},
};

// Orders by rating (G < PG < PG-13 < R < NC-17, unrated last), not A-Z; the server does the same.
export const ratedColumn: LibraryColumn = {
	colId: 'rated',
	label: 'Rated',
	picker: 'data',
	sort: {
		server: 'AGE_RATING',
		client: (row) => ageRatingRank(movieResponse(row)?.certification),
	},
	filter: {
		key: 'rated',
		kind: 'set',
		client: (row) => ratedValueGetter({ data: row })?.toLowerCase() ?? null,
		server: ratedFields,
	},
	views: { movie: 'sm' },
	grid: {
		flex: 0.5,
		maxWidth: 120,
		filter: AgeRatingFilter,
		valueGetter: ratedValueGetter,
		comparator: ratedComparator,
		valueFormatter: (params) => textOrEmpty(params.value),
		headerTooltip: 'US age rating (G, PG, PG-13, R, NC-17). Sorts by rating, not A-Z; unrated last.',
	},
};

// One column for people: directors first, then billed cast. Not sortable (a person list has no order);
// searched via the Cast / Director search scopes instead.
export const castColumn: LibraryColumn = {
	colId: 'cast',
	label: 'Cast',
	picker: 'data',
	sort: false,
	// Matches a cast or director name, like the server's castContains.
	filter: {
		key: 'cast',
		kind: 'text',
		client: (row) =>
			moviePeople(row)
				.map((p) => p.name)
				.join(', ')
				.toLowerCase() || null,
		server: textField('castContains'),
	},
	views: { movie: 'md' },
	exportText: (row) =>
		moviePeople(row)
			.map((p) => p.name)
			.join(', '),
	tooltip: TIP.cast,
	grid: {
		flex: 2,
		minWidth: 125,
		sortable: false,
		filter: 'agTextColumnFilter',
		// Directors and cast names, matching the server's castContains.
		filterValueGetter: (params) =>
			moviePeople(params.data)
				.map((p) => p.name)
				.join(', '),
		cellRenderer: castCellRenderer,
		// Tighter cell padding so the two-line cast cell has room for names beside +N.
		cellStyle: { '--ag-cell-horizontal-padding': '8px' },
		headerTooltip:
			'Directors lead (marked dir.), then billed cast. Only the top 15 cast are stored, so only they are searchable.',
	},
};

export const releasedColumn: LibraryColumn = {
	colId: 'released',
	label: 'Released',
	picker: 'data',
	// Released has a server sort (RELEASE_DATE) and a client one for "Loaded" mode.
	sort: { server: 'RELEASE_DATE', client: (row) => releasedValueGetter({ data: row }) },
	filter: {
		key: 'released',
		kind: 'date',
		day: true,
		client: (row) => releasedValueGetter({ data: row }),
		server: dateRangeFields('releasedAfter', 'releasedBefore'),
	},
	views: { movie: 'md' },
	grid: {
		flex: 1,
		maxWidth: 140,
		comparator: releasedComparator,
		filter: 'agDateColumnFilter',
		// AG's date filter compares local dates; the ISO release date would read as the day before west of UTC.
		filterValueGetter: (params) => releasedFilterDate(releasedValueGetter({ data: params.data })),
		valueGetter: releasedValueGetter,
		valueFormatter: (params) => formatReleased(params.value),
		headerTooltip: 'Theatrical release date from TMDB',
	},
};

export const boxOfficeColumn: LibraryColumn = {
	colId: 'boxOffice',
	label: 'Take',
	picker: 'data',
	sort: { server: 'BOX_OFFICE', client: (row) => boxOfficeValueGetter({ data: row }) },
	filter: {
		key: 'boxoffice',
		kind: 'number',
		client: (row) => boxOfficeValueGetter({ data: row }),
		server: numberRangeFields('minBoxOffice', 'maxBoxOffice'),
	},
	numeric: true,
	chart: ['movie'],
	views: { movie: 'lg' },
	tooltip: TIP.boxOffice,
	grid: {
		flex: 0.8,
		maxWidth: 150,
		filter: 'agNumberColumnFilter',
		valueGetter: boxOfficeValueGetter,
		comparator: unknownLastComparator,
		valueFormatter: (params) => formatBoxOffice(params.value),
		headerTooltip: 'Worldwide gross (USD) from TMDB. A dash means TMDB has no figure.',
	},
};

// No filter on purpose: it is derived (revenue / budget) and the server has no field for it, so
// a filter would apply in "Loaded" mode only and be silently dropped in "All Items".
export const vsBudgetColumn: LibraryColumn = {
	colId: 'vsBudget',
	label: 'ROI',
	picker: 'data',
	sort: { server: 'VS_BUDGET', client: (row) => vsBudgetValueGetter({ data: row }) },
	numeric: true,
	chart: ['movie'],
	views: { movie: 'lg' },
	tooltip: TIP.vsBudget,
	grid: {
		flex: 0.8,
		maxWidth: 130,
		filter: false,
		valueGetter: vsBudgetValueGetter,
		comparator: unknownLastComparator,
		valueFormatter: (params) => formatVsBudgetCell(params.value),
		headerTooltip: 'Box Office Take / Budget',
	},
};

export const tmdbScoreColumn: LibraryColumn = {
	colId: 'tmdbScore',
	label: 'Rating',
	picker: 'data',
	sort: { server: 'TMDB_SCORE', client: (row) => tmdbScoreValueGetter({ data: row }) },
	filter: {
		key: 'tmdb',
		kind: 'number',
		client: (row) => tmdbScoreValueGetter({ data: row }),
		server: numberRangeFields('minTmdbScore', 'maxTmdbScore'),
	},
	numeric: true,
	chart: ['movie'],
	views: { movie: 'lg' },
	tooltip: TIP.tmdbScore,
	grid: {
		flex: 0.7,
		maxWidth: 130,
		filter: 'agNumberColumnFilter',
		valueGetter: tmdbScoreValueGetter,
		comparator: unknownLastComparator,
		valueFormatter: (params) => formatTmdbScore(params.value),
		// Muted when the score rests on fewer than 50 votes. A colDef `cellClass` replaces the one
		// `type: 'rightAligned'` adds, so the alignment class is repeated here.
		cellClass: (params) => [
			'ag-right-aligned-cell',
			...(hasLowVoteCount({ data: params.data }) ? ['text-muted-foreground'] : []),
		],
		headerTooltip: 'TMDB user score out of 10. Muted when fewer than 50 votes.',
	},
};

// Picker-only Movie columns (never in the default set).
export const budgetColumn: LibraryColumn = {
	colId: 'budget',
	label: 'Budget',
	picker: 'data',
	sort: false,
	numeric: true,
	chart: ['movie'],
	tooltip: TIP.budget,
	grid: {
		flex: 0.8,
		maxWidth: 130,
		sortable: false,
		filter: false,
		valueGetter: budgetValueGetter,
		valueFormatter: (params) => formatBoxOffice(params.value),
		headerTooltip: 'Production budget (USD) from TMDB. A dash means TMDB has no figure.',
	},
};

export const votesColumn: LibraryColumn = {
	colId: 'votes',
	label: 'Votes',
	picker: 'data',
	sort: false,
	numeric: true,
	chart: ['movie'],
	grid: {
		flex: 0.7,
		maxWidth: 110,
		sortable: false,
		filter: false,
		valueGetter: votesValueGetter,
		valueFormatter: (params) => formatCount(params.value),
		headerTooltip: 'Number of TMDB votes behind the score',
	},
};

export const collectionColumn: LibraryColumn = {
	colId: 'collection',
	label: 'Collection',
	picker: 'data',
	sort: false,
	grid: {
		flex: 1,
		maxWidth: 200,
		sortable: false,
		filter: false,
		valueGetter: collectionValueGetter,
		valueFormatter: (params) => textOrEmpty(params.value),
		headerTooltip: 'TMDB collection (franchise) this film belongs to',
	},
};

export const synopsisColumn: LibraryColumn = {
	colId: 'synopsis',
	label: 'Synopsis',
	picker: 'data',
	sort: false,
	tooltip: TIP.synopsis,
	grid: {
		flex: 2,
		sortable: false,
		filter: false,
		valueGetter: synopsisValueGetter,
		valueFormatter: (params) => truncateDescription(params.value, 80),
		headerTooltip: 'Plot overview from TMDB',
	},
};

export const tmdbIdColumn: LibraryColumn = {
	colId: 'tmdbId',
	label: 'TMDB ID',
	picker: 'data',
	sort: false,
	spreadsheetFormatted: true,
	grid: {
		flex: 0.6,
		maxWidth: 110,
		sortable: false,
		filter: false,
		valueGetter: tmdbIdValueGetter,
		valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
		headerTooltip: 'TMDB movie id',
	},
};

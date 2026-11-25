/**
 * The Library grid's column definitions: one entry per column, plus the derived
 * right alignment, header-width floor and chart-button header for each.
 *
 * The chart header hooks come from the component because they read its live state
 * (which columns are chart-eligible in the current view).
 */
import type { ColDef } from '@ag-grid-community/core';
import { type ContentItem } from '#lib/queries/content/index.js';
import {
	typeCellRenderer,
	categoryCellRenderer,
	perspectiveCellRenderer,
	PerspectiveHeaderRenderer,
	durationValueGetter,
	durationFilterValueGetter,
	parseDurationInput,
	formatDurationSeconds,
	dateValueFormatter,
	formatCount,
	formatPublishDate,
	formatClaimDate,
	formatRatingScore,
	formatTags,
	contentTags,
	truncateDescription,
	castCellRenderer,
	genreValueGetter,
	ratedValueGetter,
	releasedValueGetter,
	releasedFilterDate,
	formatReleased,
	moviePeople,
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
	textOrEmpty,
	EMPTY_VALUE,
} from '#lib/utils/formatting.js';
import { headerMinWidth } from '#lib/utils/grid-header-width.js';
import {
	capitalizeContentType,
	durationComparator,
	unknownLastComparator,
	releasedComparator,
	labelComparator,
	ratedComparator,
	perspectiveRating,
	NUMERIC_COL_IDS,
} from '#lib/utils/grid-config.js';
import { CHART_ELIGIBLE_COLS } from '#lib/utils/columnCharts.js';
import { LIBRARY_TOOLTIP_SPECS } from '#lib/utils/libraryTooltipSpecs.js';
import {
	authorCellRenderer,
	authorValueGetter,
	editionsValueGetter,
	formatBookRating,
	formatReaders,
	hasLowRatingCount,
	pagesValueGetter,
	publishedValueGetter,
	ratingValueGetter,
	readersValueGetter,
} from '#lib/utils/bookFormatting.js';
import { ContentTypeFilter, AgeRatingFilter, WebRoleFilter } from '#lib/utils/contentTypeFilter.js';
import { libraryItemCellRenderer } from '#lib/utils/libraryItemCellRenderer.js';
import {
	webAuthorCellRenderer,
	webPublishedFilterValueGetter,
	webPublishedValueGetter,
	webRolesCellRenderer,
	webSiteCellRenderer,
	formatWebPublished,
} from '#lib/utils/webPageFormatting.js';
import { webPageAuthor, webPageSite } from '#lib/utils/webPage.js';

export interface LibraryColumnHooks {
	/** Header template params for a chart-eligible column; re-read on every header refresh. */
	chartHeaderParams: (colId: string, label: string) => { template?: string };
	/** Keeps header keyboard events on the chart button from reaching the grid. */
	suppressChartKeyboard: (params: { event: KeyboardEvent }) => boolean;
}

// flex = clamp-like: proportional sizing with min/max constraints
// minWidth is auto-derived from headerName unless explicitly set (e.g. Item = 200)
export function buildLibraryColumnDefs({
	chartHeaderParams,
	suppressChartKeyboard,
}: LibraryColumnHooks): ColDef<ContentItem>[] {
	return (
		[
			{
				colId: 'perspectize',
				pinned: 'left', // stays visible when the grid scrolls horizontally
				lockPinned: true,
				headerName: '',
				headerComponent: PerspectiveHeaderRenderer,
				headerTooltip: 'Perspectize — add or edit your perspective',
				flex: 0,
				width: 50,
				minWidth: 50,
				maxWidth: 50,
				sortable: false,
				filter: false,
				resizable: false,
				cellRenderer: perspectiveCellRenderer,
				cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.perspectize },
			},
			{
				colId: 'item',
				pinned: 'left', // keeps row identity visible while scrolling right
				lockPinned: true,
				headerName: 'Item',
				flex: 2,
				minWidth: 175, // a floor only: Item is flex 2 and grows; 10px less keeps the YouTube lg set inside 1212px

				filter: 'agTextColumnFilter',
				filterValueGetter: (params) => params.data?.name ?? '',
				cellRenderer: libraryItemCellRenderer,
				cellStyle: { padding: 0 },
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.item },
				headerTooltip: 'Video title and thumbnail from YouTube API',
			},
			{
				colId: 'type',
				headerName: 'Type',
				flex: 0.5,
				// The cell is a single icon; minWidth comes from the header (text, sort arrow, funnel).
				maxWidth: 110,

				filter: ContentTypeFilter,
				valueGetter: (params) => capitalizeContentType(params.data?.contentType),
				cellRenderer: typeCellRenderer,
				headerTooltip: 'Content type',
			},
			{
				colId: 'category',
				headerName: 'Category',
				headerTooltip: 'Wikidata category',
				width: 150,
				// Sortable only in "Loaded" mode: the effect below toggles `sortable` per mode (clientOnlySort).
				filter: false,
				valueGetter: (params) => params.data?.primaryCategory?.label ?? null,
				comparator: labelComparator,
				cellRenderer: categoryCellRenderer,
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.category },
				hide: true,
			},
			// Claim date columns (Content.customFields). Hidden by default; the responsive effect
			// shows them in the claim view. Sorted client-side (the backend cannot sort on custom fields).
			{
				colId: 'effectiveDate',
				headerName: 'Effective',
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
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.effectiveDate },
				hide: true,
			},
			{
				colId: 'evaluateBy',
				headerName: 'Evaluate by',
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
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.evaluateBy },
				hide: true,
			},
			// The viewer's own ratings (0-100). Read from the perspective map in the grid context;
			// refreshed with the perspectize column when that map changes.
			{
				colId: 'myQuality',
				headerName: 'My overall',
				headerTooltip: 'Your overall rating of this claim (0-100).',
				width: 110,
				sortable: false,
				filter: 'agNumberColumnFilter',
				valueGetter: (params) => perspectiveRating(params.context?.perspectivesByContentId, params.data?.id, 'quality'),
				valueFormatter: (params) => formatRatingScore(params.value),
				hide: true,
			},
			{
				colId: 'myImportance',
				headerName: 'My importance',
				headerTooltip: 'Your importance rating of this claim (0-100).',
				width: 120,
				sortable: false,
				filter: 'agNumberColumnFilter',
				valueGetter: (params) =>
					perspectiveRating(params.context?.perspectivesByContentId, params.data?.id, 'importance'),
				valueFormatter: (params) => formatRatingScore(params.value),
				hide: true,
			},
			{
				colId: 'myAgreement',
				headerName: 'My agreement',
				headerTooltip: 'Your agreement rating with this claim (0-100).',
				width: 120,
				sortable: false,
				filter: 'agNumberColumnFilter',
				valueGetter: (params) =>
					perspectiveRating(params.context?.perspectivesByContentId, params.data?.id, 'agreement'),
				valueFormatter: (params) => formatRatingScore(params.value),
				hide: true,
			},
			// Movie columns (TMDB). Hidden by default; the responsive effect shows the Movie
			// default set when the type filter is exactly MOVIE. Header-only columns take their
			// minWidth from headerMinWidth (never below the whole heading + sort arrow + funnel);
			// movieColumns.test.ts checks the default set still fits the 1212px grid.
			{
				colId: 'genre',
				headerName: 'Genre',
				flex: 1,
				maxWidth: 180,
				sortable: false,
				filter: 'agTextColumnFilter',
				valueGetter: genreValueGetter,
				valueFormatter: (params) => textOrEmpty(params.value),
				headerTooltip: 'TMDB genres',
				hide: true,
			},
			{
				colId: 'rated',
				headerName: 'Rated',
				flex: 0.5,
				maxWidth: 120,
				filter: AgeRatingFilter,
				valueGetter: ratedValueGetter,
				comparator: ratedComparator,
				valueFormatter: (params) => textOrEmpty(params.value),
				headerTooltip: 'US age rating (G, PG, PG-13, R, NC-17). Sorts by rating, not A-Z; unrated last.',
				hide: true,
			},
			{
				colId: 'cast',
				headerName: 'Cast',
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
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.cast },
				headerTooltip:
					'Directors lead (marked dir.), then billed cast. Only the top 15 cast are stored, so only they are searchable.',
				hide: true,
			},
			{
				colId: 'duration',
				headerName: 'Duration',
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
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.duration },
				headerTooltip: 'Length of the item.',
			},
			{
				colId: 'views',
				field: 'viewCount',
				headerName: 'Views',
				flex: 0.8,
				maxWidth: 130,

				filter: 'agNumberColumnFilter',
				valueFormatter: (params) => formatCount(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.views },
				headerTooltip: 'View count from YouTube API',
			},
			{
				colId: 'likes',
				field: 'likeCount',
				headerName: 'Likes',
				flex: 0.8,
				maxWidth: 130,

				filter: 'agNumberColumnFilter',
				valueFormatter: (params) => formatCount(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.likes },
				headerTooltip: 'Like count from YouTube API',
			},
			{
				colId: 'released',
				headerName: 'Released',
				flex: 1,
				maxWidth: 140,
				comparator: releasedComparator,
				filter: 'agDateColumnFilter',
				// AG's date filter compares local dates; the ISO release date would read as the day before west of UTC.
				filterValueGetter: (params) => releasedFilterDate(releasedValueGetter({ data: params.data })),
				valueGetter: releasedValueGetter,
				valueFormatter: (params) => formatReleased(params.value),
				headerTooltip: 'Theatrical release date from TMDB',
				hide: true,
			},
			{
				colId: 'boxOffice',
				headerName: 'Take',
				flex: 0.8,
				maxWidth: 150,
				filter: 'agNumberColumnFilter',
				valueGetter: boxOfficeValueGetter,
				comparator: unknownLastComparator,
				valueFormatter: (params) => formatBoxOffice(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.boxOffice },
				headerTooltip: 'Worldwide gross (USD) from TMDB. A dash means TMDB has no figure.',
				hide: true,
			},
			{
				colId: 'vsBudget',
				headerName: 'ROI',
				flex: 0.8,
				maxWidth: 130,
				filter: false,
				valueGetter: vsBudgetValueGetter,
				comparator: unknownLastComparator,
				valueFormatter: (params) => formatVsBudgetCell(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.vsBudget },
				headerTooltip: 'Box Office Take / Budget',
				hide: true,
			},
			{
				colId: 'tmdbScore',
				headerName: 'Rating',
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
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.tmdbScore },
				headerTooltip: 'TMDB user score out of 10. Muted when fewer than 50 votes.',
				hide: true,
			},
			{
				colId: 'publishDate',
				field: 'publishedAt',
				headerName: 'Date',
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
			{
				colId: 'channel',
				field: 'channelTitle',
				headerName: 'Channel',
				flex: 1.2,
				maxWidth: 200,

				filter: 'agTextColumnFilter',
				headerTooltip: 'Channel name from YouTube API',
			},
			{
				colId: 'user',
				field: 'addedByUsername',
				headerName: 'User',
				flex: 0.8,
				maxWidth: 160,

				filter: 'agTextColumnFilter',
				headerTooltip: 'User who added this item',
			},
			{
				colId: 'tags',
				headerName: 'Tags',
				flex: 1.5,
				maxWidth: 250,
				sortable: false,
				filter: 'agTextColumnFilter',
				// YouTube tags, or TMDB keywords for a Movie (see contentTags).
				valueGetter: (params) => contentTags(params.data),
				filterValueGetter: (params) => formatTags(contentTags(params.data)),
				valueFormatter: (params) => formatTags(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.tags },
				headerTooltip: 'Tags from YouTube API, or TMDB keywords for movies',
			},
			{
				colId: 'description',
				field: 'description',
				headerName: 'Description',
				flex: 2,
				sortable: false,
				filter: 'agTextColumnFilter',
				valueFormatter: (params) => truncateDescription(params.value, 80),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.description },
				headerTooltip: 'Video description from YouTube API',
				hide: true,
			},
			// Webpage columns. Hidden by default; the responsive effect shows the Webpage default set when
			// the type filter is exactly WEB_PAGE. Roles is picker-only (never in the default set); its header
			// filter is server-side only (f.webrole), since Loaded mode cannot filter a multi-valued field.
			// Site shows from sm up, Published from md up.
			{
				colId: 'webSite',
				headerName: 'Site',
				flex: 1,
				maxWidth: 200,
				filter: 'agTextColumnFilter',
				valueGetter: (params) => webPageSite({ url: params.data?.url ?? null, webPage: params.data?.webPage }),
				filterValueGetter: (params) =>
					webPageSite({ url: params.data?.url ?? null, webPage: params.data?.webPage }) ?? '',
				cellRenderer: webSiteCellRenderer,
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.webSite },
				headerTooltip: 'Site name the page declares, or its domain',
				hide: true,
			},
			{
				colId: 'webPublished',
				headerName: 'Published',
				flex: 0.8,
				minWidth: 105,
				maxWidth: 150,
				filter: 'agDateColumnFilter',
				valueGetter: (params) => webPublishedValueGetter({ data: params.data }),
				filterValueGetter: (params) => webPublishedFilterValueGetter({ data: params.data }),
				valueFormatter: (params) => formatWebPublished(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.webPublished },
				headerTooltip: 'Date the page declares it was published',
				hide: true,
			},
			{
				colId: 'webRoles',
				headerName: 'Roles',
				flex: 1,
				maxWidth: 220,
				sortable: false,
				filter: WebRoleFilter,
				cellRenderer: webRolesCellRenderer,
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.webRoles },
				headerTooltip: 'What the page is for, as set by whoever added it',
				hide: true,
			},
			{
				colId: 'webAuthor',
				headerName: 'Author',
				flex: 1.2,
				minWidth: 120,
				filter: 'agTextColumnFilter',
				valueGetter: (params) => webPageAuthor({ url: params.data?.url ?? null, webPage: params.data?.webPage }),
				filterValueGetter: (params) =>
					webPageAuthor({ url: params.data?.url ?? null, webPage: params.data?.webPage }) ?? '',
				cellRenderer: webAuthorCellRenderer,
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.webAuthor },
				headerTooltip: 'Author the page declares',
				hide: true,
			},
			// Book columns (Open Library). Hidden by default; the responsive effect shows the Book default
			// set when the type filter is exactly BOOK. Author sorts on the server (AUTHOR). Published, Pages
			// and Rating sort in "Loaded" mode only; all three filter on the server (f.published, f.pages, f.bookrating). Editions and Readers are picker-only.
			{
				colId: 'author',
				headerName: 'Author',
				flex: 2,
				minWidth: 140,
				filter: 'agTextColumnFilter',
				valueGetter: authorValueGetter,
				filterValueGetter: (params) => authorValueGetter({ data: params.data }) ?? '',
				cellRenderer: authorCellRenderer,
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.author },
				headerTooltip: 'Author(s) from Open Library',
				hide: true,
			},
			{
				colId: 'published',
				headerName: 'Published',
				flex: 0.8,
				minWidth: 105,
				// Raised to fit the header floor ("Published" + sort arrow, order number and funnel).
				maxWidth: 140,
				filter: 'agNumberColumnFilter',
				// A number to sort by, shown as the plain year (never through the thousands-separated formatter).
				valueGetter: (params) => {
					const year = publishedValueGetter({ data: params.data });
					return year === null ? null : Number(year);
				},
				comparator: unknownLastComparator,
				valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
				headerTooltip: 'First published year',
				hide: true,
			},
			{
				colId: 'pages',
				headerName: 'Pages',
				flex: 0.6,
				minWidth: 70,
				// Raised to fit the header floor ("Pages" + sort arrow, order number and funnel).
				maxWidth: 120,
				filter: 'agNumberColumnFilter',
				valueGetter: pagesValueGetter,
				comparator: unknownLastComparator,
				valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
				headerTooltip: 'Median page count across editions',
				hide: true,
			},
			{
				colId: 'rating',
				headerName: 'Book rating',
				flex: 0.7,
				minWidth: 128,
				// Raised to fit the header floor ("Book rating" + sort arrow, order number and funnel).
				maxWidth: 160,
				filter: 'agNumberColumnFilter',
				valueGetter: ratingValueGetter,
				comparator: unknownLastComparator,
				valueFormatter: (params) => formatBookRating(params.value),
				// Muted when the rating rests on fewer than 5 ratings.
				cellClass: (params) => (hasLowRatingCount({ data: params.data }) ? 'text-muted-foreground' : ''),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.rating },
				headerTooltip: 'Open Library community rating out of 5. Muted when fewer than 5 ratings.',
				hide: true,
			},
			{
				colId: 'editions',
				headerName: 'Editions',
				flex: 0.6,
				minWidth: 80,
				maxWidth: 110,
				sortable: false,
				filter: false,
				valueGetter: editionsValueGetter,
				valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
				headerTooltip: 'Number of editions',
				hide: true,
			},
			{
				// Open Library "want to read" count; the hover popover has the full breakdown. Picker-only,
				// sorts in "Loaded" mode only, no filter (the server has no field for it).
				colId: 'readers',
				headerName: 'Readers',
				flex: 0.6,
				minWidth: 90,
				maxWidth: 120,
				filter: false,
				valueGetter: readersValueGetter,
				comparator: unknownLastComparator,
				valueFormatter: (params) => formatReaders(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.readers },
				headerTooltip: 'Open Library members who want to read this. Open Library users only, not readers in general.',
				hide: true,
			},
			// Movie picker-only columns (never in the default set).
			{
				colId: 'budget',
				headerName: 'Budget',
				flex: 0.8,
				maxWidth: 130,
				sortable: false,
				filter: false,
				valueGetter: budgetValueGetter,
				valueFormatter: (params) => formatBoxOffice(params.value),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.budget },
				headerTooltip: 'Production budget (USD) from TMDB. A dash means TMDB has no figure.',
				hide: true,
			},
			{
				colId: 'votes',
				headerName: 'Votes',
				flex: 0.7,
				maxWidth: 110,
				sortable: false,
				filter: false,
				valueGetter: votesValueGetter,
				valueFormatter: (params) => formatCount(params.value),
				headerTooltip: 'Number of TMDB votes behind the score',
				hide: true,
			},
			{
				colId: 'collection',
				headerName: 'Collection',
				flex: 1,
				maxWidth: 200,
				sortable: false,
				filter: false,
				valueGetter: collectionValueGetter,
				valueFormatter: (params) => textOrEmpty(params.value),
				headerTooltip: 'TMDB collection (franchise) this film belongs to',
				hide: true,
			},
			{
				colId: 'synopsis',
				headerName: 'Synopsis',
				flex: 2,
				sortable: false,
				filter: false,
				valueGetter: synopsisValueGetter,
				valueFormatter: (params) => truncateDescription(params.value, 80),
				context: { tooltipSpec: LIBRARY_TOOLTIP_SPECS.synopsis },
				headerTooltip: 'Plot overview from TMDB',
				hide: true,
			},
			{
				colId: 'tmdbId',
				headerName: 'TMDB ID',
				flex: 0.6,
				maxWidth: 110,
				sortable: false,
				filter: false,
				valueGetter: tmdbIdValueGetter,
				valueFormatter: (params) => (params.value == null ? EMPTY_VALUE : String(params.value)),
				headerTooltip: 'TMDB movie id',
				hide: true,
			},
			{
				colId: 'updatedAt',
				field: 'updatedAt',
				headerName: 'Updated',
				flex: 1,
				maxWidth: 150,

				filter: 'agDateColumnFilter',
				filterValueGetter: (params) => {
					const val = params.data?.updatedAt;
					return val ? new Date(val) : null;
				},
				valueFormatter: dateValueFormatter,
				headerTooltip: 'Last updated in Perspectize',
				hide: true,
			},

			{
				colId: 'createdAt',
				field: 'createdAt',
				headerName: 'Date Added',
				flex: 1,
				maxWidth: 150,

				filter: 'agDateColumnFilter',
				filterValueGetter: (params) => {
					const val = params.data?.createdAt;
					return val ? new Date(val) : null;
				},
				valueFormatter: dateValueFormatter,
				headerTooltip: 'Date added to Perspectize',
				hide: true,
			},
			// Internal columns — hidden by default; only offered in the column
			// picker to admins (see ColumnPickerDialog / INTERNAL_COLUMNS).
			{
				colId: 'id',
				field: 'id',
				headerName: 'Content ID',
				flex: 1,
				minWidth: 260,
				sortable: false,
				filter: false,
				headerTooltip: 'Internal content record ID',
				hide: true,
			},
			{
				colId: 'addedByUserID',
				field: 'addedByUserID',
				headerName: 'Submitter',
				flex: 0.7,
				minWidth: 120,
				sortable: false,
				filter: false,
				headerTooltip: 'ID of the user who added this item',
				hide: true,
			},
			{
				colId: 'url',
				field: 'url',
				headerName: 'Source URL',
				flex: 2,
				minWidth: 240,
				sortable: false,
				filter: false,
				headerTooltip: 'Canonical source URL',
				hide: true,
			},
		] as ColDef<ContentItem>[]
	).map((col) => ({
		...col,
		...(col.colId && NUMERIC_COL_IDS.has(col.colId) ? { type: 'rightAligned' } : {}),
		// Never narrower than the whole heading + sort arrow + funnel. An explicit minWidth only
		// raises the floor (for cell content, e.g. Item's thumbnail and title); it can't lower it.
		minWidth: Math.max(
			col.minWidth ?? 0,
			headerMinWidth(col.headerName ?? '', { filter: col.filter !== false, sortable: col.sortable !== false }),
		),
		// Columns that can chart in the current view keep the stock grid header, with a chart
		// button added to its template (outside the label, so it never sorts). The params are
		// re-evaluated whenever the header is rebuilt (refreshHeader).
		...(col.colId && CHART_ELIGIBLE_COLS.has(col.colId)
			? {
					headerComponentParams: () => chartHeaderParams(col.colId as string, col.headerName ?? (col.colId as string)),
					suppressHeaderKeyboardEvent: suppressChartKeyboard,
				}
			: {}),
	}));
}

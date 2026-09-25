<script lang="ts">
	import AgGridSvelte5Component from 'ag-grid-svelte5';
	import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
	import { themeQuartz } from '@ag-grid-community/theming';
	import type {
		GridApi,
		GridOptions,
		SortChangedEvent,
		FilterChangedEvent,
		ColDef,
		CellClickedEvent,
		CellMouseOverEvent,
	} from '@ag-grid-community/core';
	import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_CONTENT, type ContentItem, type ContentResponse } from '$lib/queries/content';
	import {
		LIST_PERSPECTIVES_BY_USER,
		type ListPerspectivesByUserResponse,
		type PerspectiveItem,
	} from '$lib/queries/perspectives';
	import { queryKeys } from '$lib/queries/keys';
	import {
		parseGridParams,
		serializeGridParams,
		sortsToGraphQL,
		urlParamsToGraphQLFilter,
		urlParamsToFilter,
		filterToUrlParams,
		filtersEqual,
	} from '$lib/utils/gridUrlState';
	import type { DataMode, GridParams, SortSpec } from '$lib/utils/gridUrlState';
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
		percentLikedValueGetter,
		formatPercentLiked,
		formatPublishDate,
		formatTags,
		truncateDescription,
		contentRowId,
		headerMinWidth,
	} from '$lib/utils/formatting';
	import {
		SORT_FIELD_MAP,
		resolveSortField,
		resolveSortOrder,
		capitalizeContentType,
		durationComparator,
		compareContentBySorts,
		computeNextPage,
		computePrevPage,
		togglableColIds,
	} from '$lib/utils/grid-config';
	import { GRID_THEME_PARAMS } from '$lib/utils/grid-theme';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import ColumnPickerDialog from '$lib/components/ColumnPickerDialog.svelte';
	import SortPickerDialog from '$lib/components/SortPickerDialog.svelte';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
	import CellPopover, { type PopoverState } from '$lib/components/CellPopover.svelte';
	import { buildPopoverState, createHoverController } from '$lib/utils/tooltipHover';
	import { ACTIVITY_TOOLTIP_SPECS } from '$lib/utils/activityTooltipSpecs';
	import { onDestroy } from 'svelte';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import DataModeToggle from '$lib/components/DataModeToggle.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import ActivityDetailsModal from '$lib/components/ActivityDetailsModal.svelte';
	import ActivityCardList from '$lib/components/ActivityCardList.svelte';
	import { activityItemCellRenderer } from '$lib/utils/activityItemCellRenderer';
	import CategoryTypeahead from '$lib/components/CategoryTypeahead.svelte';
	import { useSetPrimaryCategory } from '$lib/queries/categories/useSetPrimaryCategory';
	import type { WikidataSearchResult } from '$lib/queries/categories';

	// Popover state for Perspectize column
	let popoverOpen = $state(false);
	let popoverContentId = $state<number | null>(null);
	let popoverContentName = $state('');
	let popoverExistingPerspective = $state<PerspectiveItem | null>(null);

	// Popover state for Category column
	let categoryPopoverOpen = $state(false);
	let categoryPopoverContentId = $state<number | null>(null);
	let categoryPopoverCurrentCategory = $state<{ label: string; wikidataQid: string } | null>(null);
	let categoryPopoverPosition = $state({ x: 0, y: 0 });

	// Category mutation hook
	const setPrimaryCategoryMutation = useSetPrimaryCategory();

	function handleCategorySelect(result: WikidataSearchResult) {
		if (categoryPopoverContentId == null) return;
		setPrimaryCategoryMutation.mutate({
			contentId: categoryPopoverContentId,
			qid: result.qid,
			label: result.label,
			description: result.description ?? undefined,
			entityType: result.entityType ?? undefined,
		});
		categoryPopoverOpen = false;
	}

	// Details modal state (Item cell click -> metadata modal)
	let detailsModalContentId = $state<string | null>(null);

	function handleOpenDetails(contentId: string) {
		detailsModalContentId = contentId;
	}
	function handleCloseDetails() {
		detailsModalContentId = null;
	}

	/**
	 * Opens the perspective create/edit sheet for a content row. Shared by the AG Grid
	 * Perspectize column (desktop) and the mobile card list, which has no grid column.
	 */
	function openPerspective(contentId: string, name: string) {
		popoverContentId = parseInt(contentId, 10);
		popoverContentName = name;
		popoverExistingPerspective = perspectivesByContentId.get(contentId) ?? null;
		popoverOpen = true;
	}

	function handleAddPerspectiveFromCard(contentId: string) {
		const row = rowData.find((item) => String(item.id) === contentId);
		openPerspective(contentId, row?.name ?? '');
	}

	// Mobile card-list breakpoint (< 860px) — replaces the AG Grid entirely, per design handoff.
	let cardMode = $state(false);

	// Signed-in user — drives the admin-only "Internal" group in the column picker.
	const meCtx = useMe();

	// Column picker (session-only). Once the user makes a manual choice,
	// `userColumnOverride` is non-null and the responsive $effect below stops
	// touching column visibility for the rest of the session. A page refresh
	// clears it and automatic responsive layout resumes.
	let columnPickerOpen = $state(false);
	let userColumnOverride = $state<Record<string, boolean> | null>(null);
	const overrideActive = $derived(userColumnOverride !== null);

	function currentVisibility(): Record<string, boolean> {
		const out: Record<string, boolean> = {};
		if (!gridApi) return out;
		const allowed = new Set(togglableColIds(meCtx.isAdmin));
		for (const colState of gridApi.getColumnState()) {
			if (colState.colId && allowed.has(colState.colId)) out[colState.colId] = !colState.hide;
		}
		return out;
	}

	function handleColumnToggle(colId: string, next: boolean) {
		if (!gridApi || !gridReady) return;
		if (userColumnOverride === null) userColumnOverride = currentVisibility();
		userColumnOverride = { ...userColumnOverride, [colId]: next };
		gridApi.setColumnsVisible([colId], next);
	}

	// Checkbox state for the dialog — recomputed when it opens and after every
	// toggle so the checkboxes track the live grid.
	const pickerVisibility = $derived.by(() => {
		void columnPickerOpen;
		void userColumnOverride;
		return columnPickerOpen ? currentVisibility() : {};
	});

	// ---------------------------------------------------------------------------
	// URL-derived state
	// ---------------------------------------------------------------------------

	// Derive grid params from current URL (reactive to URL changes)
	const gridParams = $derived(parseGridParams(page.url.searchParams));

	// Individual derived fields from URL
	const mode = $derived(gridParams.mode);
	// Multi-column sort. The GraphQL `sorts` list carries every sorted column in
	// priority order; `sortBy`/`sortOrder` (the first entry, or the legacy default)
	// stay populated too since the server still requires them as its single-sort
	// fallback for anything that predates multi-sort.
	const sorts = $derived(gridParams.sorts);
	const graphqlSorts = $derived(sortsToGraphQL(sorts));
	const sortBy = $derived(graphqlSorts?.[0]?.field ?? 'UPDATED_AT');
	const sortOrder = $derived(graphqlSorts?.[0]?.order ?? 'DESC');
	const pageNum = $derived(gridParams.page); // 1-indexed
	const pageSize = $derived(gridParams.pageSize);
	const searchText = $derived(gridParams.q);
	const searchFields = $derived(gridParams.qFields);
	const filters = $derived(gridParams.filters);

	// ---------------------------------------------------------------------------
	// URL update helper
	// ---------------------------------------------------------------------------

	function updateUrl(changes: Partial<GridParams>, replace = true) {
		const updated = { ...gridParams, ...changes };
		const search = serializeGridParams(updated);
		const url = search ? `?${search}` : page.url.pathname;
		goto(url, { replaceState: replace, keepFocus: true, noScroll: true });
	}

	// ---------------------------------------------------------------------------
	// Grid state
	// ---------------------------------------------------------------------------

	let gridApi = $state<GridApi | null>(null);
	let gridReady = $state(false);
	let displayedRowCount = $state<number | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout>;
	let skipNextSortEvent = $state(false);
	// Mirrors gridParams.sorts's role for "All Items" mode, but for "Loaded" (client)
	// mode — client-mode sort state lives in the grid (when there's a grid) or, on the
	// mobile card list where there's no grid at all, nowhere but here. Kept as the
	// source of truth the SortPickerDialog reads/writes in "Loaded" mode, and used to
	// manually sort rows for the card list when there's no AG Grid instance to do it.
	let clientSorts = $state<SortSpec[]>([]);
	let sortPickerOpen = $state(false);
	let activeFilterModel = $state<Record<string, any>>({});
	// Responsive tier: 'xs' (<445px), 'sm' (445-639px), 'md' (640-899px), 'lg' (900px+)
	let responsiveTier = $state<'xs' | 'sm' | 'md' | 'lg'>('lg');
	const isMobile = $derived(responsiveTier === 'xs' || responsiveTier === 'sm');

	// Current user for the perspectives query — derived straight from the Clerk
	// session (`me`), NOT the legacy `userSelection` store, which is only ever a
	// lagging mirror of `me.id` maintained by AuthUserSync and is null during the
	// ClerkLoaded → me-query → effect settle window. Reading `me` directly means
	// the +/glasses affordance reflects the signed-in user as soon as `me` resolves.
	const currentUserId = $derived(meCtx.me ? parseInt(meCtx.me.id, 10) : null);

	// TanStack Query for user's perspectives — used to determine +/glasses icon per row
	const perspectivesQuery = createQuery(() => ({
		queryKey: queryKeys.perspectives.listByUser(currentUserId ?? 0),
		queryFn: () =>
			graphqlRequest<ListPerspectivesByUserResponse>(LIST_PERSPECTIVES_BY_USER, {
				userID: currentUserId,
			}),
		enabled: currentUserId !== null,
		staleTime: 60 * 1000,
	}));

	// O(1) lookup map: contentID → PerspectiveItem
	const perspectivesByContentId = $derived(
		(() => {
			const map = new Map<string, PerspectiveItem>();
			const items = perspectivesQuery.data?.perspectives?.items ?? [];
			for (const p of items) {
				if (p.contentID) map.set(p.contentID, p);
			}
			return map;
		})(),
	);

	// Set of content ids the user has a perspective on — passed to the mobile card
	// list so it can show the glasses (edit) vs "+" (add) affordance, matching the grid.
	const perspectiveContentIds = $derived(new Set(perspectivesByContentId.keys()));

	// Cursor stack for cursor-based pagination
	// Index = page number (1-indexed: cursors[0] = null for page 1, cursors[1] = cursor for page 2, etc.)
	let cursors = $state<(string | null)[]>([null]);
	const currentCursor = $derived(cursors[pageNum - 1] ?? null); // 1-indexed page → 0-indexed cursor array

	// ---------------------------------------------------------------------------
	// Data fetching (mode-conditional)
	// ---------------------------------------------------------------------------

	// In server-side mode, build GraphQL filter from URL params + search
	// In client-side mode, pass search as simple filter (no column filters)
	const graphqlFilter = $derived(
		mode === 'all'
			? urlParamsToGraphQLFilter(filters, searchText, searchFields)
			: searchText
				? urlParamsToGraphQLFilter({}, searchText, searchFields)
				: undefined,
	);

	const contentQuery = createQuery(() => ({
		queryKey: queryKeys.content.list({
			sortBy: mode === 'all' ? sortBy : 'UPDATED_AT',
			sortOrder: mode === 'all' ? sortOrder : 'DESC',
			sorts: mode === 'all' ? graphqlSorts : undefined,
			// Search/filter must always reflect what queryFn actually sends (graphqlFilter is used
			// unconditionally below, regardless of mode) — hardcoding these to '' / undefined for
			// 'loaded' mode desyncs the cache key from the real request, so typing or clearing the
			// search box never invalidates the cache and the grid keeps showing stale results.
			search: searchText,
			searchFields,
			first: pageSize,
			after: currentCursor,
			filter: graphqlFilter as Record<string, unknown> | undefined,
			mode,
		}),
		queryFn: async () => {
			const response = await graphqlRequest<ContentResponse>(LIST_CONTENT, {
				first: mode === 'all' ? pageSize : 100, // Load more in client mode for client-side filtering
				after: mode === 'all' ? currentCursor : null,
				sortBy: mode === 'all' ? sortBy : 'UPDATED_AT',
				sortOrder: mode === 'all' ? sortOrder : 'DESC',
				sorts: mode === 'all' ? graphqlSorts : undefined,
				filter: graphqlFilter,
				includeTotalCount: true,
			});

			// Update cursor stack for page navigation (server-side mode only)
			if (mode === 'all' && response.content.pageInfo.hasNextPage && response.content.pageInfo.endCursor) {
				if (cursors.length === pageNum) {
					cursors = [...cursors, response.content.pageInfo.endCursor];
				}
			}

			return response;
		},
		placeholderData: keepPreviousData,
		staleTime: 60 * 1000,
	}));

	// Derived values from query
	const rowData = $derived(contentQuery.data?.content.items ?? []);
	const detailsModalContent = $derived(rowData.find((item) => String(item.id) === detailsModalContentId) ?? null);
	const totalCount = $derived(contentQuery.data?.content.totalCount ?? 0);
	// Reset the filtered-row count whenever the underlying row data changes
	// (new fetch, mode switch) so a stale filtered count from the previous
	// dataset doesn't linger until the next filter interaction.
	$effect(() => {
		rowData;
		displayedRowCount = null;
		hover.close(); // AG Grid recycles cell DOM; a stale anchor would mislead
	});
	const loadedItemsCount = $derived(displayedRowCount ?? rowData.length);
	const loading = $derived(contentQuery.isLoading || contentQuery.isPlaceholderData);
	const hasActiveFilters = $derived(Object.keys(filters).length > 0 || searchText !== '');

	// ---------------------------------------------------------------------------
	// Mode switch handler
	// ---------------------------------------------------------------------------

	// True when sorting is anything other than the default single updatedAt/desc —
	// i.e. multiple sorted columns, a single non-default column, or explicitly cleared.
	const hasActiveSort = $derived(
		mode === 'loaded'
			? clientSorts.length > 0
			: sorts.length !== 1 || sorts[0].col !== 'updatedAt' || sorts[0].dir !== 'desc',
	);

	// What the SortPickerDialog reads/writes — the URL list in "All Items" mode,
	// the grid-mirroring state in "Loaded" mode (works with or without a live grid).
	const activeSorts = $derived(mode === 'loaded' ? clientSorts : sorts);

	// The mobile card list has no AG Grid instance to sort for it. In "All Items" mode
	// the server already returned rows in the requested order; in "Loaded" mode, apply
	// clientSorts by hand. On desktop, AG Grid does this itself, so this is a no-op.
	const sortedRowData = $derived(
		mode === 'loaded' && cardMode && clientSorts.length > 0
			? [...rowData].sort((a, b) => compareContentBySorts(a, b, clientSorts))
			: rowData,
	);

	/**
	 * Clear all sorting. In "Loaded" mode, reset both our own tracking state and (when
	 * a grid exists) AG Grid's — the mobile card list has no grid, so clientSorts alone
	 * drives it. In "All Items" mode, sorting is server-side via the URL — push an
	 * explicit empty sort list (distinct from the param being absent, which means
	 * "default") so the grid/cards show unsorted server order.
	 */
	function handleClearSorts() {
		if (mode === 'loaded') {
			clientSorts = [];
			gridApi?.applyColumnState({ defaultState: { sort: null } });
		} else {
			cursors = [null];
			updateUrl({ sorts: [], page: 1 });
		}
	}

	/**
	 * Apply a full replacement sort list from the SortPickerDialog. In "All Items"
	 * mode this is just another URL update (identical to what onSortChanged does for
	 * grid-driven sorts). In "Loaded" mode, update our own tracking state and, when a
	 * grid exists, mirror it there too — on mobile (no grid), clientSorts alone drives
	 * the card list via sortedRowData above.
	 */
	function handleSortsApply(newSorts: SortSpec[]) {
		if (mode === 'all') {
			cursors = [null];
			updateUrl({ sorts: newSorts, page: 1 });
			return;
		}
		clientSorts = newSorts;
		gridApi?.applyColumnState({
			state: newSorts.map((s, i) => ({ colId: s.col, sort: s.dir, sortIndex: i })),
			defaultState: { sort: null },
		});
	}

	function handleModeToggle(newMode: DataMode) {
		// Reset pagination when switching modes
		cursors = [null];
		if (newMode === 'loaded') clientSorts = [];

		// When switching Loaded → All: sync AG Grid filter state to URL params
		if (newMode === 'all' && gridApi) {
			const filterModel = gridApi.getFilterModel();
			const urlFilters = filterToUrlParams(filterModel as Record<string, unknown>);
			updateUrl({ mode: newMode, page: 1, filters: urlFilters });
		} else {
			updateUrl({ mode: newMode, page: 1 });
		}
	}

	// ---------------------------------------------------------------------------
	// Pagination handlers
	// ---------------------------------------------------------------------------

	function handleNextPage() {
		if (pageNum < Math.ceil(totalCount / pageSize)) {
			updateUrl({ page: pageNum + 1 });
		}
	}

	function handlePrevPage() {
		if (pageNum > 1) {
			updateUrl({ page: pageNum - 1 });
		}
	}

	function handlePageSizeChange(newSize: number) {
		cursors = [null];
		updateUrl({ pageSize: newSize, page: 1 });
	}

	// ---------------------------------------------------------------------------
	// AG Grid column definitions
	// ---------------------------------------------------------------------------

	const modules = [ClientSideRowModelModule];

	const theme = themeQuartz.withParams(GRID_THEME_PARAMS);

	// flex = clamp-like: proportional sizing with min/max constraints
	// minWidth is auto-derived from headerName unless explicitly set (e.g. Item = 200)
	const columnDefs: ColDef<ContentItem>[] = (
		[
			{
				colId: 'perspectize',
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
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.perspectize },
			},
			{
				colId: 'item',
				headerName: 'Item',
				flex: 2,
				minWidth: 200,

				filter: 'agTextColumnFilter',
				filterValueGetter: (params) => params.data?.name ?? '',
				cellRenderer: activityItemCellRenderer,
				cellStyle: { padding: 0 },
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.item },
				headerTooltip: 'Video title and thumbnail from YouTube API',
			},
			{
				colId: 'type',
				headerName: 'Type',
				flex: 0.5,
				maxWidth: 100,

				filter: 'agTextColumnFilter',
				valueGetter: (params) => {
					const t = params.data?.contentType;
					if (!t) return '';
					return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
				},
				filterValueGetter: (params) => {
					return params.data?.contentType?.toLowerCase() ?? '';
				},
				cellRenderer: typeCellRenderer,
				headerTooltip: 'Content type',
			},
			{
				colId: 'category',
				headerName: 'Category',
				headerTooltip: 'Wikidata category',
				width: 150,
				sortable: false,
				filter: false,
				cellRenderer: categoryCellRenderer,
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.category },
				hide: true,
			},
			{
				colId: 'duration',
				headerName: 'Length',
				flex: 0.7,
				maxWidth: 120,

				filter: 'agNumberColumnFilter',
				filterParams: {
					allowedCharPattern: '\\d\\:',
					numberParser: parseDurationInput,
					numberFormatter: (value: number | null) => (value == null ? null : formatDurationSeconds(value)),
				},
				valueGetter: durationValueGetter,
				filterValueGetter: durationFilterValueGetter,
				comparator: (_valueA, _valueB, nodeA, nodeB) => {
					const a = nodeA?.data?.length ?? 0;
					const b = nodeB?.data?.length ?? 0;
					return a - b;
				},
				headerTooltip: 'Video duration from YouTube API',
			},
			{
				colId: 'views',
				field: 'viewCount',
				headerName: 'Views',
				flex: 0.8,
				maxWidth: 130,

				filter: 'agNumberColumnFilter',
				valueFormatter: (params) => formatCount(params.value),
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.views },
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
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.likes },
				headerTooltip: 'Like count from YouTube API',
			},
			{
				colId: 'percentLiked',
				headerName: '% Liked',
				flex: 0.8,
				maxWidth: 130,

				filter: false,
				valueGetter: percentLikedValueGetter,
				valueFormatter: (params) => formatPercentLiked(params.value),
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.percentLiked },
				comparator: (_valueA, _valueB, nodeA, nodeB) => {
					const a = percentLikedValueGetter({ data: nodeA?.data }) ?? -1;
					const b = percentLikedValueGetter({ data: nodeB?.data }) ?? -1;
					return a - b;
				},
				headerTooltip: 'Likes as a percentage of views',
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
				colId: 'tags',
				field: 'tags',
				headerName: 'Tags',
				flex: 1.5,
				maxWidth: 250,
				sortable: false,
				filter: 'agTextColumnFilter',
				filterValueGetter: (params) => formatTags(params.data?.tags ?? null),
				valueFormatter: (params) => formatTags(params.value),
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.tags },
				headerTooltip: 'Tags from YouTube API',
			},
			{
				colId: 'description',
				field: 'description',
				headerName: 'Description',
				flex: 2,
				sortable: false,
				filter: 'agTextColumnFilter',
				valueFormatter: (params) => truncateDescription(params.value, 80),
				context: { tooltipSpec: ACTIVITY_TOOLTIP_SPECS.description },
				headerTooltip: 'Video description from YouTube API',
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
		minWidth: col.minWidth ?? headerMinWidth(col.headerName ?? '', col.filter !== false),
	}));

	// ---------------------------------------------------------------------------
	// AG Grid options (mode-conditional event handlers)
	// ---------------------------------------------------------------------------

	let popover = $state<PopoverState | null>(null);
	const hover = createHoverController({
		getState: () => popover,
		setState: (s) => (popover = s),
	});

	function handleCellMouseOver(e: CellMouseOverEvent<ContentItem>) {
		const cellEl = (e.event?.target as HTMLElement | null)?.closest<HTMLElement>('.ag-cell');
		if (!cellEl || !e.colDef) return;
		hover.hover(cellEl, () =>
			buildPopoverState({
				colDef: e.colDef,
				value: e.value,
				valueFormatted: e.api.getCellValue<string>({
					rowNode: e.node,
					colKey: e.column,
					useFormatter: true,
				}),
				data: e.data,
				cellEl,
			}),
		);
	}

	onDestroy(() => hover.destroy());

	const gridOptions: GridOptions<ContentItem> = {
		columnDefs,
		pagination: false, // Manual pagination
		defaultColDef: {
			resizable: true,
		},
		tooltipShowDelay: 1000,
		tooltipInteraction: true,
		getRowId: contentRowId,
		domLayout: 'normal',
		suppressCellFocus: true,
		context: { perspectivesByContentId: new Map(), onOpenDetails: handleOpenDetails },
		onCellMouseOver: handleCellMouseOver,
		onCellMouseOut: () => hover.leave(),
		onBodyScroll: () => hover.close(),
		onCellClicked: (event: CellClickedEvent<ContentItem>) => {
			if (!event.data) return;

			if (event.colDef.colId === 'perspectize') {
				openPerspective(String(event.data.id), event.data.name);
			} else if (event.colDef.colId === 'category') {
				const rect =
					event.event?.target instanceof HTMLElement
						? event.event.target.getBoundingClientRect()
						: { left: 0, bottom: 0, x: 0, y: 0 };
				categoryPopoverContentId = parseInt(String(event.data.id), 10);
				categoryPopoverCurrentCategory = event.data.primaryCategory
					? {
							label: event.data.primaryCategory.label,
							wikidataQid: event.data.primaryCategory.wikidataQid,
						}
					: null;
				categoryPopoverPosition = { x: rect.left ?? rect.x, y: (rect.bottom ?? rect.y) + 4 };
				categoryPopoverOpen = true;
			}
		},
		onGridReady: (params) => {
			gridApi = params.api;
			gridReady = true;
		},
		onSortChanged: (event: SortChangedEvent) => {
			hover.close();
			// In "Loaded" mode, AG Grid handles client-side sort (including multi-column
			// via shift-click) entirely on its own — mirror its sort state into
			// clientSorts (read by "Clear sorts", the SortPickerDialog, and the mobile
			// card list, which has no grid of its own), then skip the URL update.
			if (mode === 'loaded') {
				clientSorts = event.api
					.getColumnState()
					.filter((col) => col.sort)
					.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
					.map((col) => ({
						col: col.colId ?? 'updatedAt',
						dir: col.sort === 'asc' ? ('asc' as const) : ('desc' as const),
					}));
				return;
			}
			// Skip if we triggered this event programmatically (to avoid loop)
			if (skipNextSortEvent) {
				skipNextSortEvent = false;
				return;
			}

			// Server-side: read every sorted column (multi-column sort applies shift-click
			// or ctrl-click in AG Grid), in priority order, and push the whole list to the URL.
			const sortModel = event.api
				.getColumnState()
				.filter((col) => col.sort)
				.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

			const newSorts: SortSpec[] = sortModel.map((col) => ({
				col: col.colId ?? 'updatedAt',
				dir: col.sort === 'asc' ? 'asc' : 'desc',
			}));

			cursors = [null]; // Reset cursor stack
			updateUrl({ sorts: newSorts.length > 0 ? newSorts : [], page: 1 });
		},
		onFilterChanged: (event: FilterChangedEvent) => {
			hover.close();
			// Immediate: update chip display
			activeFilterModel = event.api.getFilterModel();
			displayedRowCount = event.api.getDisplayedRowCount();

			// Debounce → convert filter model → update URL. In "Loaded" mode AG Grid already
			// filtered client-side; the URL write just keeps the URL authoritative, so a
			// cleared default filter (f=none) isn't re-applied by the restore effect below.
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const filterModel = event.api.getFilterModel();
				const urlFilters = filterToUrlParams(filterModel as Record<string, unknown>);
				if (filtersEqual(urlFilters, gridParams.filters)) return;
				if (mode === 'loaded') {
					updateUrl({ filters: urlFilters });
					return;
				}
				cursors = [null];
				updateUrl({ filters: urlFilters, page: 1 });
			}, 500);
		},
		// Prevent AG Grid from client-side re-sorting data that arrives pre-sorted from server
		postSortRows: () => {
			// In "All Items" mode, data is server-sorted — suppress AG Grid re-sort
			// In "Loaded" mode, let AG Grid sort normally (default behavior)
			if (mode === 'all') return;
		},
		overlayNoRowsTemplate: '<div class="py-12 text-center text-muted-foreground">No content yet</div>',
	};

	// ---------------------------------------------------------------------------
	// Effects
	// ---------------------------------------------------------------------------

	// Sync AG Grid sort indicators to URL state when switching to "All Items" mode
	// Uses skipNextSortEvent flag to prevent onSortChanged from re-updating the URL
	$effect(() => {
		if (!gridApi || !gridReady || mode !== 'all') return;
		skipNextSortEvent = true;
		gridApi.applyColumnState({
			state: gridParams.sorts.map((s, i) => ({ colId: s.col, sort: s.dir, sortIndex: i })),
			defaultState: { sort: null },
		});
	});

	// Restore AG Grid filter state from URL on mount and mode changes
	$effect(() => {
		if (!gridApi || !gridReady) return;
		const filterModel = urlParamsToFilter(gridParams.filters);
		gridApi.setFilterModel(Object.keys(filterModel).length > 0 ? filterModel : null);
	});

	// Update loading state reactively
	$effect(() => {
		if (gridApi) {
			gridApi.setGridOption('loading', loading);
		}
	});

	// Update empty state message based on active filters
	$effect(() => {
		if (!gridApi) return;
		const template = hasActiveFilters
			? '<div class="py-12 text-center"><p class="text-muted-foreground mb-1">No results match your filters</p><p class="text-xs text-muted-foreground/70">Try adjusting or clearing your filters</p></div>'
			: '<div class="py-12 text-center text-muted-foreground">No content yet</div>';
		gridApi.setGridOption('overlayNoRowsTemplate', template);
	});

	// Responsive breakpoint detection — 4 tiers for progressive column reveal
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mqSm = window.matchMedia('(min-width: 445px)');
		const mqMd = window.matchMedia('(min-width: 640px)');
		const mqLg = window.matchMedia('(min-width: 900px)');
		const update = () => {
			if (mqLg.matches) responsiveTier = 'lg';
			else if (mqMd.matches) responsiveTier = 'md';
			else if (mqSm.matches) responsiveTier = 'sm';
			else responsiveTier = 'xs';
		};
		update();
		mqSm.addEventListener('change', update);
		mqMd.addEventListener('change', update);
		mqLg.addEventListener('change', update);
		return () => {
			mqSm.removeEventListener('change', update);
			mqMd.removeEventListener('change', update);
			mqLg.removeEventListener('change', update);
		};
	});

	// Card-mode breakpoint: below 860px, replace the grid with stacked cards entirely.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 859px)');
		const update = () => {
			cardMode = mq.matches;
		};
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	// Null out gridApi on destroy to prevent $effect callbacks hitting a destroyed grid
	$effect(() => {
		return () => {
			gridApi = null;
			gridReady = false;
		};
	});

	// cardMode unmounts AgGridSvelte5Component (destroying the grid) without the above
	// teardown running — clear the stale reference so other $effects' `!gridApi` guards
	// don't call methods on an already-destroyed grid instance.
	$effect(() => {
		if (cardMode) {
			gridApi = null;
			gridReady = false;
		}
	});

	// Update AG Grid context reactively so perspectiveCellRenderer can access the map
	$effect(() => {
		if (gridApi) {
			gridApi.setGridOption('context', {
				perspectivesByContentId,
				onOpenDetails: handleOpenDetails,
			});
			gridApi.refreshCells({ columns: ['perspectize'], force: true });
		}
	});

	// Responsive column visibility — progressive reveal by tier
	// xs (<445px):  Perspectize, Item, Type
	// sm (445-639): Perspectize, Item, Type, Category, Channel
	// md (640-899): Perspectize, Item, Type, Category, Channel, Duration, Date
	// lg (900+):    Perspectize, Item, Type, Category, Channel, Duration, Date, Views, Likes, Tags
	$effect(() => {
		if (!gridApi || !gridReady) return;
		const api = gridApi;
		// Once the user takes manual control via the column picker, that map is the
		// source of truth for the rest of the session — re-applied here so it also
		// survives a grid remount (cardMode toggle, error recovery). A page refresh
		// clears userColumnOverride and restores breakpoint-driven visibility.
		if (userColumnOverride) {
			const override = userColumnOverride;
			requestAnimationFrame(() => {
				if (!gridApi) return;
				for (const [colId, visible] of Object.entries(override)) {
					api.setColumnsVisible([colId], visible);
				}
			});
			return;
		}
		const tier = responsiveTier;
		requestAnimationFrame(() => {
			if (!gridApi) return; // Grid may have been destroyed before rAF fires
			const alwaysVisible = ['item', 'type', 'perspectize'];
			const smCols = ['category', 'channel'];
			const mdCols = ['duration', 'publishDate'];
			const lgCols = ['views', 'likes', 'percentLiked', 'tags'];
			// createdAt/updatedAt stay hidden via their colDef `hide: true` until the
			// user enables them in the column picker; id/addedByUserID/url likewise, admins only.
			const alwaysHidden = ['description'];

			api.setColumnsVisible(alwaysVisible, true);
			api.setColumnsVisible(alwaysHidden, false);
			api.setColumnsVisible(smCols, tier !== 'xs');
			api.setColumnsVisible(mdCols, tier === 'md' || tier === 'lg');
			api.setColumnsVisible(lgCols, tier === 'lg');
		});
	});

	// Switch to autoHeight on mobile — eliminates empty gap below last row
	$effect(() => {
		if (!gridApi || !gridReady) return;
		gridApi.setGridOption('domLayout', isMobile ? 'autoHeight' : 'normal');
	});

	// Re-evaluate flex column widths when the grid container resizes
	// (e.g. DevTools panel open/close, sidebar toggle)
	let gridContainer = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!gridContainer || !gridApi || !gridReady) return;
		const api = gridApi;
		const observer = new ResizeObserver(() => {
			if (!gridApi) return; // Grid may have been destroyed before observer fires
			api.sizeColumnsToFit();
		});
		observer.observe(gridContainer);
		return () => observer.disconnect();
	});
</script>

<div class="flex flex-col h-full gap-4">
	<!-- Active Filter Chips — always visible so users can clear filters even during errors -->
	<FilterChips
		{gridApi}
		filterModel={gridApi ? activeFilterModel : urlParamsToFilter(filters)}
		onRemove={(colId) => {
			const next = { ...gridParams.filters };
			delete next[colId];
			cursors = [null];
			updateUrl({ filters: next, page: 1 });
		}}
		onClearAll={() => {
			cursors = [null];
			updateUrl({ filters: {}, page: 1 });
		}}
	/>

	<!-- Error State -->
	{#if contentQuery.isError}
		<div class="flex-1 min-h-0 flex items-center justify-center">
			<div class="text-center py-12 px-4">
				<p class="text-muted-foreground mb-2">Failed to load content. Please try again.</p>
				{#if hasActiveFilters}
					<p class="text-xs text-muted-foreground/70 mb-4">
						Your active filters may be causing this issue. Try clearing them.
					</p>
				{/if}
				<button
					onclick={() => contentQuery.refetch()}
					class="px-4 py-2 text-sm font-medium border border-input rounded-md bg-background hover:bg-accent"
				>
					Retry
				</button>
			</div>
		</div>
	{:else if cardMode}
		<div class="flex-1 min-h-0 overflow-y-auto">
			<ActivityCardList
				rowData={sortedRowData}
				{perspectiveContentIds}
				onOpenDetails={handleOpenDetails}
				onAddPerspective={handleAddPerspectiveFromCard}
			/>
		</div>
	{:else}
		<!-- AG Grid -->
		<div
			bind:this={gridContainer}
			data-testid="ag-grid-container"
			class="{isMobile ? 'overflow-y-auto' : 'flex-1'} min-h-0"
			style="--ag-row-height: 64px; --ag-header-height: 40px;"
		>
			<AgGridSvelte5Component {gridOptions} {rowData} {theme} {modules} />
		</div>
		<CellPopover
			state={popover}
			onEnter={() => hover.enter()}
			onLeave={() => hover.popoverLeave()}
			onClose={() => (popover = null)}
		/>
	{/if}

	<!-- Manual Pagination Controls -->
	<div
		class="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 px-2 md:px-4 py-2 border-t border-border text-xs md:text-sm"
	>
		<div class="flex items-center gap-2 md:gap-4">
			<div class="text-muted-foreground">
				{totalCount} total
			</div>
			<!-- Data Mode Toggle -->
			<DataModeToggle {mode} loadedCount={loadedItemsCount} onToggle={handleModeToggle} />
			{#if !cardMode}
				<button
					type="button"
					aria-label="Choose columns"
					onclick={() => (columnPickerOpen = true)}
					disabled={!gridReady}
					class="inline-flex items-center gap-1.5 px-2 py-1 text-sm border border-input rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<SlidersHorizontalIcon class="size-4" />
					<span class="hidden md:inline">Columns</span>
				</button>
			{/if}
			<!-- Sort controls — shown on mobile too (unlike Columns): the picker doesn't
			     depend on AG Grid, and the mobile card list has its own sort applied via
			     sortedRowData/clientSorts, so there's no grid-readiness gate here. -->
			<button
				type="button"
				aria-label="Edit sorts"
				title="Or shift-click column headers to sort by multiple columns"
				onclick={() => (sortPickerOpen = true)}
				class="inline-flex items-center gap-1.5 px-2 py-1 text-sm border border-input rounded-md bg-background hover:bg-accent"
			>
				<ListOrderedIcon class="size-4" />
				<span class="hidden md:inline">Edit sorts</span>
			</button>
			<button
				type="button"
				aria-label="Clear sorts"
				onclick={handleClearSorts}
				disabled={!hasActiveSort}
				class="inline-flex items-center gap-1.5 px-2 py-1 text-sm border border-input rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<ArrowUpDownIcon class="size-4" />
				<span class="hidden md:inline">Clear sorts</span>
			</button>
			{#if mode === 'all'}
				<div class="hidden md:flex items-center gap-2">
					<label for="pageSize" class="text-muted-foreground">Page size:</label>
					<select
						id="pageSize"
						value={pageSize}
						onchange={(e) => handlePageSizeChange(Number(e.currentTarget.value))}
						class="px-2 py-1 text-sm border border-input rounded-md bg-background"
					>
						<option value={10}>10</option>
						<option value={25}>25</option>
						<option value={50}>50</option>
					</select>
				</div>
			{/if}
		</div>

		{#if mode === 'all'}
			<div class="flex items-center gap-2">
				<button
					onclick={handlePrevPage}
					disabled={pageNum <= 1}
					class="px-3 py-1 text-sm border border-input rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<span class="hidden sm:inline">Previous</span><span class="sm:hidden">&lt;</span>
				</button>
				<span class="text-muted-foreground">
					Page {pageNum} of {Math.ceil(totalCount / pageSize) || 1}
				</span>
				<button
					onclick={handleNextPage}
					disabled={pageNum >= Math.ceil(totalCount / pageSize)}
					class="px-3 py-1 text-sm border border-input rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<span class="hidden sm:inline">Next</span><span class="sm:hidden">&gt;</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<!-- Perspective create/edit modal — rendered outside the grid for correct portal behavior.
     Dynamically imported: it's the only path into the Tiptap-based PerspectiveEditor
     (~170KB gzipped), which would otherwise load eagerly on every visit to this page
     even for users who never open the editor. -->
{#if popoverOpen && popoverContentId !== null}
	{#await import('$lib/components/PerspectivePopover.svelte') then { default: PerspectivePopover }}
		<PerspectivePopover
			contentId={popoverContentId}
			contentName={popoverContentName}
			existingPerspective={popoverExistingPerspective}
			userId={currentUserId ?? 0}
			bind:open={popoverOpen}
			onClose={() => {
				popoverOpen = false;
			}}
		/>
	{/await}
{/if}

<!-- Activity item details modal — rendered outside the grid for correct portal behavior -->
<ActivityDetailsModal
	content={detailsModalContent}
	open={detailsModalContentId !== null}
	onClose={handleCloseDetails}
/>

<!-- Column picker — session-only show/hide, admin-gated internal columns.
     Mounted only while open (matches PerspectivePopover) so bits-ui's body
     scroll-lock never lingers. -->
{#if columnPickerOpen}
	<ColumnPickerDialog
		bind:open={columnPickerOpen}
		isAdmin={meCtx.isAdmin}
		visibility={pickerVisibility}
		{overrideActive}
		onToggle={handleColumnToggle}
	/>
{/if}

<!-- Sort picker — works identically on mobile and desktop, and in both data modes;
     see handleSortsApply for how each mode is wired underneath. -->
{#if sortPickerOpen}
	<SortPickerDialog bind:open={sortPickerOpen} sorts={activeSorts} onApply={handleSortsApply} />
{/if}

<!-- Category typeahead popover — rendered outside the grid for correct portal positioning -->
{#if categoryPopoverOpen}
	<button
		type="button"
		class="fixed inset-0 z-40"
		onclick={() => {
			categoryPopoverOpen = false;
		}}
		aria-label="Close category search"
	></button>
	<div
		class="fixed z-50 rounded-md border bg-popover shadow-md"
		style="left: {categoryPopoverPosition.x}px; top: {categoryPopoverPosition.y}px;"
	>
		<CategoryTypeahead
			contentId={categoryPopoverContentId ?? 0}
			currentCategory={categoryPopoverCurrentCategory}
			onSelect={handleCategorySelect}
			onClose={() => {
				categoryPopoverOpen = false;
			}}
		/>
	</div>
{/if}

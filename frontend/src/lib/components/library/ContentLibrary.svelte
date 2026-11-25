<script lang="ts">
	import AgGridSvelte5Component from 'ag-grid-svelte5';
	import LazyLoadError from '#lib/components/LazyLoadError.svelte';
	import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
	import type {
		GridApi,
		GridOptions,
		SortChangedEvent,
		FilterChangedEvent,
		CellClickedEvent,
		CellMouseOverEvent,
	} from '@ag-grid-community/core';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { ContentItem } from '#lib/queries/content/index.js';
	import { useContentDetails } from '#lib/queries/content/useContentDetails.js';
	import { OPEN_CONTENT_PARAM } from '#lib/utils/contentLinks.js';
	import type { PerspectiveItem } from '#lib/queries/perspectives/index.js';
	import {
		parseGridParams,
		serializeGridParams,
		urlParamsToFilter,
		filterToUrlParams,
		filtersEqual,
		nonGridFilters,
	} from '#lib/utils/gridUrlState.js';
	import type { DataMode, GridParams, SortSpec } from '#lib/utils/gridUrlState.js';
	import { contentRowId, moviePeople, PERSON_ID_ATTR } from '#lib/utils/formatting.js';
	import {
		itemColumnHeader,
		soloTypeFilter,
		CLIENT_ONLY_SORT_COLS,
		sortableColumnsFor,
		compareContentBySorts,
		filterContentRows,
		togglableColIds,
		syncItemHeader,
		PERSON_FILTER_KEY,
		parsePersonFilter,
		rowMatchesPerson,
		showColumnRelevanceCallout,
	} from '#lib/utils/grid-config.js';
	import { LIBRARY_GRID_THEME } from '#lib/utils/grid-theme.js';
	import { emptyCellClassRules } from '#lib/utils/grid-empty.js';
	import { useCardMode, useResponsiveTier } from '#lib/utils/responsive.svelte.js';
	import { useMe } from '#lib/queries/users/useMe.svelte.js';
	import ColumnPickerDialog from '#lib/components/ColumnPickerDialog.svelte';
	import ExportMenu from '#lib/components/ExportMenu.svelte';
	import PrintListView from '#lib/components/PrintListView.svelte';
	import PrintOptionsDialog from '#lib/components/PrintOptionsDialog.svelte';
	import { isExportDisabled } from '#lib/utils/exportGrid.js';
	import ColumnChartPopover from '#lib/components/charts/ColumnChartPopover.svelte';
	import {
		COLUMN_VIEW_LABEL,
		clearLayout,
		columnViewFor,
		defaultLayout,
		loadLayout,
		planColumnSwitch,
		saveLayout,
		type ColumnLayout,
		type ColumnView,
	} from '#lib/utils/columnLayouts.js';
	import { toast } from 'svelte-sonner';
	import SortPickerDialog from '#lib/components/SortPickerDialog.svelte';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
	import CellPopover, { type PopoverState } from '#lib/components/CellPopover.svelte';
	import { buildPopoverState, createHoverController } from '#lib/utils/tooltipHover.js';
	import { onDestroy } from 'svelte';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import DataModeToggle from '#lib/components/DataModeToggle.svelte';
	import FilterChips from '#lib/components/FilterChips.svelte';
	import ColumnRelevanceCallout from '#lib/components/ColumnRelevanceCallout.svelte';
	import ContentDetailsModal from '#lib/components/ContentDetailsModal.svelte';
	import LibraryCardList from '#lib/components/library/LibraryCardList.svelte';
	import { buildLibraryColumnDefs } from '#lib/components/library/columns.js';
	import { createGridHandle } from '#lib/utils/gridHandle.svelte.js';
	import { createLibraryExport } from '#lib/components/library/libraryExport.svelte.js';
	import { createColumnCharts } from '#lib/components/library/columnCharts.svelte.js';
	import { useLibraryList } from '#lib/queries/content/useLibraryList.svelte.js';
	import { useMyPerspectives } from '#lib/queries/perspectives/useMyPerspectives.js';
	import AddToPlanDialog from '#lib/components/plan/AddToPlanDialog.svelte';
	import CategoryTypeahead from '#lib/components/CategoryTypeahead.svelte';
	import { useSetPrimaryCategory } from '#lib/queries/categories/useSetPrimaryCategory.js';
	import type { WikidataSearchResult } from '#lib/queries/categories/index.js';

	// Popover state for Perspectize column
	let popoverOpen = $state(false);
	let popoverContentId = $state<number | null>(null);
	let popoverContentName = $state('');
	let popoverExistingPerspective = $state<PerspectiveItem | null>(null);

	// Popover state for Category column
	let categoryPopoverOpen = $state(false);
	let categoryPopoverContentId = $state<number | null>(null);
	let categoryPopoverCurrentCategory = $state<{
		label: string;
		wikidataQid: string;
		wikipediaUrl?: string | null;
	} | null>(null);
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

	// From the details modal: close it first so the two dialogs never stack, then open the editor.
	function handleAddPerspectiveFromDetails(content: { id: string; name: string }) {
		handleCloseDetails();
		openPerspective(content.id, content.name);
	}

	function handleAddPerspectiveFromCard(contentId: string) {
		const row = rowData.find((item) => String(item.id) === contentId);
		openPerspective(contentId, row?.name ?? '');
	}

	// "Add to plan" target (the TodoDialog in create mode). Set from the details modal
	// or a card; the details modal closes first so the two dialogs never stack.
	let planContent = $state<{ id: number; name: string } | null>(null);

	function handleAddToPlan(content: { id: string; name: string }) {
		handleCloseDetails();
		planContent = { id: parseInt(content.id, 10), name: content.name };
	}

	function handleAddToPlanFromCard(contentId: string) {
		const row = rowData.find((item) => String(item.id) === contentId);
		handleAddToPlan({ id: contentId, name: row?.name ?? '' });
	}

	// Mobile card-list breakpoint (< 860px) — replaces the AG Grid entirely, per design handoff.
	const card = useCardMode();
	const grid = createGridHandle<ContentItem>();
	const exporter = createLibraryExport({ grid, normalDomLayout: () => normalDomLayout });
	// Export's As-seen print keeps the grid mounted even though a Letter page matches the card query.
	const cardMode = $derived(card.current && !exporter.printingAsSeen);

	// Signed-in user — drives the admin-only "Internal" group in the column picker.
	const meCtx = useMe();

	// Column picker. Each column view (Movie, or the general set; see columnLayouts.ts)
	// keeps its own saved setup in localStorage once the user changes a column, and the
	// visibility $effect below applies it instead of that view's responsive defaults.
	// `layoutVersion` bumps after every save/clear so that effect and the picker re-read.
	let columnPickerOpen = $state(false);
	let layoutVersion = $state(0);
	const customLayout = $derived.by(() => {
		void layoutVersion;
		return loadLayout(columnView) !== null;
	});

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
		const base = loadLayout(columnView) ?? currentVisibility();
		saveLayout(columnView, { ...base, [colId]: next });
		gridApi.setColumnsVisible([colId], next);
		layoutVersion++;
	}

	function handleColumnsReset() {
		clearLayout(columnView);
		layoutVersion++;
	}

	function applyLayout(api: GridApi, layout: ColumnLayout) {
		const entries = Object.entries(layout);
		api.setColumnsVisible(
			entries.filter(([, v]) => v).map(([c]) => c),
			true,
		);
		api.setColumnsVisible(
			entries.filter(([, v]) => !v).map(([c]) => c),
			false,
		);
	}

	/** After a switch of column view: offer the previous columns back, or the picker. */
	function showColumnSwitchToast(view: ColumnView, previous: ColumnLayout) {
		toast.warning(`Showing ${COLUMN_VIEW_LABEL[view]}`, {
			id: 'column-view-switch',
			action: {
				label: 'Revert',
				onClick: () => {
					saveLayout(view, previous);
					layoutVersion++;
				},
			},
			cancel: {
				label: 'Choose columns',
				onClick: () => (columnPickerOpen = true),
			},
		});
	}

	// Checkbox state for the dialog — recomputed when it opens and after every
	// toggle so the checkboxes track the live grid.
	const pickerVisibility = $derived.by(() => {
		void columnPickerOpen;
		void layoutVersion;
		return columnPickerOpen ? currentVisibility() : {};
	});

	// ---------------------------------------------------------------------------
	// URL-derived state
	// ---------------------------------------------------------------------------

	// Derive grid params from current URL (reactive to URL changes)
	const gridParams = $derived(parseGridParams(new URLSearchParams(page.url.search)));

	// Individual derived fields from URL
	const mode = $derived(gridParams.mode);
	const sorts = $derived(gridParams.sorts);
	const pageNum = $derived(gridParams.page); // 1-indexed
	const pageSize = $derived(gridParams.pageSize);
	const searchText = $derived(gridParams.q);
	const filters = $derived(gridParams.filters);
	/** Which saved/default column set applies (columnLayouts.ts): Movie, or the general set. */
	const columnView = $derived(columnViewFor(filters.type));
	// `f.person` (TMDB id, optional `:cast`/`:director`): has no grid column, so it is tracked apart from the grid filter model.
	const personFilter = $derived(parsePersonFilter(filters[PERSON_FILTER_KEY]));

	/** Filter to movies crediting this person (clicking a name in the Cast cell). */
	function filterByPerson(personId: string) {
		hover.close();
		list.resetCursors();
		updateUrl({ filters: { ...gridParams.filters, [PERSON_FILTER_KEY]: personId }, page: 1 });
	}

	// ---------------------------------------------------------------------------
	// URL update helper
	// ---------------------------------------------------------------------------

	function updateUrl(changes: Partial<GridParams>, replace = true) {
		const updated = { ...gridParams, ...changes };
		const search = serializeGridParams(updated);
		const url = search ? `?${search}` : page.url.pathname;
		goto(url, { replace, reset: false });
	}

	// ---------------------------------------------------------------------------
	// Grid state
	// ---------------------------------------------------------------------------

	const gridApi = $derived(grid.api);
	const gridReady = $derived(grid.ready);
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
	const responsive = useResponsiveTier();
	const responsiveTier = $derived(responsive.current);
	const isMobile = $derived(responsiveTier === 'xs' || responsiveTier === 'sm');

	// Current user for the perspectives query — derived straight from the Clerk
	// session (`me`), NOT the legacy `userSelection` store, which is only ever a
	// lagging mirror of `me.id` maintained by AuthUserSync and is null during the
	// ClerkLoaded → me-query → effect settle window. Reading `me` directly means
	// the +/glasses affordance reflects the signed-in user as soon as `me` resolves.
	const currentUserId = $derived(meCtx.me ? parseInt(meCtx.me.id, 10) : null);

	// The user's perspectives — used to determine +/glasses icon per row
	const perspectivesQuery = useMyPerspectives(() => currentUserId);

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

	// The content list for the current URL params: rows, counts, and the cursor stack for "All" mode.
	const list = useLibraryList(() => gridParams);
	const rowData = $derived(list.rows);
	const detailsModalRow = $derived(rowData.find((item) => String(item.id) === detailsModalContentId) ?? null);
	// A deep-linked item (`?open=<id>`, e.g. from a "Go to" toast or a verse jump) is
	// often not on the loaded page — fetch just that row so the modal can still open.
	const detailsFallbackQuery = useContentDetails(
		() => detailsModalContentId,
		() => detailsModalRow === null && !list.isPending,
	);
	const detailsModalContent = $derived(detailsModalRow ?? detailsFallbackQuery.data?.contentByID ?? null);

	// Consume `?open=<id>`: open that item's details, then strip the param (replaceState)
	// so a refresh or later grid URL update doesn't reopen it.
	$effect(() => {
		const id = page.url.searchParams.get(OPEN_CONTENT_PARAM);
		if (!id) return;
		detailsModalContentId = id;
		const params = new URLSearchParams(page.url.search);
		params.delete(OPEN_CONTENT_PARAM);
		const search = params.toString();
		goto(search ? `?${search}` : page.url.pathname, { replace: true, reset: false });
	});
	const totalCount = $derived(list.totalCount);
	// The grid reports its displayed (post-filter) row count through onModelUpdated, which also
	// fires when row data is replaced under an active filter; the count is cleared on grid teardown.
	$effect(() => {
		rowData;
		hover.close(); // AG Grid recycles cell DOM; a stale anchor would mislead
	});
	const loadedItemsCount = $derived(displayedRowCount ?? rowData.length);
	const loading = $derived(list.loading);
	// Chip text for the person filter: the name from any loaded row, else the bare TMDB id.
	const personChipLabel = $derived.by(() => {
		if (!personFilter) return '';
		for (const r of rowData) {
			const hit = moviePeople(r).find((p) => p.id === personFilter.id);
			if (hit) return hit.name;
		}
		return `TMDB #${personFilter.id}`;
	});
	const chipFilterModel = $derived<Record<string, any>>({
		...(gridApi ? activeFilterModel : urlParamsToFilter(filters)),
		...(personFilter ? { [PERSON_FILTER_KEY]: { filterType: 'person', filter: personChipLabel } } : {}),
	});
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

	// The mobile card list has no AG Grid instance to sort or filter for it. In "All
	// Items" mode the server already returned rows in the requested (and filtered)
	// order; in "Loaded" mode, apply clientSorts and the URL filters by hand, or the
	// mobile card view would silently ignore every column filter. On desktop, AG Grid
	// does both itself, so this is a no-op there.
	const sortedRowData = $derived(
		mode === 'loaded' && cardMode
			? (() => {
					const byColumns = filterContentRows(rowData, urlParamsToFilter(filters));
					const filtered = personFilter ? byColumns.filter((r) => rowMatchesPerson(r, personFilter)) : byColumns;
					return clientSorts.length > 0
						? [...filtered].sort((a, b) => compareContentBySorts(a, b, clientSorts))
						: filtered;
				})()
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
			list.resetCursors();
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
			list.resetCursors();
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
		list.resetCursors();
		if (newMode === 'loaded') clientSorts = [];

		// When switching Loaded → All: sync AG Grid filter state to URL params
		if (newMode === 'all' && gridApi) {
			const filterModel = gridApi.getFilterModel();
			const urlFilters = {
				...filterToUrlParams(filterModel as Record<string, unknown>),
				...nonGridFilters(gridParams.filters),
			};
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
		list.resetCursors();
		updateUrl({ pageSize: newSize, page: 1 });
	}

	// ---------------------------------------------------------------------------
	// AG Grid column definitions
	// ---------------------------------------------------------------------------

	const modules = [ClientSideRowModelModule];

	const theme = LIBRARY_GRID_THEME;

	// Column charts (numeric columns in the Movie view, "Loaded" mode, desktop grid).
	const charts = createColumnCharts({
		grid,
		view: () => ({ mode, cardMode, typeFilter: filters.type, layoutVersion }),
		container: () => gridContainer,
		onFlagChange: () => layoutVersion++,
	});

	const columnDefs = buildLibraryColumnDefs({
		chartHeaderParams: charts.headerParams,
		suppressChartKeyboard: charts.suppressKeyboard,
	});

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
			cellClassRules: emptyCellClassRules,
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
			} else if (event.colDef.colId === 'cast') {
				// A name in the Cast cell filters to that person (TMDB id carried on the span).
				const nameEl = (event.event?.target as HTMLElement | null)?.closest<HTMLElement>(`[${PERSON_ID_ATTR}]`);
				const personId = nameEl?.getAttribute(PERSON_ID_ATTR);
				if (personId) filterByPerson(personId);
			} else if (event.colDef.colId === 'category') {
				hover.close(); // don't leave the hover copy-popover open under the typeahead
				const rect =
					event.event?.target instanceof HTMLElement
						? event.event.target.getBoundingClientRect()
						: { left: 0, bottom: 0, x: 0, y: 0 };
				categoryPopoverContentId = parseInt(String(event.data.id), 10);
				categoryPopoverCurrentCategory = event.data.primaryCategory
					? {
							label: event.data.primaryCategory.label,
							wikidataQid: event.data.primaryCategory.wikidataQid,
							wikipediaUrl: event.data.primaryCategory.wikipediaUrl,
						}
					: null;
				categoryPopoverPosition = { x: rect.left ?? rect.x, y: (rect.bottom ?? rect.y) + 4 };
				categoryPopoverOpen = true;
			}
		},
		...grid.options({ onDetach: () => (displayedRowCount = null) }),
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

			list.resetCursors();
			updateUrl({ sorts: newSorts.length > 0 ? newSorts : [], page: 1 });
		},
		// The person filter has no column, so "Loaded" mode applies it here, alongside the column filters.
		isExternalFilterPresent: () => personFilter != null,
		doesExternalFilterPass: (node) => (personFilter && node.data ? rowMatchesPerson(node.data, personFilter) : false),
		onModelUpdated: (event) => {
			displayedRowCount = event.api.getDisplayedRowCount();
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
				const urlFilters = {
					...filterToUrlParams(filterModel as Record<string, unknown>),
					...nonGridFilters(gridParams.filters),
				};
				if (filtersEqual(urlFilters, gridParams.filters)) return;
				if (mode === 'loaded') {
					updateUrl({ filters: urlFilters });
					return;
				}
				list.resetCursors();
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
			// Drop client-only columns (a stale URL sort): the server cannot honour them.
			state: gridParams.sorts
				.filter((s) => !CLIENT_ONLY_SORT_COLS.includes(s.col))
				.map((s, i) => ({ colId: s.col, sort: s.dir, sortIndex: i })),
			defaultState: { sort: null },
		});
	});

	// Client-only sort columns (no ContentSortBy key) can sort in "Loaded" mode but would
	// silently do nothing in "All Items" mode, so switch their header sorting off there.
	// AG Grid reads colDef.sortable live; refreshHeader redraws the header without touching
	// the column visibility state the responsive effect owns.
	$effect(() => {
		const sortableHere = mode === 'loaded';
		if (!gridApi || !gridReady) return;
		for (const colId of CLIENT_ONLY_SORT_COLS) {
			const colDef = gridApi.getColumn(colId)?.getColDef();
			if (colDef) colDef.sortable = sortableHere;
		}
		gridApi.refreshHeader();
	});

	// The Item column reads "Film" in the Movie view. headerName is read live; refreshHeader redraws it.
	// syncItemHeader redraws only on a real rename: this effect re-runs on every filter change.
	$effect(() => {
		const headerName = itemColumnHeader(filters.type);
		if (!gridApi || !gridReady) return;
		syncItemHeader(gridApi, headerName);
	});

	// Restore AG Grid filter state from URL on mount and mode changes
	$effect(() => {
		const api = grid.live();
		if (!api) return;
		const filterModel = urlParamsToFilter(gridParams.filters);
		api.setFilterModel(Object.keys(filterModel).length > 0 ? filterModel : null);
	});

	// Re-run the grid's filters when the person filter changes (external filters aren't tracked by the model).
	$effect(() => {
		void personFilter;
		if (!gridApi || !gridReady) return;
		gridApi.onFilterChanged();
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

	// Drop the grid API on destroy to prevent $effect callbacks hitting a destroyed grid
	$effect(() => {
		return () => grid.detach();
	});

	// cardMode unmounts AgGridSvelte5Component (destroying the grid) without the above
	// teardown running — clear the stale reference so other $effects' `!gridApi` guards
	// don't call methods on an already-destroyed grid instance.
	$effect(() => {
		if (cardMode) grid.detach();
	});

	// Update AG Grid context reactively so perspectiveCellRenderer can access the map
	$effect(() => {
		if (gridApi) {
			gridApi.setGridOption('context', {
				perspectivesByContentId,
				onOpenDetails: handleOpenDetails,
			});
			gridApi.refreshCells({ columns: ['perspectize', 'myQuality', 'myImportance', 'myAgreement'], force: true });
		}
	});

	// Responsive column visibility — progressive reveal by tier
	// xs (<445px):  Perspectize, Item, Type
	// sm (445-639): Perspectize, Item, Type, Category, Channel
	// md (640-899): Perspectize, Item, Type, Category, Channel, Duration, Date
	// lg (900+):    Perspectize, Item, Type, Category, Channel, Duration, Date, Views, Likes, Tags
	// With the type filter exactly MOVIE, BOOK or CLAIM, that view's set applies instead (defaultColumnVisibility).
	// A view with a saved setup (column picker) shows that instead of its defaults, which
	// also re-applies it after a grid remount (cardMode toggle, error recovery).
	// Switching view (e.g. to exactly MOVIE) shows a toast offering the previous columns back.
	let lastColumnView: ColumnView | null = null; // plain, not $state: written by the effect it guards
	$effect(() => {
		if (!gridApi || !gridReady) {
			// No grid: the next mount is a fresh start, not a switch, so no toast.
			lastColumnView = null;
			return;
		}
		void layoutVersion;
		// Read synchronously, before the rAF, so this effect re-runs when they change.
		const tier = responsiveTier;
		const view = columnView;
		// Read synchronously too: a change of the one type named (youtube -> bible_passage) keeps the
		// view but moves Type's visibility, so the effect must re-run on it.
		const solo = soloTypeFilter(filters.type);
		const prevView = lastColumnView;
		lastColumnView = view;
		const current = prevView !== null && prevView !== view ? currentVisibility() : {};
		const plan = planColumnSwitch({
			prevView,
			view,
			current,
			saved: loadLayout(view),
			defaults: defaultLayout(tier, view, solo),
		});
		// Not cancelled on re-run: a superseded run's toast offer must still show.
		grid.afterFrame((api) => {
			applyLayout(api, plan.apply);
			if (plan.toast) showColumnSwitchToast(view, current);
		});
	});

	// Export: the grid is read at click time, so the output matches what the toolbar shows.
	const exportDisabled = $derived(isExportDisabled({ gridReady, loading, displayedRows: loadedItemsCount }));

	// The grid's resting layout; a print run restores this, not a fixed value.
	const normalDomLayout = $derived(isMobile ? 'autoHeight' : 'normal');

	// Switch to autoHeight on mobile — eliminates empty gap below last row
	$effect(() => {
		if (!gridApi || !gridReady) return;
		gridApi.setGridOption('domLayout', normalDomLayout);
	});

	// Re-evaluate flex column widths when the grid container resizes
	// (e.g. DevTools panel open/close, sidebar toggle)
	let gridContainer = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!gridContainer || !gridApi || !gridReady) return;
		const api = gridApi;
		const observer = new ResizeObserver(() => {
			if (api.isDestroyed()) return; // Grid may have been destroyed before observer fires
			api.sizeColumnsToFit();
		});
		observer.observe(gridContainer);
		return () => observer.disconnect();
	});
</script>

<div class="flex flex-col h-full gap-0">
	<!-- Active Filter Chips — always visible so users can clear filters even during errors -->
	<FilterChips
		{gridApi}
		filterModel={chipFilterModel}
		onRemove={(colId) => {
			const next = { ...gridParams.filters };
			delete next[colId];
			list.resetCursors();
			updateUrl({ filters: next, page: 1 });
		}}
		onClearAll={() => {
			list.resetCursors();
			updateUrl({ filters: {}, page: 1 });
		}}
		onClearAllButType={() => {
			list.resetCursors();
			const { type } = gridParams.filters;
			updateUrl({ filters: type ? { type } : {}, page: 1 });
		}}
	/>

	<!-- Mixed/unfiltered types share one column set, so many cells are blank. The card list
	     has no filter popup or Columns button to point at, so it skips the callout. -->
	{#if !cardMode && showColumnRelevanceCallout(filters.type)}
		<ColumnRelevanceCallout
			disabled={!gridReady}
			onPickType={() => gridApi?.showColumnFilter('type')}
			onChooseColumns={() => (columnPickerOpen = true)}
		/>
	{/if}

	<!-- Error State -->
	{#if list.isError}
		<div class="flex-1 min-h-0 flex items-center justify-center">
			<div class="text-center py-12 px-4">
				<p class="text-muted-foreground mb-2">Failed to load content. Please try again.</p>
				{#if hasActiveFilters}
					<p class="text-xs text-muted-foreground/70 mb-4">
						Your active filters may be causing this issue. Try clearing them.
					</p>
				{/if}
				<button
					onclick={() => list.refetch()}
					class="px-4 py-2 text-sm font-medium border border-input rounded-md bg-background hover:bg-accent"
				>
					Retry
				</button>
			</div>
		</div>
	{:else if cardMode}
		<div class="flex-1 min-h-0 overflow-y-auto">
			<LibraryCardList
				rowData={sortedRowData}
				{perspectiveContentIds}
				onOpenDetails={handleOpenDetails}
				onAddPerspective={handleAddPerspectiveFromCard}
				onAddToPlan={currentUserId !== null ? handleAddToPlanFromCard : undefined}
			/>
		</div>
	{:else}
		<!-- AG Grid -->
		<div
			bind:this={gridContainer}
			data-testid="ag-grid-container"
			class="activity-grid {isMobile ? 'overflow-y-auto' : 'flex-1'} min-h-0"
			style="--ag-row-height: 49px; --ag-header-height: 36px;"
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
		class="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 px-2 md:pl-4 md:pr-20 py-1 border-t border-border text-xs md:text-sm"
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
			{#if !cardMode}
				<ExportMenu
					disabled={exportDisabled}
					onDownloadCsv={exporter.downloadCsv}
					onCopy={exporter.copy}
					onPrintAsSeen={exporter.printAsSeen}
					onPrintAsList={() => (exporter.printOptionsOpen = true)}
				/>
			{/if}
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
     Dynamically imported: it's the only path into the Tiptap-based CommentsEditor
     (~170KB gzipped), which would otherwise load eagerly on every visit to this page
     even for users who never open the editor. -->
{#if popoverOpen && popoverContentId !== null}
	{#await import('#lib/components/PerspectivePopover.svelte') then { default: PerspectivePopover }}
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
	{:catch}
		<LazyLoadError what="the perspective editor" floating />
	{/await}
{/if}

<!-- Activity item details modal — rendered outside the grid for correct portal behavior -->
<ContentDetailsModal
	content={detailsModalContent}
	open={detailsModalContentId !== null}
	onClose={handleCloseDetails}
	onAddToPlan={currentUserId !== null ? handleAddToPlan : undefined}
	onAddPerspective={handleAddPerspectiveFromDetails}
/>

<!-- "Add to plan" todo dialog. Mounted only while open; the caller is signed in by construction. -->
{#if planContent !== null && currentUserId !== null}
	<AddToPlanDialog content={planContent} userId={currentUserId} onClose={() => (planContent = null)} />
{/if}

<!-- Column picker — session-only show/hide, admin-gated internal columns.
     Mounted only while open (matches PerspectivePopover) so bits-ui's body
     scroll-lock never lingers. -->
{#if columnPickerOpen}
	<ColumnPickerDialog
		bind:open={columnPickerOpen}
		isAdmin={meCtx.isAdmin}
		visibility={pickerVisibility}
		{customLayout}
		onToggle={handleColumnToggle}
		onReset={handleColumnsReset}
		chartColumns={charts.pickerColumns}
		chartFlags={charts.pickerFlags}
		onChartChange={charts.setFlag}
	/>
{/if}

<!-- Column chart popover — anchored to the clicked header cell -->
{#if charts.target && charts.data}
	{#key charts.target.colId}
		<ColumnChartPopover
			colId={charts.target.colId}
			label={charts.target.label}
			values={charts.data.values}
			names={charts.data.names}
			total={charts.data.total}
			ranked={charts.data.ranked}
			format={charts.format(charts.target.colId)}
			open={true}
			onClose={charts.close}
			anchor={charts.target.anchor}
			focusOnOpen={charts.target.keyboard}
		/>
	{/key}
{/if}

<!-- Print setup for "Print as list": mounted only while open, like the pickers. -->
{#if exporter.printOptionsOpen}
	<PrintOptionsDialog bind:open={exporter.printOptionsOpen} onPrint={exporter.printAsList} />
{/if}

<!-- The print-only list; it portals itself to <body> and shows only under html[data-print='list']. -->
{#if exporter.printList}
	<PrintListView
		table={exporter.printList.table}
		title={exporter.printList.title}
		spacing={exporter.printList.spacing}
	/>
{/if}

<!-- Sort picker — works identically on mobile and desktop, and in both data modes;
     see handleSortsApply for how each mode is wired underneath. -->
{#if sortPickerOpen}
	<SortPickerDialog
		bind:open={sortPickerOpen}
		sorts={activeSorts}
		onApply={handleSortsApply}
		columns={sortableColumnsFor(mode)}
	/>
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

/**
 * The Library's URL-backed view state: data mode, sorts, filters, person filter, page and page size,
 * and the rules for how each change moves the list (cursor reset, page 1, what the server sees).
 *
 * The URL is read and written through the injected `LibraryUrl` adapter (SvelteKit page + goto in the
 * app, an in-memory object in tests), and cursor resets go through `resetCursors`. Getters read the URL
 * on every access, so a reactive adapter carries reactivity through them.
 *
 * Two pieces of state live in memory, not in the URL: the Loaded-mode sort list (the grid's sort state
 * mirrored here) and the grid's filter model between the grid event and its debounced URL commit.
 */
import type { ContentItem } from '#lib/queries/content/index.js';
import {
	parseGridParams,
	serializeGridParams,
	filterToUrlParams,
	filtersEqual,
	nonGridFilters,
	urlParamsToFilter,
	type DataMode,
	type GridParams,
	type SortSpec,
} from '#lib/utils/gridUrlState.js';
import { PERSON_FILTER_KEY, parsePersonFilter, rowMatchesPerson, type PersonFilter } from '#lib/utils/grid-config.js';
import { CLIENT_ONLY_SORT_COLS } from '#lib/utils/libraryColumns/index.js';
import { compareContentBySorts, filterContentRows } from '#lib/utils/libraryColumns/clientRows.js';

/** Quiet period after the last grid filter change before it is written to the URL. */
export const FILTER_DEBOUNCE_MS = 500;

/** How the module reads and writes the URL. `search()` has no leading `?`. */
export interface LibraryUrl {
	search(): string;
	pathname(): string;
	navigate(href: string, replace: boolean): void;
}

export interface LibraryViewDeps {
	url: LibraryUrl;
	/** Restarts the cursor stack of the content list (page 1 again). Called on every reorder. */
	resetCursors(): void;
}

export interface LibraryViewState {
	/** The URL state as grid params, for `useLibraryList`. */
	readonly params: GridParams;
	readonly mode: DataMode;
	/** Sorts in the URL. */
	readonly sorts: SortSpec[];
	/** URL sorts the server can honour (client-only columns removed). */
	readonly serverSorts: SortSpec[];
	/** The sorts the picker and the grid show: the Loaded-mode list, or `serverSorts` in All. */
	readonly activeSorts: SortSpec[];
	readonly hasActiveSort: boolean;
	readonly pageNum: number;
	readonly pageSize: number;
	readonly filters: Record<string, string>;
	readonly personFilter: PersonFilter | null;
	readonly hasActiveFilters: boolean;
	/** The AG Grid filter model: the grid's own model until committed, else the URL filters. */
	filterModel(): Record<string, unknown>;
	/** Filter chips: `filterModel()` plus the person chip, labelled by the caller. */
	chips(personLabel: string): Record<string, unknown>;
	/** Card-list rows: in Loaded mode, the rows filtered and sorted as the grid would; in All, unchanged. */
	cardRows(rows: ContentItem[]): ContentItem[];
	pageCount(totalCount: number): number;
	setMode(mode: DataMode): void;
	/** The sort picker's full list. Loaded: in memory. All: URL, cursors reset, page 1. */
	setSorts(sorts: SortSpec[]): void;
	/** The grid's own sort state. Loaded: mirrored in memory. All: URL, unless it matches what was already sent. */
	sortsFromGrid(sorts: SortSpec[]): void;
	clearSorts(): void;
	/** The grid's filter model changed. Shown at once; written to the URL after `FILTER_DEBOUNCE_MS`. */
	gridFilterChanged(model: Record<string, unknown>): void;
	/** Removes the filter stored under `key` (the key the filter chip passes). */
	removeFilter(key: string): void;
	clearFilters(): void;
	clearFiltersKeepType(): void;
	filterByPerson(personId: string): void;
	setPageSize(size: number): void;
	nextPage(totalCount: number): void;
	prevPage(): void;
	/** Cancels a pending filter commit. Call on teardown. */
	dispose(): void;
}

function sameSorts(a: SortSpec[], b: SortSpec[]): boolean {
	return a.length === b.length && a.every((s, i) => s.col === b[i].col && s.dir === b[i].dir);
}

export function createLibraryViewState({ url, resetCursors }: LibraryViewDeps): LibraryViewState {
	let loadedSorts = $state<SortSpec[]>([]);
	let liveGridFilter = $state<Record<string, unknown> | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const current = (): GridParams => parseGridParams(new URLSearchParams(url.search()));

	function write(changes: Partial<GridParams>) {
		const search = serializeGridParams({ ...current(), ...changes });
		url.navigate(search ? `?${search}` : url.pathname(), true);
	}

	/** A change that reorders the list: restart the cursor stack and go back to page 1 with it. */
	function reorder(changes: Partial<GridParams>) {
		resetCursors();
		write({ ...changes, page: 1 });
	}

	const serverSortsOf = (sorts: SortSpec[]) => sorts.filter((s) => !CLIENT_ONLY_SORT_COLS.includes(s.col));
	const filterModel = () => liveGridFilter ?? urlParamsToFilter(current().filters);
	const pageCount = (totalCount: number) => Math.ceil(totalCount / current().pageSize);

	function commitGridFilter(model: Record<string, unknown>) {
		liveGridFilter = null;
		// Read the URL when the commit fires, not when the grid reported the change: a person filter
		// set inside the window must survive.
		const params = current();
		const urlFilters = { ...filterToUrlParams(model as Record<string, unknown>), ...nonGridFilters(params.filters) };
		if (filtersEqual(urlFilters, params.filters)) return;
		// Loaded mode filters on the grid only, so a filter commit leaves the page and cursors as they are.
		if (params.mode === 'loaded') {
			write({ filters: urlFilters });
			return;
		}
		reorder({ filters: urlFilters });
	}

	return {
		get params() {
			return current();
		},
		get mode() {
			return current().mode;
		},
		get sorts() {
			return current().sorts;
		},
		get serverSorts() {
			return serverSortsOf(current().sorts);
		},
		get activeSorts() {
			return current().mode === 'loaded' ? loadedSorts : serverSortsOf(current().sorts);
		},
		get hasActiveSort() {
			const { mode, sorts } = current();
			return mode === 'loaded'
				? loadedSorts.length > 0
				: sorts.length !== 1 || sorts[0].col !== 'updatedAt' || sorts[0].dir !== 'desc';
		},
		get pageNum() {
			return current().page;
		},
		get pageSize() {
			return current().pageSize;
		},
		get filters() {
			return current().filters;
		},
		get personFilter() {
			return parsePersonFilter(current().filters[PERSON_FILTER_KEY]);
		},
		get hasActiveFilters() {
			const { filters, q } = current();
			return Object.keys(filters).length > 0 || q !== '';
		},

		filterModel,
		chips(personLabel) {
			const base = filterModel();
			const person = parsePersonFilter(current().filters[PERSON_FILTER_KEY]);
			return person ? { ...base, [PERSON_FILTER_KEY]: { filterType: 'person', filter: personLabel } } : base;
		},
		cardRows(rows) {
			const params = current();
			if (params.mode !== 'loaded') return rows;
			const byColumns = filterContentRows(rows, urlParamsToFilter(params.filters));
			const person = parsePersonFilter(params.filters[PERSON_FILTER_KEY]);
			const filtered = person ? byColumns.filter((r) => rowMatchesPerson(r, person)) : byColumns;
			return loadedSorts.length > 0 ? [...filtered].sort((a, b) => compareContentBySorts(a, b, loadedSorts)) : filtered;
		},
		pageCount,

		setMode(mode) {
			resetCursors();
			if (mode === 'loaded') loadedSorts = [];
			// A pending grid filter is the newest state: carry it into the URL before the mode changes.
			const carried = liveGridFilter
				? { ...filterToUrlParams(liveGridFilter), ...nonGridFilters(current().filters) }
				: undefined;
			liveGridFilter = null;
			write({ mode, page: 1, ...(carried ? { filters: carried } : {}) });
		},
		setSorts(sorts) {
			if (current().mode === 'loaded') {
				loadedSorts = sorts;
				return;
			}
			reorder({ sorts });
		},
		sortsFromGrid(sorts) {
			if (current().mode === 'loaded') {
				loadedSorts = sorts;
				return;
			}
			// An echo of the sorts already sent to the server (the grid reports them back after a write or a mode switch) is a no-op.
			if (sameSorts(sorts, serverSortsOf(current().sorts))) return;
			reorder({ sorts });
		},
		clearSorts() {
			if (current().mode === 'loaded') {
				loadedSorts = [];
				return;
			}
			reorder({ sorts: [] });
		},

		gridFilterChanged(model) {
			liveGridFilter = model;
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => commitGridFilter(model), FILTER_DEBOUNCE_MS);
		},
		removeFilter(key) {
			const next = { ...current().filters };
			delete next[key];
			reorder({ filters: next });
		},
		clearFilters() {
			reorder({ filters: {} });
		},
		clearFiltersKeepType() {
			const { type } = current().filters;
			reorder({ filters: type ? { type } : {} });
		},
		filterByPerson(personId) {
			reorder({ filters: { ...current().filters, [PERSON_FILTER_KEY]: personId } });
		},

		setPageSize(size) {
			reorder({ pageSize: size });
		},
		nextPage(totalCount) {
			const page = current().page;
			if (page < pageCount(totalCount)) write({ page: page + 1 });
		},
		prevPage() {
			const page = current().page;
			if (page > 1) write({ page: page - 1 });
		},
		dispose() {
			clearTimeout(debounceTimer);
		},
	};
}

import type { GridApi } from '@ag-grid-community/core';
import type { ContentItem } from '#lib/queries/content/index.js';
import type { GridHandle } from '#lib/utils/gridHandle.svelte.js';
import type { DataMode } from '#lib/utils/gridUrlState.js';
import { CHART_ELIGIBLE_COLS, isChartEligible } from '#lib/utils/columnCharts.js';
import { isChartOn, loadChartFlags, setChartFlag } from '#lib/utils/columnChartSettings.js';
import { topBottom, type TopBottom } from '#lib/utils/columnStats.js';
import { formatDurationMinutes } from '#lib/utils/formatting.js';

export interface ChartRows {
	values: number[];
	names: string[];
	total: number;
	ranked: TopBottom;
}

export interface ChartTarget {
	colId: string;
	label: string;
	anchor: HTMLElement;
	keyboard: boolean;
}

const CHART_BUTTON_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="9"/></svg>';

/**
 * The grid's stock header template plus a chart button, placed after the label so a click on it
 * does not sort. `hidden` starts the button hidden; the header refresh effect toggles it after.
 */
export function chartHeaderTemplate(colId: string, label: string, hidden: boolean): string {
	return `<div class="ag-cell-label-container" role="presentation">
				<span data-ref="eMenu" class="ag-header-icon ag-header-cell-menu-button" aria-hidden="true"></span>
				<span data-ref="eFilterButton" class="ag-header-icon ag-header-cell-filter-button" aria-hidden="true"></span>
				<div data-ref="eLabel" class="ag-header-cell-label" role="presentation">
					<span data-ref="eText" class="ag-header-cell-text"></span>
					<span data-ref="eFilter" class="ag-header-icon ag-header-label-icon ag-filter-icon" aria-hidden="true"></span>
					<ag-sort-indicator data-ref="eSortIndicator"></ag-sort-indicator>
				</div>
				<button type="button" data-chart-col="${colId}" data-testid="column-chart-button-${colId}" aria-label="Chart ${label.replace(/"/g, '&quot;')}" title="Show chart" class="text-muted-foreground hover:text-foreground ml-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"${hidden ? ' hidden' : ''}>${CHART_BUTTON_SVG}</button>
			</div>`;
}

/**
 * Lets the keyboard reach the chart button inside a header cell. Keys pressed on the button are left
 * to the browser (Enter/Space click it) instead of the grid (where Enter would sort); Tab from the
 * header cell itself goes into the button when one is showing. Everything else keeps the grid's behaviour.
 */
export function suppressChartKeyboard(params: { event: KeyboardEvent }): boolean {
	const { event } = params;
	const target = event.target as HTMLElement | null;
	if (!target) return false;
	if (target.closest('[data-chart-col]')) return true;
	if (event.key === 'Tab' && !event.shiftKey && target.classList.contains('ag-header-cell')) {
		return target.querySelector('[data-chart-col]:not([hidden])') !== null;
	}
	return false;
}

/**
 * The numbers the grid currently shows for a column: post-filter, post-sort,
 * read through the column's own valueGetter. `total` counts every shown row,
 * including those with no value. Null when the grid isn't available.
 */
export function readChartRows(api: GridApi<ContentItem> | null, colId: string): ChartRows | null {
	if (!api || api.isDestroyed()) return null;
	const column = api.getColumn(colId);
	const colDef = column?.getColDef();
	if (!column || !colDef) return null;
	const rows: { name: string; value: number | null }[] = [];
	api.forEachNodeAfterFilterAndSort((node) => {
		if (!node.data) return;
		let v: unknown = api.getCellValue({ rowNode: node, colKey: column });
		// Duration displays as text; its numeric (seconds) form is the filter value.
		if (colId === 'duration' && typeof v !== 'number' && typeof colDef.filterValueGetter === 'function') {
			v = (colDef.filterValueGetter as (p: unknown) => unknown)({ data: node.data, node, colDef, column, api });
		}
		rows.push({ name: node.data.name, value: typeof v === 'number' && Number.isFinite(v) ? v : null });
	});
	const values = rows.flatMap((r) => (r.value === null ? [] : [r.value]));
	// Parallel to `values`: the item behind each charted number, for the chart readout.
	const names = rows.flatMap((r) => (r.value === null ? [] : [r.name]));
	return {
		values,
		names,
		total: rows.length,
		ranked: topBottom(
			rows,
			(r) => r.value,
			(r) => r.name,
			10,
		),
	};
}

/** How the chart labels a value: the column's own formatter, minutes for duration, else 2 decimals. */
export function chartFormatter(api: GridApi<ContentItem> | null, colId: string): (n: number) => string {
	if (colId === 'duration') return (n) => formatDurationMinutes(n);
	const fmt = api?.getColumn(colId)?.getColDef().valueFormatter;
	if (typeof fmt === 'function') return (n) => String((fmt as (p: unknown) => unknown)({ value: n }));
	return (n) => String(Math.round(n * 100) / 100);
}

/**
 * Column charts on the Library grid: numeric columns in the Movie view, "Loaded" mode, desktop grid.
 * A chart button sits in each eligible header; clicking it opens a popover over the shown rows.
 *
 * Call during component init (it registers effects). `view()` is read reactively: the header
 * buttons, the picker's chart switches and an open chart all follow it.
 */
export function createColumnCharts({
	grid,
	view,
	container,
	onFlagChange,
}: {
	grid: GridHandle<ContentItem>;
	view: () => { mode: DataMode; cardMode: boolean; typeFilter: string | undefined; layoutVersion: number };
	/** The element wrapping the grid; chart buttons are found and clicked inside it. */
	container: () => HTMLElement | null;
	/** Called after a chart switch changes in the picker, so the layout version moves on. */
	onFlagChange: () => void;
}) {
	let target = $state<ChartTarget | null>(null);
	let rowsTick = $state(0); // bumps when the grid's rows change (filter, sort, new data)

	/** Chart-capable in this view; drives the header template. */
	function eligibleHere(colId: string): boolean {
		const v = view();
		return v.mode === 'loaded' && !v.cardMode && isChartEligible(colId, v.typeFilter);
	}

	/** The header chart icon shows only when every one of these holds. */
	function iconVisible(colId: string): boolean {
		return eligibleHere(colId) && grid.api?.getColumn(colId)?.isVisible() === true && isChartOn(colId);
	}

	function open(anchor: HTMLElement, colId: string, keyboard = false) {
		const label = grid.api?.getColumn(colId)?.getColDef().headerName ?? colId;
		target = { colId, label, anchor, keyboard };
	}

	const data = $derived.by(() => {
		void rowsTick;
		return target ? readChartRows(grid.api, target.colId) : null;
	});

	const pickerColumns = $derived.by(() => {
		const v = view();
		return v.mode === 'loaded' && !v.cardMode
			? [...CHART_ELIGIBLE_COLS].filter((c) => isChartEligible(c, v.typeFilter))
			: [];
	});

	const pickerFlags = $derived.by(() => {
		void view().layoutVersion;
		return loadChartFlags();
	});

	// Re-draw the headers when something the chart icon depends on changes (the picker
	// switch, mode, card mode, type filter); the header component re-reads iconVisible.
	$effect(() => {
		if (!grid.api || !grid.ready) return;
		void view();
		grid.afterFrame((api) => {
			api.refreshHeader();
			// Show/hide each chart button to match its column's current state.
			container()
				?.querySelectorAll<HTMLElement>('[data-chart-col]')
				.forEach((btn) => {
					btn.hidden = !iconVisible(btn.dataset.chartCol ?? '');
				});
		});
	});

	// One delegated listener for every chart button (headers are rebuilt by the grid).
	$effect(() => {
		const el = container();
		if (!el) return;
		const onClick = (e: MouseEvent) => {
			const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-chart-col]');
			if (!btn?.dataset.chartCol) return;
			e.stopPropagation();
			// A click from Enter/Space has detail 0; the popover then takes focus.
			open(btn.closest<HTMLElement>('.ag-header-cell') ?? btn, btn.dataset.chartCol, e.detail === 0);
		};
		el.addEventListener('click', onClick);
		return () => el.removeEventListener('click', onClick);
	});

	// An open chart closes when its icon no longer applies.
	$effect(() => {
		void view();
		if (target && !iconVisible(target.colId)) target = null;
	});

	// It re-reads when the shown rows change.
	$effect(() => {
		const api = grid.api;
		if (!api || !grid.ready) return;
		const bump = () => rowsTick++;
		api.addEventListener('modelUpdated', bump);
		return () => {
			if (!api.isDestroyed()) api.removeEventListener('modelUpdated', bump);
		};
	});

	return {
		/** Header params for a chart-eligible column; re-read on every header refresh. */
		headerParams(colId: string, label: string): { template?: string } {
			if (!eligibleHere(colId)) return {};
			return { template: chartHeaderTemplate(colId, label, !iconVisible(colId)) };
		},
		suppressKeyboard: suppressChartKeyboard,
		get target() {
			return target;
		},
		get data() {
			return data;
		},
		format(colId: string) {
			return chartFormatter(grid.api, colId);
		},
		close() {
			target = null;
		},
		/** Columns the picker offers a chart switch for. */
		get pickerColumns() {
			return pickerColumns;
		},
		get pickerFlags() {
			return pickerFlags;
		},
		setFlag(colId: string, on: boolean) {
			setChartFlag(colId, on);
			onFlagChange();
		},
	};
}

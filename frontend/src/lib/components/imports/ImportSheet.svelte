<script lang="ts">
	import AgGridSvelte5Component from 'ag-grid-svelte5';
	import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
	import { themeQuartz } from '@ag-grid-community/theming';
	import type { CellClickedEvent, GridApi, GridOptions, IRowNode } from '@ag-grid-community/core';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import ImportDetailPanel from './ImportDetailPanel.svelte';
	import type { ImportJob } from '$lib/queries/imports';
	import { useImportItems } from '$lib/queries/imports/useImportItems';
	import { GRID_THEME_PARAMS } from '$lib/utils/grid-theme';
	import { emptyCellClassRules } from '$lib/utils/grid-empty';
	import {
		buildImportColumnDefs,
		columnsForSet,
		formatTotalTime,
		isSelectable,
		passesSheetFilter,
		selectionSummary,
		sheetTypes,
		toImportRows,
		unavailableNote,
		type ColumnSet,
		type ImportRow,
		type LibraryFilter,
		type SheetFilter,
	} from '$lib/utils/import-sheet';

	/**
	 * ImportSheet: one import's staging sheet. A spreadsheet of every candidate
	 * row with a filter on each column, a detail panel for the focused row, and
	 * a selection bar that imports the picked rows. Rows already in the library
	 * are shown but can't be picked.
	 */
	let { job }: { job: ImportJob } = $props();

	const now = new Date();
	const rows = $derived(toImportRows(job.items, job.sources));
	// Columns follow the content types in the sheet, so a filmography has no view or like columns.
	const types = $derived(sheetTypes(rows));
	const note = $derived(unavailableNote(types));
	const importItems = useImportItems();

	let gridApi = $state<GridApi<ImportRow> | null>(null);
	let gridReady = $state(false);
	let sourceId = $state('');
	let library = $state<LibraryFilter>('all');
	let columnSet = $state<ColumnSet>('decide');
	let search = $state('');
	let selected = $state<ImportRow[]>([]);
	let focusedId = $state<string | null>(null);
	let confirming = $state(false);
	let shownCount = $state(0);

	// External filter state is read by AG Grid callbacks, so keep a plain mirror.
	const filter: SheetFilter = { sourceId: '', library: 'all' };

	const focused = $derived(rows.find((r) => r.id === focusedId) ?? null);
	const summary = $derived(selectionSummary(selected));
	const libraryCount = $derived(rows.filter((r) => r.inLibrary).length);

	const modules = [ClientSideRowModelModule];
	const theme = themeQuartz.withParams(GRID_THEME_PARAMS);

	function countShown(api: GridApi<ImportRow>) {
		let n = 0;
		api.forEachNodeAfterFilter(() => n++);
		shownCount = n;
	}

	const gridOptions: GridOptions<ImportRow> = {
		columnDefs: buildImportColumnDefs(now),
		defaultColDef: { sortable: true, resizable: true, cellClassRules: emptyCellClassRules },
		getRowId: (p) => p.data.id,
		rowSelection: 'multiple',
		suppressRowClickSelection: true,
		isRowSelectable: (node: IRowNode<ImportRow>) => !!node.data && isSelectable(node.data),
		isExternalFilterPresent: () => filter.sourceId !== '' || filter.library !== 'all',
		doesExternalFilterPass: (node: IRowNode<ImportRow>) => !!node.data && passesSheetFilter(node.data, filter),
		rowClassRules: { 'opacity-60': (p) => !!p.data?.inLibrary },
		tooltipShowDelay: 400,
		enableCellTextSelection: true,
		animateRows: false,
		overlayNoRowsTemplate:
			'<div class="py-12 text-center text-muted-foreground">No rows match. Clear a filter or pick another source.</div>',
		onGridReady: (p) => {
			gridApi = p.api;
			gridReady = true;
		},
		onSelectionChanged: (e) => {
			selected = e.api.getSelectedRows();
		},
		onModelUpdated: (e) => countShown(e.api),
		onCellClicked: (e: CellClickedEvent<ImportRow>) => {
			if (e.colDef.colId === 'select' || !e.data) return;
			focusedId = e.data.id;
		},
	};

	// Toolbar filters live outside AG Grid: push them into the mirror and re-filter.
	$effect(() => {
		filter.sourceId = sourceId;
		filter.library = library;
		const api = gridApi;
		if (api && gridReady && !api.isDestroyed()) api.onFilterChanged();
	});

	$effect(() => {
		const text = search;
		const api = gridApi;
		if (api && gridReady && !api.isDestroyed()) api.setGridOption('quickFilterText', text);
	});

	// Column set, a frame after grid ready (column APIs throw straight from onGridReady).
	$effect(() => {
		const { shown, hidden } = columnsForSet(columnSet, types, job.sources.length);
		const api = gridApi;
		if (!api || !gridReady) return;
		const frame = requestAnimationFrame(() => {
			if (api.isDestroyed()) return;
			api.setColumnsVisible(shown, true);
			api.setColumnsVisible(hidden, false);
		});
		return () => cancelAnimationFrame(frame);
	});

	// Focus the first row once, so the panel isn't empty on arrival.
	$effect(() => {
		if (focusedId === null && rows.length > 0) focusedId = rows[0].id;
	});

	function clearFilters() {
		sourceId = '';
		library = 'all';
		search = '';
		gridApi?.setFilterModel(null);
	}

	function clearSelection() {
		gridApi?.deselectAll();
		confirming = false;
	}

	async function runImport() {
		const ids = selected.map((r) => r.id);
		try {
			const res = await importItems.mutateAsync({ jobId: job.id, itemIds: ids });
			const r = res.importItems;
			const extra = [
				r.alreadyInLibrary ? `${r.alreadyInLibrary} already in the library` : '',
				r.alreadyQueued ? `${r.alreadyQueued} already importing or imported` : '',
			]
				.filter(Boolean)
				.join(', ');
			toast.success(
				`Importing ${r.queued} item${r.queued === 1 ? '' : 's'}${extra ? ` (${extra})` : ''}. Rows update as each one lands.`,
			);
			clearSelection();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Import failed. Try again.');
		}
	}

	const libraryOptions: { value: LibraryFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'new', label: 'Not imported' },
		{ value: 'lib', label: 'In library' },
	];
</script>

<div class="flex flex-col gap-3" data-testid="import-sheet">
	<div class="flex flex-wrap items-center gap-2" role="search">
		<label class="text-muted-foreground flex items-center gap-1.5 text-sm" for="import-source">
			Source
			<select
				id="import-source"
				bind:value={sourceId}
				class="border-border bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
			>
				<option value="">All sources ({rows.length})</option>
				{#each job.sources as s (s.id)}
					<option value={s.id}>{s.title ?? s.sourceRef} ({rows.filter((r) => r.sourceId === s.id).length})</option>
				{/each}
			</select>
		</label>
		<div class="border-border inline-flex overflow-hidden rounded-md border" role="group" aria-label="Library status">
			{#each libraryOptions as opt (opt.value)}
				<button
					type="button"
					class="border-border px-3 py-1.5 text-sm not-first:border-l"
					class:bg-accent={library === opt.value}
					class:font-medium={library === opt.value}
					class:text-muted-foreground={library !== opt.value}
					aria-pressed={library === opt.value}
					onclick={() => (library = opt.value)}
				>
					{opt.label}
				</button>
			{/each}
		</div>
		<div class="border-border inline-flex overflow-hidden rounded-md border" role="group" aria-label="Columns">
			{#each [{ value: 'decide', label: 'Decide' }, { value: 'all', label: 'All columns' }] as opt (opt.value)}
				<button
					type="button"
					class="border-border px-3 py-1.5 text-sm not-first:border-l"
					class:bg-accent={columnSet === opt.value}
					class:font-medium={columnSet === opt.value}
					class:text-muted-foreground={columnSet !== opt.value}
					aria-pressed={columnSet === opt.value}
					title={opt.value === 'decide'
						? 'The columns that help you decide'
						: 'Every column, including IDs and captions'}
					onclick={() => (columnSet = opt.value as ColumnSet)}
				>
					{opt.label}
				</button>
			{/each}
		</div>
		<input
			type="search"
			bind:value={search}
			placeholder="Search titles, summaries, sources, cast"
			aria-label="Search every row"
			class="border-border bg-background text-foreground min-w-56 flex-1 rounded-md border px-2 py-1.5 text-sm"
		/>
		<Button type="button" variant="outline" size="sm" onclick={clearFilters}>Clear filters</Button>
		<span class="text-muted-foreground ml-auto text-sm tabular-nums" aria-live="polite" data-testid="import-counts">
			<strong class="text-foreground">{shownCount}</strong> of {rows.length} rows · {libraryCount} in library
		</span>
	</div>

	{#if note}
		<p class="text-muted-foreground text-sm" data-testid="import-unavailable-note">{note}</p>
	{/if}

	<div class="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="h-[68vh] min-h-96" style="--ag-row-height: 52px; --ag-header-height: 36px;">
			<AgGridSvelte5Component {gridOptions} rowData={rows} {theme} {modules} />
		</div>
		<div class="lg:h-[68vh]">
			<ImportDetailPanel item={focused} sourceTitle={focused?.sourceTitle ?? ''} {now} />
		</div>
	</div>

	<div
		class="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
		data-testid="import-selection-bar"
	>
		{#if confirming && summary.count > 0}
			<p class="flex-1 text-sm">
				Import {summary.count} item{summary.count === 1 ? '' : 's'}? Each one is added to the library with its full
				details and attributed to you. Anything already added is skipped, not duplicated.
			</p>
			<div class="flex gap-2">
				<Button type="button" onclick={runImport} disabled={importItems.isPending}>
					{importItems.isPending ? 'Starting…' : 'Start import'}
				</Button>
				<Button type="button" variant="outline" onclick={() => (confirming = false)}>Keep choosing</Button>
			</div>
		{:else}
			<div class="text-sm">
				<strong class="tabular-nums">{summary.count}</strong> selected
				{#if summary.count > 0}
					<span class="text-muted-foreground">
						· {summary.byDestination.map((d) => `${d.count} ${d.label}`).join(', ')}
						{#if formatTotalTime(summary.totalSeconds)}· {formatTotalTime(summary.totalSeconds)}{/if}
					</span>
				{:else}
					<span class="text-muted-foreground">· tick rows, or use the header box to take every filtered row</span>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button type="button" variant="outline" size="sm" disabled={summary.count === 0} onclick={clearSelection}>
					Clear selection
				</Button>
				<Button type="button" size="sm" disabled={summary.count === 0} onclick={() => (confirming = true)}>
					{summary.count === 0 ? 'Import' : `Import ${summary.count}`}
				</Button>
			</div>
		{/if}
	</div>
</div>

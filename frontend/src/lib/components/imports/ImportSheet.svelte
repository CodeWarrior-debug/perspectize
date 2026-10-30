<script lang="ts">
	import AgGridSvelte5Component from 'ag-grid-svelte5';
	import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
	import { themeQuartz } from '@ag-grid-community/theming';
	import type { CellClickedEvent, GridApi, GridOptions, IRowNode } from '@ag-grid-community/core';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import ImportDetailPanel from './ImportDetailPanel.svelte';
	import ImportProgressBar from './ImportProgressBar.svelte';
	import type { ImportJob } from '$lib/queries/imports';
	import { useImportItems } from '$lib/queries/imports/useImportItems';
	import { useSetImportItemsExcluded } from '$lib/queries/imports/useSetImportItemsExcluded';
	import { GRID_THEME_PARAMS } from '$lib/utils/grid-theme';
	import { emptyCellClassRules } from '$lib/utils/grid-empty';
	import {
		buildImportColumnDefs,
		columnsForSet,
		emptyOptionalColumns,
		formatTotalTime,
		importErrorMessage,
		isImportable,
		isSelectable,
		selectionLimit,
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
	 * row with a filter on each column, a detail panel for the focused row, a
	 * live progress bar while rows import, and a selection bar that imports the
	 * picked rows or marks them "don't import". Rows already in the library are
	 * shown but can't be picked. A closed import is read-only.
	 */
	let { job, isAdmin = false }: { job: ImportJob; isAdmin?: boolean } = $props();

	const now = new Date();
	const rows = $derived(toImportRows(job.items, job.sources));
	// Columns follow the content types in the sheet, so a filmography has no view or like columns.
	const types = $derived(sheetTypes(rows));
	const empty = $derived(emptyOptionalColumns(rows));
	const note = $derived(unavailableNote(types, empty));
	const readOnly = $derived(!!job.closedAt);
	const limit = $derived(selectionLimit(isAdmin));
	const importItems = useImportItems();
	const setExcluded = useSetImportItemsExcluded();

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
	// The grid hands back the row objects it had when they were ticked; read the
	// current version by id, so a mark or an import that lands later is reflected.
	const rowsById = $derived(new Map(rows.map((r) => [r.id, r])));
	const selectedRows = $derived(selected.map((r) => rowsById.get(r.id) ?? r));
	const summary = $derived(selectionSummary(selectedRows));
	const libraryCount = $derived(rows.filter((r) => r.inLibrary).length);
	const excludedCount = $derived(rows.filter((r) => r.excluded && !r.inLibrary).length);
	const overLimit = $derived(summary.importable > limit);

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
		isRowSelectable: (node: IRowNode<ImportRow>) => !job.closedAt && !!node.data && isSelectable(node.data),
		isExternalFilterPresent: () => filter.sourceId !== '' || filter.library !== 'all',
		doesExternalFilterPass: (node: IRowNode<ImportRow>) => !!node.data && passesSheetFilter(node.data, filter),
		rowClassRules: { 'opacity-60': (p) => !!p.data && (p.data.inLibrary || p.data.excluded) },
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
		const { shown, hidden } = columnsForSet(columnSet, types, job.sources.length, empty);
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
		const ids = selectedRows.filter(isImportable).map((r) => r.id);
		try {
			const res = await importItems.mutateAsync({ jobId: job.id, itemIds: ids });
			const r = res.importItems;
			const extra = [
				r.alreadyInLibrary ? `${r.alreadyInLibrary} already in the library` : '',
				r.alreadyQueued ? `${r.alreadyQueued} already importing or imported` : '',
				r.excluded ? `${r.excluded} marked don't import` : '',
			]
				.filter(Boolean)
				.join(', ');
			toast.success(
				`Importing ${r.queued} item${r.queued === 1 ? '' : 's'}${extra ? ` (${extra})` : ''}. Progress shows below the sheet.`,
			);
			clearSelection();
		} catch (err) {
			toast.error(importErrorMessage(err, 'Import failed. Try again.'));
		}
	}

	async function markExcluded(excluded: boolean) {
		const ids = selectedRows.filter((r) => r.excluded !== excluded).map((r) => r.id);
		if (ids.length === 0) return;
		try {
			const res = await setExcluded.mutateAsync({ jobId: job.id, itemIds: ids, excluded });
			const n = res.setImportItemsExcluded;
			toast.success(
				excluded
					? `Marked ${n} row${n === 1 ? '' : 's'} "don't import". Anyone can undo this until the import is closed.`
					: `Cleared "don't import" on ${n} row${n === 1 ? '' : 's'}.`,
			);
			clearSelection();
		} catch (err) {
			toast.error(importErrorMessage(err));
		}
	}

	const libraryOptions: { value: LibraryFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'new', label: 'Not imported' },
		{ value: 'lib', label: 'In library' },
		{ value: 'excluded', label: "Won't import" },
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
			<strong class="text-foreground">{shownCount}</strong> of {rows.length} rows · {libraryCount} in library{#if excludedCount}
				· {excludedCount} won't import{/if}
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

	<!-- Next to the Import button, where the eye is when an import starts (the grid can push a bar above it off screen). -->
	<ImportProgressBar jobId={job.id} />

	<div
		class="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
		data-testid="import-selection-bar"
	>
		{#if readOnly}
			<p class="text-muted-foreground text-sm">
				This import is closed, so nothing on it can change. An admin can reopen it.
			</p>
		{:else if confirming && summary.importable > 0 && !overLimit}
			<p class="flex-1 text-sm">
				Import {summary.importable} item{summary.importable === 1 ? '' : 's'}? Each one is added to the library with its
				full details and attributed to you. Anything already added is skipped, not duplicated.
			</p>
			<div class="flex gap-2">
				<Button type="button" onclick={runImport} disabled={importItems.isPending}>
					{importItems.isPending ? 'Starting…' : 'Start import'}
				</Button>
				<Button type="button" variant="outline" onclick={() => (confirming = false)}>Keep choosing</Button>
			</div>
		{:else}
			<div class="flex flex-col gap-0.5 text-sm">
				<div>
					<strong class="tabular-nums">{summary.count}</strong> selected
					{#if summary.count > 0}
						<span class="text-muted-foreground">
							· {summary.byDestination.map((d) => `${d.count} ${d.label}`).join(', ')}
							{#if formatTotalTime(summary.totalSeconds)}· {formatTotalTime(summary.totalSeconds)}{/if}
							{#if summary.excluded}· {summary.excluded} marked don't import{/if}
						</span>
					{:else}
						<span class="text-muted-foreground">· tick rows, or use the header box to take every filtered row</span>
					{/if}
				</div>
				{#if overLimit}
					<p class="text-destructive" role="alert" data-testid="import-selection-limit">
						Select up to {limit.toLocaleString('en-US')} at a time: you have {summary.importable.toLocaleString(
							'en-US',
						)} to import. Untick some, or narrow the filters first.
					</p>
				{:else}
					<p class="text-muted-foreground text-xs" data-testid="import-selection-hint">
						Select up to {limit.toLocaleString('en-US')} at a time.
					</p>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="outline" size="sm" disabled={summary.count === 0} onclick={clearSelection}>
					Clear selection
				</Button>
				{#if summary.excluded > 0}
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={setExcluded.isPending}
						onclick={() => markExcluded(false)}
					>
						Clear "don't import"
					</Button>
				{/if}
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={summary.importable === 0 || setExcluded.isPending}
					title="Hide these rows from Not imported for everyone; anyone can undo it until the import is closed"
					onclick={() => markExcluded(true)}
				>
					Don't import
				</Button>
				<Button
					type="button"
					size="sm"
					disabled={summary.importable === 0 || overLimit}
					onclick={() => (confirming = true)}
				>
					{summary.importable === 0 ? 'Import' : `Import ${summary.importable.toLocaleString('en-US')}`}
				</Button>
			</div>
		{/if}
	</div>
</div>

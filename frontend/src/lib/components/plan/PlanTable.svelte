<script lang="ts">
	import AgGridSvelte5Component from 'ag-grid-svelte5';
	import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
	import { themeQuartz } from '@ag-grid-community/theming';
	import type {
		CellClickedEvent,
		GridApi,
		GridOptions,
		RowDragEndEvent,
		SortChangedEvent,
	} from '@ag-grid-community/core';
	import type { UserTodoItem, UserTodoSortBy } from '$lib/queries/userTodos';
	import type { ResponsiveTier } from '$lib/utils/grid-config';
	import { GRID_THEME_PARAMS } from '$lib/utils/grid-theme';
	import {
		buildPlanColumnDefs,
		PLAN_COL_IDS,
		planColumnsForTier,
		planContentLabel,
		planListLabel,
		planPercentLabel,
		planStatusLabel,
		serverSortFor,
	} from '$lib/utils/plan-grid-config';
	import { addPerspectiveDisabledReason } from '$lib/utils/plan-todo-helpers';

	/**
	 * PlanTable: the user's todos in an AG Grid (or a stacked card list below
	 * 860px, the same breakpoint as the Activity table). Presentational: it
	 * reports clicks, sorts and drag-reorders and leaves the data to its parent.
	 */
	let {
		rows,
		listMode = false,
		onOpen,
		onAddPerspective,
		onSortChange,
		onReorder,
	}: {
		rows: UserTodoItem[];
		/** True when one list is selected: rows are in list order and can be dragged. */
		listMode?: boolean;
		onOpen: (todo: UserTodoItem) => void;
		onAddPerspective: (todo: UserTodoItem) => void;
		/** The server sort for the first sorted column, or null when none applies. */
		onSortChange: (sort: { sortBy: UserTodoSortBy; sortOrder: 'ASC' | 'DESC' } | null) => void;
		/** New order (todo ids, top to bottom) after a drag in list mode. */
		onReorder: (todoIds: number[]) => void;
	} = $props();

	let gridApi = $state<GridApi<UserTodoItem> | null>(null);
	let gridReady = $state(false);
	let tier = $state<ResponsiveTier>('lg');
	let cardMode = $state(false);

	const modules = [ClientSideRowModelModule];
	const theme = themeQuartz.withParams(GRID_THEME_PARAMS);

	function buildGridOptions(inListMode: boolean): GridOptions<UserTodoItem> {
		return {
			// Initial visibility is left to the tier effect below, so this doesn't read `tier`.
			columnDefs: buildPlanColumnDefs(inListMode),
			getRowId: (params) => params.data.id,
			rowDragManaged: true,
			animateRows: false,
			overlayNoRowsTemplate:
				'<div class="py-12 text-center text-muted-foreground">No todos here yet. Use New todo to start a plan.</div>',
			onGridReady: (params) => {
				// In list mode the order is the list position, so any header sort starts cleared.
				if (inListMode) params.api.applyColumnState({ defaultState: { sort: null } });
				gridApi = params.api;
				gridReady = true;
			},
			onSortChanged: (event: SortChangedEvent<UserTodoItem>) => {
				const sorted = event.api
					.getColumnState()
					.filter((c) => c.sort)
					.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
				const first = sorted[0];
				const sortBy = first ? serverSortFor(first.colId) : null;
				onSortChange(sortBy && first.sort ? { sortBy, sortOrder: first.sort === 'asc' ? 'ASC' : 'DESC' } : null);
			},
			onCellClicked: (event: CellClickedEvent<UserTodoItem>) => {
				const todo = event.data;
				if (!todo) return;
				if (event.colDef.colId === 'addPerspective') {
					if (addPerspectiveDisabledReason(todo) === null) onAddPerspective(todo);
					return;
				}
				onOpen(todo);
			},
			onRowDragEnd: (event: RowDragEndEvent<UserTodoItem>) => {
				const ids: number[] = [];
				event.api.forEachNodeAfterFilterAndSort((node) => {
					if (node.data) ids.push(Number(node.data.id));
				});
				onReorder(ids);
			},
		};
	}

	// Rebuilt only when list mode flips: the grid is keyed on it below and remounts,
	// because rowDrag is read once per column definition.
	const gridOptions = $derived(buildGridOptions(listMode));

	// Responsive tiers (same breakpoints as ActivityTable).
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mqSm = window.matchMedia('(min-width: 445px)');
		const mqMd = window.matchMedia('(min-width: 640px)');
		const mqLg = window.matchMedia('(min-width: 900px)');
		const update = () => {
			if (mqLg.matches) tier = 'lg';
			else if (mqMd.matches) tier = 'md';
			else if (mqSm.matches) tier = 'sm';
			else tier = 'xs';
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

	// Card-mode breakpoint: below 860px the grid is replaced by stacked cards.
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

	// Unmounting the grid (card mode, or a list-mode remount) leaves a stale API behind;
	// clear it so the effects below don't call into a destroyed grid.
	$effect(() => {
		if (cardMode) {
			gridApi = null;
			gridReady = false;
		}
	});

	// Column visibility follows the responsive tier. Re-applied on every grid ready,
	// since a remounted grid starts from the column defs' own hide flags.
	$effect(() => {
		const shown = new Set(planColumnsForTier(tier));
		if (!gridApi || !gridReady) return;
		gridApi.setColumnsVisible(
			PLAN_COL_IDS.filter((id) => shown.has(id)),
			true,
		);
		gridApi.setColumnsVisible(
			PLAN_COL_IDS.filter((id) => !shown.has(id)),
			false,
		);
	});
</script>

{#if cardMode}
	<ul class="flex flex-col gap-2" data-testid="plan-card-list">
		{#each rows as todo (todo.id)}
			{@const reason = addPerspectiveDisabledReason(todo)}
			<li class="border-border bg-card text-card-foreground flex flex-col gap-2 rounded-lg border p-3">
				<button type="button" class="flex flex-col gap-1 text-left" onclick={() => onOpen(todo)}>
					<span class="font-medium">{planContentLabel(todo)}</span>
					<span class="text-muted-foreground text-xs">
						{todo.action.label} · {planStatusLabel(todo.status)} · {planPercentLabel(todo.percentComplete)}
					</span>
					{#if todo.list}
						<span class="text-muted-foreground text-xs">{planListLabel(todo.list, todo.listPosition)}</span>
					{/if}
				</button>
				<button
					type="button"
					class="text-primary self-start text-sm underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
					disabled={reason !== null}
					title={reason ?? 'Add a perspective on this content'}
					onclick={() => onAddPerspective(todo)}
				>
					Add perspective
				</button>
			</li>
		{:else}
			<li class="text-muted-foreground py-12 text-center">No todos here yet. Use New todo to start a plan.</li>
		{/each}
	</ul>
{:else}
	{#key listMode}
		<div
			data-testid="plan-grid-container"
			class="h-[70vh] min-h-80"
			style="--ag-row-height: 49px; --ag-header-height: 36px;"
		>
			<AgGridSvelte5Component {gridOptions} rowData={rows} {theme} {modules} />
		</div>
	{/key}
{/if}

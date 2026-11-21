<script lang="ts">
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
		DialogFooter,
		Button,
	} from '#lib/components/shadcn/index.js';
	import { DATA_COLUMNS, INTERNAL_COLUMNS, type TogglableColumn } from '#lib/utils/grid-config.js';
	import type { CustomPickerRow } from '#lib/utils/customColumnDefs.js';
	import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';

	interface Props {
		/** Two-way bound open state. */
		open?: boolean;
		/** Whether to show the admin-only "Internal" group. */
		isAdmin?: boolean;
		/** colId → currently-visible, seeded from the live grid when the dialog opens. */
		visibility?: Record<string, boolean>;
		/** True when the current view has a saved custom column setup (see columnLayouts.ts). */
		customLayout?: boolean;
		/** Called with (colId, nextVisible) on each checkbox change. */
		onToggle: (colId: string, next: boolean) => void;
		/** Drops the current view's custom setup, back to its default columns. */
		onReset?: () => void;
		/** colIds that offer a chart switch in the current view (empty = none). */
		chartColumns?: string[];
		/** colId → chart currently on. */
		chartFlags?: Record<string, boolean>;
		/** Called with (colId, on) when a chart switch changes; the caller persists it. */
		onChartChange?: (colId: string, on: boolean) => void;
		/** The viewer's saved formulas, shaped for the picker (customColumnDefs.ts). */
		customColumns?: { available: CustomPickerRow[]; unavailable: CustomPickerRow[] };
		/** False outside the Movie type: the custom columns are listed but cannot be turned on. */
		customEnabled?: boolean;
		/** Signed-out viewers see no formulas, and cannot create or browse them. */
		signedIn?: boolean;
		onNewCustomColumn?: () => void;
		onBrowseSharedColumns?: () => void;
		onEditCustomColumn?: (formula: SavedFormula) => void;
		/** Soft-deletes an own formula, or removes a link. The caller owns the Undo toast. */
		onDeleteCustomColumn?: (formula: SavedFormula) => void;
	}

	let {
		open = $bindable(false),
		isAdmin = false,
		visibility = {},
		customLayout = false,
		onToggle,
		onReset,
		chartColumns = [],
		chartFlags = {},
		onChartChange,
		customColumns = { available: [], unavailable: [] },
		customEnabled = false,
		signedIn = false,
		onNewCustomColumn,
		onBrowseSharedColumns,
		onEditCustomColumn,
		onDeleteCustomColumn,
	}: Props = $props();

	function handleChange(col: TogglableColumn, e: Event) {
		onToggle(col.colId, (e.currentTarget as HTMLInputElement).checked);
	}

	function handleCustomChange(row: CustomPickerRow, e: Event) {
		onToggle(row.colId, (e.currentTarget as HTMLInputElement).checked);
	}
</script>

{#snippet columnRow(col: TogglableColumn)}
	<div class="flex items-center gap-2 rounded-md hover:bg-accent">
		<label class="flex flex-1 items-center gap-3 px-2 py-1.5 text-sm">
			<input
				type="checkbox"
				class="size-4 rounded border-input accent-primary"
				checked={visibility[col.colId] ?? false}
				onchange={(e) => handleChange(col, e)}
			/>
			<span>{col.label}</span>
		</label>
		{#if chartColumns.includes(col.colId)}
			<button
				type="button"
				role="switch"
				aria-checked={chartFlags[col.colId] ?? false}
				aria-label="{col.label} chart"
				class="mr-2 rounded-full border px-2 py-0.5 text-xs {chartFlags[col.colId]
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border bg-secondary text-secondary-foreground hover:bg-accent'}"
				onclick={() => onChartChange?.(col.colId, !(chartFlags[col.colId] ?? false))}
			>
				Chart {chartFlags[col.colId] ? 'on' : 'off'}
			</button>
		{/if}
	</div>
{/snippet}

{#snippet customRow(row: CustomPickerRow)}
	<div class="flex items-center gap-2 rounded-md hover:bg-accent">
		<label class="flex flex-1 items-center gap-3 px-2 py-1.5 text-sm {customEnabled ? '' : 'text-muted-foreground'}">
			<input
				type="checkbox"
				class="size-4 rounded border-input accent-primary"
				disabled={!customEnabled}
				checked={visibility[row.colId] ?? false}
				onchange={(e) => handleCustomChange(row, e)}
			/>
			<span aria-hidden="true" class="font-mono text-xs">ƒ</span>
			<span>{row.name}</span>
			<span class="text-xs text-muted-foreground">{row.ownerLabel}</span>
		</label>
		{#if signedIn}
			{#if row.own}
				<Button type="button" variant="ghost" size="sm" onclick={() => onEditCustomColumn?.(row.formula)}>Edit</Button>
			{/if}
			<Button type="button" variant="ghost" size="sm" onclick={() => onDeleteCustomColumn?.(row.formula)}>
				{row.own ? 'Delete' : 'Remove'}
			</Button>
		{/if}
	</div>
{/snippet}

<Dialog bind:open>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>Columns</DialogTitle>
			<DialogDescription>Choose which columns appear in the table.</DialogDescription>
		</DialogHeader>

		<div class="max-h-[60vh] space-y-6 overflow-y-auto py-2">
			<fieldset class="space-y-2">
				<legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Columns</legend>
				{#each DATA_COLUMNS as col (col.colId)}
					{@render columnRow(col)}
				{/each}
			</fieldset>

			{#if isAdmin}
				<fieldset class="space-y-2">
					<legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"> Internal </legend>
					{#each INTERNAL_COLUMNS as col (col.colId)}
						{@render columnRow(col)}
					{/each}
				</fieldset>
			{/if}

			<fieldset class="space-y-2" data-testid="custom-columns-group">
				<legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom columns</legend>
				{#if !customEnabled}
					<p class="px-2 text-xs text-muted-foreground">Choose the Movie type to use custom columns.</p>
				{/if}
				{#each customColumns.available as row (row.colId)}
					{@render customRow(row)}
				{/each}
				{#if customColumns.unavailable.length > 0}
					<div class="space-y-1 px-2 pt-1">
						<p class="text-xs text-muted-foreground">No longer available</p>
						{#each customColumns.unavailable as row (row.colId)}
							<div class="flex items-center justify-between gap-2 text-sm text-muted-foreground">
								<span>ƒ {row.name}</span>
								{#if signedIn}
									<Button type="button" variant="ghost" size="sm" onclick={() => onDeleteCustomColumn?.(row.formula)}>
										Remove
									</Button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
				{#if signedIn}
					<div class="flex flex-wrap gap-2 px-2 pt-1">
						<Button type="button" variant="outline" size="sm" onclick={() => onNewCustomColumn?.()}>
							New custom column
						</Button>
						<Button type="button" variant="outline" size="sm" onclick={() => onBrowseSharedColumns?.()}>
							Browse shared columns
						</Button>
					</div>
				{/if}
			</fieldset>
		</div>

		<div
			class="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs {customLayout
				? 'bg-muted font-medium text-foreground'
				: 'text-muted-foreground'}"
		>
			<p data-testid="layout-hint">
				{#if customLayout}
					Your custom columns for this view are saved.
				{:else}
					Showing the default columns for this view. Changes are saved for next time.
				{/if}
			</p>
			{#if customLayout && onReset}
				<Button type="button" variant="outline" size="sm" onclick={onReset}>Reset to default columns</Button>
			{/if}
		</div>

		<DialogFooter>
			<Button type="button" onclick={() => (open = false)}>Done</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

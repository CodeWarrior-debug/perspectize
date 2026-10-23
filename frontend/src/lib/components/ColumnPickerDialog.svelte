<script lang="ts">
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
		DialogFooter,
		Button,
	} from '$lib/components/shadcn';
	import { DATA_COLUMNS, INTERNAL_COLUMNS, type TogglableColumn } from '$lib/utils/grid-config';

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
	}: Props = $props();

	function handleChange(col: TogglableColumn, e: Event) {
		onToggle(col.colId, (e.currentTarget as HTMLInputElement).checked);
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
					: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
				onclick={() => onChartChange?.(col.colId, !(chartFlags[col.colId] ?? false))}
			>
				Chart {chartFlags[col.colId] ? 'on' : 'off'}
			</button>
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

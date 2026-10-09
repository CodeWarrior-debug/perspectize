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
	}

	let {
		open = $bindable(false),
		isAdmin = false,
		visibility = {},
		customLayout = false,
		onToggle,
		onReset,
	}: Props = $props();

	function handleChange(col: TogglableColumn, e: Event) {
		onToggle(col.colId, (e.currentTarget as HTMLInputElement).checked);
	}
</script>

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
					<label class="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
						<input
							type="checkbox"
							class="size-4 rounded border-input accent-primary"
							checked={visibility[col.colId] ?? false}
							onchange={(e) => handleChange(col, e)}
						/>
						<span>{col.label}</span>
					</label>
				{/each}
			</fieldset>

			{#if isAdmin}
				<fieldset class="space-y-2">
					<legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"> Internal </legend>
					{#each INTERNAL_COLUMNS as col (col.colId)}
						<label class="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
							<input
								type="checkbox"
								class="size-4 rounded border-input accent-primary"
								checked={visibility[col.colId] ?? false}
								onchange={(e) => handleChange(col, e)}
							/>
							<span>{col.label}</span>
						</label>
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

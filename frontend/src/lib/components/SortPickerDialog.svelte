<script lang="ts">
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
		DialogFooter,
		Button,
		Select,
		SelectTrigger,
		SelectContent,
		SelectItem,
	} from '$lib/components/shadcn';
	import { SORTABLE_COLUMNS } from '$lib/utils/grid-config';
	import type { SortSpec } from '$lib/utils/gridUrlState';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import PlusIcon from '@lucide/svelte/icons/plus';

	interface Props {
		/** Two-way bound open state. */
		open?: boolean;
		/** Current sort, in priority order — seeded from the live grid/URL when the dialog opens. */
		sorts: SortSpec[];
		/** Called with the full replacement list on every change (add/remove/reorder/direction). */
		onApply: (sorts: SortSpec[]) => void;
	}

	let { open = $bindable(false), sorts, onApply }: Props = $props();

	// Local draft so the row list doesn't jump while editing (parent re-render churn
	// on every apply is fine functionally, but the direction toggle feels laggy
	// without a stable local list to render from).
	let draft = $state<SortSpec[]>([]);
	$effect(() => {
		if (open) draft = sorts.map((s) => ({ ...s }));
	});

	const usedCols = $derived(new Set(draft.map((s) => s.col)));
	const availableCols = $derived(SORTABLE_COLUMNS.filter((c) => !usedCols.has(c.colId)));
	const columnLabel = (colId: string) => SORTABLE_COLUMNS.find((c) => c.colId === colId)?.label ?? colId;

	function commit(next: SortSpec[]) {
		draft = next;
		onApply(next);
	}

	function handleColumnChange(index: number, colId: string) {
		const next = draft.map((s, i) => (i === index ? { ...s, col: colId } : s));
		commit(next);
	}

	function toggleDirection(index: number) {
		const next = draft.map((s, i): SortSpec => (i === index ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s));
		commit(next);
	}

	function removeRow(index: number) {
		commit(draft.filter((_, i) => i !== index));
	}

	function moveRow(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= draft.length) return;
		const next = [...draft];
		[next[index], next[target]] = [next[target], next[index]];
		commit(next);
	}

	function addRow() {
		const next = availableCols[0];
		if (!next) return;
		commit([...draft, { col: next.colId, dir: 'asc' }]);
	}
</script>

<Dialog bind:open>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>Sort by</DialogTitle>
			<DialogDescription>
				Stack multiple columns — the first row is the primary sort, later rows break ties.
			</DialogDescription>
		</DialogHeader>

		<div class="max-h-[60vh] space-y-2 overflow-y-auto py-2">
			{#if draft.length === 0}
				<p class="px-2 py-4 text-center text-sm text-muted-foreground">No sort applied — showing default order.</p>
			{/if}

			{#each draft as row, i (row.col)}
				<div class="flex items-center gap-2 rounded-md border border-border p-2">
					<span class="w-4 shrink-0 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
						{i + 1}
					</span>

					<Select type="single" value={row.col} onValueChange={(v) => v && handleColumnChange(i, v)}>
						<SelectTrigger class="flex-1" aria-label={`Sort column ${i + 1}`}>
							{columnLabel(row.col)}
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={row.col}>{columnLabel(row.col)}</SelectItem>
							{#each availableCols as col (col.colId)}
								<SelectItem value={col.colId}>{col.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>

					<button
						type="button"
						aria-label={row.dir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
						title={row.dir === 'asc' ? 'Ascending' : 'Descending'}
						onclick={() => toggleDirection(i)}
						class="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1.5 text-sm hover:bg-accent"
					>
						{#if row.dir === 'asc'}
							<ChevronUpIcon class="size-4" />
							<span class="hidden sm:inline">Asc</span>
						{:else}
							<ChevronDownIcon class="size-4" />
							<span class="hidden sm:inline">Desc</span>
						{/if}
					</button>

					<div class="flex flex-col">
						<button
							type="button"
							aria-label="Move up in sort priority"
							disabled={i === 0}
							onclick={() => moveRow(i, -1)}
							class="rounded p-0.5 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
						>
							<ChevronUpIcon class="size-3.5" />
						</button>
						<button
							type="button"
							aria-label="Move down in sort priority"
							disabled={i === draft.length - 1}
							onclick={() => moveRow(i, 1)}
							class="rounded p-0.5 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
						>
							<ChevronDownIcon class="size-3.5" />
						</button>
					</div>

					<button
						type="button"
						aria-label={`Remove ${columnLabel(row.col)} from sort`}
						onclick={() => removeRow(i)}
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<XIcon class="size-4" />
					</button>
				</div>
			{/each}

			{#if availableCols.length > 0}
				<button
					type="button"
					onclick={addRow}
					class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<PlusIcon class="size-4" />
					Add sort column
				</button>
			{/if}
		</div>

		<DialogFooter>
			<Button type="button" onclick={() => (open = false)}>Done</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

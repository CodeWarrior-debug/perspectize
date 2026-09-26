<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { RatingRow, FilledInDifferentlyRow, FeelingComparison } from '$lib/utils/comparePerspectives';

	let {
		rows,
		filledInDifferently,
		feelings,
		sortDesc,
		onToggleSort,
		leftName,
		rightName,
	}: {
		rows: RatingRow[];
		filledInDifferently: FilledInDifferentlyRow[];
		feelings: FeelingComparison;
		sortDesc: boolean;
		onToggleSort: () => void;
		// Whose take filled in a dimension, for the "Filled in differently" rows
		// below — named ("Alice"/"You") instead of raw "left"/"right", which
		// only means anything relative to a picker column no longer visible in
		// that sublist (compare-page-enhancements #4).
		leftName: string;
		rightName: string;
	} = $props();

	const STATUS_LABEL: Record<RatingRow['status'], string> = {
		similar: 'Similar',
		diverges: 'Diverges',
		conflict: 'Conflict',
	};
	const STATUS_COLOR: Record<RatingRow['status'], string> = {
		similar: 'var(--color-rating-positive)',
		diverges: 'var(--color-rating-neutral)',
		conflict: 'var(--color-rating-negative)',
	};

	function fmt(n: number): string {
		return n.toFixed(1);
	}
</script>

<div class="mx-auto flex w-full max-w-[300px] flex-col gap-3">
	{#if feelings.shared.length > 0}
		<div
			class="flex items-center gap-2 rounded-full border border-[var(--color-rating-positive)] px-3 py-1.5 text-[13px]"
		>
			<span class="font-medium" style="color: var(--color-rating-positive);">Matching feelings</span>
			{#each feelings.shared as f, i (`${f.emoji}:${f.label ?? ''}:${i}`)}
				<span>{f.emoji} {f.label ?? ''}</span>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		data-testid="sort-toggle"
		onclick={onToggleSort}
		class="flex items-center justify-center gap-1 self-center text-[12.5px] font-medium text-muted-foreground"
	>
		{sortDesc ? 'Most similar last' : 'Most similar first'}
		<ChevronDownIcon class="size-3.5 transition-transform" style="transform: rotate({sortDesc ? 180 : 0}deg);" />
	</button>

	<div class="flex flex-col gap-3">
		{#each rows as row (row.key)}
			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-[13px] font-semibold text-foreground">{row.label}</span>
					<span class="flex items-center gap-1 text-[11.5px]" style="color: {STATUS_COLOR[row.status]};">
						<span class="size-1.5 rounded-full" style="background-color: {STATUS_COLOR[row.status]};"></span>
						{STATUS_LABEL[row.status]}
					</span>
				</div>
				<div class="flex items-center justify-between text-[12.5px] text-foreground">
					<span>{fmt(row.leftDisplay)}</span>
					<span style="color: var(--color-muted-foreground);">{fmt(row.pctDiff)}% different</span>
					<span>{fmt(row.rightDisplay)}</span>
				</div>
			</div>
		{/each}
	</div>

	{#if filledInDifferently.length > 0}
		<div class="mt-1 flex flex-col gap-1 border-t border-border pt-2.5">
			<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
				Filled in differently
			</span>
			{#each filledInDifferently as row (row.key)}
				<div class="text-[12.5px] text-foreground">
					{row.label} &mdash; {row.side === 'left' ? leftName : rightName} filled in {fmt(row.display)}
				</div>
			{/each}
		</div>
	{/if}
</div>

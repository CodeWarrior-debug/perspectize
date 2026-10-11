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

	// Visual 0-10 scale per row (compare-page-enhancements #2) — a filled dot
	// for the left value, a hollow ring for the right, joined by a bar
	// spanning the gap between them, all colored by the row's status.
	function pct(value: number): number {
		return Math.min(100, Math.max(0, (value / 10) * 100));
	}
	function trackStart(row: RatingRow): number {
		return Math.min(pct(row.leftDisplay), pct(row.rightDisplay));
	}
	function trackWidth(row: RatingRow): number {
		return Math.abs(pct(row.leftDisplay) - pct(row.rightDisplay));
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

	{#if rows.length > 0}
		<button
			type="button"
			data-testid="sort-toggle"
			onclick={onToggleSort}
			class="flex items-center justify-center gap-1 self-center text-[12.5px] font-medium text-muted-foreground"
		>
			{sortDesc ? 'Most similar last' : 'Most similar first'}
			<ChevronDownIcon class="size-3.5 transition-transform" style="transform: rotate({sortDesc ? 180 : 0}deg);" />
		</button>
	{/if}

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
				<div class="flex items-center gap-2 text-[12.5px] text-foreground">
					<span class="w-6 flex-none text-right">{fmt(row.leftDisplay)}</span>
					<div
						class="relative h-1.5 flex-1 rounded-full bg-border"
						data-testid={`rating-scale-${row.key}`}
						role="img"
						aria-label={`${fmt(row.leftDisplay)} vs ${fmt(row.rightDisplay)}, ${fmt(row.pctDiff)}% different`}
					>
						<div
							class="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
							style="left: {trackStart(row)}%; width: {trackWidth(row)}%; background-color: {STATUS_COLOR[row.status]};"
						></div>
						<span
							class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
							style="left: {pct(row.leftDisplay)}%; background-color: {STATUS_COLOR[row.status]};"
						></span>
						<span
							class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
							style="left: {pct(row.rightDisplay)}%; border-color: {STATUS_COLOR[
								row.status
							]}; background-color: var(--color-background);"
						></span>
					</div>
					<span class="w-6 flex-none">{fmt(row.rightDisplay)}</span>
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

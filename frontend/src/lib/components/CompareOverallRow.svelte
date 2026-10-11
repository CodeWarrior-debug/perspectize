<script lang="ts">
	import type { OverallComparison, OverallStatus } from '$lib/utils/comparePerspectives';

	let {
		overall,
		leftName,
		rightName,
		agreementPercent = null,
	}: {
		overall: OverallComparison;
		leftName: string;
		rightName: string;
		agreementPercent?: number | null;
	} = $props();

	// 'differ' uses red/green rather than the neutral amber "diverges" uses
	// per-dimension, so the two are never styled the same (compare-no-overlap-summary
	// #3). 'oneSided'/'none' are a missing verdict, not disagreement, so they
	// stay neutral rather than amber (#2).
	const STATUS_LABEL_STATIC: Record<Exclude<OverallStatus, 'oneSided'>, string> = {
		agree: 'Agree overall',
		differ: 'Different',
		none: 'No verdict yet',
	};
	// oneSided's label names whichever side actually gave a verdict, so — unlike
	// the static labels above — it must stay reactive to overall/leftName/rightName
	// rather than being baked into a plain object once.
	const label = $derived(
		overall.status === 'oneSided'
			? `Only ${overall.left !== null ? leftName : rightName} gave a verdict`
			: STATUS_LABEL_STATIC[overall.status],
	);
	const STATUS_COLOR: Record<OverallStatus, string> = {
		agree: 'var(--color-rating-positive)',
		differ: 'var(--color-rating-negative)',
		oneSided: 'var(--color-muted-foreground)',
		none: 'var(--color-muted-foreground)',
	};

	const THUMB_UP_PATHS = [
		'M7 10v12',
		'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-9.66a1 1 0 0 1 1.66.43z',
	];
	const THUMB_DOWN_PATHS = [
		'M17 14V2',
		'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 9.66a1 1 0 0 1-1.66-.43z',
	];
</script>

{#snippet thumbIcon(value: string | null, testId: string)}
	<span data-testid={testId} class="flex items-center justify-center">
		{#if value === 'THUMBS_UP'}
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="var(--color-rating-positive)"
				stroke="var(--color-rating-positive)"
				stroke-width="1.6"
				role="img"
				aria-label="Thumbs up"
			>
				{#each THUMB_UP_PATHS as d (d)}
					<path {d} />
				{/each}
			</svg>
		{:else if value === 'THUMBS_DOWN'}
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="var(--color-rating-negative)"
				stroke="var(--color-rating-negative)"
				stroke-width="1.6"
				role="img"
				aria-label="Thumbs down"
			>
				{#each THUMB_DOWN_PATHS as d (d)}
					<path {d} />
				{/each}
			</svg>
		{:else}
			<span class="text-sm text-muted-foreground">—</span>
		{/if}
	</span>
{/snippet}

<div class="flex flex-col gap-2 rounded-lg border border-border px-3.5 py-2.5">
	<div class="flex items-center gap-2">
		<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Overall</span>
		{#if agreementPercent !== null}
			<span class="text-[12.5px] font-medium text-foreground" data-testid="agreement-percent">
				{agreementPercent}% aligned
			</span>
		{/if}
	</div>
	<!-- Same grid-template-columns as the Take/RatingTable/Take row below, so each
	     thumb sits under its own side's column instead of both being clustered on
	     the right (compare-no-overlap-summary #4). -->
	<div class="grid items-center gap-4" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
		<div class="flex justify-center">
			{@render thumbIcon(overall.left, 'overall-left')}
		</div>
		<span
			class="flex items-center justify-center gap-1.5 text-[13px] font-medium"
			style="color: {STATUS_COLOR[overall.status]};"
		>
			<span class="size-1.5 rounded-full" style="background-color: {STATUS_COLOR[overall.status]};"></span>
			{label}
		</span>
		<div class="flex justify-center">
			{@render thumbIcon(overall.right, 'overall-right')}
		</div>
	</div>
</div>

<script lang="ts">
	import type { OverallComparison } from '$lib/utils/comparePerspectives';

	let { overall, agreementPercent = null }: { overall: OverallComparison; agreementPercent?: number | null } = $props();

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

<div class="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
	<div class="flex items-center gap-2">
		<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Overall</span>
		{#if agreementPercent !== null}
			<span class="text-[12.5px] font-medium text-foreground" data-testid="agreement-percent">
				{agreementPercent}% aligned
			</span>
		{/if}
	</div>
	<div class="flex items-center gap-2.5">
		{@render thumbIcon(overall.left, 'overall-left')}
		<span
			class="flex items-center gap-1.5 text-[13px] font-medium"
			style="color: {overall.agree ? 'var(--color-rating-positive)' : 'var(--color-rating-neutral)'};"
		>
			<span
				class="size-1.5 rounded-full"
				style="background-color: {overall.agree ? 'var(--color-rating-positive)' : 'var(--color-rating-neutral)'};"
			></span>
			{overall.agree ? 'Agree overall' : 'Different'}
		</span>
		{@render thumbIcon(overall.right, 'overall-right')}
	</div>
</div>

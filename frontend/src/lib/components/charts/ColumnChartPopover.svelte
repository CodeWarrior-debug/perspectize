<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { Popover, PopoverContent } from '$lib/components/shadcn/popover';
	import ColumnChart from './ColumnChart.svelte';
	import type { TopBottom } from '$lib/utils/columnStats';
	import { CHART_TYPES, CHART_TYPE_LABELS, defaultChartType, type ChartType } from '$lib/utils/columnCharts';

	let {
		colId,
		label,
		values,
		total,
		ranked,
		format,
		open,
		onClose,
		anchor,
		focusOnOpen = false,
	}: {
		colId: string;
		label: string;
		values: number[];
		/** Count of all loaded rows, including those with no value. */
		total: number;
		ranked?: TopBottom;
		format: (n: number) => string;
		open: boolean;
		onClose: () => void;
		/** Element the popover points at; without it the popover floats at its default spot. */
		anchor?: HTMLElement;
		/** Move focus to the selected chart-type button on open (keyboard users). */
		focusOnOpen?: boolean;
	} = $props();

	let content = $state<HTMLElement | null>(null);

	// The pick is transient: never persisted, and cleared whenever the popover is closed.
	let picked = $state<ChartType | null>(null);
	const type = $derived(picked ?? defaultChartType(colId));
	const empty = $derived(Math.max(total - values.length, 0));

	$effect(() => {
		if (!open) picked = null;
	});
</script>

<Popover {open} onOpenChange={(o) => !o && onClose()}>
	{#if open}
		<PopoverPrimitive.Portal>
			<PopoverContent
				customAnchor={anchor}
				side="bottom"
				align="start"
				trapFocus={false}
				bind:ref={content}
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					if (focusOnOpen) content?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
				}}
				class="w-72"
				aria-label={`${label} chart`}
				data-testid="column-chart-popover"
			>
				<div role="group" aria-label="Chart type" class="mb-3 flex flex-wrap gap-1">
					{#each CHART_TYPES as t (t)}
						<button
							type="button"
							aria-pressed={t === type}
							class="rounded-full border px-2 py-0.5 text-xs {t === type
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-border bg-secondary text-secondary-foreground hover:bg-accent'}"
							onclick={() => (picked = t)}>{CHART_TYPE_LABELS[t]}</button
						>
					{/each}
				</div>
				<ColumnChart {type} {values} {total} {ranked} {format} />
				<p class="text-muted-foreground mt-2 text-xs">
					based on {values.length} loaded {values.length === 1 ? 'movie' : 'movies'} · {empty} empty
				</p>
			</PopoverContent>
		</PopoverPrimitive.Portal>
	{/if}
</Popover>

<script lang="ts">
	import {
		summarize,
		histogram,
		frequencyPoints,
		cumulative,
		boxStats,
		density,
		pieSlices,
		coverage,
		type TopBottom,
	} from '$lib/utils/columnStats';
	import { CHART_TYPE_LABELS, type ChartType } from '$lib/utils/columnCharts';

	let {
		type,
		values,
		total,
		ranked,
		format,
	}: {
		type: ChartType;
		values: number[];
		/** Count of all loaded rows, including those with no value. */
		total: number;
		ranked?: TopBottom;
		format: (n: number) => string;
	} = $props();

	const W = 240;
	const H = 120;
	const PAD = { l: 8, r: 8, t: 8, b: 16 };
	const BINS = 10;
	const PIE_CAP = 6;

	const summary = $derived(summarize(values));
	const empty = $derived(type === 'coverage' ? total === 0 : values.length === 0);
	const cover = $derived(coverage(total, values.length));
	const DONUT_R = 40;
	const DONUT_C = 2 * Math.PI * DONUT_R;
	const filledLen = $derived((cover.filled / Math.max(cover.filled + cover.empty, 1)) * DONUT_C);
	const VALUE_DEPENDENT: ChartType[] = ['histogram', 'line', 'pie', 'box', 'cumulative', 'density', 'strip'];
	// One value, or every value identical: the shape charts have nothing to show.
	const degenerate = $derived(summary !== null && summary.min === summary.max);
	const label = $derived(`${CHART_TYPE_LABELS[type]} chart`);

	const bins = $derived(histogram(values, BINS));
	const binMax = $derived(Math.max(...bins.map((b) => b.count), 1));
	const lo = $derived(summary?.min ?? 0);
	const hi = $derived(summary?.max ?? 1);

	const sx = (v: number) => PAD.l + ((v - lo) / (hi - lo || 1)) * (W - PAD.l - PAD.r);
	const sy = (frac: number) => H - PAD.b - frac * (H - PAD.t - PAD.b);

	const barW = $derived((W - PAD.l - PAD.r) / Math.max(bins.length, 1));
	const linePts = $derived(
		frequencyPoints(bins)
			.map((p) => `${sx(p.x)},${sy(p.y / binMax)}`)
			.join(' '),
	);
	const cumPts = $derived(
		cumulative(values)
			.map((p) => `${sx(p.x)},${sy(p.share)}`)
			.join(' '),
	);
	const box = $derived(boxStats(values));
	const dens = $derived(density(values, 48));
	const densMax = $derived(Math.max(...dens.map((p) => p.y), 1e-12));
	const densPath = $derived.by(() => {
		if (dens.length === 0) return '';
		const dLo = dens[0].x;
		const dHi = dens[dens.length - 1].x;
		const x = (v: number) => PAD.l + ((v - dLo) / (dHi - dLo)) * (W - PAD.l - PAD.r);
		const line = dens.map((p) => `L${x(p.x)},${sy(p.y / densMax)}`).join(' ');
		return `M${x(dLo)},${sy(0)} ${line} L${x(dHi)},${sy(0)} Z`;
	});

	const slices = $derived(pieSlices(bins, PIE_CAP));
	const sliceTotal = $derived(slices.reduce((acc, s) => acc + s.count, 0) || 1);
	const pie = $derived.by(() => {
		const cx = 60;
		const cy = H / 2;
		const r = 46;
		let angle = -Math.PI / 2;
		return slices.map((s, i) => {
			const sweep = Math.min((s.count / sliceTotal) * Math.PI * 2, Math.PI * 2 - 0.0001);
			const a0 = angle;
			angle += sweep;
			const pt = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
			return {
				...s,
				d: `M${cx},${cy} L${pt(a0)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${pt(angle)} Z`,
				other: s.label === 'Other' && i === slices.length - 1,
				opacity: Math.max(1 - i * 0.14, 0.3),
			};
		});
	});

	const STRIP_COLS = 3;
	// Deterministic vertical jitter so repeated values stay visible.
	const stripDots = $derived(
		[...values]
			.sort((a, b) => a - b)
			.map((v, i) => ({
				x: sx(v),
				y: sy(0.2 + ((i % STRIP_COLS) / STRIP_COLS) * 0.6),
			})),
	);
</script>

{#snippet summaryList()}
	{#if summary}
		<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
			<dt class="text-muted-foreground">Count</dt>
			<dd class="text-right tabular-nums">{summary.count}</dd>
			<dt class="text-muted-foreground">Min</dt>
			<dd class="text-right tabular-nums">{format(summary.min)}</dd>
			<dt class="text-muted-foreground">Median</dt>
			<dd class="text-right tabular-nums">{format(summary.median)}</dd>
			<dt class="text-muted-foreground">Mean</dt>
			<dd class="text-right tabular-nums">{format(summary.mean)}</dd>
			<dt class="text-muted-foreground">Max</dt>
			<dd class="text-right tabular-nums">{format(summary.max)}</dd>
			<dt class="text-muted-foreground">Std dev</dt>
			<dd class="text-right tabular-nums">{format(summary.stdDev)}</dd>
		</dl>
	{/if}
{/snippet}

{#if empty}
	<p class="text-sm text-muted-foreground">no values yet</p>
{:else if degenerate && VALUE_DEPENDENT.includes(type)}
	<div class="space-y-2">
		{@render summaryList()}
		<p class="text-xs text-muted-foreground">
			{summary?.count === 1 ? 'Only one value' : 'All values are the same'}, so there is no shape to chart.
		</p>
	</div>
{:else if type === 'summary'}
	<div role="group" aria-label="Summary statistics">
		{@render summaryList()}
	</div>
{:else if type === 'topBottom'}
	{#if ranked && (ranked.top.length > 0 || ranked.bottom.length > 0)}
		<div role="group" aria-label="Top and bottom values" class="grid grid-cols-2 gap-4 text-sm">
			{#each [{ name: 'Top', rows: ranked.top }, { name: 'Bottom', rows: ranked.bottom }] as group (group.name)}
				<div>
					<h4 class="mb-1 text-xs font-medium text-muted-foreground">{group.name}</h4>
					<ol class="space-y-0.5">
						{#each group.rows as row, i (`${i}-${row.title}`)}
							<li class="flex justify-between gap-2">
								<span class="truncate">{row.title}</span>
								<span class="tabular-nums">{format(row.value)}</span>
							</li>
						{/each}
					</ol>
				</div>
			{/each}
		</div>
	{:else}
		<p role="group" aria-label="Top and bottom values" class="text-sm text-muted-foreground">no rankings yet</p>
	{/if}
{:else if type === 'coverage'}
	<div role="group" aria-label="Coverage" class="flex items-center gap-4">
		<svg viewBox="0 0 100 100" aria-hidden="true" class="size-20 shrink-0 -rotate-90">
			<circle cx="50" cy="50" r={DONUT_R} fill="none" stroke="var(--color-muted)" stroke-width="14" />
			<circle
				data-filled
				cx="50"
				cy="50"
				r={DONUT_R}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width="14"
				stroke-dasharray="{filledLen} {DONUT_C}"
			/>
		</svg>
		<div class="text-sm">
			<p>{cover.filled} with a value</p>
			<p class="text-muted-foreground">{cover.empty} empty</p>
		</div>
	</div>
{:else}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={label} class="h-auto w-full">
		<line x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} stroke="var(--color-muted-foreground)" stroke-width="1" />
		{#if type === 'histogram'}
			{#each bins as bin, i (i)}
				<rect
					data-bin
					x={PAD.l + i * barW + 1}
					y={sy(bin.count / binMax)}
					width={Math.max(barW - 2, 1)}
					height={sy(0) - sy(bin.count / binMax)}
					fill="var(--color-primary)"
				>
					<title>{format(bin.lo)} to {format(bin.hi)}: {bin.count}</title>
				</rect>
			{/each}
		{:else if type === 'line'}
			<polyline points={linePts} fill="none" stroke="var(--color-primary)" stroke-width="2" />
		{:else if type === 'cumulative'}
			<polyline points={cumPts} fill="none" stroke="var(--color-primary)" stroke-width="2" />
		{:else if type === 'density'}
			<path
				d={densPath}
				fill="var(--color-primary)"
				fill-opacity="0.35"
				stroke="var(--color-primary)"
				stroke-width="1.5"
			/>
		{:else if type === 'pie'}
			{#each pie as slice, i (i)}
				<path
					d={slice.d}
					fill={slice.other ? 'var(--color-muted-foreground)' : 'var(--color-primary)'}
					fill-opacity={slice.opacity}
					stroke="var(--color-background)"
					stroke-width="1"
				>
					<title>{slice.label}: {slice.count}</title>
				</path>
			{/each}
		{:else if type === 'strip'}
			{#each stripDots as dot, i (i)}
				<circle cx={dot.x} cy={dot.y} r="3" fill="var(--color-primary)" fill-opacity="0.6" />
			{/each}
		{:else if type === 'box' && box}
			{@const mid = sy(0.5)}
			<line
				x1={sx(box.min)}
				x2={sx(box.max)}
				y1={mid}
				y2={mid}
				stroke="var(--color-muted-foreground)"
				stroke-width="1.5"
			/>
			<rect
				x={sx(box.q1)}
				y={mid - 20}
				width={Math.max(sx(box.q3) - sx(box.q1), 1)}
				height="40"
				fill="var(--color-primary)"
				fill-opacity="0.35"
				stroke="var(--color-primary)"
				stroke-width="1.5"
			/>
			<line
				data-median
				x1={sx(box.median)}
				x2={sx(box.median)}
				y1={mid - 20}
				y2={mid + 20}
				stroke="var(--color-primary)"
				stroke-width="2.5"
			/>
			{#each box.outliers as o, i (i)}
				<circle
					data-outlier
					cx={sx(o)}
					cy={mid}
					r="3"
					fill="none"
					stroke="var(--color-muted-foreground)"
					stroke-width="1.5"
				/>
			{/each}
		{/if}
		{#if type !== 'pie'}
			<text x={PAD.l} y={H - 3} font-size="9" fill="var(--color-muted-foreground)">{format(lo)}</text>
			<text x={W - PAD.r} y={H - 3} font-size="9" text-anchor="end" fill="var(--color-muted-foreground)"
				>{format(hi)}</text
			>
		{/if}
	</svg>
{/if}

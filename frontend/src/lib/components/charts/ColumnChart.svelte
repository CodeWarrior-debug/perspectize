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
	} from '#lib/utils/columnStats';
	import { niceTicks } from '#lib/utils/chartAxes';
	import {
		binReadout,
		lineReadout,
		cumulativeReadout,
		densityReadout,
		movieReadout,
		pieReadout,
		coverageReadout,
		nearestIndex,
		stepIndex,
	} from '#lib/utils/chartReadout';
	import { CHART_TYPE_LABELS, type ChartType } from '#lib/utils/columnCharts';

	let {
		type,
		values,
		names = [],
		total,
		ranked,
		format,
	}: {
		type: ChartType;
		values: number[];
		/** Movie title for each entry of `values`, in the same order. Used by the readout only. */
		names?: string[];
		/** Count of all loaded rows, including those with no value. */
		total: number;
		ranked?: TopBottom;
		format: (n: number) => string;
	} = $props();

	// viewBox units. The popover is 288px wide, so these render at about 1:1.
	const W = 256;
	const H = 130;
	const PAD = { l: 30, r: 14, t: 8, b: 22 };
	const plotW = W - PAD.l - PAD.r;
	const plotH = H - PAD.t - PAD.b;
	const baseY = H - PAD.b;
	const BINS = 10;
	const PIE_CAP = 5;
	const STRIP_COLS = 3;
	const DONUT_R = 40;
	const DONUT_C = 2 * Math.PI * DONUT_R;
	// Chart types whose hover target is the nearest mark to the pointer (the others use per-element enter events).
	const NEAREST_TYPES: ChartType[] = ['histogram', 'line', 'cumulative', 'density', 'strip', 'box'];
	const VALUE_DEPENDENT: ChartType[] = ['histogram', 'line', 'pie', 'box', 'cumulative', 'density', 'strip'];

	const summary = $derived(summarize(values));
	const empty = $derived(type === 'coverage' ? total === 0 : values.length === 0);
	const cover = $derived(coverage(total, values.length));
	const filledLen = $derived((cover.filled / Math.max(cover.filled + cover.empty, 1)) * DONUT_C);
	// One value, or every value identical: the shape charts have nothing to show.
	const degenerate = $derived(summary !== null && summary.min === summary.max);
	const label = $derived(`${CHART_TYPE_LABELS[type]} chart`);

	const bins = $derived(histogram(values, BINS));
	const binMax = $derived(Math.max(...bins.map((b) => b.count), 1));
	const bandWidth = $derived(summary && summary.max > summary.min ? (summary.max - summary.min) / BINS : 1);
	const lo = $derived(summary?.min ?? 0);
	const hi = $derived(summary?.max ?? 1);

	const dens = $derived(density(values, 48));
	const densMax = $derived(Math.max(...dens.map((p) => p.y), 1e-12));
	// The density curve runs a few bandwidths past the data, so its axis follows the curve, not the data range.
	const curveDomain = $derived(type === 'density' && dens.length > 1);
	const x0 = $derived(curveDomain ? dens[0].x : lo);
	const x1 = $derived(curveDomain ? dens[dens.length - 1].x : hi);
	const xs = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * plotW;
	const ys = (frac: number) => baseY - frac * plotH;

	const xTicks = $derived(niceTicks(x0, x1, 4).map((v) => ({ v, x: xs(v), text: format(v) })));
	const countTicks = $derived(niceTicks(0, binMax, 3, true).map((v) => ({ v, y: ys(v / binMax), text: String(v) })));
	const percentTicks = $derived(niceTicks(0, 1, 2).map((v) => ({ v, y: ys(v), text: `${Math.round(v * 100)}%` })));
	const yTicks = $derived(
		type === 'cumulative' ? percentTicks : type === 'histogram' || type === 'line' ? countTicks : [],
	);

	const barW = $derived(plotW / Math.max(bins.length, 1));
	const box = $derived(boxStats(values));
	const densPath = $derived.by(() => {
		if (dens.length === 0) return '';
		const line = dens.map((p) => `L${xs(p.x)},${ys(p.y / densMax)}`).join(' ');
		return `M${xs(dens[0].x)},${baseY} ${line} L${xs(dens[dens.length - 1].x)},${baseY} Z`;
	});

	const slices = $derived(pieSlices(bins, PIE_CAP));
	const sliceTotal = $derived(slices.reduce((acc, s) => acc + s.count, 0) || 1);
	const sliceLabel = (s: { lo: number; hi: number | null }) =>
		s.hi === null ? `${format(s.lo)} and up` : s.lo === s.hi ? format(s.lo) : `${format(s.lo)}–${format(s.hi)}`;
	const pie = $derived.by(() => {
		const cx = W / 2;
		const cy = H / 2;
		const r = 54;
		let angle = -Math.PI / 2;
		return slices.map((s, i) => {
			const sweep = Math.min((s.count / sliceTotal) * Math.PI * 2, Math.PI * 2 - 0.0001);
			const a0 = angle;
			angle += sweep;
			const pt = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
			return {
				d: `M${cx},${cy} L${pt(a0)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${pt(angle)} Z`,
				other: s.hi === null,
				opacity: Math.max(1 - i * 0.14, 0.3),
			};
		});
	});

	// Movies with a value, ascending. Strip and box plot them; the readout names them.
	const rows = $derived(values.map((v, i) => ({ value: v, name: names[i] ?? '' })).sort((a, b) => a.value - b.value));
	const STRIP_Y = (i: number) => ys(0.2 + ((i % STRIP_COLS) / STRIP_COLS) * 0.6);
	const BOX_Y = $derived(ys(0.5));

	type Mark = { x: number; y: number; text: string };
	// Every hover and keyboard target for the current chart type. Coordinates are viewBox units.
	const items = $derived.by((): Mark[] => {
		switch (type) {
			case 'histogram':
				return bins.map((b) => ({
					x: xs((b.lo + b.hi) / 2),
					y: ys(b.count / binMax),
					text: binReadout(b, format),
				}));
			case 'line':
				return frequencyPoints(bins).map((p, i) => ({
					x: xs(p.x),
					y: ys(p.y / binMax),
					text: lineReadout(bins[i], format),
				}));
			case 'cumulative': {
				const pts = cumulative(values);
				return pts.map((p, i) => ({
					x: xs(p.x),
					y: ys(p.share),
					text: cumulativeReadout(p.x, i + 1, pts.length, format),
				}));
			}
			case 'density':
				return dens.map((p) => ({
					x: xs(p.x),
					y: ys(p.y / densMax),
					text: densityReadout(p.x, p.y * values.length * bandWidth, bandWidth, format),
				}));
			case 'pie':
				return slices.map((s) => ({ x: 0, y: 0, text: pieReadout(sliceLabel(s), s.count, values.length) }));
			case 'strip':
				return rows.map((r, i) => ({
					x: xs(r.value),
					y: STRIP_Y(i),
					text: movieReadout(r.name, r.value, format),
				}));
			case 'box':
				return rows.map((r) => ({ x: xs(r.value), y: BOX_Y, text: movieReadout(r.name, r.value, format) }));
			case 'coverage':
				return [
					{ x: 0, y: 0, text: coverageReadout('filled', cover.filled, total) },
					{ x: 0, y: 0, text: coverageReadout('empty', cover.empty, total) },
				];
			default:
				return [];
		}
	});

	// Hover and focus are kept per chart type, so a pick made on one type can't select a mark on another.
	type Pick = { type: ChartType; index: number };
	let hovered = $state<Pick | null>(null);
	let focused = $state<Pick | null>(null);
	const hoverIndex = $derived(hovered?.type === type ? hovered.index : null);
	const focusIndex = $derived(focused?.type === type ? focused.index : null);
	const activeIndex = $derived(hoverIndex ?? focusIndex);
	const activeMark = $derived(activeIndex !== null && activeIndex < items.length ? items[activeIndex] : null);

	function pointInViewBox(e: MouseEvent): { x: number; y: number } | null {
		const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
	}

	function handleMove(e: MouseEvent) {
		if (!NEAREST_TYPES.includes(type)) return;
		const p = pointInViewBox(e);
		if (!p) return;
		const i = nearestIndex(items, p.x, type === 'strip' ? p.y : undefined);
		hovered = i === null ? null : { type, index: i };
	}

	function handleKey(e: KeyboardEvent) {
		const n = items.length;
		let next: number | null;
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowUp':
				next = stepIndex(focusIndex, 1, n);
				break;
			case 'ArrowLeft':
			case 'ArrowDown':
				next = stepIndex(focusIndex, -1, n);
				break;
			case 'Home':
				next = n > 0 ? 0 : null;
				break;
			case 'End':
				next = n > 0 ? n - 1 : null;
				break;
			default:
				return;
		}
		e.preventDefault();
		focused = next === null ? null : { type, index: next };
	}

	function handleFocus() {
		focused = items.length > 0 ? { type, index: focusIndex ?? 0 } : null;
	}

	function handleBlur() {
		focused = null;
	}

	function leave() {
		hovered = null;
	}
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

{#snippet readout()}
	<p data-testid="chart-readout" aria-live="polite" class="mt-1 min-h-10 text-sm tabular-nums">
		{#if activeMark}
			{activeMark.text}
		{:else}
			<span class="text-muted-foreground">Hover the chart, or focus it and use the arrow keys, to read a value.</span>
		{/if}
	</p>
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
	<div role="group" aria-label="Coverage" class="flex items-center gap-4" onmouseleave={leave}>
		<svg viewBox="0 0 100 100" aria-hidden="true" class="size-20 shrink-0 -rotate-90">
			<!-- svelte-ignore a11y_no_static_element_interactions: hover target only; the readout below carries the text and the group is labelled. -->
			<circle
				cx="50"
				cy="50"
				r={DONUT_R}
				fill="none"
				stroke="var(--color-muted)"
				stroke-width={activeIndex === 1 ? 18 : 14}
				onmouseenter={() => (hovered = { type, index: 1 })}
			/>
			<!-- svelte-ignore a11y_no_static_element_interactions: hover target only; the readout below carries the text and the group is labelled. -->
			<circle
				data-filled
				cx="50"
				cy="50"
				r={DONUT_R}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width={activeIndex === 0 ? 18 : 14}
				stroke-dasharray="{filledLen} {DONUT_C}"
				onmouseenter={() => (hovered = { type, index: 0 })}
			/>
		</svg>
		<div class="text-sm">
			<p>{cover.filled} with a value</p>
			<p class="text-muted-foreground">{cover.empty} empty</p>
		</div>
	</div>
	{@render readout()}
{:else}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions: the chart stays role="img" but takes focus so arrow keys can step through its marks; the readout line announces each one. -->
	<svg
		viewBox="0 0 {W} {H}"
		role="img"
		aria-label={label}
		tabindex="0"
		class="h-auto w-full rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
		onmousemove={handleMove}
		onmouseleave={leave}
		onkeydown={handleKey}
		onfocus={handleFocus}
		onblur={handleBlur}
	>
		{#if type !== 'pie'}
			{#each yTicks as t (t.v)}
				<line
					x1={PAD.l}
					x2={W - PAD.r}
					y1={t.y}
					y2={t.y}
					stroke="var(--color-muted-foreground)"
					stroke-opacity="0.2"
					stroke-width="1"
				/>
				<text x={PAD.l - 4} y={t.y + 3} font-size="9" text-anchor="end" fill="var(--color-muted-foreground)"
					>{t.text}</text
				>
			{/each}
		{/if}
		<line x1={PAD.l} x2={W - PAD.r} y1={baseY} y2={baseY} stroke="var(--color-muted-foreground)" stroke-width="1" />
		{#if type === 'histogram'}
			{#each bins as bin, i (i)}
				{@const top = ys(bin.count / binMax)}
				<rect
					data-bin
					x={PAD.l + i * barW + 1}
					y={top}
					width={Math.max(barW - 2, 1)}
					height={baseY - top}
					fill="var(--color-primary)"
					fill-opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
					stroke={activeIndex === i ? 'var(--color-foreground)' : 'none'}
					stroke-width="1.5"
				/>
			{/each}
		{:else if type === 'line'}
			<polyline
				points={items.map((p) => `${p.x},${p.y}`).join(' ')}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width="2"
			/>
		{:else if type === 'cumulative'}
			<polyline
				points={items.map((p) => `${p.x},${p.y}`).join(' ')}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width="2"
			/>
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
				<!-- svelte-ignore a11y_no_static_element_interactions: hover target only; the readout line carries the slice text. -->
				<path
					d={slice.d}
					fill={slice.other ? 'var(--color-muted-foreground)' : 'var(--color-primary)'}
					fill-opacity={activeIndex !== null && activeIndex !== i ? 0.35 : slice.opacity}
					stroke={activeIndex === i ? 'var(--color-foreground)' : 'var(--color-background)'}
					stroke-width={activeIndex === i ? 2 : 1}
					onmouseenter={() => (hovered = { type, index: i })}
				/>
			{/each}
		{:else if type === 'strip'}
			{#each items as dot, i (i)}
				<circle
					cx={dot.x}
					cy={dot.y}
					r="3"
					fill="var(--color-primary)"
					fill-opacity={activeIndex === null || activeIndex === i ? 0.6 : 0.25}
				/>
			{/each}
		{:else if type === 'box' && box}
			<line
				x1={xs(box.min)}
				x2={xs(box.max)}
				y1={BOX_Y}
				y2={BOX_Y}
				stroke="var(--color-muted-foreground)"
				stroke-width="1.5"
			/>
			<rect
				x={xs(box.q1)}
				y={BOX_Y - 20}
				width={Math.max(xs(box.q3) - xs(box.q1), 1)}
				height="40"
				fill="var(--color-primary)"
				fill-opacity="0.35"
				stroke="var(--color-primary)"
				stroke-width="1.5"
			/>
			<line
				data-median
				x1={xs(box.median)}
				x2={xs(box.median)}
				y1={BOX_Y - 20}
				y2={BOX_Y + 20}
				stroke="var(--color-primary)"
				stroke-width="2.5"
			/>
			{#each box.outliers as o, i (i)}
				<circle
					data-outlier
					cx={xs(o)}
					cy={BOX_Y}
					r="3"
					fill="none"
					stroke="var(--color-muted-foreground)"
					stroke-width="1.5"
				/>
			{/each}
			{#each items as dot, i (i)}
				<circle cx={dot.x} cy={dot.y} r="2" fill="var(--color-foreground)" fill-opacity={activeIndex === i ? 1 : 0.5} />
			{/each}
		{/if}
		{#if activeMark && (type === 'line' || type === 'cumulative' || type === 'density')}
			<line
				x1={activeMark.x}
				x2={activeMark.x}
				y1={PAD.t}
				y2={baseY}
				stroke="var(--color-muted-foreground)"
				stroke-dasharray="3 3"
				stroke-width="1"
			/>
			<circle
				cx={activeMark.x}
				cy={activeMark.y}
				r="4"
				fill="var(--color-primary)"
				stroke="var(--color-background)"
				stroke-width="2"
			/>
		{:else if activeMark && (type === 'strip' || type === 'box')}
			<circle cx={activeMark.x} cy={activeMark.y} r="5" fill="none" stroke="var(--color-foreground)" stroke-width="2" />
		{/if}
		{#if type !== 'pie'}
			{#each xTicks as t (t.v)}
				<line x1={t.x} x2={t.x} y1={baseY} y2={baseY + 3} stroke="var(--color-muted-foreground)" stroke-width="1" />
				<text x={t.x} y={H - 4} font-size="9" text-anchor="middle" fill="var(--color-muted-foreground)">{t.text}</text>
			{/each}
		{/if}
	</svg>
	{@render readout()}
{/if}

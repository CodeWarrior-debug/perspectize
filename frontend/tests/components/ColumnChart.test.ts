import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnChart from '#lib/components/charts/ColumnChart.svelte';
import { histogram, topBottom } from '#lib/utils/columnStats';
import { CHART_TYPES, CHART_TYPE_LABELS, type ChartType } from '#lib/utils/columnCharts';

const values = [1, 2, 2, 3, 4, 5, 6, 8, 9, 10, 15, 40];
const format = (n: number) => `#${Math.round(n * 100) / 100}`;
const renderChart = (type: ChartType, v: number[] = values, ranked?: ReturnType<typeof topBottom>) =>
	render(ColumnChart, { props: { type, values: v, total: v.length, ranked, format } });

const HINT = /Hover the chart/;
const readout = () => screen.getByTestId('chart-readout').textContent?.trim() ?? '';
const svgOf = (c: HTMLElement) => c.querySelector<SVGSVGElement>('svg[role="img"]')!;
const texts = (c: HTMLElement, anchor: string) =>
	[...c.querySelectorAll('svg text')].filter((t) => t.getAttribute('text-anchor') === anchor).map((t) => t.textContent);

/** jsdom has no layout: give the chart a 256x130 box so pointer coordinates map 1:1 onto the viewBox. */
function sizeBox(svg: SVGSVGElement) {
	vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
		left: 0,
		top: 0,
		x: 0,
		y: 0,
		width: 256,
		height: 130,
		right: 256,
		bottom: 130,
		toJSON: () => ({}),
	} as DOMRect);
}

describe('ColumnChart', () => {
	it('histogram renders one rect per bin', () => {
		const { container } = renderChart('histogram');
		const bins = histogram(values, 10);
		expect(container.querySelectorAll('svg rect[data-bin]').length).toBe(bins.length);
		expect(screen.getByRole('img', { name: /histogram/i })).toBeInTheDocument();
	});

	it('line renders a polyline through the bin midpoints', () => {
		const { container } = renderChart('line');
		expect(container.querySelectorAll('svg polyline').length).toBe(1);
		expect(screen.getByRole('img', { name: /line/i })).toBeInTheDocument();
	});

	it('pie caps at five slices plus an "Other" slice', () => {
		const many = Array.from({ length: 60 }, (_, i) => i + 1);
		const { container } = renderChart('pie', many);
		const paths = [...container.querySelectorAll('svg path')];
		expect(paths.length).toBeLessThanOrEqual(6);
		expect(screen.getByRole('img', { name: /pie/i })).toBeInTheDocument();
	});

	it('box renders the median line and an outlier circle', () => {
		const { container } = renderChart('box');
		expect(container.querySelector('svg line[data-median]')).not.toBeNull();
		expect(container.querySelectorAll('svg circle[data-outlier]').length).toBeGreaterThan(0);
		expect(screen.getByRole('img', { name: /box/i })).toBeInTheDocument();
	});

	it('cumulative renders a stepped polyline', () => {
		const { container } = renderChart('cumulative');
		expect(container.querySelectorAll('svg polyline').length).toBe(1);
		expect(screen.getByRole('img', { name: /cumulative/i })).toBeInTheDocument();
	});

	it('summary renders Median with the formatted value', () => {
		renderChart('summary');
		expect(screen.getByText('Median')).toBeInTheDocument();
		expect(screen.getByText('#5.5')).toBeInTheDocument();
		expect(screen.getByText('Min')).toBeInTheDocument();
		expect(screen.getByText('Max')).toBeInTheDocument();
	});

	it('density renders a filled path', () => {
		const { container } = renderChart('density');
		expect(container.querySelectorAll('svg path').length).toBe(1);
		expect(screen.getByRole('img', { name: /density/i })).toBeInTheDocument();
	});

	it('strip renders one circle per value', () => {
		const { container } = renderChart('strip');
		expect(container.querySelectorAll('svg circle').length).toBe(values.length);
		expect(screen.getByRole('img', { name: /strip/i })).toBeInTheDocument();
	});

	it('topBottom renders titles and formatted values from ranked', () => {
		const ranked = {
			top: [{ title: 'Alpha video', value: 90 }],
			bottom: [{ title: 'Omega video', value: 0 }],
		};
		renderChart('topBottom', values, ranked);
		expect(screen.getByText('Alpha video')).toBeInTheDocument();
		expect(screen.getByText('#90')).toBeInTheDocument();
		expect(screen.getByText('Omega video')).toBeInTheDocument();
		expect(screen.getByText('#0')).toBeInTheDocument();
	});

	it('topBottom without ranked renders a no-rankings note', () => {
		renderChart('topBottom');
		expect(screen.getByText('no rankings yet')).toBeInTheDocument();
	});

	it('coverage splits filled and empty rows using total', () => {
		const { container } = render(ColumnChart, { props: { type: 'coverage', values, total: 20, format } });
		expect(screen.getByText('12 with a value')).toBeInTheDocument();
		expect(screen.getByText('8 empty')).toBeInTheDocument();
		const filled = container.querySelector('circle[data-filled]')!;
		const [len, circ] = filled.getAttribute('stroke-dasharray')!.split(' ').map(Number);
		expect(len / circ).toBeCloseTo(12 / 20, 3);
	});

	it('coverage with total 0 shows no values yet', () => {
		render(ColumnChart, { props: { type: 'coverage', values: [], total: 0, format } });
		expect(screen.getByText('no values yet')).toBeInTheDocument();
	});

	it('coverage with all rows empty still renders the donut', () => {
		render(ColumnChart, { props: { type: 'coverage', values: [], total: 5, format } });
		expect(screen.getByText('0 with a value')).toBeInTheDocument();
		expect(screen.getByText('5 empty')).toBeInTheDocument();
	});

	it.each([
		['summary', 'Summary statistics'],
		['topBottom', 'Top and bottom values'],
		['coverage', 'Coverage'],
	] as const)('%s is an HTML group labelled %s, not an img', (type, name) => {
		const ranked = { top: [{ title: 'A', value: 2 }], bottom: [{ title: 'B', value: 1 }] };
		renderChart(type, values, ranked);
		expect(screen.getByRole('group', { name })).toBeInTheDocument();
		expect(screen.queryByRole('img')).toBeNull();
	});

	it.each(['summary', 'topBottom', 'coverage'] as const)('%s still renders normally for identical values', (type) => {
		const ranked = { top: [{ title: 'A', value: 3 }], bottom: [{ title: 'B', value: 3 }] };
		render(ColumnChart, { props: { type, values: [3, 3, 3], total: 4, ranked, format } });
		expect(screen.queryByText(/all values are the same/i)).toBeNull();
		if (type === 'summary') expect(screen.getByText('Median')).toBeInTheDocument();
		if (type === 'topBottom') expect(screen.getByText('A')).toBeInTheDocument();
		if (type === 'coverage') expect(screen.getByText('1 empty')).toBeInTheDocument();
	});

	it.each(CHART_TYPES)('%s shows "no values yet" when empty', (type) => {
		const { container } = renderChart(type, []);
		expect(screen.getByText('no values yet')).toBeInTheDocument();
		expect(container.querySelector('svg')).toBeNull();
	});

	it('treats zero as a value', () => {
		renderChart('summary', [0, 0, 0]);
		expect(screen.queryByText('no values yet')).toBeNull();
	});

	const VALUE_DEPENDENT_TYPES = ['histogram', 'line', 'pie', 'box', 'cumulative', 'density', 'strip'] as const;
	it.each(
		VALUE_DEPENDENT_TYPES.flatMap((type) => [
			[type, 'one value', [7]] as const,
			[type, 'identical values', [3, 3, 3, 3]] as const,
		]),
	)('%s is replaced by summary and a note for %s', (type, _name, v) => {
		const { container } = renderChart(type, [...v]);
		expect(screen.getByText('Median')).toBeInTheDocument();
		expect(screen.getByText(/all values are the same|only one value/i)).toBeInTheDocument();
		expect(container.querySelector('svg')).toBeNull();
	});

	it('names every chart type in its aria-label', () => {
		for (const type of CHART_TYPES.filter((t) => t !== 'summary' && t !== 'topBottom' && t !== 'coverage')) {
			const { unmount } = renderChart(type);
			expect(screen.getByRole('img').getAttribute('aria-label')).toContain(CHART_TYPE_LABELS[type]);
			unmount();
		}
	});
});

describe('ColumnChart readout', () => {
	const names = values.map((_, i) => `Movie ${i}`);
	const withNames = (type: ChartType, v = values) =>
		render(ColumnChart, { props: { type, values: v, names, total: v.length, format } });

	it('shows only the hint until something is hovered or focused', () => {
		const { container } = renderChart('histogram');
		expect(readout()).toMatch(HINT);
		expect(container.querySelector('[data-bin]')).not.toBeNull();
	});

	it('histogram: hovering a bar reads its range and count, and leaving clears it', async () => {
		const { container } = renderChart('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[0];
		const cx = Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2;
		await fireEvent.mouseMove(svg, { clientX: cx, clientY: 60 });
		expect(readout()).toBe('#1–#4.9 · 5 movies');
		await fireEvent.mouseLeave(svg);
		expect(readout()).toMatch(HINT);
	});

	it('histogram: the hovered bar is highlighted and the others dim', async () => {
		const { container } = renderChart('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bars = container.querySelectorAll('rect[data-bin]');
		const cx = Number(bars[0].getAttribute('x')) + Number(bars[0].getAttribute('width')) / 2;
		await fireEvent.mouseMove(svg, { clientX: cx, clientY: 60 });
		expect(bars[0].getAttribute('fill-opacity')).toBe('1');
		expect(bars[1].getAttribute('fill-opacity')).toBe('0.45');
	});

	it('line: hovering a point reads the midpoint, count and range of its bin', async () => {
		const { container } = renderChart('line');
		const svg = svgOf(container);
		sizeBox(svg);
		const first = container.querySelector('polyline')!.getAttribute('points')!.split(' ')[0].split(',')[0];
		await fireEvent.mouseMove(svg, { clientX: Number(first), clientY: 60 });
		expect(readout()).toBe('#2.95: 5 movies from #1 to #4.9');
		expect(container.querySelector('svg circle[r="4"]')).not.toBeNull();
	});

	it('cumulative: hovering a point reads its value and rank of the total', async () => {
		const { container } = renderChart('cumulative');
		const svg = svgOf(container);
		sizeBox(svg);
		const first = container.querySelector('polyline')!.getAttribute('points')!.split(' ')[0].split(',')[0];
		await fireEvent.mouseMove(svg, { clientX: Number(first), clientY: 60 });
		expect(readout()).toBe('#1 · 1 of 12 movies (8%) at or below');
	});

	it('density: hovering the curve reads an expected count in one band', async () => {
		const { container } = renderChart('density');
		const svg = svgOf(container);
		sizeBox(svg);
		const peakX = 30 + 212 * ((values[1] - 1) / 39);
		await fireEvent.mouseMove(svg, { clientX: peakX, clientY: 60 });
		expect(readout()).toMatch(/band around it$/);
		expect(readout()).toMatch(/· (about \d+ movies?|under 1 movie) in the/);
	});

	it('strip: hovering a dot names its movie and value', async () => {
		const { container } = withNames('strip');
		const svg = svgOf(container);
		sizeBox(svg);
		const dot = container.querySelectorAll('svg circle')[values.length - 1];
		await fireEvent.mouseMove(svg, {
			clientX: Number(dot.getAttribute('cx')),
			clientY: Number(dot.getAttribute('cy')),
		});
		expect(readout()).toBe('Movie 11 · #40');
	});

	it('box: hovering on the outlier names its movie', async () => {
		const { container } = withNames('box');
		const svg = svgOf(container);
		sizeBox(svg);
		const outlier = container.querySelector('circle[data-outlier]')!;
		await fireEvent.mouseMove(svg, { clientX: Number(outlier.getAttribute('cx')), clientY: 60 });
		expect(readout()).toBe('Movie 11 · #40');
	});

	it('histogram: a bin names its three largest movies and counts the rest as "+N more"', async () => {
		const { container } = withNames('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[0];
		await fireEvent.mouseMove(svg, {
			clientX: Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2,
			clientY: 60,
		});
		// Bin 0 holds 1, 2, 2, 3, 4 (movies 0 to 4): largest first, then the count left over.
		expect(readout()).toBe('#1–#4.9 · 5 movies · Movie 4, Movie 3, Movie 1, +2 more');
	});

	it('histogram: a bin with exactly three movies lists all three and no "more"', async () => {
		const { container } = withNames('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[1];
		await fireEvent.mouseMove(svg, {
			clientX: Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2,
			clientY: 60,
		});
		expect(readout()).toBe('#4.9–#8.8 · 3 movies · Movie 7, Movie 6, Movie 5');
	});

	it('histogram: a bin with one movie names that movie alone', async () => {
		const { container } = withNames('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[3];
		await fireEvent.mouseMove(svg, {
			clientX: Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2,
			clientY: 60,
		});
		expect(readout()).toBe('#12.7–#16.6 · 1 movie · Movie 10');
	});

	it('histogram: an empty bin reads zero movies with no titles', async () => {
		const { container } = withNames('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[4];
		await fireEvent.mouseMove(svg, {
			clientX: Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2,
			clientY: 60,
		});
		expect(readout()).toBe('#16.6–#20.5 · 0 movies');
	});

	it('histogram: a movie with no title is labelled Untitled, not dropped', async () => {
		const untitled = values.map((_, i) => (i === 10 ? '' : `Movie ${i}`));
		const { container } = render(ColumnChart, {
			props: { type: 'histogram', values, names: untitled, total: values.length, format },
		});
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[3];
		await fireEvent.mouseMove(svg, {
			clientX: Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2,
			clientY: 60,
		});
		expect(readout()).toBe('#12.7–#16.6 · 1 movie · Untitled');
	});

	it('line: a point names the movies in its bin', async () => {
		const { container } = withNames('line');
		const svg = svgOf(container);
		sizeBox(svg);
		const first = container.querySelector('polyline')!.getAttribute('points')!.split(' ')[0].split(',')[0];
		await fireEvent.mouseMove(svg, { clientX: Number(first), clientY: 60 });
		expect(readout()).toBe('#2.95: 5 movies from #1 to #4.9 · Movie 4, Movie 3, Movie 1, +2 more');
	});

	it('cumulative: a point names the largest movies at or below it', async () => {
		const { container } = withNames('cumulative');
		const svg = svgOf(container);
		sizeBox(svg);
		const points = container.querySelector('polyline')!.getAttribute('points')!.split(' ');
		// The fourth point is the movie at rank 4 (value 3); the movies at or below it are values 1, 2, 2, 3.
		await fireEvent.mouseMove(svg, { clientX: Number(points[3].split(',')[0]), clientY: 60 });
		expect(readout()).toBe('#3 · 4 of 12 movies (33%) at or below · Movie 3, Movie 1, Movie 2, +1 more');
	});

	it('pie: hovering a slice reads its range, count and share of the values', async () => {
		const { container } = renderChart('pie');
		const first = container.querySelectorAll('svg path')[0];
		await fireEvent.mouseEnter(first);
		expect(readout()).toBe('#1–#4.9 · 5 movies (42%)');
		await fireEvent.mouseLeave(svgOf(container));
		expect(readout()).toMatch(HINT);
	});

	it('pie: the last slice reads as open-ended', async () => {
		const many = Array.from({ length: 60 }, (_, i) => i + 1);
		const { container } = renderChart('pie', many);
		const paths = container.querySelectorAll('svg path');
		await fireEvent.mouseEnter(paths[paths.length - 1]);
		expect(readout()).toMatch(/^#\d+(\.\d+)? and up · \d+ movies? \(\d+%\)$/);
	});

	it('coverage: hovering a segment reads its count and share of all rows', async () => {
		const { container } = render(ColumnChart, { props: { type: 'coverage', values, total: 20, format } });
		await fireEvent.mouseEnter(container.querySelector('circle[data-filled]')!);
		expect(readout()).toBe('12 with a value (60%)');
	});

	it('keyboard: focus reads the first mark, arrows step, Home and End jump, blur clears', async () => {
		const { container } = renderChart('histogram');
		const svg = svgOf(container);
		expect(svg.getAttribute('tabindex')).toBe('0');
		await fireEvent.focus(svg);
		expect(readout()).toBe('#1–#4.9 · 5 movies');
		await fireEvent.keyDown(svg, { key: 'ArrowRight' });
		expect(readout()).toMatch(/^#4\.9–/);
		await fireEvent.keyDown(svg, { key: 'End' });
		expect(readout()).toMatch(/^#36\.1–#40 ·/);
		await fireEvent.keyDown(svg, { key: 'Home' });
		expect(readout()).toBe('#1–#4.9 · 5 movies');
		await fireEvent.keyDown(svg, { key: 'ArrowLeft' });
		expect(readout()).toBe('#1–#4.9 · 5 movies');
		await fireEvent.blur(svg);
		expect(readout()).toMatch(HINT);
	});

	it('keyboard: an arrow key that is not a chart key is left alone', async () => {
		const { container } = renderChart('histogram');
		const svg = svgOf(container);
		await fireEvent.focus(svg);
		const notPrevented = await fireEvent.keyDown(svg, { key: 'a' });
		expect(notPrevented).toBe(true);
	});

	it('a hover on one chart type does not leak into another', async () => {
		const { container, rerender } = renderChart('histogram');
		const svg = svgOf(container);
		sizeBox(svg);
		const bar = container.querySelectorAll('rect[data-bin]')[9];
		await fireEvent.mouseMove(svg, { clientX: Number(bar.getAttribute('x')) + 1, clientY: 60 });
		expect(readout()).not.toMatch(HINT);
		await rerender({ type: 'pie', values, total: values.length, format });
		expect(readout()).toMatch(HINT);
	});

	it('axes: the count scale is whole numbers and the value axis is formatted', () => {
		const { container } = renderChart('histogram');
		const counts = texts(container, 'end');
		expect(counts.length).toBeGreaterThanOrEqual(2);
		for (const c of counts) expect(c).toMatch(/^\d+$/);
		expect(texts(container, 'middle')).toEqual(['#10', '#20', '#30', '#40']);
	});

	it('axes: the cumulative scale is a percentage', () => {
		const { container } = renderChart('cumulative');
		expect(texts(container, 'end')).toEqual(['0%', '50%', '100%']);
	});

	it('axes: strip and box have no count scale', () => {
		for (const type of ['strip', 'box'] as const) {
			const { container, unmount } = renderChart(type);
			expect(texts(container, 'end')).toEqual([]);
			unmount();
		}
	});
});

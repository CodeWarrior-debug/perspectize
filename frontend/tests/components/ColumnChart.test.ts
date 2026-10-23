import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ColumnChart from '$lib/components/charts/ColumnChart.svelte';
import { histogram, topBottom } from '$lib/utils/columnStats';
import { CHART_TYPES, CHART_TYPE_LABELS, type ChartType } from '$lib/utils/columnCharts';

const values = [1, 2, 2, 3, 4, 5, 6, 8, 9, 10, 15, 40];
const format = (n: number) => `#${Math.round(n * 100) / 100}`;
const renderChart = (type: ChartType, v: number[] = values, ranked?: ReturnType<typeof topBottom>) =>
	render(ColumnChart, { props: { type, values: v, total: v.length, ranked, format } });

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
		expect(paths.at(-1)?.querySelector('title')?.textContent).toMatch(/^Other:/);
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

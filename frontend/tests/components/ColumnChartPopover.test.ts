import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnChartPopover from '#lib/components/charts/ColumnChartPopover.svelte';
import { CHART_TYPES, CHART_TYPE_LABELS, defaultChartType } from '#lib/utils/columnCharts';
import { itemNounFor } from '#lib/utils/chartReadout';

const values = [1, 2, 2, 3, 4, 5, 6, 8, 9, 10, 15, 40];
const format = (n: number) => `#${Math.round(n * 100) / 100}`;
const props = (over: Record<string, unknown> = {}) => ({
	colId: 'views',
	label: 'Views',
	values,
	total: values.length + 3,
	format,
	open: true,
	onClose: vi.fn(),
	...over,
});

afterEach(() => vi.restoreAllMocks());

describe('ColumnChartPopover', () => {
	it('renders nothing while closed', () => {
		render(ColumnChartPopover, { props: props({ open: false }) });
		expect(screen.queryByTestId('column-chart-popover')).toBeNull();
	});

	it('opens with the default type selected and its chart rendered', () => {
		render(ColumnChartPopover, { props: props() });
		const def = defaultChartType('views');
		for (const t of CHART_TYPES) {
			expect(screen.getByRole('button', { name: CHART_TYPE_LABELS[t] })).toHaveAttribute(
				'aria-pressed',
				String(t === def),
			);
		}
		expect(screen.getByRole('img', { name: /histogram/i })).toBeInTheDocument();
	});

	it('choosing pie re-renders the chart in place without touching localStorage', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		render(ColumnChartPopover, { props: props() });
		await fireEvent.click(screen.getByRole('button', { name: 'Pie' }));
		expect(screen.getByRole('img', { name: /pie/i })).toBeInTheDocument();
		expect(screen.queryByRole('img', { name: /histogram/i })).toBeNull();
		expect(screen.getByRole('button', { name: 'Pie' })).toHaveAttribute('aria-pressed', 'true');
		expect(setItem).not.toHaveBeenCalled();
	});

	it('re-opening after close shows the default type again', async () => {
		const { rerender } = render(ColumnChartPopover, { props: props() });
		await fireEvent.click(screen.getByRole('button', { name: 'Pie' }));
		await rerender(props({ open: false }));
		await rerender(props({ open: true }));
		expect(screen.getByRole('button', { name: 'Histogram' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('img', { name: /histogram/i })).toBeInTheDocument();
	});

	it('says how many loaded movies the chart is based on, and how many rows are empty', () => {
		render(ColumnChartPopover, { props: props() });
		expect(screen.getByText(`based on ${values.length} loaded movies · 3 empty`)).toBeInTheDocument();
	});

	it('uses the singular for one movie and shows zero empty rows', () => {
		render(ColumnChartPopover, { props: props({ values: [5], total: 1 }) });
		expect(screen.getByText('based on 1 loaded movie · 0 empty')).toBeInTheDocument();
	});

	it('names the rows by content type: books in the Book view', () => {
		render(ColumnChartPopover, {
			props: props({ label: 'Pages', noun: itemNounFor('book'), values: [5], total: 1 }),
		});
		expect(screen.getByText('Pages · 1 book')).toBeInTheDocument();
		expect(screen.getByText('based on 1 loaded book · 0 empty')).toBeInTheDocument();
		expect(screen.queryByText(/movie/)).toBeNull();
	});

	it('passes total through so coverage counts empty rows', async () => {
		render(ColumnChartPopover, { props: props() });
		await fireEvent.click(screen.getByRole('button', { name: 'Coverage' }));
		expect(screen.getByText('12 with a value')).toBeInTheDocument();
		expect(screen.getByText('3 empty')).toBeInTheDocument();
	});

	it('Escape closes via onClose', async () => {
		const onClose = vi.fn();
		render(ColumnChartPopover, { props: props({ onClose }) });
		await fireEvent.keyDown(document.body, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});

	it('moves focus to the selected chart type when opened for the keyboard', async () => {
		render(ColumnChartPopover, { props: props({ focusOnOpen: true }) });
		await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Histogram' })));
	});

	it('leaves focus alone when opened by the pointer', async () => {
		render(ColumnChartPopover, { props: props() });
		await new Promise((r) => setTimeout(r, 50));
		expect(document.activeElement).toBe(document.body);
	});

	it('heading names the column and the number of movies charted', () => {
		render(ColumnChartPopover, { props: props() });
		expect(screen.getByRole('heading', { name: `Views · ${values.length} movies` })).toBeInTheDocument();
	});

	it('caption says what the axes are, and follows the chosen chart type', async () => {
		render(ColumnChartPopover, { props: props() });
		expect(screen.getByText('Number of movies (height) by Views (across)')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Pie' }));
		expect(screen.getByText('Share of movies in each Views range')).toBeInTheDocument();
		expect(screen.queryByText('Number of movies (height) by Views (across)')).toBeNull();
	});

	it('passes the movie names through so a strip readout names the movie under the pointer', async () => {
		const names = values.map((_, i) => `Movie ${i}`);
		const svgRect = {
			left: 0,
			top: 0,
			x: 0,
			y: 0,
			width: 256,
			height: 130,
			right: 256,
			bottom: 130,
			toJSON: () => ({}),
		};
		vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue(svgRect as DOMRect);
		render(ColumnChartPopover, { props: props({ names }) });
		await fireEvent.click(screen.getByRole('button', { name: 'Strip plot' }));
		const dot = document.querySelectorAll<SVGCircleElement>('[data-testid="column-chart-popover"] svg circle')[
			values.length - 1
		];
		await fireEvent.mouseMove(dot.closest('svg') as SVGSVGElement, {
			clientX: Number(dot.getAttribute('cx')),
			clientY: Number(dot.getAttribute('cy')),
		});
		expect(screen.getByTestId('chart-readout').textContent).toBe(`Movie ${values.length - 1} · ${format(40)}`);
	});
});

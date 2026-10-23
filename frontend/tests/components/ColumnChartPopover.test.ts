import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnChartPopover from '$lib/components/charts/ColumnChartPopover.svelte';
import { CHART_TYPES, CHART_TYPE_LABELS, defaultChartType } from '$lib/utils/columnCharts';

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
			expect(screen.getByRole('radio', { name: CHART_TYPE_LABELS[t] })).toHaveAttribute(
				'aria-checked',
				String(t === def),
			);
		}
		expect(screen.getByRole('img', { name: /histogram/i })).toBeInTheDocument();
	});

	it('choosing pie re-renders the chart in place without touching localStorage', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		render(ColumnChartPopover, { props: props() });
		await fireEvent.click(screen.getByRole('radio', { name: 'Pie' }));
		expect(screen.getByRole('img', { name: /pie/i })).toBeInTheDocument();
		expect(screen.queryByRole('img', { name: /histogram/i })).toBeNull();
		expect(screen.getByRole('radio', { name: 'Pie' })).toHaveAttribute('aria-checked', 'true');
		expect(setItem).not.toHaveBeenCalled();
	});

	it('re-opening after close shows the default type again', async () => {
		const { rerender } = render(ColumnChartPopover, { props: props() });
		await fireEvent.click(screen.getByRole('radio', { name: 'Pie' }));
		await rerender(props({ open: false }));
		await rerender(props({ open: true }));
		expect(screen.getByRole('radio', { name: 'Histogram' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('img', { name: /histogram/i })).toBeInTheDocument();
	});

	it('says how many loaded movies the chart is based on', () => {
		render(ColumnChartPopover, { props: props() });
		expect(screen.getByText(`based on ${values.length} loaded movies`)).toBeInTheDocument();
	});

	it('passes total through so coverage counts empty rows', async () => {
		render(ColumnChartPopover, { props: props() });
		await fireEvent.click(screen.getByRole('radio', { name: 'Coverage' }));
		expect(screen.getByText('12 with a value')).toBeInTheDocument();
		expect(screen.getByText('3 empty')).toBeInTheDocument();
	});

	it('Escape closes via onClose', async () => {
		const onClose = vi.fn();
		render(ColumnChartPopover, { props: props({ onClose }) });
		await fireEvent.keyDown(document.body, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});
});

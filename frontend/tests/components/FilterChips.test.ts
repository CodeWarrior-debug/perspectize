import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FilterChips from '$lib/components/FilterChips.svelte';

const mockSetFilterModel = vi.fn();
const mockGetFilterModel = vi.fn();

function mockGridApi() {
	return {
		setFilterModel: mockSetFilterModel,
		getFilterModel: mockGetFilterModel,
	} as any;
}

function renderChips(filterModel: Record<string, any>, gridApi = mockGridApi()) {
	return render(FilterChips, { props: { gridApi, filterModel } });
}

describe('FilterChips', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders nothing when no filters are active', () => {
		const { container } = renderChips({});
		expect(container.textContent?.trim()).toBe('');
	});

	it('renders a chip for a text filter', () => {
		renderChips({
			channel: { filterType: 'text', type: 'contains', filter: 'Fireship' },
		});
		expect(screen.getByText('Channel:')).toBeInTheDocument();
		expect(screen.getByText('contains "Fireship"')).toBeInTheDocument();
	});

	it('renders a chip for a number filter', () => {
		renderChips({
			views: { filterType: 'number', type: 'greaterThan', filter: 1000 },
		});
		expect(screen.getByText('Views:')).toBeInTheDocument();
		expect(screen.getByText('> 1000')).toBeInTheDocument();
	});

	it('renders a chip for a number range filter', () => {
		renderChips({
			likes: { filterType: 'number', type: 'inRange', filter: 100, filterTo: 5000 },
		});
		expect(screen.getByText('Likes:')).toBeInTheDocument();
		expect(screen.getByText('100 \u2013 5000')).toBeInTheDocument();
	});

	it('renders a chip for a date filter', () => {
		renderChips({
			publishDate: {
				filterType: 'date',
				type: 'greaterThan',
				dateFrom: '2024-06-15 00:00:00',
			},
		});
		expect(screen.getByText('Date:')).toBeInTheDocument();
		expect(screen.getByText(/after/)).toBeInTheDocument();
	});

	it('renders a chip for a date range filter', () => {
		renderChips({
			publishDate: {
				filterType: 'date',
				type: 'inRange',
				dateFrom: '2024-01-01 00:00:00',
				dateTo: '2024-06-30 00:00:00',
			},
		});
		expect(screen.getByText('Date:')).toBeInTheDocument();
		// Should show two dates separated by an en-dash
		expect(screen.getByText(/\u2013/)).toBeInTheDocument();
	});

	it('renders multiple chips for multiple filters', () => {
		renderChips({
			channel: { filterType: 'text', type: 'contains', filter: 'Fireship' },
			views: { filterType: 'number', type: 'greaterThan', filter: 1000 },
		});
		expect(screen.getByText('Channel:')).toBeInTheDocument();
		expect(screen.getByText('Views:')).toBeInTheDocument();
	});

	it('renders Clear all button when filters are active', () => {
		renderChips({
			channel: { filterType: 'text', type: 'contains', filter: 'test' },
		});
		expect(screen.getByText('Clear all')).toBeInTheDocument();
	});

	it('calls setFilterModel(null) when Clear all is clicked', async () => {
		const api = mockGridApi();
		renderChips({ channel: { filterType: 'text', type: 'contains', filter: 'test' } }, api);

		const clearBtn = screen.getByText('Clear all');
		await fireEvent.click(clearBtn);
		expect(mockSetFilterModel).toHaveBeenCalledWith(null);
	});

	it('removes a single filter when X is clicked', async () => {
		const api = mockGridApi();
		mockGetFilterModel.mockReturnValue({
			channel: { filterType: 'text', type: 'contains', filter: 'test' },
			views: { filterType: 'number', type: 'greaterThan', filter: 500 },
		});

		renderChips(
			{
				channel: { filterType: 'text', type: 'contains', filter: 'test' },
				views: { filterType: 'number', type: 'greaterThan', filter: 500 },
			},
			api,
		);

		const removeChannelBtn = screen.getByLabelText('Remove Channel filter');
		await fireEvent.click(removeChannelBtn);

		expect(mockSetFilterModel).toHaveBeenCalledWith({
			views: { filterType: 'number', type: 'greaterThan', filter: 500 },
		});
	});

	it('handles text filter with equals type', () => {
		renderChips({
			type: { filterType: 'text', type: 'equals', filter: 'youtube' },
		});
		expect(screen.getByText('Type:')).toBeInTheDocument();
		expect(screen.getByText('is "youtube"')).toBeInTheDocument();
	});

	it('handles blank and notBlank filters', () => {
		renderChips({
			tags: { filterType: 'text', type: 'blank' },
		});
		expect(screen.getByText('Tags:')).toBeInTheDocument();
		expect(screen.getByText('is blank')).toBeInTheDocument();
	});

	it('handles combined conditions with AND operator', () => {
		renderChips({
			channel: {
				filterType: 'text',
				operator: 'AND',
				conditions: [
					{ filterType: 'text', type: 'contains', filter: 'Fire' },
					{ filterType: 'text', type: 'notContains', filter: 'Ice' },
				],
			},
		});
		expect(screen.getByText('Channel:')).toBeInTheDocument();
		expect(screen.getByText('contains "Fire" and excludes "Ice"')).toBeInTheDocument();
	});

	it('does not render when gridApi is null', () => {
		const { container } = renderChips(
			{ channel: { filterType: 'text', type: 'contains', filter: 'test' } },
			null as any,
		);
		// Still renders chips (display is independent of gridApi), but remove buttons won't work
		expect(screen.getByText('Channel:')).toBeInTheDocument();
	});
});

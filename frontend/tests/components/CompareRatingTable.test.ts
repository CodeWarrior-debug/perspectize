import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CompareRatingTable from '$lib/components/CompareRatingTable.svelte';
import type { RatingRow, FilledInDifferentlyRow, FeelingComparison } from '$lib/utils/comparePerspectives';

const rows: RatingRow[] = [
	{ key: 'quality', label: 'Quality', leftDisplay: 8, rightDisplay: 7, delta: 1, pctDiff: 10, status: 'similar' },
	{ key: 'agreement', label: 'Agreement', leftDisplay: 9, rightDisplay: 3, delta: 6, pctDiff: 60, status: 'conflict' },
];
const filledInDifferently: FilledInDifferentlyRow[] = [
	{ key: 'confidence', label: 'Confidence', side: 'left', display: 6 },
];
const noFeelings: FeelingComparison = { shared: [], leftOnly: [], rightOnly: [] };
const withSharedFeelings: FeelingComparison = {
	shared: [{ emoji: '🤔', label: 'curious' }],
	leftOnly: [],
	rightOnly: [],
};

describe('CompareRatingTable', () => {
	it('renders one row per rating dimension with its label and status', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.getByText('Quality')).toBeInTheDocument();
		expect(screen.getByText('Agreement')).toBeInTheDocument();
		expect(screen.getByText('Similar')).toBeInTheDocument();
		expect(screen.getByText('Conflict')).toBeInTheDocument();
	});

	it('shows the ascending sort label when sortDesc is false', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.getByText('Most similar first')).toBeInTheDocument();
	});

	it('shows the descending sort label when sortDesc is true', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: true, onToggleSort: vi.fn() },
		});
		expect(screen.getByText('Most similar last')).toBeInTheDocument();
	});

	it('calls onToggleSort when the sort toggle is clicked', async () => {
		const onToggleSort = vi.fn();
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort },
		});
		await fireEvent.click(screen.getByTestId('sort-toggle'));
		expect(onToggleSort).toHaveBeenCalled();
	});

	it('renders the filled-in-differently sublist', () => {
		render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.getByText(/Confidence/)).toBeInTheDocument();
	});

	it('shows the matching-feelings row only when there are shared feelings', () => {
		const { rerender } = render(CompareRatingTable, {
			props: { rows, filledInDifferently, feelings: noFeelings, sortDesc: false, onToggleSort: vi.fn() },
		});
		expect(screen.queryByText('Matching feelings')).not.toBeInTheDocument();

		rerender({ rows, filledInDifferently, feelings: withSharedFeelings, sortDesc: false, onToggleSort: vi.fn() });
		expect(screen.getByText('Matching feelings')).toBeInTheDocument();
	});
});

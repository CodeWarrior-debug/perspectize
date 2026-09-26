import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CompareOverallRow from '$lib/components/CompareOverallRow.svelte';

describe('CompareOverallRow', () => {
	it('shows "Agree overall" when both thumbs match', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', agree: true } } });
		expect(screen.getByText('Agree overall')).toBeInTheDocument();
	});

	it('shows "Different" when thumbs differ', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', agree: false } } });
		expect(screen.getByText('Different')).toBeInTheDocument();
	});

	it('renders a dash for a side with no thumb set', () => {
		render(CompareOverallRow, { props: { overall: { left: null, right: 'THUMBS_UP', agree: false } } });
		expect(screen.getByTestId('overall-left')).toHaveTextContent('—');
	});

	it('gives thumb icons an accessible name', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', agree: false } } });
		expect(screen.getByRole('img', { name: 'Thumbs up' })).toBeInTheDocument();
		expect(screen.getByRole('img', { name: 'Thumbs down' })).toBeInTheDocument();
	});

	it('uses the theme-aware rating color tokens for thumb fill/stroke', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', agree: false } } });
		const up = screen.getByRole('img', { name: 'Thumbs up' });
		const down = screen.getByRole('img', { name: 'Thumbs down' });
		expect(up).toHaveAttribute('fill', 'var(--color-rating-positive)');
		expect(down).toHaveAttribute('fill', 'var(--color-rating-negative)');
	});

	it('shows the headline agreement percent when provided', () => {
		render(CompareOverallRow, {
			props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', agree: true }, agreementPercent: 82 },
		});
		expect(screen.getByTestId('agreement-percent')).toHaveTextContent('82% aligned');
	});

	it('omits the agreement percent when null (no shared rating dimensions)', () => {
		render(CompareOverallRow, {
			props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', agree: true }, agreementPercent: null },
		});
		expect(screen.queryByTestId('agreement-percent')).not.toBeInTheDocument();
	});

	it('omits the agreement percent by default when the prop is not passed', () => {
		render(CompareOverallRow, { props: { overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', agree: true } } });
		expect(screen.queryByTestId('agreement-percent')).not.toBeInTheDocument();
	});
});

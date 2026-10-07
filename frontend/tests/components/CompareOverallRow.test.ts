import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CompareOverallRow from '$lib/components/CompareOverallRow.svelte';

const baseProps = { leftName: 'You', rightName: 'Jamie' };

describe('CompareOverallRow', () => {
	it('shows "Agree overall" in the positive color when both thumbs are up', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', status: 'agree' } },
		});
		const label = screen.getByText('Agree overall');
		expect(label).toBeInTheDocument();
		expect(label).toHaveStyle({ color: 'var(--color-rating-positive)' });
	});

	it('shows "Different" in the negative color (not the "diverges" amber) when thumbs are opposite', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', status: 'differ' } },
		});
		const label = screen.getByText('Different');
		expect(label).toBeInTheDocument();
		expect(label).toHaveStyle({ color: 'var(--color-rating-negative)' });
	});

	it('names the side that gave a verdict, with neutral styling, when the other side is null', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: null, status: 'oneSided' } },
		});
		const label = screen.getByText('Only You gave a verdict');
		expect(label).toBeInTheDocument();
		expect(label).toHaveStyle({ color: 'var(--color-muted-foreground)' });
	});

	it('names the other side when the left side is the one that is null', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: null, right: 'THUMBS_DOWN', status: 'oneSided' } },
		});
		expect(screen.getByText('Only Jamie gave a verdict')).toBeInTheDocument();
	});

	it('shows a neutral no-verdict message when both sides are null', () => {
		render(CompareOverallRow, { props: { ...baseProps, overall: { left: null, right: null, status: 'none' } } });
		const label = screen.getByText('No verdict yet');
		expect(label).toBeInTheDocument();
		expect(label).toHaveStyle({ color: 'var(--color-muted-foreground)' });
	});

	it('renders a dash for a side with no thumb set', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: null, right: 'THUMBS_UP', status: 'oneSided' } },
		});
		expect(screen.getByTestId('overall-left')).toHaveTextContent('—');
	});

	it('gives thumb icons an accessible name', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', status: 'differ' } },
		});
		expect(screen.getByRole('img', { name: 'Thumbs up' })).toBeInTheDocument();
		expect(screen.getByRole('img', { name: 'Thumbs down' })).toBeInTheDocument();
	});

	it('uses the theme-aware rating color tokens for thumb fill/stroke', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: 'THUMBS_DOWN', status: 'differ' } },
		});
		const up = screen.getByRole('img', { name: 'Thumbs up' });
		const down = screen.getByRole('img', { name: 'Thumbs down' });
		expect(up).toHaveAttribute('fill', 'var(--color-rating-positive)');
		expect(down).toHaveAttribute('fill', 'var(--color-rating-negative)');
	});

	it('shows the headline agreement percent when provided', () => {
		render(CompareOverallRow, {
			props: {
				...baseProps,
				overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', status: 'agree' },
				agreementPercent: 82,
			},
		});
		expect(screen.getByTestId('agreement-percent')).toHaveTextContent('82% aligned');
	});

	it('omits the agreement percent when null (no shared rating dimensions)', () => {
		render(CompareOverallRow, {
			props: {
				...baseProps,
				overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', status: 'agree' },
				agreementPercent: null,
			},
		});
		expect(screen.queryByTestId('agreement-percent')).not.toBeInTheDocument();
	});

	it('omits the agreement percent by default when the prop is not passed', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', status: 'agree' } },
		});
		expect(screen.queryByTestId('agreement-percent')).not.toBeInTheDocument();
	});

	it('lays out left thumb, verdict, and right thumb under the same grid columns as the Take row below', () => {
		render(CompareOverallRow, {
			props: { ...baseProps, overall: { left: 'THUMBS_UP', right: 'THUMBS_UP', status: 'agree' } },
		});
		const leftThumb = screen.getByTestId('overall-left');
		const rightThumb = screen.getByTestId('overall-right');
		const grid = leftThumb.closest('.grid');
		expect(grid).not.toBeNull();
		expect(grid).toContainElement(rightThumb);
		expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' });
	});
});

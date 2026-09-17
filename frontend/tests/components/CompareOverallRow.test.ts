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
});

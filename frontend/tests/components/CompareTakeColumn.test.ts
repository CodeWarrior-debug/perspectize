import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CompareTakeColumn from '$lib/components/CompareTakeColumn.svelte';

describe('CompareTakeColumn', () => {
	it('renders the name and review text', () => {
		render(CompareTakeColumn, {
			props: { name: 'Jamie Lee', avatarColor: '#8b5cf6', review: 'Solid overview.', uniqueFeelings: [] },
		});
		expect(screen.getByText('Jamie Lee')).toBeInTheDocument();
		expect(screen.getByText(/Solid overview/)).toBeInTheDocument();
	});

	it('shows a placeholder when there is no review text', () => {
		render(CompareTakeColumn, {
			props: { name: 'Jamie Lee', avatarColor: '#8b5cf6', review: null, uniqueFeelings: [] },
		});
		expect(screen.getByText('No written review.')).toBeInTheDocument();
	});

	it('does not render the unique feelings section when empty', () => {
		render(CompareTakeColumn, {
			props: { name: 'Jamie Lee', avatarColor: '#8b5cf6', review: 'x', uniqueFeelings: [] },
		});
		expect(screen.queryByText('Unique feelings')).not.toBeInTheDocument();
	});

	it('renders unique feelings when present', () => {
		render(CompareTakeColumn, {
			props: {
				name: 'Jamie Lee',
				avatarColor: '#8b5cf6',
				review: 'x',
				uniqueFeelings: [{ emoji: '🤔', label: 'curious' }],
			},
		});
		expect(screen.getByText('Unique feelings')).toBeInTheDocument();
		expect(screen.getByText(/curious/)).toBeInTheDocument();
	});
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EmptyAware from '$lib/components/EmptyAware.svelte';

describe('EmptyAware', () => {
	it('marks the empty dash', () => {
		render(EmptyAware, { text: '—' });
		expect(screen.getByText('—')).toHaveClass('empty-marker');
	});
	it('leaves real values unmarked', () => {
		render(EmptyAware, { text: 'Done' });
		expect(screen.getByText('Done')).not.toHaveClass('empty-marker');
	});
});

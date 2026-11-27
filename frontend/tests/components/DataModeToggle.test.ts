import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DataModeToggle from '#lib/components/DataModeToggle.svelte';

describe('DataModeToggle', () => {
	it('labels the two modes with the loaded count', () => {
		render(DataModeToggle, { props: { mode: 'all', loadedCount: 50, onToggle: vi.fn() } });
		expect(screen.getByRole('button', { name: 'All Items' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Loaded 50 Items' })).toBeInTheDocument();
	});

	it('reports the mode that was clicked', async () => {
		const onToggle = vi.fn();
		render(DataModeToggle, { props: { mode: 'all', loadedCount: 50, onToggle } });
		await fireEvent.click(screen.getByRole('button', { name: 'Loaded 50 Items' }));
		expect(onToggle).toHaveBeenCalledWith('loaded');
		await fireEvent.click(screen.getByRole('button', { name: 'All Items' }));
		expect(onToggle).toHaveBeenCalledWith('all');
	});

	// At 320px the footer is too tight for both labels on one line; each label must stay whole
	// ("All Items", never "All" over "Items") so the footer can wrap the buttons instead.
	it('keeps each label on one line', () => {
		render(DataModeToggle, { props: { mode: 'all', loadedCount: 50, onToggle: vi.fn() } });
		for (const button of screen.getAllByRole('button')) {
			expect(button.className).toContain('whitespace-nowrap');
		}
	});
});

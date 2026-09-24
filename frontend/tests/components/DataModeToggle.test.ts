import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DataModeToggle from '$lib/components/DataModeToggle.svelte';
import { SEGMENT_SELECTED } from '$lib/utils/segmented';

function renderToggle(mode: 'all' | 'loaded', onToggle = vi.fn()) {
	render(DataModeToggle, { props: { mode, loadedCount: 93, onToggle } });
	return {
		all: screen.getByRole('button', { name: 'All Items' }),
		loaded: screen.getByRole('button', { name: /Loaded 93 Items/ }),
		onToggle,
	};
}

describe('DataModeToggle', () => {
	it('marks "All Items" as the selected segment when mode is all', () => {
		const { all, loaded } = renderToggle('all');
		expect(all).toHaveAttribute('aria-pressed', 'true');
		expect(all.className).toContain(SEGMENT_SELECTED);
		expect(loaded).toHaveAttribute('aria-pressed', 'false');
		expect(loaded.className).not.toContain(SEGMENT_SELECTED);
	});

	it('marks "Loaded N Items" as the selected segment when mode is loaded', () => {
		const { all, loaded } = renderToggle('loaded');
		expect(loaded).toHaveAttribute('aria-pressed', 'true');
		expect(loaded.className).toContain(SEGMENT_SELECTED);
		expect(all).toHaveAttribute('aria-pressed', 'false');
	});

	it('never uses solid primary for the selected segment', () => {
		const { all } = renderToggle('all');
		expect(all.className).not.toContain('bg-primary');
	});

	it('reports the clicked mode', async () => {
		const { loaded, onToggle } = renderToggle('all');
		await fireEvent.click(loaded);
		expect(onToggle).toHaveBeenCalledWith('loaded');
	});
});

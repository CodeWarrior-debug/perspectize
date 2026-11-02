import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnRelevanceCallout from '$lib/components/ColumnRelevanceCallout.svelte';

describe('ColumnRelevanceCallout', () => {
	it('renders the short copy', () => {
		render(ColumnRelevanceCallout, { props: { onPickType: vi.fn(), onChooseColumns: vi.fn() } });
		expect(screen.getByTestId('column-relevance-callout').textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Select one type or custom columns for the most relevant info.',
		);
	});

	it('wires each link to its own handler', async () => {
		const onPickType = vi.fn();
		const onChooseColumns = vi.fn();
		render(ColumnRelevanceCallout, { props: { onPickType, onChooseColumns } });

		await fireEvent.click(screen.getByRole('button', { name: 'one type' }));
		expect(onPickType).toHaveBeenCalledOnce();
		expect(onChooseColumns).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'custom columns' }));
		expect(onChooseColumns).toHaveBeenCalledOnce();
	});

	it('disables both links until the grid is ready', () => {
		render(ColumnRelevanceCallout, { props: { onPickType: vi.fn(), onChooseColumns: vi.fn(), disabled: true } });
		expect(screen.getByRole('button', { name: 'one type' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'custom columns' })).toBeDisabled();
	});

	it('moves itself into the page slot above the table when one exists', () => {
		const slot = document.createElement('div');
		slot.id = 'activity-callout-slot';
		document.body.appendChild(slot);
		try {
			render(ColumnRelevanceCallout, { props: { onPickType: vi.fn(), onChooseColumns: vi.fn() } });
			expect(slot.contains(screen.getByTestId('column-relevance-callout'))).toBe(true);
		} finally {
			slot.remove();
		}
	});
});

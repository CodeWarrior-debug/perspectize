import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColumnRelevanceCallout from '$lib/components/ColumnRelevanceCallout.svelte';

describe('ColumnRelevanceCallout', () => {
	it('renders the short copy', () => {
		render(ColumnRelevanceCallout, { props: { onPickType: vi.fn(), onChooseColumns: vi.fn() } });
		expect(screen.getByTestId('column-relevance-callout').textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Pick one type or choose custom columns for the most relevant info.',
		);
	});

	it('wires each link to its own handler', async () => {
		const onPickType = vi.fn();
		const onChooseColumns = vi.fn();
		render(ColumnRelevanceCallout, { props: { onPickType, onChooseColumns } });

		await fireEvent.click(screen.getByRole('button', { name: 'Pick one type' }));
		expect(onPickType).toHaveBeenCalledOnce();
		expect(onChooseColumns).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'choose custom columns' }));
		expect(onChooseColumns).toHaveBeenCalledOnce();
	});

	it('disables both links until the grid is ready', () => {
		render(ColumnRelevanceCallout, { props: { onPickType: vi.fn(), onChooseColumns: vi.fn(), disabled: true } });
		expect(screen.getByRole('button', { name: 'Pick one type' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'choose custom columns' })).toBeDisabled();
	});
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ComparePickerRow from '$lib/components/ComparePickerRow.svelte';

const options = [
	{ id: '1', name: 'You' },
	{ id: '2', name: 'Jamie Lee' },
	{ id: '3', name: 'Alex Kim' },
];

describe('ComparePickerRow', () => {
	it('renders both selects with the current selections', () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		expect(screen.getByTestId('picker-left')).toHaveValue('1');
		expect(screen.getByTestId('picker-right')).toHaveValue('2');
	});

	it("excludes the right side's selection from the left picker's options", () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		const leftSelect = screen.getByTestId('picker-left') as HTMLSelectElement;
		const leftOptionValues = Array.from(leftSelect.options).map((o) => o.value);
		expect(leftOptionValues).not.toContain('2');
		expect(leftOptionValues).toEqual(expect.arrayContaining(['1', '3']));
	});

	it("excludes the left side's selection from the right picker's options", () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		const rightSelect = screen.getByTestId('picker-right') as HTMLSelectElement;
		const rightOptionValues = Array.from(rightSelect.options).map((o) => o.value);
		expect(rightOptionValues).not.toContain('1');
	});

	it('calls onLeftChange when the left select changes', async () => {
		const onLeftChange = vi.fn();
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange, onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		await fireEvent.change(screen.getByTestId('picker-left'), { target: { value: '3' } });
		expect(onLeftChange).toHaveBeenCalledWith('3');
	});

	it('calls onSwap when the swap button is clicked', async () => {
		const onSwap = vi.fn();
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap },
		});
		await fireEvent.click(screen.getByRole('button', { name: /swap sides/i }));
		expect(onSwap).toHaveBeenCalled();
	});
});

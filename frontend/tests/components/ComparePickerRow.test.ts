import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ComparePickerRow from '$lib/components/ComparePickerRow.svelte';

function avatarColor(select: HTMLElement): string | undefined {
	const avatar = select.parentElement?.querySelector('span[style*="background-color"]') as HTMLElement | null;
	return avatar?.style.backgroundColor;
}

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

	it("colors the avatar by viewer identity, not by side, and follows the viewer across a swap", () => {
		// Viewer (id '1') on the left: left avatar is primary, right is purple.
		const { rerender } = render(ComparePickerRow, {
			props: {
				options,
				leftId: '1',
				rightId: '2',
				viewerId: '1',
				onLeftChange: vi.fn(),
				onRightChange: vi.fn(),
				onSwap: vi.fn(),
			},
		});
		expect(avatarColor(screen.getByTestId('picker-left'))).toBe('var(--color-primary)');
		expect(avatarColor(screen.getByTestId('picker-right'))).toBe('var(--color-logo-purple)');

		// After a swap, the viewer moves to the right side — their avatar must
		// stay primary-colored, following identity rather than position.
		rerender({
			options,
			leftId: '2',
			rightId: '1',
			viewerId: '1',
			onLeftChange: vi.fn(),
			onRightChange: vi.fn(),
			onSwap: vi.fn(),
		});
		expect(avatarColor(screen.getByTestId('picker-left'))).toBe('var(--color-logo-purple)');
		expect(avatarColor(screen.getByTestId('picker-right'))).toBe('var(--color-primary)');
	});

	it('has accessible names on both selects', () => {
		render(ComparePickerRow, {
			props: { options, leftId: '1', rightId: '2', onLeftChange: vi.fn(), onRightChange: vi.fn(), onSwap: vi.fn() },
		});
		expect(screen.getByRole('combobox', { name: 'Left perspective' })).toBeInTheDocument();
		expect(screen.getByRole('combobox', { name: 'Right perspective' })).toBeInTheDocument();
	});
});

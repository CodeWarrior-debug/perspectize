import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CellPopover from '$lib/components/CellPopover.svelte';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
	mocks.success.mockClear();
	mocks.error.mockClear();
	writeText = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

const anchor = () => document.body.appendChild(document.createElement('div'));
const base = { onEnter: vi.fn(), onLeave: vi.fn(), onClose: vi.fn() };

describe('CellPopover', () => {
	it('renders nothing when state is null (closed)', () => {
		render(CellPopover, { ...base, state: null });
		expect(screen.queryByTestId('tip-text')).toBeNull();
	});

	it('single mode shows display text and copies the raw payload, not the display', async () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'single', text: '1,234', copy: '1234', items: [] },
		});
		expect(screen.getByTestId('tip-text').textContent).toBe('1,234');
		await fireEvent.click(screen.getByTestId('tip-copy'));
		expect(writeText).toHaveBeenCalledWith('1234');
		expect(mocks.success).toHaveBeenCalled();
	});

	it('hides the copy button when there is nothing to copy', () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'single', text: '--', copy: null, items: [] },
		});
		expect(screen.queryByTestId('tip-copy')).toBeNull();
	});

	it('multi mode: nothing selected by default, Copy selected disabled', () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b'] },
		});
		expect((screen.getByTestId('tip-copy-selected') as HTMLButtonElement).disabled).toBe(true);
	});

	it('multi mode: copies only selected labels', async () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b', 'c'] },
		});
		await fireEvent.click(screen.getByTestId('tip-item-a'));
		await fireEvent.click(screen.getByTestId('tip-item-c'));
		await fireEvent.click(screen.getByTestId('tip-copy-selected'));
		expect(writeText).toHaveBeenCalledWith('a, c');
	});

	it('multi mode: Copy all copies every label', async () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b'] },
		});
		await fireEvent.click(screen.getByTestId('tip-copy-all'));
		expect(writeText).toHaveBeenCalledWith('a, b');
	});

	it('Esc calls onClose', async () => {
		const onClose = vi.fn();
		render(CellPopover, {
			...base,
			onClose,
			state: { anchor: anchor(), mode: 'single', text: 'x', copy: 'x', items: [] },
		});
		await fireEvent.keyDown(document.body, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});

	it('toasts an error when the clipboard write fails', async () => {
		writeText.mockRejectedValueOnce(new Error('denied'));
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'single', text: 'x', copy: 'x', items: [] },
		});
		await fireEvent.click(screen.getByTestId('tip-copy'));
		await Promise.resolve();
		expect(mocks.error).toHaveBeenCalled();
	});
});

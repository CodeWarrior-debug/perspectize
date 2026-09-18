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
		await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled());
	});

	it('hover bridge: pointer enter/leave on the content call onEnter/onLeave', async () => {
		const onEnter = vi.fn();
		const onLeave = vi.fn();
		render(CellPopover, {
			...base,
			onEnter,
			onLeave,
			state: { anchor: anchor(), mode: 'single', text: 'x', copy: 'x', items: [] },
		});
		const content = screen.getByTestId('cell-popover');
		await fireEvent.pointerEnter(content);
		expect(onEnter).toHaveBeenCalled();
		await fireEvent.pointerLeave(content);
		expect(onLeave).toHaveBeenCalled();
	});

	it('selection resets on a new state object but persists on the same object', async () => {
		const multi = () => ({ anchor: anchor(), mode: 'multi' as const, text: '', copy: null, items: ['a', 'b'] });
		const first = multi();
		const { rerender } = render(CellPopover, { ...base, state: first });
		const copySel = () => screen.getByTestId('tip-copy-selected') as HTMLButtonElement;
		await fireEvent.click(screen.getByTestId('tip-item-a'));
		expect(copySel().disabled).toBe(false);
		await rerender({ ...base, state: first });
		expect(copySel().disabled).toBe(false);
		await rerender({ ...base, state: multi() });
		await vi.waitFor(() => expect(copySel().disabled).toBe(true));
	});

	it('clicking a chip twice deselects it', async () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b'] },
		});
		const chip = screen.getByTestId('tip-item-a');
		await fireEvent.click(chip);
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(chip);
		expect(chip.getAttribute('aria-pressed')).toBe('false');
		expect((screen.getByTestId('tip-copy-selected') as HTMLButtonElement).disabled).toBe(true);
	});

	it('duplicate tags render without throwing', () => {
		render(CellPopover, {
			...base,
			state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'a', 'b'] },
		});
		expect(screen.getAllByTestId('tip-item-a').length).toBe(2);
		expect(screen.getByTestId('tip-item-b')).toBeTruthy();
	});
});

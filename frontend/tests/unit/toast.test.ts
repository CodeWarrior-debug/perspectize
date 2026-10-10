import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastFn } = vi.hoisted(() => ({ toastFn: vi.fn((..._args: unknown[]) => 'toast-1') }));

vi.mock('svelte-sonner', () => ({ toast: toastFn }));

import { ACTION_TOAST_DURATION_MS, toastWithAction } from '$lib/utils/toast';

describe('toastWithAction', () => {
	beforeEach(() => {
		toastFn.mockClear();
	});

	it('uses a 4 second duration for action toasts', () => {
		expect(ACTION_TOAST_DURATION_MS).toBe(4000);
	});

	it('calls svelte-sonner with the message, the 4s duration and the action', () => {
		const onClick = vi.fn();
		const action = { label: 'Undo', onClick };

		toastWithAction('Saved', action);

		expect(toastFn).toHaveBeenCalledTimes(1);
		expect(toastFn).toHaveBeenCalledWith('Saved', { duration: 4000, action });
	});

	it('passes the action through unchanged, so its click handler is the caller’s', () => {
		const onClick = vi.fn();

		toastWithAction('Mark this todo done?', { label: 'Yes', onClick });

		const passed = toastFn.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
		expect(passed.action.label).toBe('Yes');
		passed.action.onClick();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('spreads extra options after the defaults, so a caller can add an id or override duration', () => {
		const action = { label: 'Retry', onClick: () => {} };

		toastWithAction('Failed', action, { id: 'todo-prompt', duration: 9000 });

		expect(toastFn).toHaveBeenCalledWith('Failed', { duration: 9000, action, id: 'todo-prompt' });
	});

	it('returns the id svelte-sonner gives the toast', () => {
		expect(toastWithAction('Saved', { label: 'Undo', onClick: () => {} })).toBe('toast-1');
	});
});

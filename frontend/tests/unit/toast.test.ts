import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastFn } = vi.hoisted(() => ({ toastFn: vi.fn((..._args: unknown[]) => 'toast-1') }));

vi.mock('svelte-sonner', () => ({ toast: toastFn }));

import { ACTION_TOAST_DURATION_MS, isInsideToast, toastWithAction } from '$lib/utils/toast';

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

	it('renders a secondary choice as the cancel button and keeps it out of the other options', () => {
		const action = { label: 'Done + 100%', onClick: () => {} };
		const secondary = { label: 'Done, keep %', onClick: () => {} };

		toastWithAction('Mark this todo done?', action, { secondary });

		expect(toastFn).toHaveBeenCalledWith('Mark this todo done?', { duration: 4000, action, cancel: secondary });
	});
});

describe('isInsideToast', () => {
	function toastWith(child: Element) {
		const toast = document.createElement('li');
		toast.setAttribute('data-sonner-toast', '');
		toast.append(child);
		document.body.append(toast);
		return child;
	}

	it('is true for the toast itself and anything inside it', () => {
		const button = toastWith(document.createElement('button'));
		expect(isInsideToast(button)).toBe(true);
		expect(isInsideToast(button.parentElement)).toBe(true);
	});

	it('is false for anything outside a toast, and for a non-element target', () => {
		const elsewhere = document.createElement('button');
		document.body.append(elsewhere);
		expect(isInsideToast(elsewhere)).toBe(false);
		expect(isInsideToast(null)).toBe(false);
		expect(isInsideToast(document)).toBe(false);
	});
});

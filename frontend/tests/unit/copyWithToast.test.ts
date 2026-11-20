import { describe, expect, it, vi } from 'vitest';
import { ClipboardBlockedError, copyWithToast, downloadWithToast } from '#lib/utils/toast.js';

function toaster() {
	return { success: vi.fn(), error: vi.fn() };
}

describe('copyWithToast', () => {
	it('announces the copied row count', async () => {
		const t = toaster();
		await copyWithToast(async () => 12, t as never);
		expect(t.success).toHaveBeenCalledWith('Copied 12 rows');
		expect(t.error).not.toHaveBeenCalled();
	});

	it('uses the singular for one row', async () => {
		const t = toaster();
		await copyWithToast(async () => 1, t as never);
		expect(t.success).toHaveBeenCalledWith('Copied 1 row');
	});

	it('reports a blocked clipboard as an error', async () => {
		const t = toaster();
		await copyWithToast(() => Promise.reject(new ClipboardBlockedError()), t as never);
		expect(t.error).toHaveBeenCalledWith('Could not copy. Your browser blocked clipboard access.');
		expect(t.success).not.toHaveBeenCalled();
	});

	it('reports a failure building the table as a generic export error', async () => {
		const t = toaster();
		await copyWithToast(() => Promise.reject(new Error('boom')), t as never);
		expect(t.error).toHaveBeenCalledWith('Could not export the Library.');
		expect(t.success).not.toHaveBeenCalled();
	});
});

describe('downloadWithToast', () => {
	it('runs the download without a toast when it succeeds', () => {
		const t = { error: vi.fn() };
		const download = vi.fn();
		downloadWithToast(download, t as never);
		expect(download).toHaveBeenCalledOnce();
		expect(t.error).not.toHaveBeenCalled();
	});

	it('toasts a generic error when the download throws', () => {
		const t = { error: vi.fn() };
		downloadWithToast(() => {
			throw new Error('boom');
		}, t as never);
		expect(t.error).toHaveBeenCalledWith('Could not export the Library.');
	});
});

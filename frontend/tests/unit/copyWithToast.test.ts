import { describe, expect, it, vi } from 'vitest';
import { copyWithToast } from '$lib/utils/toast';

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
		await copyWithToast(() => Promise.reject(new Error('denied')), t as never);
		expect(t.error).toHaveBeenCalledWith('Could not copy. Your browser blocked clipboard access.');
		expect(t.success).not.toHaveBeenCalled();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi, GridPreDestroyedEvent, GridReadyEvent } from '@ag-grid-community/core';
import { createGridHandle } from '#lib/utils/gridHandle.svelte.js';

type Row = { id: string };

function fakeApi(destroyed = false) {
	const api = { isDestroyed: vi.fn(() => destroyed), destroy: () => (destroyed = true) };
	return api as unknown as GridApi<Row> & { destroy: () => void };
}

function ready(
	handle: ReturnType<typeof createGridHandle<Row>>,
	api: GridApi<Row>,
	hooks?: Parameters<typeof handle.options>[0],
) {
	handle.options(hooks).onGridReady?.({ api } as GridReadyEvent<Row>);
}

function preDestroy(handle: ReturnType<typeof createGridHandle<Row>>, hooks?: Parameters<typeof handle.options>[0]) {
	handle.options(hooks).onGridPreDestroyed?.({} as GridPreDestroyedEvent<Row>);
}

describe('createGridHandle', () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }));
	afterEach(() => vi.useRealTimers());

	it('starts with no API and not ready', () => {
		const handle = createGridHandle<Row>();
		expect(handle.api).toBeNull();
		expect(handle.ready).toBe(false);
		expect(handle.live()).toBeNull();
	});

	it('holds the API once the grid is ready, and calls onReady after recording it', () => {
		const handle = createGridHandle<Row>();
		const api = fakeApi();
		const onReady = vi.fn(() => expect(handle.ready).toBe(true));
		ready(handle, api, { onReady });
		expect(handle.api).toBe(api);
		expect(handle.ready).toBe(true);
		expect(handle.live()).toBe(api);
		expect(onReady).toHaveBeenCalledWith(api);
	});

	it('drops the API before teardown, and calls onDetach after', () => {
		const handle = createGridHandle<Row>();
		ready(handle, fakeApi());
		const onDetach = vi.fn(() => expect(handle.api).toBeNull());
		preDestroy(handle, { onDetach });
		expect(handle.api).toBeNull();
		expect(handle.ready).toBe(false);
		expect(onDetach).toHaveBeenCalledOnce();
	});

	it('detach() forgets the API without a grid event (card mode hides the grid)', () => {
		const handle = createGridHandle<Row>();
		ready(handle, fakeApi());
		handle.detach();
		expect(handle.api).toBeNull();
		expect(handle.ready).toBe(false);
	});

	it('live() is null for a destroyed grid even while the API is still held', () => {
		const handle = createGridHandle<Row>();
		const api = fakeApi();
		ready(handle, api);
		api.destroy();
		expect(handle.api).toBe(api);
		expect(handle.live()).toBeNull();
	});

	describe('afterFrame', () => {
		it('runs on the next frame, not straight away', () => {
			const handle = createGridHandle<Row>();
			const api = fakeApi();
			ready(handle, api);
			const fn = vi.fn();
			handle.afterFrame(fn);
			expect(fn).not.toHaveBeenCalled();
			vi.advanceTimersToNextFrame();
			expect(fn).toHaveBeenCalledWith(api);
		});

		it('skips the work if the grid was destroyed before the frame', () => {
			const handle = createGridHandle<Row>();
			const api = fakeApi();
			ready(handle, api);
			const fn = vi.fn();
			handle.afterFrame(fn);
			api.destroy();
			vi.advanceTimersToNextFrame();
			expect(fn).not.toHaveBeenCalled();
		});

		it('returns a cancel function that stops the pending work', () => {
			const handle = createGridHandle<Row>();
			ready(handle, fakeApi());
			const fn = vi.fn();
			const cancel = handle.afterFrame(fn);
			cancel();
			vi.advanceTimersToNextFrame();
			expect(fn).not.toHaveBeenCalled();
		});

		it('does nothing without an API', () => {
			const handle = createGridHandle<Row>();
			const fn = vi.fn();
			const cancel = handle.afterFrame(fn);
			vi.advanceTimersToNextFrame();
			expect(fn).not.toHaveBeenCalled();
			expect(cancel).not.toThrow();
		});

		it('uses the API held when it was scheduled, not one from a later remount', () => {
			const handle = createGridHandle<Row>();
			const first = fakeApi();
			ready(handle, first);
			const fn = vi.fn();
			handle.afterFrame(fn);
			ready(handle, fakeApi());
			vi.advanceTimersToNextFrame();
			expect(fn).toHaveBeenCalledWith(first);
		});
	});
});

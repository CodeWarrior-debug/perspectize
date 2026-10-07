import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { IDLE_TIMEOUT_MS } from '$lib/utils/idleDetector';
import { streamIdle, watchStreamIdle } from '$lib/messaging/streamIdle.svelte';
import { queryKeys } from '$lib/queries/keys';

const MIN = 60 * 1000;

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('streamIdle (idle pause of realtime streams)', () => {
	let client: QueryClient;
	let stop: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		// no observers: keep seeded entries from being GC'd while fake time advances
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
		stop = watchStreamIdle(client);
	});

	afterEach(() => {
		stop();
		setVisibility('visible');
		vi.useRealTimers();
	});

	it('uses a 5 minute idle timeout', () => {
		expect(IDLE_TIMEOUT_MS).toBe(5 * MIN);
	});

	it('active: streams run right after start', () => {
		expect(streamIdle.paused).toBe(false);
	});

	it('timer reset by activity: no pause before 5 min of inactivity', () => {
		vi.advanceTimersByTime(4 * MIN);
		window.dispatchEvent(new Event('mousemove'));
		vi.advanceTimersByTime(4 * MIN);
		expect(streamIdle.paused).toBe(false);
		vi.advanceTimersByTime(1 * MIN + 1);
		expect(streamIdle.paused).toBe(true);
	});

	it('paused on idle: pauses after 5 min with no activity', () => {
		vi.advanceTimersByTime(5 * MIN - 1);
		expect(streamIdle.paused).toBe(false);
		vi.advanceTimersByTime(1);
		expect(streamIdle.paused).toBe(true);
	});

	it.each(['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'])('resumed on input: %s', (type) => {
		vi.advanceTimersByTime(5 * MIN);
		expect(streamIdle.paused).toBe(true);
		window.dispatchEvent(new Event(type));
		expect(streamIdle.paused).toBe(false);
	});

	it('resumed on refocus: tab becoming visible', () => {
		setVisibility('hidden');
		vi.advanceTimersByTime(5 * MIN);
		expect(streamIdle.paused).toBe(true);
		setVisibility('visible');
		expect(streamIdle.paused).toBe(false);
	});

	it('resumed on refocus: window focus', () => {
		vi.advanceTimersByTime(5 * MIN);
		window.dispatchEvent(new Event('focus'));
		expect(streamIdle.paused).toBe(false);
	});

	it('hidden tab alone does not count as activity', () => {
		vi.advanceTimersByTime(2 * MIN);
		setVisibility('hidden');
		vi.advanceTimersByTime(3 * MIN);
		expect(streamIdle.paused).toBe(true);
	});

	it('query invalidation on resume: refreshes only messaging thread queries', () => {
		const inbox = queryKeys.messaging.threads.list();
		const other = ['unrelated'];
		client.setQueryData(inbox, { messageThreads: [] });
		client.setQueryData(other, 1);
		const spy = vi.spyOn(client, 'invalidateQueries');

		vi.advanceTimersByTime(5 * MIN);
		expect(spy).not.toHaveBeenCalled();
		window.dispatchEvent(new Event('keydown'));

		expect(spy).toHaveBeenCalledTimes(1);
		expect(client.getQueryState(inbox)?.isInvalidated).toBe(true);
		expect(client.getQueryState(other)?.isInvalidated).toBe(false);
	});

	it('activity while active does not invalidate', () => {
		const spy = vi.spyOn(client, 'invalidateQueries');
		window.dispatchEvent(new Event('keydown'));
		expect(spy).not.toHaveBeenCalled();
	});

	it('stopping removes listeners and clears the pause flag', () => {
		vi.advanceTimersByTime(5 * MIN);
		expect(streamIdle.paused).toBe(true);
		stop();
		expect(streamIdle.paused).toBe(false);
		vi.advanceTimersByTime(10 * MIN);
		expect(streamIdle.paused).toBe(false);
	});
});

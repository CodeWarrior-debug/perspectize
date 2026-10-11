import { describe, expect, it, vi } from 'vitest';
import { createPlayerCoordinator, type ChannelLike } from '$lib/utils/playerCoordinator';

/** Two in-memory "tabs" joined like a BroadcastChannel (no echo to the sender). */
function channelPair(): [ChannelLike, ChannelLike] {
	const a = new EventTarget() as EventTarget & ChannelLike;
	const b = new EventTarget() as EventTarget & ChannelLike;
	a.postMessage = (data: unknown) => void b.dispatchEvent(new MessageEvent('message', { data }));
	b.postMessage = (data: unknown) => void a.dispatchEvent(new MessageEvent('message', { data }));
	return [a, b];
}

describe('player coordinator', () => {
	it('starting one player pauses the others in the tab, never itself', () => {
		const c = createPlayerCoordinator({ channel: null });
		const pauseA = vi.fn();
		const pauseB = vi.fn();
		c.register('a', pauseA);
		c.register('b', pauseB);
		c.playing('b');
		expect(pauseA).toHaveBeenCalledOnce();
		expect(pauseB).not.toHaveBeenCalled();
	});

	it('a player starting in another tab pauses every player here', () => {
		const [chA, chB] = channelPair();
		const tabA = createPlayerCoordinator({ channel: chA, tabId: 'A' });
		const tabB = createPlayerCoordinator({ channel: chB, tabId: 'B' });
		const pauseInA = vi.fn();
		const pauseInB = vi.fn();
		tabA.register('a1', pauseInA);
		tabB.register('b1', pauseInB);
		tabB.playing('b1');
		expect(pauseInA).toHaveBeenCalledOnce();
		expect(pauseInB).not.toHaveBeenCalled();
	});

	it('override on: nothing is paused and nothing is broadcast', () => {
		const [chA, chB] = channelPair();
		const post = vi.spyOn(chB, 'postMessage');
		const tabA = createPlayerCoordinator({ channel: chA, tabId: 'A' });
		const tabB = createPlayerCoordinator({ channel: chB, tabId: 'B', allowOverlap: () => true });
		const pauseInA = vi.fn();
		const pauseInB2 = vi.fn();
		tabA.register('a1', pauseInA);
		tabB.register('b1', vi.fn());
		tabB.register('b2', pauseInB2);
		tabB.playing('b1');
		expect(post).not.toHaveBeenCalled();
		expect(pauseInA).not.toHaveBeenCalled();
		expect(pauseInB2).not.toHaveBeenCalled();
	});

	it('an unregistered player is never paused', () => {
		const c = createPlayerCoordinator({ channel: null });
		const pause = vi.fn();
		const unregister = c.register('a', pause);
		unregister();
		c.register('b', vi.fn());
		c.playing('b');
		expect(pause).not.toHaveBeenCalled();
	});
});

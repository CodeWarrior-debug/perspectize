import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock('@tanstack/svelte-query', () => ({ useQueryClient: vi.fn(() => ({})) }));
vi.mock('$lib/messaging/useInboxStream.svelte', () => ({
	createInboxStream: () => ({ start: mocks.start, stop: mocks.stop }),
}));

import { tick } from 'svelte';
import { streamIdle } from '$lib/messaging/streamIdle.svelte';
import InboxStreamMount from '$lib/components/messaging/InboxStreamMount.svelte';

describe('InboxStreamMount', () => {
	beforeEach(() => vi.clearAllMocks());

	it('starts the inbox stream on mount and stops on unmount', () => {
		const { unmount } = render(InboxStreamMount);
		expect(mocks.start).toHaveBeenCalledTimes(1);
		unmount();
		expect(mocks.stop).toHaveBeenCalledTimes(1);
	});

	it('stops the stream when idle and restarts on activity', async () => {
		const { unmount } = render(InboxStreamMount);
		expect(mocks.start).toHaveBeenCalledTimes(1);
		streamIdle.paused = true;
		await tick();
		expect(mocks.stop).toHaveBeenCalledTimes(1);
		streamIdle.paused = false;
		await tick();
		expect(mocks.start).toHaveBeenCalledTimes(2);
		unmount();
	});
});

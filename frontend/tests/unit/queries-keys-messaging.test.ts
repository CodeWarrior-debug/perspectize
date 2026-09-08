import { describe, it, expect } from 'vitest';
import { queryKeys } from '$lib/queries/keys';

describe('queryKeys.messaging', () => {
	it('all() is the messaging prefix', () => {
		expect(queryKeys.messaging.all()).toEqual(['app', 'messaging']);
	});

	it('threads.lists() and threads.list() are the inbox list key', () => {
		expect(queryKeys.messaging.threads.lists()).toEqual(['app', 'messaging', 'threads', 'list']);
		expect(queryKeys.messaging.threads.list()).toEqual(['app', 'messaging', 'threads', 'list']);
	});

	it('threads.detail(id) nests under the threads prefix', () => {
		expect(queryKeys.messaging.threads.detail('42')).toEqual([
			'app', 'messaging', 'threads', 'detail', '42',
		]);
	});

	it('messages.list(threadId) carries the threadId in an object', () => {
		expect(queryKeys.messaging.messages.lists()).toEqual(['app', 'messaging', 'messages', 'list']);
		expect(queryKeys.messaging.messages.list('42')).toEqual([
			'app', 'messaging', 'messages', 'list', { threadId: '42' },
		]);
	});
});

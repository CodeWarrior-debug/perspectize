import { describe, it, expect } from 'vitest';
import type { Message } from '$lib/queries/messaging';
import { seedFromApiPage } from '$lib/messaging/threadCache';
import {
	makeClientNonce,
	optimisticMessage,
	addOptimistic,
	reconcileSentMessage,
	isOptimistic,
} from '$lib/messaging/optimistic';

const real = (seq: number, over: Partial<Message> = {}): Message => ({
	id: `m${seq}`,
	threadId: 't1',
	sender: { id: 'u1', username: 'me' },
	seq,
	body: `b${seq}`,
	createdAt: '2026-09-07T12:00:00Z',
	editedAt: null,
	deletedAt: null,
	...over,
});

const pageInfo = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null };

describe('optimistic send', () => {
	it('makeClientNonce returns distinct non-empty strings', () => {
		const a = makeClientNonce();
		const b = makeClientNonce();
		expect(a).not.toBe(b);
		expect(a.length).toBeGreaterThan(8);
	});

	it('optimisticMessage sorts after the last real message and is flagged optimistic', () => {
		const m = optimisticMessage({
			body: '  hello  ',
			sender: { id: 'u1', username: 'me' },
			threadId: 't1',
			clientNonce: 'nonce-1',
			afterSeq: 7,
		});
		expect(m.body).toBe('hello');
		expect(m.seq).toBeGreaterThan(7);
		expect(m.seq).toBeLessThan(8);
		expect(isOptimistic(m)).toBe(true);
	});

	it('addOptimistic appends to the end of the ascending list', () => {
		let c = seedFromApiPage([real(7), real(6)], pageInfo);
		const opt = optimisticMessage({
			body: 'x',
			sender: { id: 'u1', username: 'me' },
			threadId: 't1',
			clientNonce: 'n1',
			afterSeq: 7,
		});
		c = addOptimistic(c, opt);
		expect(c.items[c.items.length - 1].id).toBe('optimistic:n1');
	});

	it('reconcileSentMessage swaps the optimistic row for the server row', () => {
		let c = seedFromApiPage([real(7)], pageInfo);
		const opt = optimisticMessage({
			body: 'x',
			sender: { id: 'u1', username: 'me' },
			threadId: 't1',
			clientNonce: 'n1',
			afterSeq: 7,
		});
		c = addOptimistic(c, opt);
		c = reconcileSentMessage(c, 'n1', real(8, { body: 'x' }));
		expect(c.items.map((m) => m.id)).toEqual(['m7', 'm8']);
		expect(c.items.some(isOptimistic)).toBe(false);
	});

	it('reconcileSentMessage is a no-op-safe when the optimistic row is already gone', () => {
		let c = seedFromApiPage([real(7), real(8, { body: 'x' })], pageInfo);
		c = reconcileSentMessage(c, 'n1', real(8, { body: 'x' }));
		expect(c.items.map((m) => m.seq)).toEqual([7, 8]);
	});
});

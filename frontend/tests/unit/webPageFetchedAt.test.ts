import { describe, it, expect } from 'vitest';
import { webPageFetchedAt } from '#lib/utils/webPage.js';

describe('webPageFetchedAt', () => {
	it('reads the fetch time from the details response', () => {
		expect(
			webPageFetchedAt({ response: { fetch: { status: 'OK', httpStatus: 200, at: '2026-11-10T12:30:00Z' } } }),
		).toBe('2026-11-10T12:30:00Z');
	});

	it('is null when the row has no details response (a list-only row)', () => {
		expect(webPageFetchedAt({})).toBeNull();
		expect(webPageFetchedAt({ response: null })).toBeNull();
	});

	it('is null when the response has no fetch record', () => {
		expect(webPageFetchedAt({ response: { title: 'x' } })).toBeNull();
	});

	it('never returns the fetch status as the time', () => {
		expect(webPageFetchedAt({ response: { fetch: { status: 'BLOCKED', httpStatus: 403, at: '' } } })).toBeNull();
	});
});

/**
 * Cache contract for the Discover book search, trending feed and ISBN lookup (see
 * frontend/CLAUDE.md → "Query caching & call budget" and .docs/QUERY_BUDGET.md). Runs
 * against a real QueryClient with the same keys and staleTimes the Book panels use.
 *
 *  1. Key hygiene: the key changes when the query, the window, the page or the ISBN changes.
 *  2. De-duplication: N consumers of one search (or feed) cost one network call.
 *  3. Freshness: a remount inside staleTime costs no call; after it, one call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import {
	BOOK_SEARCH_STALE_TIME,
	BOOK_TRENDING_STALE_TIME,
	openLibraryKeys,
} from '$lib/services/openLibraryApi';
import { tmdbKeys } from '$lib/services/tmdbApi';
import { countingFetch, makeClient, mountConsumers } from '../helpers/queryBudget';

afterEach(() => {
	vi.useRealTimers();
});

describe('book search key hygiene', () => {
	it('is stable for the same query and page', () => {
		expect(hashKey(openLibraryKeys.search('steinbeck', 1))).toBe(hashKey(openLibraryKeys.search('steinbeck', 1)));
	});

	it('changes when the query changes', () => {
		expect(hashKey(openLibraryKeys.search('steinbeck', 1))).not.toBe(hashKey(openLibraryKeys.search('heller', 1)));
	});

	it('changes when the page changes', () => {
		expect(hashKey(openLibraryKeys.search('steinbeck', 1))).not.toBe(hashKey(openLibraryKeys.search('steinbeck', 2)));
	});

	it('does not collide with the movie search key for the same text', () => {
		expect(hashKey(openLibraryKeys.search('matrix', 1))).not.toBe(hashKey(tmdbKeys.search('matrix', 1)));
	});
});

describe('book search de-duplication and freshness', () => {
	const options = (query: string, queryFn: () => Promise<unknown>) => ({
		queryKey: openLibraryKeys.search(query, 1),
		queryFn,
		staleTime: BOOK_SEARCH_STALE_TIME,
	});

	it('three consumers of one search cost one network call', async () => {
		const fetcher = countingFetch({ items: [] });
		const stop = await mountConsumers(makeClient(), options('steinbeck', fetcher), 3);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('a remount inside the staleTime costs no call', async () => {
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('steinbeck', fetcher), 1))();
		(await mountConsumers(client, options('steinbeck', fetcher), 1))();

		expect(fetcher.fetches()).toBe(1);
	});

	it('a different query is its own entry and its own call', async () => {
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('steinbeck', fetcher), 1))();
		(await mountConsumers(client, options('heller', fetcher), 1))();

		expect(fetcher.fetches()).toBe(2);
	});

	it('a remount after the staleTime refetches once', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('steinbeck', fetcher), 1))();
		vi.setSystemTime(new Date(Date.now() + BOOK_SEARCH_STALE_TIME + 1000));
		(await mountConsumers(client, options('steinbeck', fetcher), 1))();

		expect(fetcher.fetches()).toBe(2);
	});
});

describe('book trending key hygiene', () => {
	it('is stable for the same window and page', () => {
		expect(hashKey(openLibraryKeys.trending('DAY', 1))).toBe(hashKey(openLibraryKeys.trending('DAY', 1)));
	});

	it('changes when the window changes', () => {
		expect(hashKey(openLibraryKeys.trending('DAY', 1))).not.toBe(hashKey(openLibraryKeys.trending('WEEK', 1)));
	});

	it('changes when the page changes', () => {
		expect(hashKey(openLibraryKeys.trending('WEEK', 1))).not.toBe(hashKey(openLibraryKeys.trending('WEEK', 2)));
	});

	it('does not collide with a book search key for the same text and page', () => {
		expect(hashKey(openLibraryKeys.trending('WEEK', 1))).not.toBe(hashKey(openLibraryKeys.search('WEEK', 1)));
	});
});

describe('book trending de-duplication and freshness', () => {
	const options = (window: 'DAY' | 'WEEK', queryFn: () => Promise<unknown>) => ({
		queryKey: openLibraryKeys.trending(window, 1),
		queryFn,
		staleTime: BOOK_TRENDING_STALE_TIME,
	});

	it('three consumers of one trending feed cost one network call', async () => {
		const fetcher = countingFetch({ items: [] });
		const stop = await mountConsumers(makeClient(), options('WEEK', fetcher), 3);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('a remount inside the staleTime costs no call', async () => {
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('WEEK', fetcher), 1))();
		(await mountConsumers(client, options('WEEK', fetcher), 1))();

		expect(fetcher.fetches()).toBe(1);
	});

	it('a different window is its own entry and its own call', async () => {
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('WEEK', fetcher), 1))();
		(await mountConsumers(client, options('DAY', fetcher), 1))();

		expect(fetcher.fetches()).toBe(2);
	});

	it('a remount after the staleTime refetches once', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('WEEK', fetcher), 1))();
		vi.setSystemTime(new Date(Date.now() + BOOK_TRENDING_STALE_TIME + 1000));
		(await mountConsumers(client, options('WEEK', fetcher), 1))();

		expect(fetcher.fetches()).toBe(2);
	});
});

describe('book ISBN lookup key hygiene', () => {
	it('is stable for the same ISBN', () => {
		expect(hashKey(openLibraryKeys.isbn('9780434740024'))).toBe(hashKey(openLibraryKeys.isbn('9780434740024')));
	});

	it('changes when the ISBN changes', () => {
		expect(hashKey(openLibraryKeys.isbn('9780434740024'))).not.toBe(hashKey(openLibraryKeys.isbn('0306406152')));
	});
});

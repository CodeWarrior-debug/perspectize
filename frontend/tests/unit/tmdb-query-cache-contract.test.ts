/**
 * Cache contract for the Discover movie search (see frontend/CLAUDE.md →
 * "Query caching & call budget" and .docs/QUERY_BUDGET.md). Runs against a real
 * QueryClient with the same key and staleTime the MovieSearchPanel uses.
 *
 *  1. Key hygiene: the key changes when the query or the page changes.
 *  2. De-duplication: N consumers of one search cost one network call.
 *  3. Freshness: a remount inside MOVIE_SEARCH_STALE_TIME costs no call; after it, one call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import { MOVIE_SEARCH_STALE_TIME, tmdbKeys } from '$lib/services/tmdbApi';
import { countingFetch, makeClient, mountConsumers } from '../helpers/queryBudget';

afterEach(() => {
	vi.useRealTimers();
});

describe('movie search key hygiene', () => {
	it('is stable for the same query and page', () => {
		expect(hashKey(tmdbKeys.search('matrix', 1))).toBe(hashKey(tmdbKeys.search('matrix', 1)));
	});

	it('changes when the query changes', () => {
		expect(hashKey(tmdbKeys.search('matrix', 1))).not.toBe(hashKey(tmdbKeys.search('heat', 1)));
	});

	it('changes when the page changes', () => {
		expect(hashKey(tmdbKeys.search('matrix', 1))).not.toBe(hashKey(tmdbKeys.search('matrix', 2)));
	});

	it('does not collide with the YouTube trending key', () => {
		expect(hashKey(tmdbKeys.search('trending', 1))).not.toBe(hashKey(['youtube', 'trending', 'US']));
	});
});

describe('movie search de-duplication and freshness', () => {
	const options = (query: string, queryFn: () => Promise<unknown>) => ({
		queryKey: tmdbKeys.search(query, 1),
		queryFn,
		staleTime: MOVIE_SEARCH_STALE_TIME,
	});

	it('three consumers of one search cost one network call', async () => {
		const fetcher = countingFetch({ items: [] });
		const stop = await mountConsumers(makeClient(), options('matrix', fetcher), 3);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('a remount inside the staleTime costs no call', async () => {
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('matrix', fetcher), 1))();
		(await mountConsumers(client, options('matrix', fetcher), 1))();

		expect(fetcher.fetches()).toBe(1);
	});

	it('a different query is its own entry and its own call', async () => {
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('matrix', fetcher), 1))();
		(await mountConsumers(client, options('heat', fetcher), 1))();

		expect(fetcher.fetches()).toBe(2);
	});

	it('a remount after the staleTime refetches once', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
		const client = makeClient();
		const fetcher = countingFetch({ items: [] });

		(await mountConsumers(client, options('matrix', fetcher), 1))();
		vi.setSystemTime(new Date(Date.now() + MOVIE_SEARCH_STALE_TIME + 1000));
		(await mountConsumers(client, options('matrix', fetcher), 1))();

		expect(fetcher.fetches()).toBe(2);
	});
});

/**
 * Cache contract for useWebsitePages (query-budget rules in frontend/CLAUDE.md). Driven through a REAL
 * QueryClient: one request per opened website however many consumers mount, a remount inside staleTime
 * is free, the key carries the website id, and a non-website never requests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, type QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '#lib/queries/keys.js';
import { countingFetch, makeClient, mountConsumers } from '../helpers/queryBudget';

let captured: any;
const request = vi.fn();

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createQuery: vi.fn((optionsFn: () => any) => {
			captured = optionsFn();
			return {};
		}),
	};
});
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: (...args: unknown[]) => request(...args) }));

import { useWebsitePages } from '#lib/queries/content/useWebsitePages.js';
import { LIST_WEBSITE_PAGES, WEBSITE_PAGES_LIMIT } from '#lib/queries/content/index.js';

let client: QueryClient;

beforeEach(() => {
	client = makeClient();
	captured = undefined;
	request.mockReset();
});

describe('useWebsitePages cache contract', () => {
	it('keys the query by website id, so another website is another cache entry', () => {
		useWebsitePages(() => '500');
		const key500 = captured.queryKey;
		useWebsitePages(() => '501');
		expect(hashKey(captured.queryKey)).not.toBe(hashKey(key500));
		expect(key500).toEqual(queryKeys.content.websitePages('500'));
	});

	it('sends the id it is keyed on, capped at the page limit', async () => {
		request.mockResolvedValue({ content: { items: [], totalCount: 0 } });
		useWebsitePages(() => '500');
		await captured.queryFn();
		expect(request).toHaveBeenCalledWith(LIST_WEBSITE_PAGES, {
			parentContentID: '500',
			first: WEBSITE_PAGES_LIMIT,
		});
	});

	it('three consumers of one website cost one network call', async () => {
		useWebsitePages(() => '500');
		const fetcher = countingFetch({ content: { items: [], totalCount: 0 } });
		const stop = await mountConsumers(
			client,
			{ queryKey: captured.queryKey, queryFn: fetcher, staleTime: captured.staleTime },
			3,
		);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('has a deliberate staleTime, so a remount inside it does not refetch', async () => {
		useWebsitePages(() => '500');
		expect(captured.staleTime).toBeGreaterThan(0);
		const fetcher = countingFetch({ content: { items: [], totalCount: 0 } });
		const options = { queryKey: captured.queryKey, queryFn: fetcher, staleTime: captured.staleTime };

		(await mountConsumers(client, options, 1))();
		(await mountConsumers(client, options, 1))();

		expect(fetcher.fetches()).toBe(1);
	});

	it('makes no request when the open item is not a website', () => {
		useWebsitePages(() => null);
		expect(captured.enabled).toBe(false);
		useWebsitePages(() => '500');
		expect(captured.enabled).toBe(true);
	});
});

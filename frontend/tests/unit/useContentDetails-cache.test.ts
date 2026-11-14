/**
 * Cache contract for useContentDetails (query-budget rules in frontend/CLAUDE.md).
 * The hook's real options are captured from createQuery and driven through a REAL
 * QueryClient: de-duplication (Activity deep link + Plan "View content" share one
 * call), freshness (a remount inside staleTime is free), key hygiene (the id is in
 * the key), and the `enabled` gate (no fetch when the caller already has the row).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, type QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
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
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...args: unknown[]) => request(...args) }));

import { useContentDetails } from '$lib/queries/content/useContentDetails';

let client: QueryClient;

beforeEach(() => {
	client = makeClient();
	captured = undefined;
	request.mockReset();
});

describe('useContentDetails cache contract', () => {
	it('keys the query by content id, so a different id is a different cache entry', () => {
		useContentDetails(() => '7');
		const key7 = captured.queryKey;
		useContentDetails(() => '8');
		expect(hashKey(captured.queryKey)).not.toBe(hashKey(key7));
		expect(key7).toEqual(queryKeys.content.row('7'));
	});

	it('sends the id it is keyed on', async () => {
		request.mockResolvedValue({ content: { id: '7' } });
		useContentDetails(() => '7');
		await captured.queryFn();
		expect(request).toHaveBeenCalledWith(expect.anything(), { id: '7' });
	});

	it('three consumers (Activity deep link + Plan view content) cost one network call', async () => {
		useContentDetails(() => '7');
		const fetcher = countingFetch({ content: { id: '7' } });
		const stop = await mountConsumers(
			client,
			{ queryKey: captured.queryKey, queryFn: fetcher, staleTime: captured.staleTime },
			3,
		);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('has a deliberate staleTime, so a remount inside it does not refetch', async () => {
		useContentDetails(() => '7');
		expect(captured.staleTime).toBeGreaterThan(0);
		const fetcher = countingFetch({ content: { id: '7' } });
		const options = { queryKey: captured.queryKey, queryFn: fetcher, staleTime: captured.staleTime };

		(await mountConsumers(client, options, 1))();
		(await mountConsumers(client, options, 1))();

		expect(fetcher.fetches()).toBe(1);
	});

	it('does not fetch without an id, or when the caller already has the row', () => {
		useContentDetails(() => null);
		expect(captured.enabled).toBe(false);

		useContentDetails(
			() => '7',
			() => false,
		);
		expect(captured.enabled).toBe(false);

		useContentDetails(() => '7');
		expect(captured.enabled).toBe(true);
	});
});

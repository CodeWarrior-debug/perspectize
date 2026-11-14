/**
 * useUsernames: the userId → username lookup behind the Activity grid's User column.
 * Its cache contract matters more than its mapping — it must ride the shared users-list
 * key (one request per session, however many components ask), not a per-page fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import { countingFetch, makeClient, mountConsumers } from '../helpers/queryBudget';

let capturedOptions: { queryKey: unknown[]; queryFn: () => Promise<unknown>; staleTime?: number };
let queryData: { users: { id: string; username: string }[] } | undefined;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createQuery: vi.fn((optionsFn: () => typeof capturedOptions) => {
			capturedOptions = optionsFn();
			return {
				get data() {
					return queryData;
				},
			};
		}),
	};
});

const graphqlRequest = vi.hoisted(() => vi.fn());
vi.mock('$lib/queries/client', () => ({ graphqlRequest }));

import { useUsernames } from '$lib/queries/users/useUsernames.svelte';

describe('useUsernames', () => {
	beforeEach(() => {
		queryData = undefined;
		graphqlRequest.mockReset();
	});

	it('maps user ids to usernames', () => {
		queryData = {
			users: [
				{ id: '1', username: 'ann' },
				{ id: '2', username: 'bob' },
			],
		};
		const { byId } = useUsernames();
		expect(byId.get('1')).toBe('ann');
		expect(byId.get('2')).toBe('bob');
		expect(byId.get('3')).toBeUndefined();
	});

	it('is an empty lookup until the users list has loaded', () => {
		expect(useUsernames().byId.size).toBe(0);
	});

	it('shares the users-list key and keeps it fresh for minutes, not per mount', () => {
		useUsernames();
		expect(hashKey(capturedOptions.queryKey)).toBe(hashKey(queryKeys.users.list()));
		expect(capturedOptions.staleTime).toBe(5 * 60 * 1000);
	});

	it('three consumers cost one network call', async () => {
		useUsernames();
		const fetcher = countingFetch({ users: [] });
		const stop = await mountConsumers(
			makeClient(),
			{ queryKey: capturedOptions.queryKey, queryFn: fetcher, staleTime: capturedOptions.staleTime },
			3,
		);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('queryFn requests the users list', async () => {
		graphqlRequest.mockResolvedValue({ users: [] });
		useUsernames();
		await capturedOptions.queryFn();
		expect(graphqlRequest).toHaveBeenCalledTimes(1);
	});
});

/**
 * Cache contract tests — the executable form of the "Query caching & call
 * budget" rules in frontend/CLAUDE.md. They run against a real QueryClient.
 *
 *  1. De-duplication: N consumers of one key cost one network call.
 *  2. Freshness: a consumer mounting inside staleTime costs zero calls.
 *  3. Key hygiene: every variable a queryFn sends changes the key hash (the
 *     ActivityTable search-box bug), and equal inputs hash equal (no needless
 *     refetch from an unstable key).
 *  4. Eviction: a mutation's onSuccess evicts exactly the affected entries —
 *     and nothing else.
 *
 * Copy the shape of (4) for every new mutation hook; copy (1)-(2) for any hook
 * or component that introduces a new createQuery.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, type QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import { countingFetch, invalidationOutcome, makeClient, mountConsumers, seed } from '../helpers/queryBudget';

let client: QueryClient;
let capturedDeleteOptions: any;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createMutation: vi.fn((optionsFn: () => any) => {
			capturedDeleteOptions = optionsFn();
			return { mutate: vi.fn(), isPending: false };
		}),
		useQueryClient: () => client,
	};
});
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

beforeEach(() => {
	client = makeClient();
	capturedDeleteOptions = undefined;
});

describe('de-duplication and freshness', () => {
	it('three consumers of one key cost one network call', async () => {
		const fetcher = countingFetch({ id: '3' });
		const stop = await mountConsumers(
			client,
			{ queryKey: queryKeys.content.detail('3'), queryFn: fetcher, staleTime: 60_000 },
			3,
		);
		expect(fetcher.fetches()).toBe(1);
		stop();
	});

	it('a consumer mounting inside staleTime does not refetch', async () => {
		const fetcher = countingFetch({ id: '3' });
		const options = { queryKey: queryKeys.content.detail('3'), queryFn: fetcher, staleTime: 60_000 };

		(await mountConsumers(client, options, 1))();
		(await mountConsumers(client, options, 1))(); // e.g. navigating away and back

		expect(fetcher.fetches()).toBe(1);
	});

	it('with no staleTime (the default 0) every remount refetches — set one deliberately', async () => {
		const fetcher = countingFetch({ id: '3' });
		const options = { queryKey: queryKeys.content.detail('3'), queryFn: fetcher };

		(await mountConsumers(client, options, 1))();
		(await mountConsumers(client, options, 1))();

		expect(fetcher.fetches()).toBe(2);
	});
});

describe('query key hygiene', () => {
	const base = { sortBy: 'UPDATED_AT', sortOrder: 'DESC', search: '', first: 50 };

	it('structurally equal filters hash equal (a stable key does not refetch)', () => {
		expect(hashKey(queryKeys.content.list({ ...base }))).toBe(hashKey(queryKeys.content.list({ ...base })));
	});

	it('property order does not change the hash', () => {
		const a = queryKeys.content.list({ sortBy: 'A', first: 1 });
		const b = queryKeys.content.list({ first: 1, sortBy: 'A' });
		expect(hashKey(a)).toBe(hashKey(b));
	});

	it.each([
		['sortBy', { sortBy: 'NAME' }],
		['sortOrder', { sortOrder: 'ASC' }],
		['search', { search: 'x' }],
		['searchFields', { searchFields: ['name'] }],
		['first', { first: 10 }],
		['after', { after: 'cursor:9' }],
		['filter', { filter: { contentType: 'YOUTUBE' } }],
		['mode', { mode: 'all' }],
		['sorts', { sorts: [{ field: 'NAME', order: 'ASC' }] }],
	])('changing %s changes the content list key', (_name, change) => {
		expect(hashKey(queryKeys.content.list({ ...base, ...change }))).not.toBe(
			hashKey(queryKeys.content.list({ ...base })),
		);
	});

	it('detail, banner and row keys for one id never collide', () => {
		const hashes = [queryKeys.content.detail('3'), queryKeys.content.banner('3'), queryKeys.content.row('3')].map((k) =>
			hashKey(k),
		);
		expect(new Set(hashes).size).toBe(3);
	});
});

describe('eviction: useDeletePerspective.onSuccess evicts exactly what changed', () => {
	it('invalidates the affected entries and leaves unrelated caches alone', async () => {
		const affected = [
			queryKeys.perspectives.activityFeed(true),
			queryKeys.perspectives.activityFeed(false),
			queryKeys.perspectives.detail('7'),
			queryKeys.content.detail('3'),
			queryKeys.perspectives.listByContent(3),
			queryKeys.perspectives.listByUser(42),
		];
		const unrelated = [
			queryKeys.perspectives.detail('8'),
			queryKeys.content.detail('4'),
			queryKeys.content.list({ first: 50 }),
			queryKeys.users.list(),
			queryKeys.messaging.threads.list(),
			queryKeys.bible.passageText(1, 2),
		];
		for (const k of [...affected, ...unrelated]) seed(client, k);

		const { useDeletePerspective } = await import('$lib/queries/perspectives/useDeletePerspective');
		useDeletePerspective();
		capturedDeleteOptions.onSuccess({ deletePerspective: true }, { id: '7', contentID: '3' });

		const outcome = invalidationOutcome(client, [...affected, ...unrelated]);
		expect(outcome.invalidated).toEqual(affected);
		expect(outcome.untouched).toEqual(unrelated);
	});
});

describe('eviction: useSetPassageDisplayTitle.onSuccess patches in place, evicts nothing', () => {
	it('updates only that passage in cached lists/rows and invalidates no entry', async () => {
		const listKey = queryKeys.content.list({ first: 50 });
		const rowKey = queryKeys.content.row('3');
		const aggregatesKey = queryKeys.content.detail('3');
		const otherRowKey = queryKeys.content.row('4');
		const unrelated = [
			queryKeys.perspectives.listByContent(3),
			queryKeys.users.list(),
			queryKeys.bible.passageText(1, 2),
		];
		seed(client, listKey, {
			content: {
				items: [
					{ id: '3', displayTitle: null },
					{ id: '4', displayTitle: 'Other' },
				],
			},
		});
		seed(client, rowKey, { contentByID: { id: '3', name: 'Genesis 1:1', displayTitle: null } });
		const aggregates = { contentByID: { id: '3', perspectiveCount: 2 } };
		seed(client, aggregatesKey, aggregates);
		const otherRow = { contentByID: { id: '4', displayTitle: 'Other' } };
		seed(client, otherRowKey, otherRow);
		for (const k of unrelated) seed(client, k);

		const { useSetPassageDisplayTitle } = await import('$lib/queries/bible/useSetPassageDisplayTitle');
		useSetPassageDisplayTitle();
		capturedDeleteOptions.onSuccess(
			{ setPassageDisplayTitle: { id: '3', displayTitle: 'Creation' } },
			{ contentID: '3', title: 'Creation' },
		);

		const all = [listKey, rowKey, aggregatesKey, otherRowKey, ...unrelated];
		expect(invalidationOutcome(client, all).invalidated).toEqual([]);

		expect(client.getQueryData<any>(listKey).content.items).toEqual([
			{ id: '3', displayTitle: 'Creation' },
			{ id: '4', displayTitle: 'Other' },
		]);
		expect(client.getQueryData<any>(rowKey).contentByID.displayTitle).toBe('Creation');
		// Entries without this passage's title come back as the same object: no re-render.
		expect(client.getQueryData(aggregatesKey)).toBe(aggregates);
		expect(client.getQueryData(otherRowKey)).toBe(otherRow);
	});
});

describe('eviction: useAddMovie.onSuccess invalidates content lists only', () => {
	it('marks every content list stale and leaves details, rows and other domains alone', async () => {
		const affected = [queryKeys.content.list({ first: 50 }), queryKeys.content.list({ first: 10, search: 'matrix' })];
		const unrelated = [
			queryKeys.content.detail('3'),
			queryKeys.content.row('3'),
			queryKeys.perspectives.listByContent(3),
			queryKeys.users.list(),
			queryKeys.bible.passageText(1, 2),
		];
		for (const k of [...affected, ...unrelated]) seed(client, k);

		const { useAddMovie } = await import('$lib/queries/content/useAddMovie');
		useAddMovie();
		capturedDeleteOptions.onSuccess({ createContentFromMovie: { id: '9', name: 'The Matrix', contentType: 'MOVIE' } });

		const outcome = invalidationOutcome(client, [...affected, ...unrelated]);
		expect(outcome.invalidated).toEqual(affected);
		expect(outcome.untouched).toEqual(unrelated);
	});
});

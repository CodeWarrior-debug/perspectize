/**
 * Cache behaviour of useUpdateSourceData's onSuccess against a REAL QueryClient.
 *
 * The hook is called for real; only createMutation and svelte-sonner are swapped
 * so the test can grab the mutation options and run onSuccess. Each test reads the
 * cache back, so a patch that matches no entry, or a crash in an updater, fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '#lib/queries/keys.js';
import { useUpdateSourceData } from '#lib/queries/content/useUpdateSourceData.js';
import { makeClient, seed, invalidationOutcome } from '../helpers/queryBudget';

let client: QueryClient;
let captured: any;

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createMutation: vi.fn((optionsFn: () => any) => {
			captured = optionsFn();
			return { mutate: vi.fn(), isPending: false };
		}),
		useQueryClient: () => client,
	};
});

vi.mock('svelte-sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('#lib/queries/client.js', () => ({
	graphqlRequest: vi.fn(),
}));

const refreshed = { id: '1', name: 'Refreshed title' } as any;
const existingRow = { id: '1', name: 'Old title', primaryCategory: { label: 'Film' } } as any;
const otherRow = { id: '2', name: 'Other' } as any;

const libraryList = queryKeys.content.list({ sortBy: 'UPDATED_AT', first: 50 } as any);
const claims = queryKeys.content.claimList();
const itemPicker = queryKeys.content.itemPicker('', []);
const comparePicker = queryKeys.content.comparePicker('');
const detail = queryKeys.content.detail('1');
const allKeys = [libraryList, claims, itemPicker, comparePicker, detail];

/** Seeds one library list plus a bare-array claims list and the two picker shapes. */
function seedCache() {
	seed(client, libraryList, { content: { items: [existingRow, otherRow], totalCount: 2, pageInfo: {} } });
	// The claims list caches a bare ClaimRow[], not a { content: { items } } envelope.
	seed(client, claims, [{ id: 'c1' }]);
	seed(client, itemPicker, { content: { items: [existingRow] } });
	seed(client, comparePicker, { content: { items: [existingRow] } });
	seed(client, detail, { id: '1' });
}

const libraryItems = () => (client.getQueryData(libraryList) as any).content.items as unknown[];

describe('useUpdateSourceData onSuccess cache eviction', () => {
	beforeEach(() => {
		client = makeClient();
		captured = undefined;
		seedCache();
		useUpdateSourceData();
	});

	it('does not throw when the claims list is cached as a bare array', () => {
		expect(() => captured.onSuccess({ updateContentSourceData: refreshed })).not.toThrow();
		expect(client.getQueryData(claims)).toEqual([{ id: 'c1' }]);
	});

	it('merges the refreshed row into the library list and keeps fields the mutation does not select', () => {
		captured.onSuccess({ updateContentSourceData: refreshed });

		expect(libraryItems()).toEqual([{ ...existingRow, ...refreshed }, otherRow]);
		expect((client.getQueryData(libraryList) as any).content.totalCount).toBe(2);
	});

	it('leaves the claims list and the picker keys untouched in data, and marks them stale', () => {
		captured.onSuccess({ updateContentSourceData: refreshed });

		expect(client.getQueryData(claims)).toEqual([{ id: 'c1' }]);
		expect(client.getQueryData(itemPicker)).toEqual({ content: { items: [existingRow] } });
		expect(client.getQueryData(comparePicker)).toEqual({ content: { items: [existingRow] } });
		expect(invalidationOutcome(client, allKeys)).toEqual({
			invalidated: [libraryList, claims, itemPicker, comparePicker],
			untouched: [detail],
		});
	});

	it('leaves the detail key untouched in data and not invalidated', () => {
		captured.onSuccess({ updateContentSourceData: refreshed });

		expect(client.getQueryData(detail)).toEqual({ id: '1' });
		expect(invalidationOutcome(client, [detail]).untouched).toEqual([detail]);
	});
});

/**
 * Cache behaviour of the five add hooks (useAddVideo, useAddBook, useAddMovie,
 * useAddPassage, useCreateWebPage) against a REAL QueryClient.
 *
 * The hooks are called for real; only createMutation/useQueryClient are
 * swapped so the test can grab each mutation's options and run onSuccess.
 * Each test reads the cache back, so an eviction that matches no entry fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '#lib/queries/keys.js';
import { useAddVideo } from '#lib/queries/content/useAddVideo.js';
import { useAddBook } from '#lib/queries/content/useAddBook.js';
import { useAddMovie } from '#lib/queries/content/useAddMovie.js';
import { useAddPassage } from '#lib/queries/content/useAddPassage.js';
import { useCreateWebPage } from '#lib/queries/content/useCreateWebPage.js';
import { isLibraryListKey } from '#lib/queries/content/contentCreatedEviction.js';
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

vi.mock('#lib/utils/toast.js', () => ({
	silentToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('#lib/queries/client.js', () => ({
	graphqlRequest: vi.fn(),
}));

const newRow = { id: '900', name: 'New row' } as any;
const existingRow = { id: '1', name: 'Old row' } as any;

const libraryList = queryKeys.content.list({ sortBy: 'UPDATED_AT', first: 50 } as any);
const claims = queryKeys.content.claimList();
const itemPicker = queryKeys.content.itemPicker('', []);
const comparePicker = queryKeys.content.comparePicker('');
const detail = queryKeys.content.detail('1');
const allKeys = [libraryList, claims, itemPicker, comparePicker, detail];

/** Every key an add hook may touch, plus a detail key it must leave alone. */
function seedCache() {
	seed(client, libraryList, { content: { items: [existingRow], totalCount: 1, pageInfo: {} } });
	// The claims list caches a bare ClaimRow[], not a { content: { items } } envelope.
	seed(client, claims, [{ id: 'c1' }]);
	seed(client, itemPicker, { content: { items: [existingRow] } });
	seed(client, comparePicker, { content: { items: [existingRow] } });
	seed(client, detail, { id: '1' });
}

/** Runs the onSuccess of the hook named by `make`, against the seeded client. */
function runOnSuccess(make: (o?: { quiet: boolean }) => unknown, data: unknown, quiet = false) {
	make(quiet ? { quiet: true } : undefined);
	captured.onSuccess(data);
}

const libraryItems = () => (client.getQueryData(libraryList) as any).content.items as unknown[];

describe('content-created eviction', () => {
	beforeEach(() => {
		client = makeClient();
		captured = undefined;
		seedCache();
	});

	describe('library list key', () => {
		it('matches only the library list, not the claims or picker keys', () => {
			expect(isLibraryListKey(libraryList)).toBe(true);
			expect(isLibraryListKey(claims)).toBe(false);
			expect(isLibraryListKey(itemPicker)).toBe(false);
			expect(isLibraryListKey(comparePicker)).toBe(false);
			expect(isLibraryListKey(detail)).toBe(false);
		});
	});

	describe('useAddVideo', () => {
		// Pinned regression: the claims list is a bare array, and the old updater read `.content.items` on it.
		it('does not throw when the claims list is cached as a bare array', () => {
			expect(() =>
				runOnSuccess((o) => useAddVideo(o), {
					createContentFromYouTube: { content: newRow, alreadyExisted: false },
				}),
			).not.toThrow();
			expect(client.getQueryData(claims)).toEqual([{ id: 'c1' }]);
		});

		it('prepends a new video to the library list and marks every list stale', () => {
			runOnSuccess((o) => useAddVideo(o), {
				createContentFromYouTube: { content: newRow, alreadyExisted: false },
			});

			expect(libraryItems()).toEqual([newRow, existingRow]);
			expect((client.getQueryData(libraryList) as any).content.totalCount).toBe(2);
			expect(invalidationOutcome(client, allKeys)).toEqual({
				invalidated: [libraryList, claims, itemPicker, comparePicker],
				untouched: [detail],
			});
		});

		it('does not patch an existing video, but still marks the lists stale', () => {
			runOnSuccess((o) => useAddVideo(o), {
				createContentFromYouTube: { content: existingRow, alreadyExisted: true },
			});

			expect(libraryItems()).toEqual([existingRow]);
			expect(invalidationOutcome(client, [libraryList]).invalidated).toEqual([libraryList]);
		});

		it('still evicts with quiet: true', () => {
			runOnSuccess(
				(o) => useAddVideo(o),
				{ createContentFromYouTube: { content: newRow, alreadyExisted: false } },
				true,
			);
			expect(libraryItems()).toEqual([newRow, existingRow]);
		});
	});

	describe.each([
		['useAddBook', (o?: { quiet: boolean }) => useAddBook(o), { createContentFromBook: { id: '900', name: 'A book' } }],
		[
			'useAddMovie',
			(o?: { quiet: boolean }) => useAddMovie(o),
			{ createContentFromMovie: { id: '900', name: 'A movie' } },
		],
		[
			'useAddPassage',
			(o?: { quiet: boolean }) => useAddPassage(o),
			{ createContentFromPassage: { id: '900', displayTitle: 'John 3:16' } },
		],
		[
			'useCreateWebPage',
			(o?: { quiet: boolean }) => useCreateWebPage(o),
			{ createContentFromWebPage: { content: { id: '900', name: 'A page' }, alreadyExisted: false } },
		],
	])('%s', (_name, make, data) => {
		it('marks the library list stale without patching it, and does not throw with the claims list cached', () => {
			expect(() => runOnSuccess(make, data)).not.toThrow();

			// Find-or-create: the server can't say whether the row is new, so no prepend.
			expect(libraryItems()).toEqual([existingRow]);
			expect(invalidationOutcome(client, allKeys)).toEqual({
				invalidated: [libraryList, claims, itemPicker, comparePicker],
				untouched: [detail],
			});
		});

		it('still evicts with quiet: true', () => {
			runOnSuccess(make, data, true);
			expect(libraryItems()).toEqual([existingRow]);
			expect(invalidationOutcome(client, allKeys).invalidated).toContain(libraryList);
		});
	});
});

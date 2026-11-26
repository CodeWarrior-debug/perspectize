/**
 * The create -> update -> delete cache story for one viewer's perspective, driven
 * against a REAL QueryClient through perspectiveCache.ts (the one copy of the rules).
 *
 * Every step reads the cache back. The leak regression pins the shipped bug: a create
 * on one content item inserted its row into another item's Compare picker list.
 */
import { describe, it, expect } from 'vitest';
import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '#lib/queries/keys.js';
import type { ListPerspectivesByUserResponse, PerspectiveItem } from '#lib/queries/perspectives/index.js';
import {
	optimisticCreate,
	optimisticDelete,
	optimisticId,
	optimisticUpdate,
	rollbackLists,
	settleCreate,
	settleDelete,
	settleUpdate,
} from '#lib/queries/perspectives/perspectiveCache.js';
import { isInvalidated, makeClient } from '../helpers/queryBudget';

const VIEWER = 42;
const OTHER_VIEWER = 7;
const ITEM = 10;
const OTHER_ITEM = 11;

function row(overrides: Partial<PerspectiveItem> = {}): PerspectiveItem {
	return {
		id: '501',
		userID: String(VIEWER),
		contentID: String(ITEM),
		quality: 5000,
		agreement: null,
		importance: null,
		confidence: null,
		like: null,
		review: null,
		privacy: 'PUBLIC',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: null,
		feelings: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function items(client: QueryClient, key: readonly unknown[]): PerspectiveItem[] {
	return client.getQueryData<ListPerspectivesByUserResponse>(key)?.perspectives.items ?? [];
}

function seedWorld(client: QueryClient) {
	// The viewer's own by-user list, the other viewer's list, and the content item's
	// by-content list (the Compare picker) plus a different item's by-content list.
	client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(VIEWER), {
		perspectives: { items: [] },
	});
	client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(OTHER_VIEWER), {
		perspectives: { items: [row({ id: 'other-viewer-row', userID: String(OTHER_VIEWER), contentID: String(ITEM) })] },
	});
	client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(ITEM), {
		perspectives: { items: [] },
	});
	client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(OTHER_ITEM), {
		perspectives: { items: [row({ id: 'other-item-row', contentID: String(OTHER_ITEM) })] },
	});
	client.setQueryData(queryKeys.content.detail(String(ITEM)), { aggregate: 'before' });
}

describe('perspective cache story: create -> update -> delete (real QueryClient)', () => {
	it('create: the optimistic row appears in the viewer list, then the server row replaces it', async () => {
		const client = makeClient();
		seedWorld(client);
		const tempId = optimisticId();
		expect(tempId.startsWith('optimistic-')).toBe(true);

		await optimisticCreate(client, { userID: VIEWER, contentID: ITEM, quality: 5000 }, tempId);
		expect(items(client, queryKeys.perspectives.listByUser(VIEWER)).map((p) => p.id)).toEqual([tempId]);

		const created = row({ id: '900' });
		settleCreate(client, { userID: VIEWER, contentID: ITEM, quality: 5000 }, created, tempId);
		expect(items(client, queryKeys.perspectives.listByUser(VIEWER)).map((p) => p.id)).toEqual(['900']);
	});

	it('create: the Compare-picker leak is pinned; other items and other viewers are untouched', async () => {
		const client = makeClient();
		seedWorld(client);
		const otherItemBefore = client.getQueryData(queryKeys.perspectives.listByContent(OTHER_ITEM));
		const otherViewerBefore = client.getQueryData(queryKeys.perspectives.listByUser(OTHER_VIEWER));

		const tempId = optimisticId();
		await optimisticCreate(client, { userID: VIEWER, contentID: ITEM }, tempId);
		settleCreate(client, { userID: VIEWER, contentID: ITEM }, row({ id: '900' }), tempId);

		// The leak: a row for ITEM must never appear in OTHER_ITEM's Compare picker list.
		expect(client.getQueryData(queryKeys.perspectives.listByContent(OTHER_ITEM))).toBe(otherItemBefore);
		expect(client.getQueryData(queryKeys.perspectives.listByUser(OTHER_VIEWER))).toBe(otherViewerBefore);
		expect(isInvalidated(client, queryKeys.perspectives.listByContent(OTHER_ITEM))).toBe(false);
	});

	it('create: the content item’s own Compare list and aggregate are marked stale', async () => {
		const client = makeClient();
		seedWorld(client);
		const tempId = optimisticId();
		await optimisticCreate(client, { userID: VIEWER, contentID: ITEM }, tempId);
		settleCreate(client, { userID: VIEWER, contentID: ITEM }, row({ id: '900' }), tempId);

		expect(isInvalidated(client, queryKeys.perspectives.listByContent(ITEM))).toBe(true);
		expect(isInvalidated(client, queryKeys.content.detail(String(ITEM)))).toBe(true);
	});

	it('update: the edited row is patched in every row list and the aggregate is evicted', async () => {
		const client = makeClient();
		seedWorld(client);
		const saved = row({ id: '501', quality: 5000 });
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(VIEWER), {
			perspectives: { items: [saved] },
		});
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(ITEM), {
			perspectives: { items: [saved] },
		});

		await optimisticUpdate(client, { id: 501, quality: 7000, privacy: 'PRIVATE' });
		expect(items(client, queryKeys.perspectives.listByContent(ITEM))[0]).toMatchObject({
			quality: 7000,
			privacy: 'PRIVATE',
		});

		settleUpdate(client, row({ id: '501', quality: 7000, privacy: 'PRIVATE', updatedAt: '2026-02-01T00:00:00Z' }));
		expect(items(client, queryKeys.perspectives.listByUser(VIEWER))[0]).toMatchObject({ quality: 7000 });
		expect(isInvalidated(client, queryKeys.content.detail(String(ITEM)))).toBe(true);
	});

	it('update: an omitted field keeps its value, a null field is cleared (tri-state)', async () => {
		const client = makeClient();
		seedWorld(client);
		const saved = row({ id: '501', quality: 5000, review: '<p>kept</p>' });
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(VIEWER), {
			perspectives: { items: [saved] },
		});
		await optimisticUpdate(client, { id: 501, quality: null });
		const patched = items(client, queryKeys.perspectives.listByUser(VIEWER))[0];
		expect(patched.quality).toBeNull();
		expect(patched.review).toBe('<p>kept</p>');
	});

	it('delete: the row leaves every row list and the perspective and content are evicted', async () => {
		const client = makeClient();
		seedWorld(client);
		const saved = row({ id: '501' });
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(VIEWER), {
			perspectives: { items: [saved] },
		});
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByContent(ITEM), {
			perspectives: { items: [saved] },
		});

		// invalidateQueries only marks entries that exist, so the perspective's detail entry is seeded.
		client.setQueryData(queryKeys.perspectives.detail('501'), saved);

		await optimisticDelete(client, '501');
		expect(items(client, queryKeys.perspectives.listByUser(VIEWER))).toEqual([]);
		expect(items(client, queryKeys.perspectives.listByContent(ITEM))).toEqual([]);

		settleDelete(client, '501', String(ITEM));
		expect(isInvalidated(client, queryKeys.perspectives.detail('501'))).toBe(true);
		expect(isInvalidated(client, queryKeys.content.detail(String(ITEM)))).toBe(true);
		// The other item's by-content list was never a delete target.
		expect(isInvalidated(client, queryKeys.perspectives.listByContent(OTHER_ITEM))).toBe(false);
	});

	it('a failed delete rolls every captured list back to its pre-mutation value', async () => {
		const client = makeClient();
		seedWorld(client);
		const saved = row({ id: '501' });
		client.setQueryData<ListPerspectivesByUserResponse>(queryKeys.perspectives.listByUser(VIEWER), {
			perspectives: { items: [saved] },
		});
		const previous = await optimisticDelete(client, '501');
		expect(items(client, queryKeys.perspectives.listByUser(VIEWER))).toEqual([]);

		rollbackLists(client, previous);
		expect(items(client, queryKeys.perspectives.listByUser(VIEWER)).map((p) => p.id)).toEqual(['501']);
	});
});

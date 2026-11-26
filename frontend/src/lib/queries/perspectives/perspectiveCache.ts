import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '../keys';
import {
	OPTIMISTIC_PREFIX,
	type FeelingEntry,
	type ListPerspectivesByUserResponse,
	type PerspectiveItem,
} from './index';
import type { CreatePerspectiveInput } from './useCreatePerspective';
import type { UpdatePerspectiveInput } from './useUpdatePerspective';

/**
 * The one copy of the perspective cache rules: which entries an optimistic create,
 * edit or delete patches, which it only marks stale, and how a failed mutation rolls
 * back. The three mutation hooks call these; nothing else touches the perspective keys.
 *
 * Shape rules: only the by-user list is patched on create, because it is the one list
 * guaranteed to hold the PerspectiveItem the server returns. Edit and delete patch every
 * PerspectiveItem-shaped list (by-user and by-content) by row id, which never inserts a
 * row into a list it isn't already in.
 */

export type ListSnapshot = [readonly unknown[], ListPerspectivesByUserResponse | undefined][];

/** Placeholder id for an optimistic row, unique per create call. */
export function optimisticId(): string {
	return `${OPTIMISTIC_PREFIX}${Date.now()}`;
}

function ownListFilter(userID: number) {
	return { queryKey: queryKeys.perspectives.listByUser(userID), exact: true };
}

/** Every PerspectiveItem-shaped perspective list (by-user and by-content). */
function rowListFilters(): { queryKey: readonly unknown[] }[] {
	return [{ queryKey: queryKeys.perspectives.byUserLists() }, { queryKey: queryKeys.perspectives.byContentLists() }];
}

function patchLists(
	items: (list: PerspectiveItem[]) => PerspectiveItem[],
): (old: ListPerspectivesByUserResponse | undefined) => ListPerspectivesByUserResponse | undefined {
	return (old) => (old ? { perspectives: { ...old.perspectives, items: items(old.perspectives.items) } } : old);
}

function snapshot(
	queryClient: QueryClient,
	filters: { queryKey: readonly unknown[]; exact?: boolean }[],
): ListSnapshot {
	return filters.flatMap((f) => queryClient.getQueriesData<ListPerspectivesByUserResponse>(f) as ListSnapshot);
}

/** Restore every list captured by a snapshot. Used by each mutation's onError. */
export function rollbackLists(queryClient: QueryClient, previous: ListSnapshot): void {
	previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
}

/** Placeholder row shown immediately, before the server responds. */
export function optimisticPerspective(input: CreatePerspectiveInput, id: string): PerspectiveItem {
	const now = new Date().toISOString();
	return {
		id,
		userID: String(input.userID),
		contentID: input.contentID != null ? String(input.contentID) : null,
		quality: input.quality ?? null,
		agreement: input.agreement ?? null,
		importance: input.importance ?? null,
		confidence: input.confidence ?? null,
		like: input.like ?? null,
		review: input.review ?? null,
		privacy: input.privacy ?? 'PUBLIC',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: input.customFields ?? null,
		feelings: (input.feelings as FeelingEntry[] | undefined) ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

/** Insert the placeholder row into the creator's own by-user list only. */
export async function optimisticCreate(
	queryClient: QueryClient,
	input: CreatePerspectiveInput,
	tempId: string,
): Promise<ListSnapshot> {
	const filter = ownListFilter(input.userID);
	await queryClient.cancelQueries(filter);
	const previous = queryClient.getQueriesData<ListPerspectivesByUserResponse>(filter) as ListSnapshot;
	queryClient.setQueriesData<ListPerspectivesByUserResponse>(
		filter,
		patchLists((list) => [optimisticPerspective(input, tempId), ...list]),
	);
	return previous;
}

/**
 * Swap the placeholder for the server row, then evict what the new row changed. The
 * own list is marked stale without a refetch, avoiding a flicker on the +/glasses
 * affordance; other content's lists and the content aggregates are invalidated.
 */
export function settleCreate(
	queryClient: QueryClient,
	input: CreatePerspectiveInput,
	created: PerspectiveItem,
	tempId: string | undefined,
): void {
	const filter = ownListFilter(input.userID);
	queryClient.setQueriesData<ListPerspectivesByUserResponse>(
		filter,
		patchLists((list) => {
			const hasTemp = tempId != null && list.some((p) => p.id === tempId);
			return hasTemp ? list.map((p) => (p.id === tempId ? created : p)) : [created, ...list];
		}),
	);
	queryClient.invalidateQueries({ ...filter, refetchType: 'none' });
	if (created.contentID) {
		queryClient.invalidateQueries({
			queryKey: queryKeys.perspectives.listByContent(Number(created.contentID)),
			exact: true,
		});
		queryClient.invalidateQueries({ queryKey: queryKeys.content.detail(created.contentID) });
	}
}

/** Marks every perspective list stale. Used when a response has an unexpected shape. */
export function invalidateAllPerspectiveLists(queryClient: QueryClient): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.lists() });
}

/** Apply the submitted fields onto the cached row. undefined keeps the cached value. */
function pick<T>(next: T | undefined, prev: T): T {
	return next === undefined ? prev : next;
}

/**
 * Mirrors the server's tri-state Update(): an omitted field stays, a field set to null
 * is cleared, so a cleared field shows cleared before the response replaces the row.
 */
function applyEdit(p: PerspectiveItem, input: UpdatePerspectiveInput): PerspectiveItem {
	return {
		...p,
		quality: pick(input.quality, p.quality),
		agreement: pick(input.agreement, p.agreement),
		importance: pick(input.importance, p.importance),
		confidence: pick(input.confidence, p.confidence),
		like: pick(input.like, p.like),
		review: pick(input.review, p.review),
		customFields: pick(input.customFields, p.customFields),
		feelings: pick(input.feelings as FeelingEntry[] | null | undefined, p.feelings),
		privacy: input.privacy ?? p.privacy,
		updatedAt: new Date().toISOString(),
	};
}

export async function optimisticUpdate(queryClient: QueryClient, input: UpdatePerspectiveInput): Promise<ListSnapshot> {
	const filters = rowListFilters();
	await Promise.all(filters.map((f) => queryClient.cancelQueries(f)));
	const previous = snapshot(queryClient, filters);
	const targetId = String(input.id);
	const edit = patchLists((list) => list.map((p) => (p.id === targetId ? applyEdit(p, input) : p)));
	for (const f of filters) queryClient.setQueriesData<ListPerspectivesByUserResponse>(f, edit);
	return previous;
}

/**
 * Replace the edited row with the server's copy. Editing a perspective, including its
 * privacy, changes the content's perspectiveCount and averageRating, so the cached
 * aggregate is evicted too.
 */
export function settleUpdate(queryClient: QueryClient, updated: PerspectiveItem): void {
	const swap = patchLists((list) => list.map((p) => (p.id === updated.id ? updated : p)));
	for (const f of rowListFilters()) {
		queryClient.setQueriesData<ListPerspectivesByUserResponse>(f, swap);
	}
	markRowListsStale(queryClient, updated.contentID);
	if (updated.contentID) {
		queryClient.invalidateQueries({ queryKey: queryKeys.content.detail(updated.contentID) });
	}
}

/**
 * Mark stale, without refetching, the lists a row change can reach: the viewer's by-user
 * lists, and only this item's by-content list (the Compare picker). Other items' lists
 * never held this row, so they are left alone.
 */
function markRowListsStale(queryClient: QueryClient, contentID: string | null): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.byUserLists(), refetchType: 'none' });
	if (contentID) {
		queryClient.invalidateQueries({
			queryKey: queryKeys.perspectives.listByContent(Number(contentID)),
			exact: true,
			refetchType: 'none',
		});
	}
}

export async function optimisticDelete(queryClient: QueryClient, id: string): Promise<ListSnapshot> {
	const filters = rowListFilters();
	await Promise.all(filters.map((f) => queryClient.cancelQueries(f)));
	const previous = snapshot(queryClient, filters);
	const drop = patchLists((list) => list.filter((p) => p.id !== id));
	for (const f of filters) queryClient.setQueriesData<ListPerspectivesByUserResponse>(f, drop);
	return previous;
}

/** Evict the perspective, and the content whose count and average just changed. */
export function settleDelete(queryClient: QueryClient, id: string, contentID: string | null): void {
	markRowListsStale(queryClient, contentID);
	queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.detail(id) });
	if (contentID) {
		queryClient.invalidateQueries({ queryKey: queryKeys.content.detail(contentID) });
	}
}

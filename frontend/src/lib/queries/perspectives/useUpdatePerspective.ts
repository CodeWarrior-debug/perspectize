import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	UPDATE_PERSPECTIVE,
	type UpdatePerspectiveResponse,
	type ListPerspectivesByUserResponse,
	type PerspectiveItem,
	type FeelingEntry,
} from './index';
import { queryKeys } from '../keys';
import type { FeelingInput } from './useCreatePerspective';

export interface UpdatePerspectiveInput {
	id: number;
	/** undefined = leave unchanged (the key is omitted from the request); null = clear. */
	quality?: number | null;
	agreement?: number | null;
	importance?: number | null;
	confidence?: number | null;
	like?: string | null;
	review?: string | null;
	customFields?: Record<string, number> | null;
	feelings?: FeelingInput[] | null;
	privacy?: 'PUBLIC' | 'PRIVATE';
	/** Mutually exclusive with hermeneuticCustomText; setting one clears the other server-side. */
	hermeneuticApproachID?: number;
	hermeneuticCustomText?: string;
}

type ListSnapshot = [readonly unknown[], ListPerspectivesByUserResponse | undefined][];

interface UpdateContext {
	previous: ListSnapshot;
}

function patchLists(
	items: (list: PerspectiveItem[]) => PerspectiveItem[],
): (old: ListPerspectivesByUserResponse | undefined) => ListPerspectivesByUserResponse | undefined {
	return (old) => (old ? { perspectives: { ...old.perspectives, items: items(old.perspectives.items) } } : old);
}

/** undefined (the key was omitted) keeps the cached value; anything else — including
 *  explicit null — overwrites it. This mirrors the server's tri-state Update(): a
 *  field the caller didn't mention stays put, one they set to null gets cleared. */
function pick<T>(next: T | undefined, prev: T): T {
	return next === undefined ? prev : next;
}

/** Apply the submitted fields onto the cached row. See pick() above for the
 *  undefined-vs-null-vs-value semantics — this optimistic patch mirrors what the
 *  server does in perspective_service.go's Update(), so a cleared field shows
 *  cleared immediately instead of only after the response replaces the row. */
function applyEdit(p: PerspectiveItem, input: UpdatePerspectiveInput): PerspectiveItem {
	return {
		...p,
		quality: pick(input.quality, p.quality),
		agreement: pick(input.agreement, p.agreement),
		importance: pick(input.importance, p.importance),
		confidence: pick(input.confidence, p.confidence),
		like: pick(input.like, p.like),
		review: pick(input.review, p.review),
		// The server stores a cleared customFields as an absent/null column, same as
		// a perspective that never had one — no need for a separate "{}" convention.
		customFields: pick(input.customFields, p.customFields),
		feelings: pick(input.feelings as FeelingEntry[] | null | undefined, p.feelings),
		privacy: input.privacy ?? p.privacy,
		hermeneuticApproachID:
			input.hermeneuticApproachID !== undefined
				? String(input.hermeneuticApproachID)
				: input.hermeneuticCustomText !== undefined
					? null
					: p.hermeneuticApproachID,
		hermeneuticCustomText:
			input.hermeneuticCustomText !== undefined
				? input.hermeneuticCustomText
				: input.hermeneuticApproachID !== undefined
					? null
					: p.hermeneuticCustomText,
		updatedAt: new Date().toISOString(),
	};
}

export function useUpdatePerspective() {
	const queryClient = useQueryClient();
	// PerspectiveItem-shaped branches only — patching by id never inserts a row, so a
	// list that doesn't contain this perspective is untouched by the loop below.
	// activityFeeds() is deliberately excluded: it caches a different row shape
	// (ActivityPerspectiveItem, nested `content`, no rating fields) and is
	// privacy-filtered server-side, so a PUBLIC<->PRIVATE toggle needs a real refetch
	// to be re-filtered correctly, not a same-shape patch.
	const rowListFilters: { queryKey: readonly unknown[] }[] = [
		{ queryKey: queryKeys.perspectives.byUserLists() },
		{ queryKey: queryKeys.perspectives.byContentLists() },
	];

	return createMutation(() => ({
		mutationFn: async (input: UpdatePerspectiveInput) => {
			return graphqlRequest<UpdatePerspectiveResponse>(UPDATE_PERSPECTIVE, { input });
		},
		onMutate: async (input: UpdatePerspectiveInput): Promise<UpdateContext> => {
			await Promise.all(rowListFilters.map((f) => queryClient.cancelQueries(f)));
			const previous = rowListFilters.flatMap(
				(f) => queryClient.getQueriesData<ListPerspectivesByUserResponse>(f) as ListSnapshot,
			);
			const targetId = String(input.id);
			const edit = patchLists((list) => list.map((p) => (p.id === targetId ? applyEdit(p, input) : p)));
			for (const f of rowListFilters) {
				queryClient.setQueriesData<ListPerspectivesByUserResponse>(f, edit);
			}
			return { previous };
		},
		onError: (err: Error, _input: UpdatePerspectiveInput, context?: UpdateContext) => {
			context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));

			const message = err.message.toLowerCase();
			if (message.includes('no user selected') || message.includes('user not found')) {
				toast.error('No user selected');
			} else if (message.includes('invalid rating')) {
				toast.error('Invalid rating value');
			} else if (message.includes('at least one field')) {
				toast.error('Please fill in at least one field');
			} else {
				toast.error('Failed to update perspective. Please try again.');
			}
		},
		onSuccess: (data: UpdatePerspectiveResponse) => {
			toast.success('Perspective updated');

			const updated = data?.updatePerspective;
			if (!updated) {
				// Unexpected response shape — fall back to a full, shape-agnostic refetch.
				queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.lists() });
				return;
			}

			const swap = patchLists((list) => list.map((p) => (p.id === updated.id ? updated : p)));
			for (const f of rowListFilters) {
				queryClient.setQueriesData<ListPerspectivesByUserResponse>(f, swap);
				queryClient.invalidateQueries({ ...f, refetchType: 'none' });
			}
			// Activity rows carry nested `content` and are privacy-filtered — refetch
			// rather than patch, so e.g. a PUBLIC->PRIVATE toggle drops the row out of
			// activityFeed(false) instead of leaving it there until something else
			// happens to refetch it.
			queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.activityFeeds() });

			// Editing a perspective — including toggling its Privacy — changes this
			// content's perspectiveCount/averageRating (see useContentAggregates,
			// which now counts private perspectives too). Evict the cached aggregate
			// so the details modal doesn't keep showing pre-edit numbers for up to
			// staleTime; without this, toggling privacy off looked like it did
			// nothing until the 60s cache staleTime happened to lapse.
			if (updated.contentID) {
				queryClient.invalidateQueries({ queryKey: queryKeys.content.detail(updated.contentID) });
			}
		},
	}));
}

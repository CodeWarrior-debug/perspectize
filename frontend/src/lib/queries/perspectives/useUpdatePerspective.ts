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
	quality?: number;
	agreement?: number;
	importance?: number;
	confidence?: number;
	like?: string;
	review?: string;
	customFields?: Record<string, number>;
	feelings?: FeelingInput[];
	privacy?: 'PUBLIC' | 'PRIVATE';
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

/** Apply the submitted fields onto the cached row (omitted fields keep their value). */
function applyEdit(p: PerspectiveItem, input: UpdatePerspectiveInput): PerspectiveItem {
	return {
		...p,
		quality: input.quality ?? p.quality,
		agreement: input.agreement ?? p.agreement,
		importance: input.importance ?? p.importance,
		confidence: input.confidence ?? p.confidence,
		like: input.like ?? p.like,
		review: input.review ?? p.review,
		customFields: input.customFields ?? p.customFields,
		feelings: (input.feelings as FeelingEntry[] | undefined) ?? p.feelings,
		privacy: input.privacy ?? p.privacy,
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

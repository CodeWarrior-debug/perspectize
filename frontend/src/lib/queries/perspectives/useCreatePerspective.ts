import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	CREATE_PERSPECTIVE,
	type CreatePerspectiveResponse,
	type ListPerspectivesByUserResponse,
	type PerspectiveItem,
	type FeelingEntry,
} from './index';
import { queryKeys } from '../keys';

export interface FeelingInput {
	emoji: string;
	label?: string;
	intensity: number;
	note?: string;
}

export interface CreatePerspectiveInput {
	userID: number;
	contentID?: number;
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

interface CreateContext {
	previous: ListSnapshot;
	tempId: string;
}

/** Placeholder row shown immediately, before the server responds. */
function optimisticPerspective(input: CreatePerspectiveInput, id: string): PerspectiveItem {
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

function patchLists(
	items: (list: PerspectiveItem[]) => PerspectiveItem[],
): (old: ListPerspectivesByUserResponse | undefined) => ListPerspectivesByUserResponse | undefined {
	return (old) => (old ? { perspectives: { ...old.perspectives, items: items(old.perspectives.items) } } : old);
}

export function useCreatePerspective() {
	const queryClient = useQueryClient();
	// Only the creator's own by-user list gets an optimistic row: it's the one cached
	// list guaranteed to hold the same PerspectiveItem shape the mutation returns, and
	// it's what drives the ActivityTable/OnboardingCoach +/glasses affordance. Every
	// other cached perspective list (other users' listByUser, any listByContent,
	// both activityFeed variants) is either unrelated or a different response shape
	// (activityFeed nests `content` and has no rating fields) — those are invalidated
	// in onSuccess below instead of patched, so a create never inserts a
	// wrongly-shaped or wrongly-scoped row into them.
	const ownListFilter = (userID: number) => ({
		queryKey: queryKeys.perspectives.listByUser(userID),
		exact: true,
	});

	return createMutation(() => ({
		mutationFn: async (input: CreatePerspectiveInput) => {
			return graphqlRequest<CreatePerspectiveResponse>(CREATE_PERSPECTIVE, { input });
		},
		// Insert an optimistic row so the +/glasses affordance flips instantly.
		onMutate: async (input: CreatePerspectiveInput): Promise<CreateContext> => {
			const filter = ownListFilter(input.userID);
			await queryClient.cancelQueries(filter);
			const previous = queryClient.getQueriesData<ListPerspectivesByUserResponse>(filter) as ListSnapshot;
			const tempId = `optimistic-${Date.now()}`;
			queryClient.setQueriesData<ListPerspectivesByUserResponse>(
				filter,
				patchLists((list) => [optimisticPerspective(input, tempId), ...list]),
			);
			return { previous, tempId };
		},
		onError: (err: Error, _input: CreatePerspectiveInput, context?: CreateContext) => {
			// Roll the optimistic insert back.
			context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));

			const message = err.message.toLowerCase();
			if (message.includes('no user selected') || message.includes('user not found')) {
				toast.error('No user selected');
			} else if (message.includes('invalid rating')) {
				toast.error('Invalid rating value');
			} else if (message.includes('at least one field')) {
				toast.error('Please fill in at least one field');
			} else {
				toast.error('Failed to add perspective. Please try again.');
			}
		},
		onSuccess: (data: CreatePerspectiveResponse, input: CreatePerspectiveInput, context?: CreateContext) => {
			toast.success('Perspective added');

			const created = data?.createPerspective;
			if (!created) {
				// Unexpected response shape — fall back to a full, shape-agnostic refetch.
				queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.lists() });
				return;
			}

			const filter = ownListFilter(input.userID);
			// Swap the optimistic row for the server row (real id + timestamps).
			queryClient.setQueriesData<ListPerspectivesByUserResponse>(
				filter,
				patchLists((list) => {
					const hasTemp = context?.tempId != null && list.some((p) => p.id === context.tempId);
					return hasTemp ? list.map((p) => (p.id === context!.tempId ? created : p)) : [created, ...list];
				}),
			);
			// Own list now holds the exact server row — mark stale, no immediate refetch
			// (avoids a +/glasses flicker).
			queryClient.invalidateQueries({ ...filter, refetchType: 'none' });
			// Every other perspective list that could now be stale (other content's
			// Compare picker, the activity feeds) wasn't patched above, so refetch it if
			// mounted rather than leaving wrong data on screen.
			queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.activityFeeds() });
			if (created.contentID) {
				queryClient.invalidateQueries({
					queryKey: queryKeys.perspectives.listByContent(Number(created.contentID)),
					exact: true,
				});
			}

			// A new perspective changes this content's perspectiveCount/averageRating
			// (see useContentAggregates) — evict the cached aggregate so the details
			// modal doesn't keep showing pre-creation numbers for up to staleTime.
			if (created.contentID) {
				queryClient.invalidateQueries({ queryKey: queryKeys.content.detail(created.contentID) });
			}
		},
	}));
}

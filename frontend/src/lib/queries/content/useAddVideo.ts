import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import {
	CREATE_CONTENT_FROM_YOUTUBE,
	type CreateContentResponse,
	type CreateContentResult,
	type ContentResponse,
} from './index';
import { queryKeys } from '../keys';
import { activityContentHref } from '$lib/utils/contentLinks';

export function useAddVideo() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		// userId: 0 is the "derive from my Clerk session" sentinel — the backend
		// resolves it via auth.RequireAuth when zero.
		mutationFn: async (url: string) =>
			graphqlRequest<CreateContentResponse>(CREATE_CONTENT_FROM_YOUTUBE, { input: { url, userId: 0 } }),
		onSuccess: (data: CreateContentResponse) => {
			const result = data?.createContentFromYouTube ?? null;
			if (!result) {
				queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
				return;
			}
			const newItem = result.content;
			if (result.alreadyExisted) {
				// VIDEO-05: warn that the video already exists, and offer a way to it.
				const existingId = newItem?.id;
				toast.warning('This video has already been added', {
					action: existingId
						? { label: 'Go to video', onClick: () => goto(activityContentHref(existingId)) }
						: undefined,
				});
			} else {
				toast.success(`Added: ${newItem?.name ?? 'video'}`);
			}
			updateListCache(queryClient, result);
		},
		onError: (err: Error) => {
			console.error('[AddVideo] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('invalid youtube') || message.includes('video not found')) {
				toast.error('Invalid YouTube URL or video not found');
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to add a video');
			} else {
				toast.error('Failed to add video. Please try again.');
			}
		},
	}));
}

function updateListCache(queryClient: QueryClient, result: CreateContentResult) {
	const newItem = result?.content;
	if (!newItem) {
		// Fallback: full refetch if the response shape is unexpected
		queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		return;
	}
	// Only insert into the cache if it's a genuinely new item
	if (!result.alreadyExisted) {
		queryClient.setQueriesData<ContentResponse>({ queryKey: queryKeys.content.lists() }, (oldData) => {
			if (!oldData) return oldData;
			return {
				content: {
					...oldData.content,
					items: [newItem, ...oldData.content.items],
					totalCount: (oldData.content.totalCount ?? 0) + 1,
				},
			};
		});
	}
	// Mark stale for eventual consistency
	queryClient.invalidateQueries({ queryKey: queryKeys.content.lists(), refetchType: 'none' });
}

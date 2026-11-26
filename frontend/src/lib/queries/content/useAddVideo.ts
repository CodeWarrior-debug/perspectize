import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { silentToast } from '#lib/utils/toast.js';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_YOUTUBE, type CreateContentResponse, type ContentResponse } from './index';
import { queryKeys } from '../keys';
import { libraryContentHref } from '#lib/utils/contentLinks.js';

export interface UseAddVideoOptions {
	/** Skip the toasts (and the navigation actions on them); the caller shows its own feedback. */
	quiet?: boolean;
}

export function useAddVideo(options: UseAddVideoOptions = {}) {
	const queryClient = useQueryClient();
	const notify = options.quiet ? silentToast : toast;

	return createMutation(() => ({
		mutationFn: async (url: string) => {
			// userId: 0 is the "derive from my Clerk session" sentinel — the
			// backend resolves it via auth.RequireAuth when zero.
			return graphqlRequest<CreateContentResponse>(CREATE_CONTENT_FROM_YOUTUBE, {
				input: { url, userId: 0 },
			});
		},
		onSuccess: (data: CreateContentResponse) => {
			const result = data?.createContentFromYouTube;
			const newItem = result?.content;

			if (result?.alreadyExisted) {
				// VIDEO-05: Warn user that video already exists, and offer a way to it
				const existingId = newItem?.id;
				notify.warning('This video has already been added', {
					action: existingId
						? { label: 'Go to video', onClick: () => goto(libraryContentHref(existingId)) }
						: undefined,
				});
			} else {
				notify.success(`Added: ${newItem?.name ?? 'video'}`);
			}

			if (newItem) {
				// Only insert into cache if it's a genuinely new item
				if (!result?.alreadyExisted) {
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
				queryClient.invalidateQueries({
					queryKey: queryKeys.content.lists(),
					refetchType: 'none',
				});
			} else {
				// Fallback: full refetch if response shape is unexpected
				queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
			}
		},
		onError: (err: Error) => {
			console.error('[AddVideo] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('invalid youtube url') || message.includes('video not found')) {
				notify.error('Invalid YouTube URL or video not found');
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				notify.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				notify.error('Please sign in to add a video');
			} else {
				notify.error('Failed to add video. Please try again.');
			}
		},
	}));
}

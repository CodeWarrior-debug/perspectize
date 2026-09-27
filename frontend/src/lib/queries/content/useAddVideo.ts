import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	CREATE_CONTENT_FROM_YOUTUBE,
	CREATE_CONTENT_FROM_YOUTUBE_MUSIC,
	type CreateContentResponse,
	type CreateContentResult,
	type CreateMusicContentResponse,
	type ContentResponse,
	type RelatedMedia,
} from './index';
import { promoteRelatedMedia } from './useMusicTrack';
import { queryKeys } from '../keys';
import { classifyYouTubeUrl } from '$lib/utils/youtube';

type AddResult = CreateContentResult & { isMusic: boolean; relatedMedia: RelatedMedia[] };
type AddResponse = CreateContentResponse | CreateMusicContentResponse;

/** Normalizes either mutation's response; null if the shape is unexpected. */
export function toAddResult(data: AddResponse | null | undefined): AddResult | null {
	if (data && 'createContentFromYouTubeMusic' in data && data.createContentFromYouTubeMusic) {
		const r = data.createContentFromYouTubeMusic;
		return { ...r, isMusic: true, relatedMedia: r.content?.relatedMedia ?? [] };
	}
	if (data && 'createContentFromYouTube' in data && data.createContentFromYouTube) {
		return { ...data.createContentFromYouTube, isMusic: false, relatedMedia: [] };
	}
	return null;
}

/**
 * The one official video worth offering after a music add: not already its own
 * item and not known to be broken. Offered once, and never for a duplicate.
 */
export function promotableOfficialVideo(result: AddResult): RelatedMedia | null {
	if (!result.isMusic || result.alreadyExisted) return null;
	return result.relatedMedia.find((r) => r.kind === 'official_video' && !r.contentId && !r.unavailable) ?? null;
}

export function useAddVideo() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (url: string): Promise<AddResponse> => {
			// userId: 0 is the "derive from my Clerk session" sentinel — the
			// backend resolves it via auth.RequireAuth when zero.
			const input = { input: { url, userId: 0 } };
			if (classifyYouTubeUrl(url) === 'musicTrack') {
				return graphqlRequest<CreateMusicContentResponse>(CREATE_CONTENT_FROM_YOUTUBE_MUSIC, input);
			}
			return graphqlRequest<CreateContentResponse>(CREATE_CONTENT_FROM_YOUTUBE, input);
		},
		onSuccess: (data: AddResponse) => {
			const result = toAddResult(data);
			if (!result) {
				queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
				return;
			}
			const newItem = result.content;
			const noun = result.isMusic ? 'song' : 'video';

			if (result?.alreadyExisted) {
				toast.warning(`This ${noun} has already been added`);
			} else {
				toast.success(`Added: ${newItem?.name ?? noun}`);
			}

			const official = promotableOfficialVideo(result);
			if (official && newItem) {
				toast('This song also has an official video.', {
					description: 'Add it separately?',
					action: {
						label: 'Add video',
						onClick: () => {
							promoteRelatedMedia(newItem.id, official.videoId)
								.then((item) => {
									toast.success(`Added: ${item.name}`);
									queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
								})
								.catch(() => toast.error('Could not add that video. Please try again.'));
						},
					},
				});
			}

			updateListCache(queryClient, result);
		},
		onError: (err: Error) => {
			console.error('[AddVideo] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('not an album, playlist, or artist')) {
				toast.error('Paste a song link, not an album, playlist, or artist');
			} else if (message.includes('invalid youtube') || message.includes('video not found')) {
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

function updateListCache(queryClient: QueryClient, result: AddResult) {
	const newItem = result?.content;
	if (!newItem) {
		// Fallback: full refetch if response shape is unexpected
		queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		return;
	}
	// Only insert into cache if it's a genuinely new item
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

import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_PASSAGE, type CreateContentFromPassageResponse } from '../bible';
import { queryKeys } from '../keys';
import type { PassageRange } from '$lib/utils/bible';
import { activityContentHref } from '$lib/utils/contentLinks';

/**
 * "See <ref> only": jumps from a longer passage to a narrower one (e.g. a single
 * verse). The server find-or-creates the passage row, so this one call covers
 * both "already exists → go there" and "doesn't exist → add it, then go there".
 */
export function useOpenPassage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (range: PassageRange) =>
			graphqlRequest<CreateContentFromPassageResponse>(CREATE_CONTENT_FROM_PASSAGE, {
				input: {
					bookID: range.bookId,
					startChapter: range.startChapter,
					startVerse: range.startVerse,
					endChapter: range.endChapter,
					endVerse: range.endVerse,
					userID: 0,
				},
			}),
		onSuccess: (data) => {
			const id = data?.createContentFromPassage?.id;
			// The row may be brand new, so lists must refetch before it can show up there.
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
			if (id) goto(activityContentHref(id));
		},
		onError: (err: Error) => {
			console.error('[OpenPassage] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to open this passage');
			} else {
				toast.error('Failed to open passage. Please try again.');
			}
		},
	}));
}

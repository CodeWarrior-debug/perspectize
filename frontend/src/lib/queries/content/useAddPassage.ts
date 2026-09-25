import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_PASSAGE, type CreateContentFromPassageResponse } from '../bible';
import { queryKeys } from '../keys';
import type { PassageRange } from '$lib/utils/bible';

export function useAddPassage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (range: PassageRange) =>
			// Always the authenticated wrapper. userID 0 = derive from Clerk session.
			// Canonical name/url are regenerated server-side from these numbers.
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
			const passage = data?.createContentFromPassage;
			toast.success(`Added: ${passage?.displayTitle ?? passage?.name ?? 'passage'}`);
			// Idempotent server call: new or pre-existing rows both come back as
			// Content, so refetch lists instead of blindly prepending (no duplicates).
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			console.error('[AddPassage] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to add a passage');
			} else {
				toast.error('Failed to add passage. Please try again.');
			}
		},
	}));
}

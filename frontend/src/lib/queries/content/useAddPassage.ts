import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { silentToast } from '#lib/utils/toast.js';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_PASSAGE, type CreateContentFromPassageResponse } from '../bible';
import { evictAfterContentCreated } from './contentCreatedEviction';
import type { PassageRange } from '#lib/utils/bible.js';
import { libraryContentHref } from '#lib/utils/contentLinks.js';

export interface UseAddPassageOptions {
	/** Skip the toasts (and the navigation actions on them); the caller shows its own feedback. */
	quiet?: boolean;
}

export function useAddPassage(options: UseAddPassageOptions = {}) {
	const queryClient = useQueryClient();
	const notify = options.quiet ? silentToast : toast;

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
			// The server doesn't say whether the row already existed (find-or-create),
			// so both cases get a way to jump to it.
			const id = passage?.id;
			notify.success(`Added: ${passage?.displayTitle ?? passage?.name ?? 'passage'}`, {
				action: id ? { label: 'Go to passage', onClick: () => goto(libraryContentHref(id)) } : undefined,
			});
			// Idempotent server call: new or pre-existing rows both come back as
			// Content, so refetch lists instead of blindly prepending (no duplicates).
			evictAfterContentCreated(queryClient);
		},
		onError: (err: Error) => {
			console.error('[AddPassage] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('load failed') || message.includes('failed to fetch')) {
				notify.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				notify.error('Please sign in to add a passage');
			} else {
				notify.error('Failed to add passage. Please try again.');
			}
		},
	}));
}

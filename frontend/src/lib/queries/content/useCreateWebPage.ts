import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { graphqlRequest } from '../client';
import { CREATE_CONTENT_FROM_WEB_PAGE, type CreateContentFromWebPageResponse, type WebPageRole } from './index';
import { queryKeys } from '../keys';
import { libraryContentHref } from '$lib/utils/contentLinks';

export interface CreateWebPageArgs {
	url: string;
	/** Omit or pass [] for a plain webpage. Order is kept: the first role is the primary one. */
	webPageRoles?: WebPageRole[];
}

export function useCreateWebPage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		// Always the authenticated wrapper; the server derives the user from the session.
		mutationFn: async ({ url, webPageRoles }: CreateWebPageArgs) =>
			graphqlRequest<CreateContentFromWebPageResponse>(CREATE_CONTENT_FROM_WEB_PAGE, {
				// `webPageRoles` is left out entirely when none are picked, so the server stores a plain webpage.
				input: webPageRoles?.length ? { url, webPageRoles } : { url },
			}),
		onSuccess: (data: CreateContentFromWebPageResponse) => {
			const result = data?.createContentFromWebPage;
			const content = result?.content;
			const id = content?.id;
			const name = content?.name ?? 'webpage';
			// Already saved is a success too: say so, and still offer the way to the row.
			const message = result?.alreadyExisted ? `Already saved: ${name}` : `Added: ${name}`;
			toast.success(message, {
				action: id ? { label: 'Go to webpage', onClick: () => goto(libraryContentHref(id)) } : undefined,
			});
			// Refetch lists instead of prepending: an existing row can come back (no duplicates).
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			console.error('[CreateWebPage] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to add a webpage');
			} else {
				toast.error('Failed to add webpage. Please try again.');
			}
		},
	}));
}

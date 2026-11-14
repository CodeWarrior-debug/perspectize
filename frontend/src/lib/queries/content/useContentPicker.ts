import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { queryKeys } from '../keys';
import { LIST_CONTENT_PICKER, type ContentPickerResponse } from './index';

/** Most recent first, so an empty search still offers something to pick. */
const PICKER_PAGE_SIZE = 20;

/**
 * Content matching a search term, optionally narrowed to some content types
 * (`ContentType` enum values; empty = every type). Pass the debounced term.
 */
export function useContentPicker(opts: () => { search: string; types: readonly string[] }) {
	return createQuery(() => {
		const { search, types } = opts();
		const sortedTypes = [...types].sort();
		return {
			queryKey: queryKeys.content.itemPicker(search, sortedTypes),
			queryFn: () =>
				graphqlRequest<ContentPickerResponse>(LIST_CONTENT_PICKER, {
					first: PICKER_PAGE_SIZE,
					filter: {
						...(search ? { search } : {}),
						...(sortedTypes.length > 0 ? { contentTypes: sortedTypes } : {}),
					},
				}),
			staleTime: 30 * 1000,
			// Keep the previous results on screen while the next search loads, so the list doesn't flash empty per keystroke.
			placeholderData: keepPreviousData,
		};
	});
}

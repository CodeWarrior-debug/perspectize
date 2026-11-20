import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { PREVIEW_WEB_PAGE, type PreviewWebPageResponse, type WebPagePreview } from './index';
import { queryKeys } from '../keys';

/**
 * The page is read once and its metadata rarely changes, so re-opening the Add dialog for the same
 * link within ten minutes costs no request. Deliberate, not the default 0.
 */
export const WEB_PAGE_PREVIEW_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * Import preview for one webpage url (`previewWebPage`, which writes nothing).
 *
 * `getUrl` must already be debounced by the caller: detection runs on every keystroke, and the
 * Add dialog owns the timer (see CategoryTypeahead for the pattern). `null` disables the query.
 */
export function useWebPagePreview(getUrl: () => string | null) {
	return createQuery(() => {
		// Read the url synchronously, so the key and the request always agree on it.
		const url = getUrl();
		return {
			queryKey: queryKeys.content.webPagePreview(url ?? ''),
			queryFn: async (): Promise<WebPagePreview | null> => {
				if (url === null) return null;
				// Always the authenticated wrapper, like every other content request.
				const res = await graphqlRequest<PreviewWebPageResponse>(PREVIEW_WEB_PAGE, { url });
				return res.previewWebPage ?? null;
			},
			enabled: url !== null,
			staleTime: WEB_PAGE_PREVIEW_STALE_TIME_MS,
		};
	});
}

/**
 * The Library page: the shared content library for all Perspectize members.
 * `/` sends signed-in visitors here (see src/routes/+page.svelte), so links
 * from before the rename (when this page was "Activity" at `/`) keep working.
 */
export const LIBRARY_PATH = '/content-library';

/**
 * Deep link to a content item's details on the Library page. The page reads
 * `?open=<id>`, opens the details modal for that item (fetching it by ID when
 * it isn't in the loaded rows), then strips the param so it doesn't stick.
 */
export const OPEN_CONTENT_PARAM = 'open';

export function libraryContentHref(contentId: string): string {
	return `${LIBRARY_PATH}?${OPEN_CONTENT_PARAM}=${encodeURIComponent(contentId)}`;
}

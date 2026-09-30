/**
 * Deep link to a content item's details on the Activity page. The page reads
 * `?open=<id>`, opens the details modal for that item (fetching it by ID when
 * it isn't in the loaded rows), then strips the param so it doesn't stick.
 */
export const OPEN_CONTENT_PARAM = 'open';

export function activityContentHref(contentId: string): string {
	return `/?${OPEN_CONTENT_PARAM}=${encodeURIComponent(contentId)}`;
}

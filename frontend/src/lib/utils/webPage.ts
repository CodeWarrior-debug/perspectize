/**
 * Webpage helpers shared by the Add dialog, the Activity grid and the details view.
 * Pure functions only: no reactive state, no network.
 */
import type { ContentItem, WebPageFetch, WebPageRole } from '$lib/queries/content';

/** The roles an adder can pick, in the order the dropdown lists them. */
export const WEB_PAGE_ROLE_OPTIONS: ReadonlyArray<{ value: WebPageRole; label: string }> = [
	{ value: 'BLOG_POST', label: 'Blog post' },
	{ value: 'SESSION_TRANSCRIPT', label: 'Session transcript' },
];

const ROLE_LABELS = new Map<string, string>(WEB_PAGE_ROLE_OPTIONS.map((o) => [o.value, o.label]));

/** One role's label. An unknown value (a later enum the client does not know yet) shows as-is. */
export function webPageRoleLabel(role: string): string {
	return ROLE_LABELS.get(role) ?? role;
}

/**
 * The Type tile: the roles in stored order, joined with a comma. No roles reads as a plain
 * "Webpage", never as unknown: a missing role is an empty list, not a guess.
 */
export function webPageRolesLabel(roles: readonly string[] | null | undefined): string {
	if (!roles || roles.length === 0) return 'Webpage';
	return roles.map(webPageRoleLabel).join(', ');
}

/**
 * What the Add dialog says when the page's details could not be read. Null when the details
 * were read (OK) or there is no fetch yet. Save stays open in every case: a failed read never
 * blocks the add. A missing HTTP status is left out, never printed as "HTTP null".
 */
export function webPageReadNotice(fetch: WebPageFetch | null | undefined): string | null {
	if (!fetch || fetch.status === 'OK') return null;
	const save = 'You can still save the link.';
	switch (fetch.status) {
		case 'BLOCKED':
			return fetch.httpStatus == null
				? `We couldn't read this page's details. ${save}`
				: `We couldn't read this page's details (HTTP ${fetch.httpStatus}). ${save}`;
		case 'NOT_HTML':
			return "This link isn't an HTML page, so there are no details to read. You can still save it.";
		default:
			return `We couldn't read this page's details. ${save}`;
	}
}

/** The row shape these readers need: the url plus the shaped list payload. */
type WebPageRow = Pick<ContentItem, 'url' | 'webPage'>;

/** The host of a url without `www.`, or null when it does not parse. */
export function webPageHost(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.replace(/^www\./i, '') || null;
	} catch {
		return null;
	}
}

/** Site column: the site name, else the domain, else the url's host. Null only when there is no url at all. */
export function webPageSite(row: WebPageRow): string | null {
	return row.webPage?.siteName || row.webPage?.domain || webPageHost(row.url);
}

/** Published column: the date the page declares, or null (shown as a dash, with a tooltip). */
export function webPagePublished(row: WebPageRow): string | null {
	return row.webPage?.publishedAt || null;
}

/** Roles pills: the stored roles in order. `[]` when there is no metadata (a plain webpage). */
export function webPageRolesOf(row: WebPageRow): WebPageRole[] {
	return row.webPage?.webPageRoles ?? [];
}

/** Author column: the author the page declares, or null (shown as a dash, never "Unknown"). */
export function webPageAuthor(row: WebPageRow): string | null {
	return row.webPage?.author || null;
}

/**
 * Webpage cell renderers and value getters for the Activity grid. Pure DOM builders, no reactive
 * state. The shaped row helpers (site, published, roles, author) live in ./webPage.ts.
 */
import type { ContentItem, WebPageRole } from '#lib/queries/content/index.js';
import { EMPTY_VALUE, formatPublishDate, parseDateValue } from './formatting';
import { webPageAuthor, webPagePublished, webPageRoleLabel, webPageRolesOf, webPageSite } from './webPage';

type WebPageRow = Pick<ContentItem, 'url' | 'webPage'>;

/** Site column: the site name as plain text, or the dash when there is no url at all. */
export function webSiteCellRenderer(params: { data?: WebPageRow }): HTMLElement | string {
	if (!params.data) return '';
	const span = document.createElement('span');
	span.className = 'truncate';
	span.textContent = webPageSite(params.data) ?? EMPTY_VALUE;
	return span;
}

/** Published column sort/filter value: the declared ISO date, or null (sorted last). */
export function webPublishedValueGetter(params: { data?: WebPageRow }): string | null {
	return params.data ? webPagePublished(params.data) : null;
}

/** Published column filter value: a Date for the date filter, or null when the page declares none. */
export function webPublishedFilterValueGetter(params: { data?: WebPageRow }): Date | null {
	const iso = webPublishedValueGetter(params);
	return iso ? parseDateValue(iso) : null;
}

/** Published column display: the formatted date, or the dash. */
export function formatWebPublished(value: string | null | undefined): string {
	return formatPublishDate(value ?? null);
}

/** Roles column: one pill per role in stored order; the dash when the page has no role. */
export function webRolesCellRenderer(params: { data?: WebPageRow }): HTMLElement | string {
	if (!params.data) return '';
	const roles: WebPageRole[] = webPageRolesOf(params.data);
	const wrap = document.createElement('div');
	wrap.className = 'flex h-full w-full min-w-0 items-center gap-1 overflow-hidden';
	if (roles.length === 0) {
		const dash = document.createElement('span');
		dash.textContent = EMPTY_VALUE;
		wrap.appendChild(dash);
		return wrap;
	}
	for (const role of roles) {
		const pill = document.createElement('span');
		pill.className = 'whitespace-nowrap rounded-full border border-border bg-muted px-2 py-px text-xs text-foreground';
		pill.textContent = webPageRoleLabel(role);
		wrap.appendChild(pill);
	}
	return wrap;
}

/** Author column: the declared author, or the dash (never "Unknown"). */
export function webAuthorCellRenderer(params: { data?: WebPageRow }): HTMLElement | string {
	if (!params.data) return '';
	const span = document.createElement('span');
	span.className = 'truncate';
	span.textContent = webPageAuthor(params.data) ?? EMPTY_VALUE;
	return span;
}

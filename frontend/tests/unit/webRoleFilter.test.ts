import { describe, it, expect } from 'vitest';
import { WebRoleFilter } from '#lib/utils/contentTypeFilter.js';
import { parseGridParams, urlParamsToFilter, urlParamsToGraphQLFilter } from '#lib/utils/gridUrlState.js';
import { activityListRequest } from '#lib/queries/content/activityList.js';
import type { ContentItem } from '#lib/queries/content/index.js';

const row = (webPageRoles: string[] | null): ContentItem =>
	({
		id: 1,
		name: 'A page',
		url: 'https://www.example.com/post',
		contentType: 'WEB_PAGE',
		webPage: webPageRoles === null ? null : { webPageRoles },
	}) as unknown as ContentItem;

/** Build a WebRoleFilter, mount its GUI and tick the given values (URL form). */
function filterWith(ticked: string[]) {
	const filter = new WebRoleFilter();
	let changes = 0;
	filter.init({
		filterChangedCallback: () => changes++,
		filterModifiedCallback: () => {},
		doesRowPassOtherFilter: () => true,
		column: {} as never,
		api: {} as never,
		columnApi: {} as never,
		context: {},
		getValue: () => undefined,
		filterParams: {},
		colDef: {},
		node: {} as never,
		data: undefined,
	} as never);
	document.body.replaceChildren(filter.getGui());
	for (const value of ticked) {
		const input = filter.getGui().querySelector<HTMLInputElement>(`input[value="${value}"]`);
		if (!input) throw new Error(`no checkbox for ${value}`);
		input.checked = true;
		input.dispatchEvent(new Event('change'));
	}
	return { filter, changes: () => changes };
}

describe('WebRoleFilter (Roles column)', () => {
	it('offers the two roles, Blog post and Session transcript, in that order', () => {
		const { filter } = filterWith([]);
		const labels = [...filter.getGui().querySelectorAll('label')].map((l) => l.textContent);
		expect(labels.slice(0, 2)).toEqual(['Blog post', 'Session transcript']);
	});

	it('a row passes when it has the ticked role', () => {
		const { filter } = filterWith(['blog_post']);
		expect(filter.doesFilterPass({ data: row(['BLOG_POST']) } as never)).toBe(true);
		expect(filter.doesFilterPass({ data: row(['SESSION_TRANSCRIPT']) } as never)).toBe(false);
	});

	it('a page with both roles passes when either is ticked (OR)', () => {
		const both = row(['BLOG_POST', 'SESSION_TRANSCRIPT']);
		expect(filterWith(['session_transcript']).filter.doesFilterPass({ data: both } as never)).toBe(true);
		expect(filterWith(['blog_post']).filter.doesFilterPass({ data: both } as never)).toBe(true);
	});

	it('a plain webpage (no role) never passes an active role filter', () => {
		expect(filterWith(['blog_post']).filter.doesFilterPass({ data: row([]) } as never)).toBe(false);
		expect(filterWith(['blog_post']).filter.doesFilterPass({ data: row(null) } as never)).toBe(false);
	});

	it('emits the model in option order, lowercase, regardless of click order', () => {
		const { filter } = filterWith(['session_transcript', 'blog_post']);
		expect(filter.getModel()).toEqual({ filterType: 'set', values: ['blog_post', 'session_transcript'] });
	});

	it('is inactive with nothing ticked', () => {
		expect(filterWith([]).filter.getModel()).toBeNull();
	});
});

describe('f.webrole URL param', () => {
	it('maps to ContentFilter.webPageRoles in uppercase, in URL order', () => {
		const filter = urlParamsToGraphQLFilter({ webrole: 'session_transcript,blog_post' }, '');
		expect(filter?.webPageRoles).toEqual(['SESSION_TRANSCRIPT', 'BLOG_POST']);
	});

	it('drops unknown roles, and sends nothing when none are known', () => {
		expect(urlParamsToGraphQLFilter({ webrole: 'podcast' }, '')).toBeUndefined();
		expect(urlParamsToGraphQLFilter({ webrole: 'podcast,blog_post' }, '')?.webPageRoles).toEqual(['BLOG_POST']);
	});

	it('round-trips to the Roles set filter model in the AG Grid filter model', () => {
		expect(urlParamsToFilter({ webrole: 'blog_post' })).toEqual({
			webRoles: { filterType: 'set', values: ['blog_post'] },
		});
	});
});

describe('Roles filter cache key', () => {
	it('changes the Activity list key when the roles filter changes, and not otherwise', () => {
		const base = activityListRequest(parseGridParams(new URLSearchParams('mode=all&f.type=web_page')), null);
		const blog = activityListRequest(
			parseGridParams(new URLSearchParams('mode=all&f.type=web_page&f.webrole=blog_post')),
			null,
		);
		const session = activityListRequest(
			parseGridParams(new URLSearchParams('mode=all&f.type=web_page&f.webrole=session_transcript')),
			null,
		);
		expect(blog.queryKey).not.toEqual(base.queryKey);
		expect(blog.queryKey).not.toEqual(session.queryKey);
		expect(blog.variables.filter).toMatchObject({ webPageRoles: ['BLOG_POST'] });
	});
});

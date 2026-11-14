import { describe, it, expect } from 'vitest';
import { WEB_PAGE_ROLE_OPTIONS, webPageReadNotice, webPageRoleLabel, webPageRolesLabel } from '$lib/utils/webPage';
import type { WebPageFetch } from '$lib/queries/content';

const fetchOf = (status: WebPageFetch['status'], httpStatus: number | null = null): WebPageFetch => ({
	status,
	httpStatus,
	at: '2026-11-11T12:00:00Z',
});

describe('WEB_PAGE_ROLE_OPTIONS', () => {
	it('offers exactly Blog post and Session transcript, in that order', () => {
		expect(WEB_PAGE_ROLE_OPTIONS).toEqual([
			{ value: 'BLOG_POST', label: 'Blog post' },
			{ value: 'SESSION_TRANSCRIPT', label: 'Session transcript' },
		]);
	});
});

describe('webPageRoleLabel', () => {
	it('labels each role', () => {
		expect(webPageRoleLabel('BLOG_POST')).toBe('Blog post');
		expect(webPageRoleLabel('SESSION_TRANSCRIPT')).toBe('Session transcript');
	});
});

describe('webPageRolesLabel (the Type tile: "Webpage" when there are no roles)', () => {
	it('no roles reads as a plain Webpage, never as unknown', () => {
		expect(webPageRolesLabel([])).toBe('Webpage');
		expect(webPageRolesLabel(null)).toBe('Webpage');
		expect(webPageRolesLabel(undefined)).toBe('Webpage');
	});

	it('one role', () => {
		expect(webPageRolesLabel(['BLOG_POST'])).toBe('Blog post');
	});

	it('two roles keep the stored (pick) order, joined with a comma', () => {
		expect(webPageRolesLabel(['SESSION_TRANSCRIPT', 'BLOG_POST'])).toBe('Session transcript, Blog post');
	});
});

describe('webPageReadNotice (what the add dialog says when the page could not be read)', () => {
	it('no fetch yet: nothing to say', () => {
		expect(webPageReadNotice(null)).toBeNull();
	});

	it('OK: nothing to say, the details are shown', () => {
		expect(webPageReadNotice(fetchOf('OK', 200))).toBeNull();
	});

	it('BLOCKED names the HTTP status and keeps Save open', () => {
		expect(webPageReadNotice(fetchOf('BLOCKED', 403))).toBe(
			"We couldn't read this page's details (HTTP 403). You can still save the link.",
		);
	});

	it('BLOCKED without a status never prints "HTTP null"', () => {
		expect(webPageReadNotice(fetchOf('BLOCKED', null))).toBe(
			"We couldn't read this page's details. You can still save the link.",
		);
	});

	it('NOT_HTML says there is no page to read, not that the read failed', () => {
		expect(webPageReadNotice(fetchOf('NOT_HTML', 200))).toBe(
			"This link isn't an HTML page, so there are no details to read. You can still save it.",
		);
	});

	it('TIMEOUT has no HTTP status and never prints one', () => {
		expect(webPageReadNotice(fetchOf('TIMEOUT', null))).toBe(
			"We couldn't read this page's details. You can still save the link.",
		);
	});

	it('ERROR (network or 5xx) reads as a generic failure', () => {
		expect(webPageReadNotice(fetchOf('ERROR', 502))).toBe(
			"We couldn't read this page's details. You can still save the link.",
		);
	});

	it('TOO_LARGE reads as a generic failure', () => {
		expect(webPageReadNotice(fetchOf('TOO_LARGE', 200))).toBe(
			"We couldn't read this page's details. You can still save the link.",
		);
	});
});

describe('webpage row readers (list rows carry the shaped webPage payload)', () => {
	const row = (over: Record<string, unknown> = {}) =>
		({
			id: '1',
			name: 'Attention Is All You Need',
			url: 'https://www.arxiv.org/abs/1706.03762',
			contentType: 'WEB_PAGE',
			webPage: null,
			...over,
		}) as never;

	it('site falls back to the domain, then to the url host, when no site name is set', async () => {
		const { webPageSite } = await import('$lib/utils/webPage');
		expect(webPageSite(row({ webPage: { siteName: 'arXiv.org', domain: 'arxiv.org', webPageRoles: [] } }))).toBe(
			'arXiv.org',
		);
		expect(webPageSite(row({ webPage: { siteName: null, domain: 'arxiv.org', webPageRoles: [] } }))).toBe('arxiv.org');
		expect(webPageSite(row({ webPage: null }))).toBe('arxiv.org');
	});

	it('site is null when there is no url and no metadata', async () => {
		const { webPageSite } = await import('$lib/utils/webPage');
		expect(webPageSite(row({ url: null, webPage: null }))).toBeNull();
	});

	it('published date is null (never a guess) when the page declares none', async () => {
		const { webPagePublished } = await import('$lib/utils/webPage');
		expect(webPagePublished(row({ webPage: { publishedAt: '2017-06-12', webPageRoles: [] } }))).toBe('2017-06-12');
		expect(webPagePublished(row({ webPage: { publishedAt: null, webPageRoles: [] } }))).toBeNull();
		expect(webPagePublished(row({ webPage: null }))).toBeNull();
	});

	it('roles are the stored list, and [] when there is no metadata', async () => {
		const { webPageRolesOf } = await import('$lib/utils/webPage');
		expect(webPageRolesOf(row({ webPage: { webPageRoles: ['BLOG_POST'] } }))).toEqual(['BLOG_POST']);
		expect(webPageRolesOf(row({ webPage: null }))).toEqual([]);
	});

	it('author is null when the page declares none (the Author column shows a dash, never "Unknown")', async () => {
		const { webPageAuthor } = await import('$lib/utils/webPage');
		expect(webPageAuthor(row({ webPage: { author: 'Jane Doe', webPageRoles: [] } }))).toBe('Jane Doe');
		expect(webPageAuthor(row({ webPage: { author: null, webPageRoles: [] } }))).toBeNull();
	});
});

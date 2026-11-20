import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WebPageTiles from '#lib/components/WebPageTiles.svelte';
import { formatDateTime } from '#lib/utils/formatting.js';

/** The value shown under a tile's label. */
function tileValue(label: string): string {
	const tile = screen.getByText(label, { selector: 'div' }).parentElement;
	return tile?.lastElementChild?.textContent?.trim() ?? '';
}

const base = {
	url: 'https://www.example.com/post',
	description: null,
	primaryCategory: null,
	createdAt: '2026-11-01T12:00:00Z',
	publishedAt: null,
	webPage: { siteName: 'Example Blog', domain: 'example.com', author: null, publishedAt: null, webPageRoles: [] },
	response: null,
};

function withRoles(webPageRoles: string[], extra: Record<string, unknown> = {}) {
	return { ...base, webPage: { ...base.webPage, webPageRoles }, ...extra } as never;
}

describe('WebPageTiles: Type tile', () => {
	it('shows "Blog post" for a blog post', () => {
		render(WebPageTiles, { props: { row: withRoles(['BLOG_POST']) } });
		expect(tileValue('Type')).toBe('Blog post');
	});

	it('shows both roles, in stored order, for a page with both', () => {
		render(WebPageTiles, { props: { row: withRoles(['BLOG_POST', 'SESSION_TRANSCRIPT']) } });
		expect(tileValue('Type')).toBe('Blog post, Session transcript');
	});

	it('shows "Webpage" for a plain page with no role', () => {
		render(WebPageTiles, { props: { row: withRoles([]) } });
		expect(tileValue('Type')).toBe('Webpage');
	});
});

describe('WebPageTiles: Author tile', () => {
	it('shows the author only when the page declares one', () => {
		const row = { ...base, webPage: { ...base.webPage, author: 'Jane Doe' } } as never;
		render(WebPageTiles, { props: { row } });
		expect(tileValue('Author')).toBe('Jane Doe');
	});

	it('has no Author tile when no author is set, never "Unknown"', () => {
		render(WebPageTiles, { props: { row: withRoles([]) } });
		expect(screen.queryByText('Author', { selector: 'div' })).toBeNull();
		expect(screen.queryByText(/unknown/i)).toBeNull();
	});
});

describe('WebPageTiles: Fetched tile', () => {
	it('shows the date and the time the page was read, in local time', () => {
		const at = '2026-11-10T12:30:00Z';
		const row = { ...base, response: { fetch: { status: 'OK', httpStatus: 200, at } } } as never;
		render(WebPageTiles, { props: { row } });
		expect(tileValue('Fetched')).toBe(formatDateTime(at));
	});

	it('shows a dash, not a status, when there is no fetch record', () => {
		render(WebPageTiles, { props: { row: withRoles([]) } });
		expect(tileValue('Fetched')).toBe('—');
	});
});

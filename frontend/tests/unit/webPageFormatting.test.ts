import { describe, it, expect } from 'vitest';
import {
	webAuthorCellRenderer,
	webPublishedValueGetter,
	webRolesCellRenderer,
	webSiteCellRenderer,
} from '#lib/utils/webPageFormatting.js';
import { typeCellRenderer } from '#lib/utils/formatting.js';
import { libraryItemCellRenderer } from '#lib/utils/libraryItemCellRenderer.js';

const page = (overrides: Record<string, unknown> = {}, url = 'https://www.example.com/post') =>
	({
		url,
		webPage: {
			siteName: null,
			domain: null,
			imageUrl: null,
			faviconUrl: null,
			publishedAt: null,
			author: null,
			webPageRoles: [],
			...overrides,
		},
	}) as never;

function text(el: HTMLElement | string): string {
	return typeof el === 'string' ? el : (el.textContent ?? '');
}

describe('webRolesCellRenderer', () => {
	it('shows the dash and no pills when the page has no role', () => {
		const el = webRolesCellRenderer({ data: page() }) as HTMLElement;
		expect(el.querySelectorAll('span.rounded-full')).toHaveLength(0);
		expect(text(el)).toBe('—');
	});

	it('shows one pill per role, in stored order, with the readable label', () => {
		const el = webRolesCellRenderer({
			data: page({ webPageRoles: ['SESSION_TRANSCRIPT', 'BLOG_POST'] }),
		}) as HTMLElement;
		const pills = [...el.querySelectorAll('span.rounded-full')].map((p) => p.textContent);
		expect(pills).toEqual(['Session transcript', 'Blog post']);
	});

	it('returns nothing for a row with no data', () => {
		expect(webRolesCellRenderer({})).toBe('');
	});
});

describe('webSiteCellRenderer', () => {
	it('shows the site name when the page declares one', () => {
		expect(text(webSiteCellRenderer({ data: page({ siteName: 'Example Blog' }) }))).toBe('Example Blog');
	});

	it('falls back to the host, without www., when there is no site name', () => {
		expect(text(webSiteCellRenderer({ data: page() }))).toBe('example.com');
	});
});

describe('webAuthorCellRenderer', () => {
	it('shows the declared author', () => {
		expect(text(webAuthorCellRenderer({ data: page({ author: 'Jane Doe' }) }))).toBe('Jane Doe');
	});

	it('shows the dash, never Unknown, when no author is declared', () => {
		expect(text(webAuthorCellRenderer({ data: page() }))).toBe('—');
	});
});

describe('webPublishedValueGetter', () => {
	it('is null when the page declares no published date (sorted last, shown as a dash)', () => {
		expect(webPublishedValueGetter({ data: page() })).toBeNull();
	});

	it('returns the declared date', () => {
		expect(webPublishedValueGetter({ data: page({ publishedAt: '2024-03-05T12:00:00Z' }) })).toBe(
			'2024-03-05T12:00:00Z',
		);
	});
});

describe('type icon for a webpage row', () => {
	it('labels the icon Webpage and draws no YouTube red', () => {
		const el = typeCellRenderer({ data: { contentType: 'WEB_PAGE' } }) as HTMLElement;
		expect(el.title).toBe('Webpage');
		expect(el.innerHTML).not.toContain('FF0000');
	});
});

describe('item cell for a webpage row', () => {
	const data = (overrides: Record<string, unknown> = {}) => ({
		id: 9,
		name: 'A post title',
		url: 'https://www.example.com/post',
		contentType: 'WEB_PAGE',
		webPage: { faviconUrl: 'https://www.example.com/favicon.ico' },
		...overrides,
	});

	it('shows the title with no play overlay (a page is not a video)', () => {
		const el = libraryItemCellRenderer({ data: data() as never }) as HTMLElement;
		expect(el.querySelector('[data-testid="item-title"]')?.textContent).toBe('A post title');
		expect(el.innerHTML).not.toContain('polygon');
	});

	it('loads the favicon without a referrer', () => {
		const el = libraryItemCellRenderer({ data: data() as never }) as HTMLElement;
		const img = el.querySelector('img') as HTMLImageElement;
		expect(img.getAttribute('src')).toBe('https://www.example.com/favicon.ico');
		expect(img.referrerPolicy).toBe('no-referrer');
	});

	it('leaves the thumbnail slot empty when there is no favicon', () => {
		const el = libraryItemCellRenderer({ data: data({ webPage: null }) as never }) as HTMLElement;
		expect(el.querySelector('img')).toBeNull();
		expect(el.querySelector('[data-testid="item-thumb"]')).not.toBeNull();
	});
});

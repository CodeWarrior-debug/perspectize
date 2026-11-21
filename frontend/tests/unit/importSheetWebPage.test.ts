import { describe, it, expect } from 'vitest';
import { factColumnDef, formatFact, titleCellRenderer, type ImportRow } from '#lib/utils/import-sheet.js';
import { formatCount } from '#lib/utils/formatting.js';

// Webpage (PAGE) rows on the import sheet: Words, Reading time, Comments, Roles.

const pageRow = (facts: Record<string, unknown>): ImportRow =>
	({
		id: 1,
		title: 'A post',
		url: 'https://jordans-journey.com/a',
		destinationType: 'WEB_PAGE',
		sourceTitle: "Jordan's Journey",
		facts: { kind: 'PAGE', ...facts },
		details: null,
		inLibrary: false,
		importStatus: null,
		excluded: false,
	}) as unknown as ImportRow;

const videoRow = (): ImportRow =>
	({
		id: 2,
		title: 'A video',
		url: 'https://youtube.com/watch?v=x',
		destinationType: 'YOUTUBE_VIDEO',
		sourceTitle: 'Channel',
		facts: { kind: 'VIDEO', durationSeconds: 300 },
		details: null,
		inLibrary: false,
		importStatus: null,
		excluded: false,
	}) as unknown as ImportRow;

describe('webpage column headers', () => {
	it('labels the page facts Words, Comments and Roles', () => {
		const rows = [pageRow({ wordCount: 1200, commentCount: 3, webPageRoles: ['BLOG_POST'] })];
		expect(factColumnDef('wordCount', rows).headerName).toBe('Words');
		expect(factColumnDef('commentCount', rows).headerName).toBe('Comments');
		expect(factColumnDef('webPageRoles', rows).headerName).toBe('Roles');
	});

	it('calls durationSeconds Reading time on PAGE rows only', () => {
		expect(factColumnDef('durationSeconds', [pageRow({ durationSeconds: 540 })]).headerName).toBe('Reading time');
		expect(factColumnDef('durationSeconds', [videoRow()]).headerName).toBe('Duration seconds');
	});
});

describe('webpage cell values', () => {
	it('shows each role by its label, joined', () => {
		expect(formatFact('webPageRoles', ['BLOG_POST'])).toBe('Blog post');
		expect(formatFact('webPageRoles', ['BLOG_POST', 'SESSION_TRANSCRIPT'])).toBe('Blog post, Session transcript');
	});

	it('shows a page with no roles as the empty marker', () => {
		expect(formatFact('webPageRoles', [])).toBe('—');
	});

	it('shows a word count compactly', () => {
		expect(formatFact('wordCount', 1200)).toBe(formatCount(1200));
	});

	it('shows a missing count as the empty marker, never 0', () => {
		expect(formatFact('commentCount', undefined)).toBe('—');
		expect(formatFact('wordCount', null)).toBe('—');
	});
});

describe('title cell thumbnail', () => {
	const withThumb = (url: string) => pageRow({ thumbnailUrl: url, summary: 'Short' });

	it('loads the thumbnail without a referrer', () => {
		const cell = titleCellRenderer({ data: withThumb('https://jordans-journey.com/x.jpg') }) as HTMLElement;
		const img = cell.querySelector('img');
		expect(img).not.toBeNull();
		expect(img?.referrerPolicy).toBe('no-referrer');
	});

	it('swaps a thumbnail that fails to load for a placeholder', () => {
		const cell = titleCellRenderer({ data: withThumb('https://jordans-journey.com/broken.jpg') }) as HTMLElement;
		const img = cell.querySelector('img') as HTMLImageElement;
		img.dispatchEvent(new Event('error'));
		expect(cell.querySelector('img')).toBeNull();
		expect(cell.querySelector('[data-thumbnail-fallback]')).not.toBeNull();
	});

	it('draws no thumbnail placeholder when the row has no thumbnail', () => {
		const cell = titleCellRenderer({ data: pageRow({ summary: 'Short' }) }) as HTMLElement;
		expect(cell.querySelector('img')).toBeNull();
		expect(cell.querySelector('[data-thumbnail-fallback]')).toBeNull();
	});
});

import { describe, it, expect } from 'vitest';
import type { ContentItem } from '#lib/queries/content/index.js';
import {
	buildExportTable,
	exportCellText,
	neutralizeFormula,
	EXPORT_EXCLUDED_COLIDS,
	RENDERED_TEXT_COLIDS,
	SPREADSHEET_FORMATTED_COLIDS,
	spreadsheetNumberText,
} from '#lib/utils/exportTable.js';
import { EMPTY_VALUE } from '#lib/utils/formatting.js';
import { webPageRoleLabel } from '#lib/utils/webPage.js';

function row(overrides: Partial<ContentItem> = {}): ContentItem {
	return {
		id: '1',
		name: 'Lasagna',
		addedByUserID: 'u1',
		url: 'https://example.com/a',
		contentType: 'YOUTUBE_VIDEO',
		length: null,
		lengthUnits: null,
		viewCount: null,
		likeCount: null,
		channelTitle: null,
		publishedAt: null,
		tags: null,
		description: null,
		primaryCategory: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

describe('column id constants', () => {
	it('lists the renderer-only and excluded columns', () => {
		expect([...RENDERED_TEXT_COLIDS]).toEqual(['item', 'category', 'cast', 'webRoles', 'author']);
		expect([...EXPORT_EXCLUDED_COLIDS]).toEqual(['perspectize']);
	});
});

describe('neutralizeFormula', () => {
	it.each([
		['=SUM(A1)', "'=SUM(A1)"],
		['+1 555 0100', "'+1 555 0100"],
		['@mention', "'@mention"],
		['-evil', "'-evil"],
		['\t=x', "'\t=x"],
		['\r=x', "'\r=x"],
	])('prefixes %j', (input, expected) => {
		expect(neutralizeFormula(input)).toBe(expected);
	});

	it.each(['-12%', '-3.5', '+5', 'Crème brûlée', ''])('leaves %j unchanged', (input) => {
		expect(neutralizeFormula(input)).toBe(input);
	});
});

describe('spreadsheetNumberText', () => {
	it.each([
		[1234567, '1234567'],
		[0.8, '0.8'],
		[-12.5, '-12.5'],
		[0, '0'],
	])('writes %j as a plain number', (value, expected) => {
		expect(spreadsheetNumberText('views', value)).toBe(expected);
		expect(neutralizeFormula(expected)).toBe(expected);
	});

	it.each([null, undefined, '1.2 M', Number.NaN, Infinity])('defers %j to the formatted text', (value) => {
		expect(spreadsheetNumberText('views', value)).toBeNull();
	});

	it.each([...SPREADSHEET_FORMATTED_COLIDS, ...RENDERED_TEXT_COLIDS])('keeps %s formatted', (colId) => {
		expect(spreadsheetNumberText(colId, 161)).toBeNull();
	});
});

describe('exportCellText', () => {
	it('item prefers displayTitle, else name', () => {
		expect(exportCellText(row({ name: 'Lasagna', displayTitle: "Nonna's Lasagna" }), 'item', undefined)).toBe(
			"Nonna's Lasagna",
		);
		expect(exportCellText(row({ name: 'Lasagna', displayTitle: null }), 'item', undefined)).toBe('Lasagna');
	});

	it('category returns the label, or empty when null', () => {
		const category = {
			id: 'c',
			wikidataQid: 'Q1',
			label: 'Cooking',
			description: null,
			entityType: null,
			wikipediaUrl: null,
		};
		expect(exportCellText(row({ primaryCategory: category }), 'category', undefined)).toBe('Cooking');
		expect(exportCellText(row({ primaryCategory: null }), 'category', undefined)).toBe('');
	});

	it('cast lists directors then cast by order', () => {
		const movie = row({
			contentType: 'MOVIE',
			movie: {
				directors: [{ id: 1, name: 'Greta Gerwig' }],
				cast: [
					{ id: 3, name: 'Ryan Gosling', order: 2 },
					{ id: 2, name: 'Margot Robbie', order: 1 },
				],
			},
		});
		expect(exportCellText(movie, 'cast', undefined)).toBe('Greta Gerwig, Margot Robbie, Ryan Gosling');
		expect(exportCellText(row({ contentType: 'MOVIE', movie: null }), 'cast', undefined)).toBe('');
	});

	it('author lists every author, empty when there are none', () => {
		const book = (authors: { name: string }[]) =>
			row({ contentType: 'BOOK', book: { authors } } as Partial<ContentItem>);
		expect(exportCellText(book([{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }]), 'author', 'Ann')).toBe(
			'Ann, Bo, Cy',
		);
		expect(exportCellText(book([]), 'author', null)).toBe('');
		expect(exportCellText(row({ contentType: 'BOOK' }), 'author', null)).toBe('');
	});

	it('webRoles lists the role labels in stored order, empty when none', () => {
		const page = (webPageRoles: ('BLOG_POST' | 'SESSION_TRANSCRIPT')[]) =>
			row({
				contentType: 'WEB_PAGE',
				webPage: {
					siteName: null,
					domain: null,
					imageUrl: null,
					faviconUrl: null,
					publishedAt: null,
					author: null,
					webPageRoles,
				},
			});
		expect(exportCellText(page(['SESSION_TRANSCRIPT', 'BLOG_POST']), 'webRoles', undefined)).toBe(
			`${webPageRoleLabel('SESSION_TRANSCRIPT')}, ${webPageRoleLabel('BLOG_POST')}`,
		);
		expect(exportCellText(page([]), 'webRoles', undefined)).toBe('');
		expect(exportCellText(row(), 'webRoles', undefined)).toBe('');
	});

	it('other columns stringify the grid value', () => {
		expect(exportCellText(row(), 'views', 42)).toBe('42');
		expect(exportCellText(row(), 'views', null)).toBe('');
		expect(exportCellText(row(), 'views', undefined)).toBe('');
		expect(exportCellText(row(), 'views', EMPTY_VALUE)).toBe('');
	});
});

describe('buildExportTable', () => {
	const columns = [
		{ colId: 'item', header: 'Item' },
		{ colId: 'notes', header: 'Notes' },
	];
	const rows = [row({ url: 'https://a.test' }), row({ id: '2', url: null })];
	const cellText = (r: ContentItem, colId: string) => (colId === 'item' ? r.name : '=cmd');

	it('spreadsheet mode appends a Link column and neutralizes formulas', () => {
		const t = buildExportTable({ columns, rows, cellText, mode: 'spreadsheet' });
		expect(t.columnIds).toEqual(['item', 'notes', 'link']);
		expect(t.headers).toEqual(['Item', 'Notes', 'Link']);
		expect(t.rows).toEqual([
			['Lasagna', "'=cmd", 'https://a.test'],
			['Lasagna', "'=cmd", ''],
		]);
		expect(t.rowUrls).toEqual(['https://a.test', null]);
	});

	it('spreadsheet mode neutralizes a formula-like Link value', () => {
		const t = buildExportTable({
			columns,
			rows: [row({ url: '=HYPERLINK("x")' })],
			cellText,
			mode: 'spreadsheet',
		});
		expect(t.rows[0][2]).toBe(`'=HYPERLINK("x")`);
		expect(t.rowUrls).toEqual(['=HYPERLINK("x")']);
	});

	it('spreadsheet mode adds no Link column when a url column exists', () => {
		const t = buildExportTable({
			columns: [...columns, { colId: 'url', header: 'URL' }],
			rows,
			cellText,
			mode: 'spreadsheet',
		});
		expect(t.headers).toEqual(['Item', 'Notes', 'URL']);
		expect(t.columnIds).toEqual(['item', 'notes', 'url']);
		expect(t.rows[0]).toHaveLength(3);
	});

	it('print mode has no Link column and does not neutralize', () => {
		const t = buildExportTable({ columns, rows, cellText, mode: 'print' });
		expect(t.headers).toEqual(['Item', 'Notes']);
		expect(t.rows[0]).toEqual(['Lasagna', '=cmd']);
		expect(t.rowUrls).toEqual(['https://a.test', null]);
	});

	it('zero rows yields headers only', () => {
		const t = buildExportTable({ columns, rows: [], cellText, mode: 'spreadsheet' });
		expect(t.headers).toEqual(['Item', 'Notes', 'Link']);
		expect(t.rows).toEqual([]);
		expect(t.rowUrls).toEqual([]);
	});
});

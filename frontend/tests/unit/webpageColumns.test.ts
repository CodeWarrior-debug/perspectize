import { describe, it, expect } from 'vitest';
import {
	COLUMNS,
	CONTENT_TYPE_OPTIONS,
	DATA_COLUMNS,
	columnViewFor,
	defaultColumnVisibility,
	isWebPageOnlyTypeFilter,
	itemColumnHeader,
} from '#lib/utils/grid-config.js';

// The default Webpage set, exactly (spec §3): ◎, WebPage, Site, Category, Published, Added.
const WEBPAGE_DEFAULT_SET = ['perspectize', 'item', 'webSite', 'category', 'webPublished', 'createdAt'];

describe('Webpage type filter', () => {
	it('offers Webpage as a type, with the value web_page', () => {
		expect(CONTENT_TYPE_OPTIONS).toContainEqual({ value: 'web_page', label: 'Webpage' });
	});
});

describe('Webpage column view', () => {
	it('a filter of exactly Webpage selects the webpage view; anything else does not', () => {
		expect(isWebPageOnlyTypeFilter('web_page')).toBe(true);
		expect(isWebPageOnlyTypeFilter('WEB_PAGE')).toBe(true);
		expect(isWebPageOnlyTypeFilter('web_page,movie')).toBe(false);
		expect(isWebPageOnlyTypeFilter('movie')).toBe(false);
		expect(columnViewFor('web_page')).toBe('webpage');
		expect(columnViewFor('web_page,movie')).toBe('general');
	});

	it('the Item header reads Webpage in the webpage view', () => {
		expect(itemColumnHeader('web_page')).toBe('Webpage');
		expect(itemColumnHeader('')).toBe('Item');
	});

	it('the default set at desktop width is exactly the six columns (the Category column among them)', () => {
		const { visible } = defaultColumnVisibility('lg', 'webpage');
		expect([...visible].sort()).toEqual([...WEBPAGE_DEFAULT_SET].sort());
	});

	it('Type, Channel and the YouTube and movie columns are hidden in the webpage view', () => {
		const { hidden } = defaultColumnVisibility('lg', 'webpage');
		for (const colId of ['type', 'channel', 'views', 'likes', 'genre', 'author', 'published', 'tags']) {
			expect(hidden).toContain(colId);
		}
	});

	it('the Site and Published columns are never shown in the general or movie views', () => {
		for (const view of ['general', 'movie', 'book'] as const) {
			const { visible, hidden } = defaultColumnVisibility('lg', view);
			expect(visible).not.toContain('webSite');
			expect(visible).not.toContain('webPublished');
			expect(hidden).toContain('webSite');
			expect(hidden).toContain('webPublished');
		}
	});

	it('Roles and Author are picker-only: offered in the column picker, never in the default set', () => {
		const roles = COLUMNS.find((c) => c.colId === 'webRoles');
		const author = COLUMNS.find((c) => c.colId === 'webAuthor');
		expect(roles).toMatchObject({ label: 'Roles', picker: 'data' });
		expect(author).toMatchObject({ label: 'Author', picker: 'data' });
		for (const view of ['webpage', 'general', 'movie', 'book'] as const) {
			const { visible } = defaultColumnVisibility('lg', view);
			expect(visible).not.toContain('webRoles');
			expect(visible).not.toContain('webAuthor');
		}
		expect(DATA_COLUMNS.map((c) => c.colId)).toEqual(expect.arrayContaining(['webRoles', 'webAuthor']));
	});

	it('the Published column is labelled Published and the Site column Site', () => {
		expect(COLUMNS.find((c) => c.colId === 'webPublished')?.label).toBe('Published');
		expect(COLUMNS.find((c) => c.colId === 'webSite')?.label).toBe('Site');
	});
});

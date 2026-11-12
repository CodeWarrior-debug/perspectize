import { describe, it, expect } from 'vitest';
import {
	COL_TO_SORT,
	DATA_COLUMNS,
	defaultColumnVisibility,
	isBookOnlyTypeFilter,
	itemColumnHeader,
	columnViewFor,
	type ResponsiveTier,
} from '$lib/utils/grid-config';
import { columnViewFor as columnViewForFromLayouts } from '$lib/utils/columnLayouts';
import { urlParamsToGraphQLFilter } from '$lib/utils/gridUrlState';

const TIERS: ResponsiveTier[] = ['xs', 'sm', 'md', 'lg'];

describe('isBookOnlyTypeFilter', () => {
	it('is true only when the type filter is exactly BOOK', () => {
		expect(isBookOnlyTypeFilter('book')).toBe(true);
		expect(isBookOnlyTypeFilter(' Book ')).toBe(true);
		expect(isBookOnlyTypeFilter('book,movie')).toBe(false);
		expect(isBookOnlyTypeFilter(undefined)).toBe(false);
	});
});

describe('columnViewFor', () => {
	it('maps a BOOK-only filter to the book view, from either module', () => {
		expect(columnViewFor('book')).toBe('book');
		expect(columnViewForFromLayouts('book')).toBe('book');
	});

	it('keeps the movie and general views unchanged', () => {
		expect(columnViewFor('movie')).toBe('movie');
		expect(columnViewFor('book,movie')).toBe('general');
		expect(columnViewFor(undefined)).toBe('general');
	});
});

describe('Book default column set', () => {
	it('shows the base set at xs', () => {
		expect(defaultColumnVisibility('xs', 'book').visible).toEqual(['perspectize', 'item', 'type']);
	});

	it('adds Author at sm', () => {
		expect(defaultColumnVisibility('sm', 'book').visible).toEqual(['perspectize', 'item', 'type', 'author']);
	});

	it('adds Published and Pages at md', () => {
		expect(defaultColumnVisibility('md', 'book').visible).toEqual([
			'perspectize',
			'item',
			'type',
			'author',
			'published',
			'pages',
		]);
	});

	it('adds Rating and Tags at lg', () => {
		expect(defaultColumnVisibility('lg', 'book').visible).toEqual([
			'perspectize',
			'item',
			'type',
			'author',
			'published',
			'pages',
			'rating',
			'tags',
		]);
	});

	it('hides the Movie and YouTube-only columns, and the picker-only Editions', () => {
		const { hidden } = defaultColumnVisibility('lg', 'book');
		for (const id of [
			'genre',
			'rated',
			'cast',
			'released',
			'boxOffice',
			'vsBudget',
			'tmdbScore',
			'category',
			'channel',
			'duration',
			'publishDate',
			'views',
			'likes',
			'percentLiked',
			'description',
			'editions',
		]) {
			expect(hidden, id).toContain(id);
		}
	});

	it('every column is either shown or hidden, never both, at every tier', () => {
		for (const tier of TIERS) {
			const { visible, hidden } = defaultColumnVisibility(tier, 'book');
			expect(visible.filter((c) => hidden.includes(c))).toEqual([]);
		}
	});
});

describe('the other views keep their exact default sets', () => {
	it('movie lg is the unchanged Movie set', () => {
		expect(defaultColumnVisibility('lg', 'movie').visible).toEqual([
			'perspectize',
			'item',
			'type',
			'genre',
			'rated',
			'cast',
			'duration',
			'released',
			'boxOffice',
			'vsBudget',
			'tmdbScore',
			'tags',
		]);
	});

	it('general lg is the unchanged YouTube set', () => {
		expect(defaultColumnVisibility('lg', 'general').visible).toEqual([
			'item',
			'type',
			'perspectize',
			'category',
			'channel',
			'duration',
			'publishDate',
			'views',
			'likes',
			'percentLiked',
			'tags',
		]);
	});

	it('the movie and general views hide every Book column', () => {
		for (const view of ['movie', 'general'] as const) {
			const { hidden } = defaultColumnVisibility('lg', view);
			for (const id of ['author', 'published', 'pages', 'rating', 'editions']) {
				expect(hidden, `${view}:${id}`).toContain(id);
			}
		}
	});
});

describe('Book column registry', () => {
	it('sorts Author server-side by AUTHOR', () => {
		expect(COL_TO_SORT.author).toBe('AUTHOR');
	});

	it('offers Author, Published, Pages, Rating and Editions in the column picker', () => {
		const labels = DATA_COLUMNS.map((c) => c.label);
		for (const label of ['Author', 'Published', 'Pages', 'Rating', 'Editions']) {
			expect(labels, label).toContain(label);
		}
	});

	it('does not offer a Language column (no source field in the payload)', () => {
		expect(DATA_COLUMNS.map((c) => c.label)).not.toContain('Language');
	});

	it('names the item header Book for a BOOK-only filter', () => {
		expect(itemColumnHeader('book')).toBe('Book');
		expect(itemColumnHeader('movie')).toBe('Film');
		expect(itemColumnHeader('youtube_video')).toBe('Item');
		expect(itemColumnHeader('book,movie')).toBe('Item');
	});
});

describe('Author filter', () => {
	it('maps f.author to the backend authorContains filter', () => {
		expect(urlParamsToGraphQLFilter({ author: 'steinbeck' }, '')).toEqual({ authorContains: 'steinbeck' });
	});
});

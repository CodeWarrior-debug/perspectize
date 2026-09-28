import { describe, it, expect } from 'vitest';
import {
	capitalizeContentType,
	durationComparator,
	DATA_COLUMNS,
	INTERNAL_COLUMNS,
	togglableColIds,
	SORTABLE_COLUMNS,
	compareContentBySorts,
	filterContentRows,
} from '$lib/utils/grid-config';
import type { ContentItem } from '$lib/queries/content';

function row(overrides: Partial<ContentItem>): ContentItem {
	return {
		id: '1',
		name: '',
		addedByUserID: '1',
		url: null,
		contentType: 'YOUTUBE',
		length: null,
		lengthUnits: null,
		viewCount: null,
		likeCount: null,
		channelTitle: null,
		publishedAt: null,
		tags: null,
		description: null,
		primaryCategory: null,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// capitalizeContentType
// ---------------------------------------------------------------------------
describe('capitalizeContentType', () => {
	it('capitalizes first letter and lowercases rest', () => {
		expect(capitalizeContentType('YOUTUBE')).toBe('Youtube');
		expect(capitalizeContentType('youtube_video')).toBe('Youtube_video');
	});

	it('returns empty string for undefined', () => {
		expect(capitalizeContentType(undefined)).toBe('');
	});

	it('returns empty string for empty string', () => {
		expect(capitalizeContentType('')).toBe('');
	});

	it('handles single character', () => {
		expect(capitalizeContentType('a')).toBe('A');
		expect(capitalizeContentType('Z')).toBe('Z');
	});

	it('handles already capitalized input', () => {
		expect(capitalizeContentType('Video')).toBe('Video');
	});
});

// ---------------------------------------------------------------------------
// durationComparator
// ---------------------------------------------------------------------------
describe('durationComparator', () => {
	it('returns negative when first is shorter', () => {
		const result = durationComparator(null, null, { data: { length: 60 } }, { data: { length: 300 } });
		expect(result).toBeLessThan(0);
	});

	it('returns positive when first is longer', () => {
		const result = durationComparator(null, null, { data: { length: 300 } }, { data: { length: 60 } });
		expect(result).toBeGreaterThan(0);
	});

	it('returns zero for equal durations', () => {
		const result = durationComparator(null, null, { data: { length: 120 } }, { data: { length: 120 } });
		expect(result).toBe(0);
	});

	it('treats null length as 0', () => {
		const result = durationComparator(null, null, { data: { length: null } }, { data: { length: 60 } });
		expect(result).toBeLessThan(0);
	});

	it('treats undefined node as length 0', () => {
		const result = durationComparator(null, null, undefined, { data: { length: 60 } });
		expect(result).toBeLessThan(0);
	});

	it('treats undefined data as length 0', () => {
		const result = durationComparator(null, null, { data: undefined }, { data: { length: 60 } });
		expect(result).toBeLessThan(0);
	});

	it('both null/undefined returns 0', () => {
		const result = durationComparator(null, null, undefined, undefined);
		expect(result).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Column-picker registry
// ---------------------------------------------------------------------------
describe('column-picker registry', () => {
	it('DATA_COLUMNS holds the 12 user-togglable data columns', () => {
		expect(DATA_COLUMNS.map((c) => c.colId)).toEqual([
			'type',
			'category',
			'duration',
			'views',
			'likes',
			'percentLiked',
			'publishDate',
			'channel',
			'tags',
			'description',
			'createdAt',
			'updatedAt',
		]);
	});

	it('does not list the "item" column — it must always stay visible so rows remain identifiable', () => {
		expect(DATA_COLUMNS.map((c) => c.colId)).not.toContain('item');
		expect(togglableColIds(true)).not.toContain('item');
	});

	it('INTERNAL_COLUMNS holds the 3 admin-only columns', () => {
		expect(INTERNAL_COLUMNS.map((c) => c.colId)).toEqual(['id', 'addedByUserID', 'url']);
	});

	it('every registry colId is unique across both groups', () => {
		const all = [...DATA_COLUMNS, ...INTERNAL_COLUMNS].map((c) => c.colId);
		expect(new Set(all).size).toBe(all.length);
	});

	it('every registry column has a non-empty label', () => {
		for (const col of [...DATA_COLUMNS, ...INTERNAL_COLUMNS]) {
			expect(col.label.length).toBeGreaterThan(0);
		}
	});

	it('togglableColIds(false) returns only the 12 data columns', () => {
		expect(togglableColIds(false)).toEqual(DATA_COLUMNS.map((c) => c.colId));
	});

	it('togglableColIds(true) returns all 15 columns', () => {
		const ids = togglableColIds(true);
		expect(ids).toHaveLength(15);
		expect(ids).toEqual([...DATA_COLUMNS.map((c) => c.colId), ...INTERNAL_COLUMNS.map((c) => c.colId)]);
	});

	it('does not list the perspectize action column', () => {
		expect(togglableColIds(true)).not.toContain('perspectize');
	});
});

// ---------------------------------------------------------------------------
// SORTABLE_COLUMNS
// ---------------------------------------------------------------------------
describe('SORTABLE_COLUMNS', () => {
	it('excludes the type alias column', () => {
		expect(SORTABLE_COLUMNS.map((c) => c.colId)).not.toContain('type');
	});

	it('every entry has a non-empty label', () => {
		for (const col of SORTABLE_COLUMNS) {
			expect(col.label.length).toBeGreaterThan(0);
		}
	});

	it('includes percentLiked — sortable in the grid, must stay sortable in the mobile/Loaded-mode picker too', () => {
		expect(SORTABLE_COLUMNS.map((c) => c.colId)).toContain('percentLiked');
	});
});

// ---------------------------------------------------------------------------
// compareContentBySorts
// ---------------------------------------------------------------------------
describe('compareContentBySorts', () => {
	it('returns 0 for an empty sort list', () => {
		expect(compareContentBySorts(row({ name: 'b' }), row({ name: 'a' }), [])).toBe(0);
	});

	it('sorts by a single numeric column, descending', () => {
		const rows = [row({ id: '1', viewCount: 10 }), row({ id: '2', viewCount: 30 }), row({ id: '3', viewCount: 20 })];
		const sorted = [...rows].sort((a, b) => compareContentBySorts(a, b, [{ col: 'views', dir: 'desc' }]));
		expect(sorted.map((r) => r.id)).toEqual(['2', '3', '1']);
	});

	it('sorts by a single numeric column, ascending', () => {
		const rows = [row({ id: '1', viewCount: 10 }), row({ id: '2', viewCount: 30 }), row({ id: '3', viewCount: 20 })];
		const sorted = [...rows].sort((a, b) => compareContentBySorts(a, b, [{ col: 'views', dir: 'asc' }]));
		expect(sorted.map((r) => r.id)).toEqual(['1', '3', '2']);
	});

	it('breaks ties on the primary column using the next sort column', () => {
		const rows = [
			row({ id: '1', viewCount: 10, likeCount: 5 }),
			row({ id: '2', viewCount: 10, likeCount: 1 }),
			row({ id: '3', viewCount: 20, likeCount: 9 }),
		];
		const sorted = [...rows].sort((a, b) =>
			compareContentBySorts(a, b, [
				{ col: 'views', dir: 'desc' },
				{ col: 'likes', dir: 'asc' },
			]),
		);
		expect(sorted.map((r) => r.id)).toEqual(['3', '2', '1']);
	});

	it('sorts nulls last regardless of direction', () => {
		const rows = [row({ id: '1', viewCount: null }), row({ id: '2', viewCount: 5 })];
		const asc = [...rows].sort((a, b) => compareContentBySorts(a, b, [{ col: 'views', dir: 'asc' }]));
		const desc = [...rows].sort((a, b) => compareContentBySorts(a, b, [{ col: 'views', dir: 'desc' }]));
		expect(asc.map((r) => r.id)).toEqual(['2', '1']);
		expect(desc.map((r) => r.id)).toEqual(['2', '1']);
	});

	it('sorts strings case-insensitively', () => {
		const rows = [row({ id: '1', name: 'banana' }), row({ id: '2', name: 'Apple' })];
		const sorted = [...rows].sort((a, b) => compareContentBySorts(a, b, [{ col: 'item', dir: 'asc' }]));
		expect(sorted.map((r) => r.id)).toEqual(['2', '1']);
	});

	it('sorts by percentLiked (likes / views), the same computation the grid column uses', () => {
		const rows = [
			row({ id: '1', viewCount: 100, likeCount: 10 }), // 10%
			row({ id: '2', viewCount: 100, likeCount: 90 }), // 90%
			row({ id: '3', viewCount: 0, likeCount: 0 }), // null — no meaningful rate
		];
		const sorted = [...rows].sort((a, b) => compareContentBySorts(a, b, [{ col: 'percentLiked', dir: 'desc' }]));
		expect(sorted.map((r) => r.id)).toEqual(['2', '1', '3']);
	});

	it('skips a colId with no known value getter', () => {
		const rows = [row({ id: '1', viewCount: 30 }), row({ id: '2', viewCount: 10 })];
		const sorted = [...rows].sort((a, b) =>
			compareContentBySorts(a, b, [
				{ col: 'tags', dir: 'asc' }, // not in SORT_VALUE_GETTERS
				{ col: 'views', dir: 'asc' },
			]),
		);
		expect(sorted.map((r) => r.id)).toEqual(['2', '1']);
	});
});

// ---------------------------------------------------------------------------
// filterContentRows
// ---------------------------------------------------------------------------
// Gap #5 (remainder) in the UI gap audit: the mobile card list in "Loaded"
// mode ignored column filters entirely (there was no AG Grid instance to
// filter for it). filterContentRows applies the same filter model
// urlParamsToFilter (gridUrlState.ts) produces, by hand, against the plain
// row array.
describe('filterContentRows', () => {
	it('returns all rows when the filter model is empty', () => {
		const rows = [row({ id: '1' }), row({ id: '2' })];
		expect(filterContentRows(rows, {})).toEqual(rows);
	});

	it('filters by a text "contains" filter (e.g. the default type: youtube filter)', () => {
		const rows = [row({ id: '1', contentType: 'YOUTUBE' }), row({ id: '2', contentType: 'CLAIM' })];
		const result = filterContentRows(rows, { type: { filterType: 'text', type: 'contains', filter: 'youtube' } });
		expect(result.map((r) => r.id)).toEqual(['1']);
	});

	it('filters by a number range (views)', () => {
		const rows = [
			row({ id: '1', viewCount: 500 }),
			row({ id: '2', viewCount: 1500 }),
			row({ id: '3', viewCount: 3000 }),
		];
		const result = filterContentRows(rows, {
			views: { filterType: 'number', type: 'inRange', filter: 1000, filterTo: 2000 },
		});
		expect(result.map((r) => r.id)).toEqual(['2']);
	});

	it('excludes a row with no value for a number filter (null does not match any range)', () => {
		const rows = [row({ id: '1', viewCount: null }), row({ id: '2', viewCount: 1500 })];
		const result = filterContentRows(rows, {
			views: { filterType: 'number', type: 'greaterThan', filter: 0 },
		});
		expect(result.map((r) => r.id)).toEqual(['2']);
	});

	it('filters by a date range (publishDate)', () => {
		const rows = [
			row({ id: '1', publishedAt: '2026-01-01T00:00:00Z' }),
			row({ id: '2', publishedAt: '2026-06-01T00:00:00Z' }),
		];
		const result = filterContentRows(rows, {
			publishDate: { filterType: 'date', type: 'greaterThanOrEqual', dateFrom: '2026-03-01' },
		});
		expect(result.map((r) => r.id)).toEqual(['2']);
	});

	it('applies multiple filters as AND', () => {
		const rows = [
			row({ id: '1', contentType: 'YOUTUBE', viewCount: 500 }),
			row({ id: '2', contentType: 'YOUTUBE', viewCount: 5000 }),
			row({ id: '3', contentType: 'CLAIM', viewCount: 5000 }),
		];
		const result = filterContentRows(rows, {
			type: { filterType: 'text', type: 'contains', filter: 'youtube' },
			views: { filterType: 'number', type: 'greaterThan', filter: 1000 },
		});
		expect(result.map((r) => r.id)).toEqual(['2']);
	});

	it('skips a colId with no known value getter (matches everything for that entry)', () => {
		const rows = [row({ id: '1' })];
		const result = filterContentRows(rows, { notARealColumn: { filterType: 'text', type: 'contains', filter: 'x' } });
		expect(result.map((r) => r.id)).toEqual(['1']);
	});
});

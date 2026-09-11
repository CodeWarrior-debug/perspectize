import { describe, it, expect } from 'vitest';
import {
	SORT_FIELD_MAP,
	resolveSortField,
	resolveSortOrder,
	capitalizeContentType,
	durationComparator,
	computeNextPage,
	computePrevPage,
	deriveResponsiveTier,
	getColumnVisibility,
	isMobileTier,
	COLUMN_IDS,
	NON_SORTABLE_COLUMNS,
	COLUMN_FILTERS,
	DATA_COLUMNS,
	INTERNAL_COLUMNS,
	togglableColIds,
} from '$lib/utils/grid-config';

// ---------------------------------------------------------------------------
// SORT_FIELD_MAP
// ---------------------------------------------------------------------------
describe('SORT_FIELD_MAP', () => {
	it('maps sortable columns to their backend enum values', () => {
		expect(SORT_FIELD_MAP['views']).toBe('VIEW_COUNT');
		expect(SORT_FIELD_MAP['likes']).toBe('LIKE_COUNT');
		expect(SORT_FIELD_MAP['publishDate']).toBe('PUBLISHED_AT');
		expect(SORT_FIELD_MAP['createdAt']).toBe('CREATED_AT');
		expect(SORT_FIELD_MAP['updatedAt']).toBe('UPDATED_AT');
	});

	it('falls back to NAME for columns without backend sort support', () => {
		expect(SORT_FIELD_MAP['item']).toBe('NAME');
		expect(SORT_FIELD_MAP['type']).toBe('NAME');
		expect(SORT_FIELD_MAP['duration']).toBe('NAME');
		expect(SORT_FIELD_MAP['channel']).toBe('NAME');
		expect(SORT_FIELD_MAP['percentLiked']).toBe('NAME');
	});

	it('returns undefined for unknown column IDs', () => {
		expect(SORT_FIELD_MAP['nonexistent']).toBeUndefined();
		expect(SORT_FIELD_MAP['tags']).toBeUndefined();
		expect(SORT_FIELD_MAP['description']).toBeUndefined();
	});

	it('has entries only for columns that should be sortable via backend', () => {
		const keys = Object.keys(SORT_FIELD_MAP);
		// perspectize, tags, description are not in map (not sortable)
		expect(keys).not.toContain('perspectize');
		expect(keys).not.toContain('tags');
		expect(keys).not.toContain('description');
	});
});

// ---------------------------------------------------------------------------
// resolveSortField
// ---------------------------------------------------------------------------
describe('resolveSortField', () => {
	it('resolves known column IDs', () => {
		expect(resolveSortField('views')).toBe('VIEW_COUNT');
		expect(resolveSortField('likes')).toBe('LIKE_COUNT');
		expect(resolveSortField('publishDate')).toBe('PUBLISHED_AT');
	});

	it('falls back to UPDATED_AT for undefined colId', () => {
		expect(resolveSortField(undefined)).toBe('UPDATED_AT');
	});

	it('falls back to UPDATED_AT for unknown colId', () => {
		expect(resolveSortField('nonexistent')).toBe('UPDATED_AT');
	});
});

// ---------------------------------------------------------------------------
// resolveSortOrder
// ---------------------------------------------------------------------------
describe('resolveSortOrder', () => {
	it('returns ASC for "asc"', () => {
		expect(resolveSortOrder('asc')).toBe('ASC');
	});

	it('returns DESC for "desc"', () => {
		expect(resolveSortOrder('desc')).toBe('DESC');
	});

	it('returns DESC for null', () => {
		expect(resolveSortOrder(null)).toBe('DESC');
	});

	it('returns DESC for undefined', () => {
		expect(resolveSortOrder(undefined)).toBe('DESC');
	});
});

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
// computeNextPage / computePrevPage
// ---------------------------------------------------------------------------
describe('computeNextPage', () => {
	it('advances to next page when not at end', () => {
		// page 0 of 3 (30 items, 10 per page)
		expect(computeNextPage(0, 30, 10)).toBe(1);
	});

	it('stays on last page when already at end', () => {
		// page 2 of 3 (30 items, 10 per page) → max page = 2
		expect(computeNextPage(2, 30, 10)).toBe(2);
	});

	it('handles single page (no next)', () => {
		expect(computeNextPage(0, 5, 10)).toBe(0);
	});

	it('handles zero items', () => {
		expect(computeNextPage(0, 0, 10)).toBe(0);
	});

	it('handles partial last page', () => {
		// 25 items, 10 per page → 3 pages (0, 1, 2)
		expect(computeNextPage(1, 25, 10)).toBe(2);
		expect(computeNextPage(2, 25, 10)).toBe(2);
	});

	it('handles different page sizes', () => {
		expect(computeNextPage(0, 100, 25)).toBe(1);
		expect(computeNextPage(0, 100, 50)).toBe(1);
		expect(computeNextPage(1, 100, 50)).toBe(1); // already at last page
	});
});

describe('computePrevPage', () => {
	it('goes to previous page when not at start', () => {
		expect(computePrevPage(2)).toBe(1);
		expect(computePrevPage(1)).toBe(0);
	});

	it('stays on first page when already at start', () => {
		expect(computePrevPage(0)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// deriveResponsiveTier
// ---------------------------------------------------------------------------
describe('deriveResponsiveTier', () => {
	it('returns xs for narrow widths', () => {
		expect(deriveResponsiveTier(320)).toBe('xs');
		expect(deriveResponsiveTier(375)).toBe('xs');
		expect(deriveResponsiveTier(444)).toBe('xs');
	});

	it('returns sm for small tablet widths', () => {
		expect(deriveResponsiveTier(445)).toBe('sm');
		expect(deriveResponsiveTier(500)).toBe('sm');
		expect(deriveResponsiveTier(639)).toBe('sm');
	});

	it('returns md for medium widths', () => {
		expect(deriveResponsiveTier(640)).toBe('md');
		expect(deriveResponsiveTier(768)).toBe('md');
		expect(deriveResponsiveTier(899)).toBe('md');
	});

	it('returns lg for large widths', () => {
		expect(deriveResponsiveTier(900)).toBe('lg');
		expect(deriveResponsiveTier(1024)).toBe('lg');
		expect(deriveResponsiveTier(1920)).toBe('lg');
	});

	it('handles exact breakpoint boundaries', () => {
		expect(deriveResponsiveTier(444)).toBe('xs');
		expect(deriveResponsiveTier(445)).toBe('sm');
		expect(deriveResponsiveTier(639)).toBe('sm');
		expect(deriveResponsiveTier(640)).toBe('md');
		expect(deriveResponsiveTier(899)).toBe('md');
		expect(deriveResponsiveTier(900)).toBe('lg');
	});
});

// ---------------------------------------------------------------------------
// getColumnVisibility
// ---------------------------------------------------------------------------
describe('getColumnVisibility', () => {
	it('shows only core columns on xs', () => {
		const { visible, hidden } = getColumnVisibility('xs');
		expect(visible).toContain('item');
		expect(visible).toContain('type');
		expect(visible).toContain('perspectize');
		expect(visible).not.toContain('channel');
		expect(visible).not.toContain('duration');
		expect(visible).not.toContain('views');
		expect(hidden).toContain('channel');
		expect(hidden).toContain('duration');
		expect(hidden).toContain('views');
		expect(hidden).toContain('description');
	});

	it('adds channel on sm', () => {
		const { visible, hidden } = getColumnVisibility('sm');
		expect(visible).toContain('channel');
		expect(visible).not.toContain('duration');
		expect(hidden).toContain('duration');
		expect(hidden).toContain('views');
	});

	it('adds duration and publishDate on md', () => {
		const { visible, hidden } = getColumnVisibility('md');
		expect(visible).toContain('channel');
		expect(visible).toContain('duration');
		expect(visible).toContain('publishDate');
		expect(visible).not.toContain('views');
		expect(hidden).toContain('views');
		expect(hidden).toContain('likes');
		expect(hidden).toContain('tags');
	});

	it('shows all non-hidden columns on lg', () => {
		const { visible, hidden } = getColumnVisibility('lg');
		expect(visible).toContain('views');
		expect(visible).toContain('likes');
		expect(visible).toContain('percentLiked');
		expect(visible).toContain('tags');
		expect(visible).toContain('channel');
		expect(visible).toContain('duration');
		expect(visible).toContain('publishDate');
		// Always hidden columns
		expect(hidden).toContain('description');
		expect(hidden).toContain('updatedAt');
		expect(hidden).toContain('createdAt');
	});

	it('always hides description, updatedAt, createdAt regardless of tier', () => {
		for (const tier of ['xs', 'sm', 'md', 'lg'] as const) {
			const { hidden } = getColumnVisibility(tier);
			expect(hidden).toContain('description');
			expect(hidden).toContain('updatedAt');
			expect(hidden).toContain('createdAt');
		}
	});

	it('visible + hidden covers all responsive columns for each tier', () => {
		const responsiveCols = ['channel', 'duration', 'publishDate', 'views', 'likes', 'percentLiked', 'tags'];
		for (const tier of ['xs', 'sm', 'md', 'lg'] as const) {
			const { visible, hidden } = getColumnVisibility(tier);
			for (const col of responsiveCols) {
				const inVisible = visible.includes(col);
				const inHidden = hidden.includes(col);
				expect(inVisible || inHidden).toBe(true);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// isMobileTier
// ---------------------------------------------------------------------------
describe('isMobileTier', () => {
	it('returns true for xs and sm', () => {
		expect(isMobileTier('xs')).toBe(true);
		expect(isMobileTier('sm')).toBe(true);
	});

	it('returns false for md and lg', () => {
		expect(isMobileTier('md')).toBe(false);
		expect(isMobileTier('lg')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// COLUMN_IDS
// ---------------------------------------------------------------------------
describe('COLUMN_IDS', () => {
	it('contains all 13 columns in expected order', () => {
		expect(COLUMN_IDS).toHaveLength(13);
		expect(COLUMN_IDS[0]).toBe('perspectize');
		expect(COLUMN_IDS[1]).toBe('item');
		expect(COLUMN_IDS[COLUMN_IDS.length - 1]).toBe('createdAt');
	});

	it('contains no duplicates', () => {
		const unique = new Set(COLUMN_IDS);
		expect(unique.size).toBe(COLUMN_IDS.length);
	});
});

// ---------------------------------------------------------------------------
// NON_SORTABLE_COLUMNS
// ---------------------------------------------------------------------------
describe('NON_SORTABLE_COLUMNS', () => {
	it('includes perspectize, tags, and description', () => {
		expect(NON_SORTABLE_COLUMNS).toContain('perspectize');
		expect(NON_SORTABLE_COLUMNS).toContain('tags');
		expect(NON_SORTABLE_COLUMNS).toContain('description');
	});

	it('does not include sortable columns', () => {
		const nonSortable = [...NON_SORTABLE_COLUMNS];
		expect(nonSortable).not.toContain('views');
		expect(nonSortable).not.toContain('likes');
		expect(nonSortable).not.toContain('percentLiked');
		expect(nonSortable).not.toContain('publishDate');
	});
});

// ---------------------------------------------------------------------------
// COLUMN_FILTERS
// ---------------------------------------------------------------------------
describe('COLUMN_FILTERS', () => {
	it('disables filters on perspectize and item', () => {
		expect(COLUMN_FILTERS['perspectize']).toBe(false);
		expect(COLUMN_FILTERS['item']).toBe(false);
	});

	it('uses text filter for text-based columns', () => {
		expect(COLUMN_FILTERS['type']).toBe('agTextColumnFilter');
		expect(COLUMN_FILTERS['channel']).toBe('agTextColumnFilter');
		expect(COLUMN_FILTERS['tags']).toBe('agTextColumnFilter');
		expect(COLUMN_FILTERS['description']).toBe('agTextColumnFilter');
	});

	it('uses number filter for numeric columns', () => {
		expect(COLUMN_FILTERS['duration']).toBe('agNumberColumnFilter');
		expect(COLUMN_FILTERS['views']).toBe('agNumberColumnFilter');
		expect(COLUMN_FILTERS['likes']).toBe('agNumberColumnFilter');
	});

	it('disables the filter on the computed percentLiked column', () => {
		// No backend field to filter against yet — see PR notes on server-side options.
		expect(COLUMN_FILTERS['percentLiked']).toBe(false);
	});

	it('uses date filter for date columns', () => {
		expect(COLUMN_FILTERS['publishDate']).toBe('agDateColumnFilter');
		expect(COLUMN_FILTERS['updatedAt']).toBe('agDateColumnFilter');
		expect(COLUMN_FILTERS['createdAt']).toBe('agDateColumnFilter');
	});

	it('has an entry for every column ID', () => {
		for (const colId of COLUMN_IDS) {
			expect(COLUMN_FILTERS).toHaveProperty(colId);
		}
	});
});

// ---------------------------------------------------------------------------
// Column-picker registry
// ---------------------------------------------------------------------------
describe('column-picker registry', () => {
	it('DATA_COLUMNS holds the 9 user-togglable data columns', () => {
		expect(DATA_COLUMNS.map((c) => c.colId)).toEqual([
			'type',
			'duration',
			'views',
			'likes',
			'percentLiked',
			'publishDate',
			'channel',
			'tags',
			'description',
		]);
	});

	it('does not list the "item" column — it must always stay visible so rows remain identifiable', () => {
		expect(DATA_COLUMNS.map((c) => c.colId)).not.toContain('item');
		expect(togglableColIds(true)).not.toContain('item');
	});

	it('INTERNAL_COLUMNS holds the 5 admin-only columns', () => {
		expect(INTERNAL_COLUMNS.map((c) => c.colId)).toEqual(['id', 'addedByUserID', 'url', 'createdAt', 'updatedAt']);
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

	it('togglableColIds(false) returns only the 9 data columns', () => {
		expect(togglableColIds(false)).toEqual(DATA_COLUMNS.map((c) => c.colId));
	});

	it('togglableColIds(true) returns all 14 columns', () => {
		const ids = togglableColIds(true);
		expect(ids).toHaveLength(14);
		expect(ids).toEqual([...DATA_COLUMNS.map((c) => c.colId), ...INTERNAL_COLUMNS.map((c) => c.colId)]);
	});

	it('does not list the perspectize action column', () => {
		expect(togglableColIds(true)).not.toContain('perspectize');
	});
});

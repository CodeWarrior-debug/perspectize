import { describe, it, expect, beforeEach } from 'vitest';
import { COLUMNS, defaultColumnVisibility } from '#lib/utils/grid-config.js';
import { GRID_DEFAULTS, parseGridParams, sortsToGraphQL } from '#lib/utils/gridUrlState.js';
import { COLUMN_LAYOUTS_KEY, loadLayout } from '#lib/utils/columnLayouts.js';

// Links and saved column setups outlive a removed column: both must load without it.
describe('removed percentLiked column', () => {
	beforeEach(() => localStorage.clear());

	it('is not a column or a default in any tier', () => {
		expect(COLUMNS.map((c) => c.colId)).not.toContain('percentLiked');
		expect(defaultColumnVisibility('lg', 'general').visible).not.toContain('percentLiked');
	});

	it('is dropped from a shared URL sort, keeping the other sorts', () => {
		const { sorts } = parseGridParams(new URLSearchParams('sort=percentLiked.desc,views.asc'));
		expect(sorts).toEqual([{ col: 'views', dir: 'asc' }]);
		expect(sortsToGraphQL(sorts)).toEqual([{ field: 'VIEW_COUNT', order: 'ASC' }]);
	});

	it('falls back to the default sort when it was the only one', () => {
		const { sorts } = parseGridParams(new URLSearchParams('sort=percentLiked.desc'));
		expect(sorts).toEqual(GRID_DEFAULTS.sorts);
	});

	it('is dropped from a saved column layout', () => {
		localStorage.setItem(COLUMN_LAYOUTS_KEY, JSON.stringify({ general: { percentLiked: true, views: false } }));
		expect(loadLayout('general')).toEqual({ views: false });
	});
});

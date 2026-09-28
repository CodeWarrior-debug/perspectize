import { describe, it, expect } from 'vitest';
import activityTableSource from '$lib/components/ActivityTable.svelte?raw';
import { togglableColIds } from '$lib/utils/grid-config';

// Always-visible columns that are deliberately never offered in the column picker.
const NON_TOGGLABLE = ['item', 'perspectize'];

describe('column-picker registry parity', () => {
	it('offers every ActivityTable column except the always-visible ones', () => {
		const colIds = [...new Set([...activityTableSource.matchAll(/colId:\s*'([^']+)'/g)].map((m) => m[1]))];
		const expected = colIds.filter((id) => !NON_TOGGLABLE.includes(id)).sort();
		expect(expected.length).toBeGreaterThan(0);
		expect([...togglableColIds(true)].sort()).toEqual(expected);
	});
});

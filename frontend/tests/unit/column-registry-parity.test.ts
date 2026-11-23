import { describe, it, expect } from 'vitest';
import libraryColumnsSource from '#lib/components/library/columns.ts?raw';
import { togglableColIds } from '#lib/utils/grid-config.js';

// Always-visible columns that are deliberately never offered in the column picker.
const NON_TOGGLABLE = ['item', 'perspectize'];

describe('column-picker registry parity', () => {
	it('offers every ContentLibrary column except the always-visible ones', () => {
		const colIds = [...new Set([...libraryColumnsSource.matchAll(/colId:\s*'([^']+)'/g)].map((m) => m[1]))];
		const expected = colIds.filter((id) => !NON_TOGGLABLE.includes(id)).sort();
		expect(expected.length).toBeGreaterThan(0);
		expect([...togglableColIds(true)].sort()).toEqual(expected);
	});
});

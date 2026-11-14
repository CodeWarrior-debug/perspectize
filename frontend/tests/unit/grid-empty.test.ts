import { describe, it, expect } from 'vitest';
import type { CellClassParams } from '@ag-grid-community/core';
import { EMPTY_CLASS, emptyCellClassRules, isEmptyMarker } from '$lib/utils/grid-empty';
import { EMPTY_VALUE, formatTags } from '$lib/utils/formatting';

describe('isEmptyMarker', () => {
	it('is true only for the exact empty marker', () => {
		expect(isEmptyMarker(EMPTY_VALUE)).toBe(true);
	});
	it.each(['-', '—x', '', 0, false, null, undefined])('is false for %s', (v) => {
		expect(isEmptyMarker(v)).toBe(false);
	});
});

/** What AG Grid really passes to a cellClassRule: the raw `value` and the colDef, never a formatted value. */
function params(value: unknown, valueFormatter?: (p: { value: unknown }) => string): CellClassParams {
	return { value, colDef: { valueFormatter } } as unknown as CellClassParams;
}

describe('emptyCellClassRules', () => {
	const rule = emptyCellClassRules[EMPTY_CLASS];

	it('is empty when the column formatter turns the raw value into the dash', () => {
		const fmt = (p: { value: unknown }) => (p.value == null ? EMPTY_VALUE : String(p.value));
		expect(rule(params(null, fmt))).toBe(true);
		expect(rule(params('x', fmt))).toBe(false);
	});

	it('works with a real formatter on a raw empty array (the Activity Tags column)', () => {
		const fmt = (p: { value: unknown }) => formatTags(p.value as string[]);
		expect(rule(params([], fmt))).toBe(true);
		expect(rule(params(['a'], fmt))).toBe(false);
	});

	it('falls back to the raw value when the column has no formatter', () => {
		expect(rule(params(EMPTY_VALUE))).toBe(true);
		expect(rule(params(0))).toBe(false);
		expect(rule(params(null))).toBe(false);
	});
});

import { describe, it, expect } from 'vitest';
import { EMPTY_CLASS, emptyCellClassRules, isEmptyMarker } from '$lib/utils/grid-empty';
import { EMPTY_VALUE } from '$lib/utils/formatting';

describe('isEmptyMarker', () => {
	it('is true only for the exact empty marker', () => {
		expect(isEmptyMarker(EMPTY_VALUE)).toBe(true);
	});
	it.each(['-', '—x', '', 0, false, null, undefined])('is false for %s', (v) => {
		expect(isEmptyMarker(v)).toBe(false);
	});
});

describe('emptyCellClassRules', () => {
	const rule = emptyCellClassRules[EMPTY_CLASS];
	it('matches on the formatted value (what the user sees)', () => {
		expect(rule({ value: null, formattedValue: EMPTY_VALUE })).toBe(true);
		expect(rule({ value: 'x', formattedValue: 'x' })).toBe(false);
	});
	it('falls back to the raw value when there is no formatter', () => {
		expect(rule({ value: EMPTY_VALUE })).toBe(true);
		expect(rule({ value: 0 })).toBe(false);
	});
});

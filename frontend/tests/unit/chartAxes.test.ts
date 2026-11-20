import { describe, it, expect } from 'vitest';
import { niceStep, niceTicks } from '#lib/utils/chartAxes';

describe('niceStep', () => {
	it('rounds the raw step up to 1, 2, 2.5, 5 or 10 times a power of ten', () => {
		expect(niceStep(9.75, 1)).toBe(10);
		expect(niceStep(6.25, 1)).toBe(10);
		expect(niceStep(25, 1)).toBe(25);
		expect(niceStep(0.9, 1)).toBe(1);
	});

	it('returns 1 for an empty span or a target below one', () => {
		expect(niceStep(0, 4)).toBe(1);
		expect(niceStep(10, 0)).toBe(1);
	});

	it('never goes below a whole number for integer axes', () => {
		expect(niceStep(1, 3, true)).toBe(1);
		expect(niceStep(2, 1, true)).toBe(2);
	});
});

describe('niceTicks', () => {
	it('gives round values inside the range, about four of them', () => {
		expect(niceTicks(1, 40, 4)).toEqual([10, 20, 30, 40]);
		expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
	});

	it('keeps every tick within [lo, hi]', () => {
		const ticks = niceTicks(1_234, 9_876, 4);
		expect(ticks.length).toBeGreaterThanOrEqual(3);
		expect(ticks.length).toBeLessThanOrEqual(5);
		for (const t of ticks) {
			expect(t).toBeGreaterThanOrEqual(1_234);
			expect(t).toBeLessThanOrEqual(9_876);
		}
	});

	it('strips float noise from fractional steps', () => {
		expect(niceTicks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3]);
	});

	it('labels counts with whole numbers only', () => {
		expect(niceTicks(0, 1, 3, true)).toEqual([0, 1]);
		expect(niceTicks(0, 7, 3, true)).toEqual([0, 3, 6]);
	});

	it('returns nothing for an empty, reversed or non-finite range', () => {
		expect(niceTicks(5, 5)).toEqual([]);
		expect(niceTicks(9, 1)).toEqual([]);
		expect(niceTicks(0, Number.NaN)).toEqual([]);
		expect(niceTicks(Number.NEGATIVE_INFINITY, 4)).toEqual([]);
	});
});

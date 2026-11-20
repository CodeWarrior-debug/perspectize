import { describe, it, expect } from 'vitest';
import {
	ratingToDisplay,
	displayToRating,
	isValidRating,
	RATING_STEP,
	RATING_MIN,
	RATING_MAX,
	RATING_DEFAULT_DISPLAY,
	RATING_DEFAULT_STORAGE,
} from '#lib/utils/ratings.js';

describe('ratingToDisplay', () => {
	it('converts 0 to "0.000"', () => {
		expect(ratingToDisplay(0)).toBe('0.000');
	});

	it('converts 5000 to "5.000"', () => {
		expect(ratingToDisplay(5000)).toBe('5.000');
	});

	it('converts 10000 to "10.000"', () => {
		expect(ratingToDisplay(10000)).toBe('10.000');
	});

	it('converts 2575 correctly (rounds to 3 decimals)', () => {
		// 2575 / 1000 = 2.575
		expect(ratingToDisplay(2575)).toBe('2.575');
	});

	it('converts 9234 to "9.234"', () => {
		expect(ratingToDisplay(9234)).toBe('9.234');
	});

	it('converts 1 to "0.001"', () => {
		expect(ratingToDisplay(1)).toBe('0.001');
	});
});

describe('displayToRating', () => {
	it('converts 5.0 to 5000', () => {
		expect(displayToRating(5.0)).toBe(5000);
	});

	it('converts 10.0 to 10000', () => {
		expect(displayToRating(10.0)).toBe(10000);
	});

	it('converts 7.25 to 7250', () => {
		expect(displayToRating(7.25)).toBe(7250);
	});

	it('converts 0.0 to 0', () => {
		expect(displayToRating(0.0)).toBe(0);
	});

	it('converts 9.234 to 9234', () => {
		expect(displayToRating(9.234)).toBe(9234);
	});

	it('rounds correctly for floating point imprecision', () => {
		// 7.1 * 1000 might be 7099.999... due to floating point — Math.round handles this
		expect(displayToRating(7.1)).toBe(7100);
	});
});

describe('isValidRating', () => {
	it('returns true for 0', () => {
		expect(isValidRating(0)).toBe(true);
	});

	it('returns true for 10000', () => {
		expect(isValidRating(10000)).toBe(true);
	});

	it('returns true for 5000', () => {
		expect(isValidRating(5000)).toBe(true);
	});

	it('returns false for -1', () => {
		expect(isValidRating(-1)).toBe(false);
	});

	it('returns false for 10001', () => {
		expect(isValidRating(10001)).toBe(false);
	});

	it('returns false for 5.5 (not integer)', () => {
		expect(isValidRating(5.5)).toBe(false);
	});

	it('returns false for NaN', () => {
		expect(isValidRating(NaN)).toBe(false);
	});
});

describe('constants', () => {
	it('RATING_STEP is 0.25', () => {
		expect(RATING_STEP).toBe(0.25);
	});

	it('RATING_MIN is 0', () => {
		expect(RATING_MIN).toBe(0);
	});

	it('RATING_MAX is 10', () => {
		expect(RATING_MAX).toBe(10);
	});

	it('RATING_DEFAULT_DISPLAY is 5.0', () => {
		expect(RATING_DEFAULT_DISPLAY).toBe(5.0);
	});

	it('RATING_DEFAULT_STORAGE is 5000', () => {
		expect(RATING_DEFAULT_STORAGE).toBe(5000);
	});
});

import { describe, it, expect } from 'vitest';
import { compressPreview, explainCompareToRest, explainCompress } from '#lib/customColumns/explain';

describe('explainCompress', () => {
	it('gives the one-line explanation for the compress step', () => {
		expect(explainCompress()).toBe('Each step up means 10x bigger, so one tiny value stops swamping everything');
	});
});

describe('compressPreview', () => {
	it('shows the smallest and largest non-null values before and after log10', () => {
		const preview = compressPreview([40000, 400000, null, 1]);
		expect(preview).not.toBeNull();
		expect(preview!.smallest.before).toBe(1);
		expect(preview!.smallest.after).toBeCloseTo(0, 12);
		expect(preview!.largest.before).toBe(400000);
		expect(preview!.largest.after).toBeCloseTo(5.6020599913, 6);
	});

	it('ignores undefined and missing values rather than treating them as zero', () => {
		const preview = compressPreview([undefined, null, 100, 1000]);
		expect(preview!.smallest.before).toBe(100);
		expect(preview!.largest.before).toBe(1000);
	});

	it('gives no after-value for zero or negative inputs, which log10 cannot take', () => {
		const preview = compressPreview([0, 10]);
		expect(preview!.smallest.before).toBe(0);
		expect(preview!.smallest.after).toBeNull();
		expect(preview!.largest.after).toBe(1);
	});

	it('returns null when no value is present', () => {
		expect(compressPreview([])).toBeNull();
		expect(compressPreview([null, undefined])).toBeNull();
	});
});

describe('explainCompareToRest', () => {
	it('explains the z-score against the loaded row count', () => {
		expect(explainCompareToRest(40)).toBe(
			'How far above or below the typical value, measured against these 40 loaded rows: 0 is typical, +1 clearly above, -2 far below',
		);
	});
});

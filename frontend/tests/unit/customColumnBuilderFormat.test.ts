import { describe, it, expect } from 'vitest';
import {
	DEFAULT_NUMBER_FORMAT,
	EMPTY_CELL,
	formatCustomValue,
	formatOperandValue,
	normalizeNumberFormat,
	saveErrorMessage,
} from '#lib/components/customColumns/builderFormat';
import { OPERANDS_BY_KEY } from '#lib/customColumns';

describe('formatCustomValue', () => {
	it('shows a missing value as an em dash, never 0', () => {
		for (const format of ['sig3', 'rating', 'dollars', 'percent']) {
			expect(formatCustomValue(null, format)).toBe(EMPTY_CELL);
		}
	});

	it('sig3 keeps three significant figures', () => {
		expect(formatCustomValue(173.456, 'sig3')).toBe('173');
		expect(formatCustomValue(0.8214, 'sig3')).toBe('0.821');
	});

	it('rating shows one decimal', () => {
		expect(formatCustomValue(7.25, 'rating')).toBe('7.3');
	});

	it('dollars rounds to whole dollars and keeps the sign', () => {
		expect(formatCustomValue(1234567.4, 'dollars')).toBe('$1,234,567');
		expect(formatCustomValue(-250, 'dollars')).toBe('-$250');
	});

	it('percent multiplies a fraction by 100', () => {
		expect(formatCustomValue(0.1234, 'percent')).toBe('12.3%');
	});

	it('an unknown stored format falls back to the default', () => {
		expect(normalizeNumberFormat('weird')).toBe(DEFAULT_NUMBER_FORMAT);
		expect(formatCustomValue(173.456, 'weird')).toBe('173');
	});
});

describe('formatOperandValue', () => {
	it('shows money in the grid units and a missing value as an em dash', () => {
		const budget = OPERANDS_BY_KEY.get('budget')!;
		expect(formatOperandValue(budget, 2_000_000)).toBe('$2,000,000');
		expect(formatOperandValue(budget, null)).toBe(EMPTY_CELL);
	});

	it('shows a TMDB score with one decimal', () => {
		expect(formatOperandValue(OPERANDS_BY_KEY.get('tmdbScore')!, 8)).toBe('8.0');
	});
});

describe('saveErrorMessage', () => {
	it('explains a name clash in plain words', () => {
		expect(saveErrorMessage(new Error('GraphQL Error: name already in use'))).toMatch(/already have a custom column/);
	});

	it('gives a generic line for anything else', () => {
		expect(saveErrorMessage(new Error('socket hang up'))).toMatch(/Could not save this column/);
		expect(saveErrorMessage('not an error')).toMatch(/Could not save this column/);
	});
});

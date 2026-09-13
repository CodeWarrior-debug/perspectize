import { describe, it, expect } from 'vitest';
import { formatColorForUnit, parseColorInput } from '$lib/theme/format';

describe('formatColorForUnit', () => {
	const navy = '#1a365d';

	it('returns the hex string unchanged for the "hex" unit', () => {
		expect(formatColorForUnit(navy, 'hex')).toBe('#1a365d');
	});

	it('formats as an rgb() string for the "rgb" unit', () => {
		expect(formatColorForUnit(navy, 'rgb')).toBe('rgb(26, 54, 93)');
	});

	it('formats as an oklch() string for the "oklch" unit', () => {
		const result = formatColorForUnit(navy, 'oklch');
		expect(result).toMatch(/^oklch\(\d+\.\d{3} \d+\.\d{3} \d+\.\d\)$/);
	});

	it('produces a different string per unit for the same color (the toggle must actually change the display)', () => {
		const hex = formatColorForUnit(navy, 'hex');
		const rgb = formatColorForUnit(navy, 'rgb');
		const oklch = formatColorForUnit(navy, 'oklch');
		expect(new Set([hex, rgb, oklch]).size).toBe(3);
	});

	it('falls back to the original string for an unparseable color', () => {
		expect(formatColorForUnit('not-a-color', 'oklch')).toBe('not-a-color');
		expect(formatColorForUnit('not-a-color', 'rgb')).toBe('not-a-color');
	});
});

describe('parseColorInput', () => {
	it('parses a hex string back to itself', () => {
		expect(parseColorInput('#1a365d')).toBe('#1a365d');
	});

	it('parses an rgb() string into hex', () => {
		expect(parseColorInput('rgb(26, 54, 93)')).toBe('#1a365d');
	});

	it('parses an oklch() string into hex', () => {
		const hex = parseColorInput('oklch(0.301 0.056 259.2)');
		expect(hex).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('trims surrounding whitespace before parsing', () => {
		expect(parseColorInput('  #1a365d  ')).toBe('#1a365d');
	});

	it('returns null for empty/whitespace-only input', () => {
		expect(parseColorInput('')).toBeNull();
		expect(parseColorInput('   ')).toBeNull();
	});

	it('returns null for unparseable input', () => {
		expect(parseColorInput('not a color')).toBeNull();
	});
});

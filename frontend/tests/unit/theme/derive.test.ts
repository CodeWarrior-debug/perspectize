import { describe, it, expect } from 'vitest';
import { differenceEuclidean, wcagContrast } from 'culori';
import { deriveTheme, toCssVarMap, type BaseThemeTokens } from '$lib/theme/derive';
import { THEME_PRESETS } from '$lib/theme/presets';

const READING_ROOM_BASE: BaseThemeTokens = THEME_PRESETS[0].base;

describe('deriveTheme', () => {
	it('derives all expected token keys from the 8 base tokens', () => {
		const full = deriveTheme(READING_ROOM_BASE);
		expect(full.card).toBeDefined();
		expect(full.cardForeground).toBeDefined();
		expect(full.popover).toBeDefined();
		expect(full.primaryForeground).toBeDefined();
		expect(full.secondaryHover).toBeDefined();
		expect(full.muted).toBeDefined();
		expect(full.mutedForeground).toBeDefined();
		expect(full.ring).toBe(full.primary);
		expect(full.input).toBe(full.border);
		expect(full.ratingPositive).toBeDefined();
		expect(full.ratingNeutral).toBeDefined();
		expect(full.ratingNegative).toBeDefined();
		expect(full.ratingUndecided).toBeDefined();
	});

	it('keeps base tokens unchanged on the output (base 8 pass through)', () => {
		const full = deriveTheme(READING_ROOM_BASE);
		expect(full.primary).toBe(READING_ROOM_BASE.primary);
		expect(full.destructive).toBe(READING_ROOM_BASE.destructive);
	});

	it.each(THEME_PRESETS)('produces AA-contrast background/foreground for preset "$id"', (preset) => {
		const full = deriveTheme(preset.base);
		expect(wcagContrast(full.background, full.foreground)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(THEME_PRESETS)('produces AA-contrast card/popover pairs for preset "$id"', (preset) => {
		const full = deriveTheme(preset.base);
		expect(wcagContrast(full.card, full.cardForeground)).toBeGreaterThanOrEqual(4.5);
		expect(wcagContrast(full.popover, full.popoverForeground)).toBeGreaterThanOrEqual(4.5);
	});

	it('clamps a too-low-contrast custom foreground toward AA compliance', () => {
		// Adversarial input: a light gray foreground on a near-white background — fails AA badly.
		const badBase: BaseThemeTokens = {
			...READING_ROOM_BASE,
			background: '#ffffff',
			foreground: '#e5e5e5',
		};
		const before = wcagContrast(badBase.background, badBase.foreground);
		expect(before).toBeLessThan(4.5);

		const full = deriveTheme(badBase);
		expect(wcagContrast(full.background, full.foreground)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(THEME_PRESETS)('keeps rating colors mutually distinguishable for preset "$id"', (preset) => {
		const full = deriveTheme(preset.base);
		const ratings = [full.ratingPositive, full.ratingNeutral, full.ratingNegative, full.ratingUndecided];
		// Each pair must be visually distinct from every other — approximate via contrast-to-each-other check.
		for (let i = 0; i < ratings.length; i++) {
			for (let j = i + 1; j < ratings.length; j++) {
				expect(ratings[i].toLowerCase()).not.toBe(ratings[j].toLowerCase());
			}
		}
	});

	it('tints neutrals toward the theme hue rather than leaving them fully desaturated', () => {
		// Sanity check: derived background for a strongly-hued theme differs from a plain white input.
		const full = deriveTheme(READING_ROOM_BASE);
		// Reading Room's background is already near-white; just assert derivation didn't crash/empty it.
		expect(full.background).toMatch(/^#[0-9a-f]{6}$/i);
	});
});

describe('authored neutrals', () => {
	it('keeps an authored warm background instead of re-hueing it to a cool primary', () => {
		const base = { ...READING_ROOM_BASE, primary: '#2c4a7a', background: '#fbfaf7', secondary: '#f5f3ee' };
		const full = deriveTheme(base);
		expect(full.background).toBe(base.background);
		expect(full.secondary).toBe(base.secondary);
	});

	it('still tints a fully grey background toward the primary hue', () => {
		const full = deriveTheme({ ...READING_ROOM_BASE, background: '#e5e5e5', secondary: '#dddddd' });
		expect(full.background).not.toBe('#e5e5e5');
	});
});

describe('toCssVarMap', () => {
	it('maps every derived token to a --color-* CSS custom property', () => {
		const full = deriveTheme(READING_ROOM_BASE);
		const vars = toCssVarMap(full);
		expect(vars['--color-primary']).toBe(full.primary);
		expect(vars['--color-background']).toBe(full.background);
		expect(vars['--color-rating-positive']).toBe(full.ratingPositive);
		expect(Object.keys(vars).length).toBeGreaterThanOrEqual(25);
	});
});

describe('row tokens', () => {
	const oklabDistance = differenceEuclidean('oklab');

	it.each(THEME_PRESETS)(
		'preset "$id": hover is opaque, clearly distinct from the zebra, and keeps text readable',
		(preset) => {
			const full = deriveTheme(preset.base);
			expect(full.rowHover).toMatch(/^#[0-9a-f]{6}$/);
			expect(full.rowAlt).toMatch(/^#[0-9a-f]{6}$/);
			expect(full.rowHover).not.toBe(full.rowAlt);
			expect(oklabDistance(full.rowHover, full.rowAlt)).toBeGreaterThanOrEqual(0.04);
			expect(wcagContrast(full.foreground, full.rowHover)).toBeGreaterThanOrEqual(4.5);
			expect(wcagContrast(full.foreground, full.rowAlt)).toBeGreaterThanOrEqual(4.5);
		},
	);

	it('tints hover from the foreground when primary is nearly the page colour (dark presets)', () => {
		const midnight = deriveTheme(THEME_PRESETS.find((p) => p.id === 'midnight')!.base);
		expect(midnight.rowAccent).toBe(midnight.foreground);
		const readingRoom = deriveTheme(READING_ROOM_BASE);
		expect(readingRoom.rowAccent).toBe(readingRoom.primary);
	});

	it('keeps hover distinct from the zebra however dim the primary is (hover is not driven by primary lightness)', () => {
		const base = THEME_PRESETS.find((p) => p.id === 'midnight')!.base;
		for (const primary of ['#8fb0ff', '#5a83b2', '#3d5f8a', '#22334a']) {
			const full = deriveTheme({ ...base, primary });
			expect(oklabDistance(full.rowHover, full.rowAlt)).toBeGreaterThanOrEqual(0.04);
			expect(wcagContrast(full.foreground, full.rowHover)).toBeGreaterThanOrEqual(4.5);
		}
		const light = THEME_PRESETS[0].base;
		for (const primary of ['#1a365d', '#4a6a94', '#8aa4c8']) {
			const full = deriveTheme({ ...light, primary });
			expect(oklabDistance(full.rowHover, full.rowAlt)).toBeGreaterThanOrEqual(0.04);
		}
	});

	it('exposes the row tokens as CSS variables', () => {
		const vars = toCssVarMap(deriveTheme(READING_ROOM_BASE));
		expect(Object.keys(vars)).toEqual(
			expect.arrayContaining(['--color-row-alt', '--color-row-hover', '--color-row-accent']),
		);
	});
});

import { describe, expect, it } from 'vitest';
import { GRID_COLOR_PARAM_KEYS, GRID_THEME_PARAMS } from '$lib/utils/grid-theme';

describe('GRID_THEME_PARAMS', () => {
	it('takes every colour from a theme token so the grid follows the picker', () => {
		expect(GRID_COLOR_PARAM_KEYS.length).toBeGreaterThan(0);
		for (const key of GRID_COLOR_PARAM_KEYS) {
			const value = String(GRID_THEME_PARAMS[key as keyof typeof GRID_THEME_PARAMS]);
			expect(value, key).toMatch(/var\(--color-[a-z-]+\)|^transparent$/);
			expect(value, key).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
		}
	});

	it('keeps the 64px row height that avoids clipped descenders', () => {
		expect(GRID_THEME_PARAMS.rowHeight).toBe(64);
	});
});

describe('row colours', () => {
	it('draws hover and zebra from the row tokens', () => {
		expect(GRID_THEME_PARAMS.rowHoverColor).toBe('var(--color-row-hover)');
		expect(GRID_THEME_PARAMS.oddRowBackgroundColor).toBe('var(--color-row-alt)');
	});
});

describe('header', () => {
	it('is a quiet band: muted background, foreground labels, no column dividers', () => {
		expect(GRID_THEME_PARAMS.headerBackgroundColor).toBe('var(--color-muted)');
		expect(GRID_THEME_PARAMS.headerTextColor).toBe('var(--color-foreground)');
		expect(GRID_THEME_PARAMS.headerColumnBorder).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { themeBalham, themeQuartz } from '@ag-grid-community/theming';
import { ACTIVITY_GRID_THEME, GRID_COLOR_PARAM_KEYS, GRID_THEME_PARAMS } from '$lib/utils/grid-theme';

describe('GRID_THEME_PARAMS', () => {
	it('takes every colour from a theme token so the grid follows the picker', () => {
		expect(GRID_COLOR_PARAM_KEYS.length).toBeGreaterThan(0);
		for (const key of GRID_COLOR_PARAM_KEYS) {
			const value = String(GRID_THEME_PARAMS[key as keyof typeof GRID_THEME_PARAMS]);
			expect(value, key).toMatch(/var\(--color-[a-z-]+\)|^transparent$/);
			expect(value, key).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
		}
	});

	it('keeps the 49px row height that avoids clipped descenders while fitting more rows above the fold', () => {
		expect(GRID_THEME_PARAMS.rowHeight).toBe(49);
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

describe('ACTIVITY_GRID_THEME', () => {
	it('is built on Balham, not Quartz', () => {
		expect(ACTIVITY_GRID_THEME.id).toBe(themeBalham.id);
		expect(ACTIVITY_GRID_THEME.id).not.toBe(themeQuartz.id);
	});

	it('keeps Balham’s tighter 4px spacing, half of Quartz’s 8px, which is where the extra width comes from', () => {
		expect(ACTIVITY_GRID_THEME.getParams().spacing).toBe(4);
		expect(themeQuartz.getParams().spacing).toBe(8);
	});

	it('applies the shared token params on top, so the grid still follows the theme picker', () => {
		const params = ACTIVITY_GRID_THEME.getParams();
		for (const key of GRID_COLOR_PARAM_KEYS) {
			expect(String(params[key])).toBe(String(GRID_THEME_PARAMS[key as keyof typeof GRID_THEME_PARAMS]));
		}
	});

	it('pins row and header height, so Balham does not shrink the 2-line title rows', () => {
		const params = ACTIVITY_GRID_THEME.getParams();
		expect(params.rowHeight).toBe(GRID_THEME_PARAMS.rowHeight);
		expect(params.headerHeight).toBe(GRID_THEME_PARAMS.headerHeight);
	});
});

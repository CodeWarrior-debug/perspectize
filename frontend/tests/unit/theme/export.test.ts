import { describe, it, expect } from 'vitest';
import { themeToCssText, themeFileName } from '$lib/theme/export';
import { deriveTheme } from '$lib/theme/derive';
import { THEME_PRESETS } from '$lib/theme/presets';

describe('themeFileName', () => {
	it('kebab-cases an arbitrary theme name', () => {
		expect(themeFileName('My Custom Theme!')).toBe('my-custom-theme.css');
	});

	it('falls back to "theme" for an empty/whitespace name', () => {
		expect(themeFileName('   ')).toBe('theme.css');
	});
});

describe('themeToCssText', () => {
	it('emits an @theme block containing every derived token', () => {
		const tokens = deriveTheme(THEME_PRESETS[0].base);
		const css = themeToCssText('Reading Room', tokens);
		expect(css).toContain('@theme {');
		expect(css).toContain(`--color-primary: ${tokens.primary};`);
		expect(css).toContain(`--color-rating-positive: ${tokens.ratingPositive};`);
	});
});

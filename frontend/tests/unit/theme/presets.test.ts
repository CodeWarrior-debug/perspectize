import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { THEME_PRESETS, DEFAULT_THEME_ID, THEME_PRESET_TOKENS, generatePresetCss } from '$lib/theme/presets';

describe('THEME_PRESET_TOKENS', () => {
	it('derives a full token set for every preset', () => {
		for (const preset of THEME_PRESETS) {
			expect(THEME_PRESET_TOKENS[preset.id]).toBeDefined();
			expect(THEME_PRESET_TOKENS[preset.id].primary).toBe(preset.base.primary);
		}
	});
});

describe('generatePresetCss', () => {
	const css = generatePresetCss();

	it('emits a [data-theme] block for every non-default preset', () => {
		for (const preset of THEME_PRESETS) {
			if (preset.id === DEFAULT_THEME_ID) continue;
			expect(css).toContain(`[data-theme='${preset.id}']`);
		}
	});

	it('excludes the default theme (it ships as the unscoped :root palette)', () => {
		expect(css).not.toContain(`[data-theme='${DEFAULT_THEME_ID}']`);
	});

	it('includes each non-default preset derived tokens as CSS custom properties', () => {
		const archive = THEME_PRESET_TOKENS['archive'];
		expect(css).toContain(`--color-primary: ${archive.primary};`);
	});
});

describe('default theme (Reading Room)', () => {
	// The default palette lives twice: `THEME_PRESETS` (customizer, derivation) and the `@theme` block in
	// app.css (what actually paints before any preset applies). They must agree.
	const css = readFileSync('src/app.css', 'utf8');
	const start = css.indexOf('@theme {');
	const themeBlock = css.slice(start, css.indexOf('\n}', start));
	const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(themeBlock)?.[1]?.toLowerCase();

	it('is the warm paper its description promises, in the preset and in the @theme block', () => {
		const base = THEME_PRESETS.find((p) => p.id === DEFAULT_THEME_ID)!.base;
		expect(base.background).toBe('#fbfaf7');
		expect(token('--color-background')).toBe(base.background);
		expect(token('--color-card')).toBe(base.background);
		expect(token('--color-popover')).toBe(base.background);
		expect(token('--color-secondary')).toBe(base.secondary);
		expect(token('--color-muted')).toBe(base.secondary);
	});
});

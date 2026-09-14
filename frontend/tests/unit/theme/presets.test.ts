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

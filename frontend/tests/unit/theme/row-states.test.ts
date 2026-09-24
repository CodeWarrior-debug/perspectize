import { describe, it, expect } from 'vitest';
import { wcagContrast } from 'culori';
import { deriveTheme } from '$lib/theme/derive';
import { THEME_PRESETS } from '$lib/theme/presets';

/**
 * The interactive states of a grid row and of keyboard focus, pinned for every preset: each state
 * must stay distinguishable from the ones it can overlap with. (Hover vs zebra distance, text
 * contrast and the ring against the page are covered in derive.test.ts.)
 */
describe('row and focus states are visible against each other', () => {
	it.each(THEME_PRESETS)('preset "$id": the hover bar and the focus ring stand out from the hover fill', (preset) => {
		const t = deriveTheme(preset.base);
		expect(wcagContrast(t.rowHover, t.rowAccent), 'hover bar on hover fill').toBeGreaterThanOrEqual(3);
		expect(wcagContrast(t.rowHover, t.ring), 'focus ring on hover fill').toBeGreaterThanOrEqual(3);
		expect(wcagContrast(t.rowAlt, t.ring), 'focus ring on zebra row').toBeGreaterThanOrEqual(3);
	});
});

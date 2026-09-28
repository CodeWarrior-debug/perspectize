import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { toCssVarMap } from '$lib/theme/derive';
import { DEFAULT_THEME_ID, THEME_PRESETS, THEME_PRESET_TOKENS } from '$lib/theme/presets';

/**
 * presets.ts is the source of truth; app.css carries generated copies so the first paint has the
 * right colours before any JS runs. These tests fail when the two drift apart (this already
 * happened once: the default theme's row-hover kept an old derivation after the formula changed).
 * Fix a failure by regenerating: `npx tsx gen-preset-css.mjs` (see frontend/CLAUDE.md).
 */
const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

function declarations(block: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of block.matchAll(/(--color-[a-z-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
	return out;
}

function blockFor(selector: string): string {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) throw new Error(`No ${selector} block in app.css`);
	return css.slice(start, css.indexOf('\n}', start));
}

describe('app.css agrees with presets.ts', () => {
	it.each(THEME_PRESETS.filter((p) => p.id !== DEFAULT_THEME_ID))(
		'[data-theme="$id"] matches the derived tokens exactly',
		(preset) => {
			expect(declarations(blockFor(`[data-theme='${preset.id}']`))).toEqual(
				toCssVarMap(THEME_PRESET_TOKENS[preset.id]),
			);
		},
	);

	it('the default @theme block matches the derived tokens it shares with the presets', () => {
		const derived = toCssVarMap(THEME_PRESET_TOKENS[DEFAULT_THEME_ID]);
		const actual = declarations(blockFor('@theme'));
		// The default block also hand-authors a few values the derivation does not own (e.g. the
		// alpha secondary-hover), so compare the base tokens and the row tokens, which it does own.
		for (const key of [
			'--color-background',
			'--color-foreground',
			'--color-primary',
			'--color-primary-hover',
			'--color-secondary',
			'--color-accent',
			'--color-border',
			'--color-destructive',
			'--color-row-alt',
			'--color-row-hover',
			'--color-row-accent',
		]) {
			expect(actual[key], key).toBe(derived[key]);
		}
	});
});

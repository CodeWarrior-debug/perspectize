import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Settings → Fonts only restyles elements it can find: anything in the `.ag-cell` / heading
 * selectors in app.css, or marked with a `font-slot-*` class. A component that sets its own
 * serif font without a marker silently ignores the user's pick — this test catches that.
 */
const SRC = resolve(__dirname, '../../../src');
const LIB = join(SRC, 'lib');

// Deliberately outside the slots: original-language glyphs (Hebrew/Greek) and a tiny helper caption.
const ALLOWED = new Set(['lib/components/interlinear/WordPopover.svelte', 'lib/components/AddFieldSearch.svelte']);

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.(svelte|ts)$/.test(name) ? [path] : [];
	});
}

const SERIF = /font-\[family-name:var\(--font-family-serif\)\]|\bfont-serif\b|var\(--font-serif\)/;

describe('font slot coverage', () => {
	it('every serif font set in a component is assigned to a font slot', () => {
		const unmarked: string[] = [];
		for (const file of files(LIB)) {
			const rel = relative(SRC, file);
			if (ALLOWED.has(rel) || rel.startsWith('lib/fonts/')) continue;
			readFileSync(file, 'utf8')
				.split('\n')
				.forEach((line, i) => {
					if (SERIF.test(line) && !/font-slot-(heading|cell|longform)/.test(line)) unmarked.push(`${rel}:${i + 1}`);
				});
		}
		expect(unmarked, 'add font-slot-cell or font-slot-longform (or allowlist it here)').toEqual([]);
	});

	it('app.css has an opt-in rule for each slot', () => {
		const css = readFileSync(join(SRC, 'app.css'), 'utf8');
		for (const slot of ['heading', 'cell', 'longform']) {
			expect(css).toMatch(
				new RegExp(`:root\\[data-font-${slot}\\][^{]*\\{\\s*font-family: var\\(--font-slot-${slot}\\);`),
			);
		}
	});
});

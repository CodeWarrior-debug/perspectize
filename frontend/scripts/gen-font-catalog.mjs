#!/usr/bin/env node
/**
 * Regenerates src/lib/fonts/google-fonts-catalog.json — the font list the Settings → Fonts
 * pickers search. Run from frontend/:
 *
 *   node scripts/gen-font-catalog.mjs                 # fetch google-font-metadata from jsdelivr
 *   node scripts/gen-font-catalog.mjs --from file.json # or read a local google-fonts-v2.json
 *
 * Source: the `google-font-metadata` npm package (fontsource's mirror of the Google Fonts API,
 * no API key needed). Deliberately not a devDependency — it is only needed when refreshing the
 * catalog, and pulling it in reshuffled ~1k lines of pnpm-lock.yaml.
 *
 * Output is compact rows `[family, category, weights, italic, variable]` (see FontCatalogRow in
 * src/lib/fonts/googleFonts.ts): ~60 KB, lazy-loaded only when the Fonts section opens.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '6';
const BASE = `https://cdn.jsdelivr.net/npm/google-font-metadata@${VERSION}/data`;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/fonts/google-fonts-catalog.json');

const CATEGORY = { serif: 's', 'sans-serif': 'a', display: 'd', handwriting: 'h', monospace: 'm' };

async function load(name) {
	const i = process.argv.indexOf('--from');
	if (i !== -1 && name === 'google-fonts-v2.json') return JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
	if (i !== -1 && name === 'variable.json') {
		const sibling = resolve(dirname(process.argv[i + 1]), 'variable.json');
		return JSON.parse(readFileSync(sibling, 'utf8'));
	}
	const res = await fetch(`${BASE}/${name}`);
	if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
	return res.json();
}

const fonts = await load('google-fonts-v2.json');
const variable = await load('variable.json');

const rows = Object.entries(fonts)
	// Every face the UI shows is Latin text; a font without a Latin subset can't render it.
	.filter(([, f]) => f.subsets.includes('latin') && CATEGORY[f.category])
	.map(([id, f]) => [
		f.family,
		CATEGORY[f.category],
		[...new Set(f.weights.map(Number))].sort((a, b) => a - b),
		f.styles.includes('italic') ? 1 : 0,
		id in variable ? 1 : 0,
	])
	.sort((a, b) => a[0].localeCompare(b[0], 'en'));

writeFileSync(OUT, JSON.stringify(rows) + '\n');
console.log(`wrote ${rows.length} families to ${OUT}`);

#!/usr/bin/env node
// Builds perspectives-pages.html from preview.src.html by inlining the app's own
// fonts (frontend/static/fonts) so the preview is one self-contained file.
//
//   node docs/superpowers/specs/perspectives-pages-preview/build.mjs
//
// THROWAWAY DESIGN PREVIEW, not product code. Edit preview.src.html, never the output.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.resolve(here, '../../../../frontend/static/fonts');
const srcPath = path.join(here, 'preview.src.html');
const outPath = path.join(here, 'perspectives-pages.html');
const SLOT = '/*@FONTS@*/';

const face = (family, file, weight, style = 'normal') => {
	const b64 = readFileSync(path.join(fontDir, file)).toString('base64');
	return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};font-style:${style};font-display:block}`;
};

const css = [
	face('Geist', 'Geist-Variable.woff2', '100 900'),
	face('Charter', 'Charter-Regular.woff2', '400'),
	face('Charter', 'Charter-Italic.woff2', '400', 'italic'),
	face('Charter', 'Charter-Bold.woff2', '700'),
].join('\n');

const src = readFileSync(srcPath, 'utf8');
if (!src.includes(SLOT)) {
	console.error(`${SLOT} not found in preview.src.html`);
	process.exit(1);
}
writeFileSync(outPath, src.replace(SLOT, () => css));
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${Math.round((src.length + css.length) / 1024)} KB)`);

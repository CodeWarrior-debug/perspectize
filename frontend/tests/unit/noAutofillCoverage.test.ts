import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { NO_AUTOFILL } from '$lib/utils/noAutofill';

// Password managers decorate any text-like input they take for a login or identity field, so
// every raw input/textarea must opt out. The shared shadcn Input does this by default; this test
// keeps the raw elements honest. Types that never take typed text are not checked.
const NON_TEXT_TYPES = new Set([
	'checkbox',
	'radio',
	'file',
	'range',
	'color',
	'hidden',
	'button',
	'submit',
	'reset',
	'image',
]);

const SRC_DIR = resolve(__dirname, '../../src');
const SPREAD = /\{\s*\.\.\.NO_AUTOFILL\s*\}/;

interface RawTag {
	line: number;
	text: string;
	type: string | null; // null = no static type, 'dynamic' = type={...}
}

/** Reads one opening tag from `start` up to its closing `>`, skipping `>` inside braces or quotes. */
function readOpeningTag(source: string, start: number): string {
	let depth = 0;
	let quote: string | null = null;
	for (let i = start; i < source.length; i++) {
		const c = source[i];
		if (quote) {
			if (c === quote) quote = null;
			continue;
		}
		if (depth === 0 && (c === '"' || c === "'")) quote = c;
		else if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (c === '>' && depth === 0) return source.slice(start, i + 1);
	}
	return source.slice(start);
}

function findRawTags(source: string): RawTag[] {
	const tags: RawTag[] = [];
	const open = /<(input|textarea)(?=[\s>/])/g;
	let m: RegExpExecArray | null;
	while ((m = open.exec(source))) {
		const text = readOpeningTag(source, m.index);
		const staticType = /\btype="([^"]*)"/.exec(text) ?? /\btype='([^']*)'/.exec(text);
		let type: string | null = null;
		if (staticType) type = staticType[1];
		else if (/\btype=\{/.test(text)) type = 'dynamic';
		const line = source.slice(0, m.index).split('\n').length;
		tags.push({ line, text, type });
	}
	return tags;
}

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			return name === 'shadcn' ? [] : svelteFiles(path);
		}
		return name.endsWith('.svelte') ? [path] : [];
	});
}

function violations(): string[] {
	const found: string[] = [];
	for (const file of svelteFiles(SRC_DIR)) {
		const source = readFileSync(file, 'utf8');
		for (const tag of findRawTags(source)) {
			if (tag.type !== null && NON_TEXT_TYPES.has(tag.type)) continue;
			if (!SPREAD.test(tag.text)) {
				found.push(`${relative(SRC_DIR, file)}:${tag.line}`);
			}
		}
	}
	return found;
}

describe('password-manager opt-out on raw inputs', () => {
	it('every raw text input and textarea outside shadcn/ spreads NO_AUTOFILL', () => {
		expect(violations()).toEqual([]);
	});

	it('the scanner sees the raw elements it guards (not a vacuous pass)', () => {
		const sample = `<input {...NO_AUTOFILL} onclick={() => a > b} placeholder="x > y" />
<input type="checkbox" />
<textarea {...NO_AUTOFILL}></textarea>
<input type={kind} />`;
		const tags = findRawTags(sample);
		expect(tags.map((t) => t.type)).toEqual([null, 'checkbox', null, 'dynamic']);
		expect(tags.map((t) => SPREAD.test(t.text))).toEqual([true, false, true, false]);
		expect(tags.map((t) => t.line)).toEqual([1, 2, 3, 4]);
	});

	it('the spread is the four-attribute opt-out', () => {
		expect(NO_AUTOFILL).toEqual({
			autocomplete: 'off',
			'data-lpignore': 'true',
			'data-1p-ignore': 'true',
			'data-bwignore': 'true',
		});
	});
});

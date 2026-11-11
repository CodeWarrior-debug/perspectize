import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	applyFontsToDom,
	createFontStore,
	defaultFontState,
	FONT_APPLIED_CACHE_KEY,
	FONT_LINK_ID,
	FONT_STORAGE_KEY,
	fontAppliedCache,
	loadFontState,
	type FontState,
} from '$lib/fonts/store.svelte';
import type { FontChoice } from '$lib/fonts/googleFonts';

const LITERATA: FontChoice = { family: 'Literata', category: 's', weights: [400, 700], italic: true };
const INTER: FontChoice = { family: 'Inter', category: 'a', weights: [400, 600], italic: false };

const root = () => document.documentElement;
const link = () => document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;

function resetDom() {
	localStorage.clear();
	for (const slot of ['heading', 'cell', 'longform']) {
		root().style.removeProperty(`--font-slot-${slot}`);
		root().removeAttribute(`data-font-${slot}`);
	}
	link()?.remove();
}

beforeEach(resetDom);

describe('loadFontState', () => {
	it('defaults every slot to the app font', () => {
		expect(loadFontState()).toEqual(defaultFontState());
	});

	it('ignores corrupt JSON', () => {
		localStorage.setItem(FONT_STORAGE_KEY, '{nope');
		expect(loadFontState()).toEqual(defaultFontState());
	});

	it('keeps valid slots and drops malformed ones', () => {
		localStorage.setItem(
			FONT_STORAGE_KEY,
			JSON.stringify({
				heading: INTER,
				cell: { family: 'Bad', category: 'x', weights: [400], italic: false },
				longform: { family: '', category: 's', weights: [], italic: false },
				extra: LITERATA,
			}),
		);
		expect(loadFontState()).toEqual({ heading: INTER, cell: null, longform: null });
	});
});

describe('applyFontsToDom', () => {
	it('leaves the page untouched when nothing is picked', () => {
		applyFontsToDom(defaultFontState());
		expect(root().hasAttribute('data-font-heading')).toBe(false);
		expect(root().style.getPropertyValue('--font-slot-cell')).toBe('');
		expect(link()).toBeNull();
		expect(JSON.parse(localStorage.getItem(FONT_APPLIED_CACHE_KEY)!)).toEqual({ stacks: {}, href: null });
	});

	it('sets the slot variable and attribute, and loads the stylesheet', () => {
		applyFontsToDom({ heading: null, cell: INTER, longform: LITERATA });
		expect(root().hasAttribute('data-font-cell')).toBe(true);
		expect(root().hasAttribute('data-font-heading')).toBe(false);
		expect(root().style.getPropertyValue('--font-slot-longform')).toBe("'Literata', Georgia, 'Times New Roman', serif");
		expect(link()?.href).toBe(
			'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Literata:ital,wght@0,400;0,700;1,400;1,700&display=swap',
		);
	});

	it('clears a slot and removes the stylesheet once nothing is picked', () => {
		applyFontsToDom({ heading: INTER, cell: null, longform: null });
		applyFontsToDom(defaultFontState());
		expect(root().hasAttribute('data-font-heading')).toBe(false);
		expect(root().style.getPropertyValue('--font-slot-heading')).toBe('');
		expect(link()).toBeNull();
	});

	it('does not write the pre-paint cache for a preview', () => {
		applyFontsToDom({ heading: INTER, cell: null, longform: null }, false);
		expect(localStorage.getItem(FONT_APPLIED_CACHE_KEY)).toBeNull();
	});
});

describe('createFontStore', () => {
	it('applies saved picks on creation', () => {
		localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ heading: INTER }));
		const store = createFontStore();
		expect(store.state.heading).toEqual(INTER);
		expect(root().hasAttribute('data-font-heading')).toBe(true);
	});

	it('set() persists and applies; null goes back to the default', () => {
		const store = createFontStore();
		store.set('cell', INTER);
		expect(JSON.parse(localStorage.getItem(FONT_STORAGE_KEY)!).cell).toEqual(INTER);
		expect(root().hasAttribute('data-font-cell')).toBe(true);

		store.set('cell', null);
		expect(JSON.parse(localStorage.getItem(FONT_STORAGE_KEY)!).cell).toBeNull();
		expect(root().hasAttribute('data-font-cell')).toBe(false);
	});

	it('setAll() replaces every slot at once', () => {
		const store = createFontStore();
		store.set('heading', INTER);
		store.setAll({ heading: null, cell: INTER, longform: LITERATA });
		expect(store.state).toEqual({ heading: null, cell: INTER, longform: LITERATA });
		expect(root().hasAttribute('data-font-heading')).toBe(false);
	});

	it('preview() shows a font without saving it, and endPreview() restores the saved pick', () => {
		const store = createFontStore();
		store.set('longform', LITERATA);
		const savedCache = localStorage.getItem(FONT_APPLIED_CACHE_KEY);

		store.preview('longform', INTER);
		expect(root().style.getPropertyValue('--font-slot-longform')).toContain('Inter');
		expect(store.state.longform).toEqual(LITERATA);
		expect(localStorage.getItem(FONT_APPLIED_CACHE_KEY)).toBe(savedCache);

		store.preview('longform', null);
		expect(root().hasAttribute('data-font-longform')).toBe(false);

		store.endPreview();
		expect(root().style.getPropertyValue('--font-slot-longform')).toContain('Literata');
	});
});

describe("app.html's pre-paint font script", () => {
	// The inline script in app.html applies the cached picks before the app loads; it must
	// produce exactly what applyFontsToDom does, or the page visibly re-styles on hydration.
	const html = readFileSync(resolve(__dirname, '../../../src/app.html'), 'utf8');
	// Parse with the DOM rather than a regex: a <script> regex is the classic bad HTML filter.
	const script = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script')]
		.map((s) => s.textContent ?? '')
		.find((s) => s.includes('perspectize-fonts-applied'));

	function runPrePaint() {
		new Function(script!)();
	}

	function snapshot() {
		return {
			attrs: ['heading', 'cell', 'longform'].map((s) => root().hasAttribute(`data-font-${s}`)),
			vars: ['heading', 'cell', 'longform'].map((s) => root().style.getPropertyValue(`--font-slot-${s}`)),
			href: link()?.getAttribute('href') ?? null,
		};
	}

	it('exists', () => {
		expect(script).toBeTruthy();
	});

	it('matches applyFontsToDom for the same picks', () => {
		const state: FontState = { heading: INTER, cell: null, longform: LITERATA };
		applyFontsToDom(state);
		const fromStore = snapshot();

		const cache = localStorage.getItem(FONT_APPLIED_CACHE_KEY)!;
		resetDom();
		localStorage.setItem(FONT_APPLIED_CACHE_KEY, cache);
		runPrePaint();
		expect(snapshot()).toEqual(fromStore);
	});

	it('only ever loads a Google Fonts stylesheet from the cache', () => {
		localStorage.setItem(
			FONT_APPLIED_CACHE_KEY,
			JSON.stringify({
				...fontAppliedCache({ heading: INTER, cell: null, longform: null }),
				href: 'https://evil.example/x.css',
			}),
		);
		runPrePaint();
		expect(link()).toBeNull();
		expect(root().hasAttribute('data-font-heading')).toBe(true);
	});

	it('survives a corrupt cache', () => {
		localStorage.setItem(FONT_APPLIED_CACHE_KEY, '{nope');
		expect(runPrePaint).not.toThrow();
		expect(snapshot().attrs).toEqual([false, false, false]);
	});
});

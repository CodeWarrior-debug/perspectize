import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBibleVersionStore, BIBLE_VERSION_KEY } from '$lib/utils/bibleVersion.svelte';
import translations from '$lib/data/bible-translations.json';
import { DEFAULT_VERSION } from '$lib/utils/bibleLinks';

describe('bible-translations.json', () => {
	it('matches data/bible/translations.json (frontend copy has not drifted)', () => {
		const root = JSON.parse(readFileSync(resolve(__dirname, '../../../data/bible/translations.json'), 'utf8'));
		expect(translations).toEqual(root);
	});

	it('includes the default version', () => {
		expect(translations.some((t) => t.code === DEFAULT_VERSION)).toBe(true);
	});
});

describe('createBibleVersionStore', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('defaults to ESV when nothing is stored', () => {
		expect(createBibleVersionStore().code).toBe('ESV');
	});

	it('restores a persisted choice', () => {
		localStorage.setItem(BIBLE_VERSION_KEY, 'NIV');
		expect(createBibleVersionStore().code).toBe('NIV');
	});

	it('ignores a stored code that is not in the translations list', () => {
		localStorage.setItem(BIBLE_VERSION_KEY, 'NOPE');
		expect(createBibleVersionStore().code).toBe('ESV');
	});

	it('persists and reflects a new choice', () => {
		const store = createBibleVersionStore();
		store.set('KJV');
		expect(store.code).toBe('KJV');
		expect(localStorage.getItem(BIBLE_VERSION_KEY)).toBe('KJV');
	});

	it('rejects an unknown code without changing state', () => {
		const store = createBibleVersionStore();
		store.set('NOPE');
		expect(store.code).toBe('ESV');
	});

	it('still works when localStorage throws on read', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(createBibleVersionStore().code).toBe('ESV');
	});

	it('still updates in memory when localStorage throws on write', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const store = createBibleVersionStore();
		store.set('NLT');
		expect(store.code).toBe('NLT');
	});
});

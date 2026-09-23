import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftKey, saveDraft, loadDraft, clearDraft } from '$lib/utils/perspectiveDraft';

describe('perspectiveDraft', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('saving then loading returns the same HTML', () => {
		const key = draftKey(1, 2);
		saveDraft(key, '<p>hello</p>');
		expect(loadDraft(key)).toBe('<p>hello</p>');
	});

	it('loading a never-saved key returns null', () => {
		expect(loadDraft(draftKey('nope', 'nope'))).toBeNull();
	});

	it('clearing removes the draft', () => {
		const key = draftKey(1, 2);
		saveDraft(key, '<p>hello</p>');
		clearDraft(key);
		expect(loadDraft(key)).toBeNull();
	});

	it('draftKey produces a stable, collision-free string for different pairs', () => {
		const a = draftKey(1, 2);
		const b = draftKey(1, 3);
		const c = draftKey(2, 1);
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
		expect(draftKey(1, 2)).toBe(a);
	});

	it('returns the draft only while the server baseline it was started from is unchanged', () => {
		const key = draftKey(1, 2);
		saveDraft(key, '<p>my edit</p>', '<p>server v1</p>');
		expect(loadDraft(key, '<p>server v1</p>')).toBe('<p>my edit</p>');
	});

	it('discards a draft whose baseline no longer matches the server copy', () => {
		const key = draftKey(1, 2);
		saveDraft(key, '<p>my edit</p>', '<p>server v1</p>');
		expect(loadDraft(key, '<p>server v2 saved elsewhere</p>')).toBeNull();
		// ...and the stale entry is gone, not just hidden
		expect(loadDraft(key, '<p>server v1</p>')).toBeNull();
	});

	it('treats a missing baseline as the empty string (a brand-new perspective)', () => {
		const key = draftKey(1, 2);
		saveDraft(key, '<p>new</p>');
		expect(loadDraft(key)).toBe('<p>new</p>');
		expect(loadDraft(key, '')).toBe('<p>new</p>');
	});

	it('degrades to a no-op when localStorage throws (private browsing/quota)', () => {
		const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError');
		});
		const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
			throw new Error('SecurityError');
		});
		const removeItemSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
			throw new Error('SecurityError');
		});

		expect(() => saveDraft('k', 'v')).not.toThrow();
		expect(() => loadDraft('k')).not.toThrow();
		expect(loadDraft('k')).toBeNull();
		expect(() => clearDraft('k')).not.toThrow();

		setItemSpy.mockRestore();
		getItemSpy.mockRestore();
		removeItemSpy.mockRestore();
	});
});

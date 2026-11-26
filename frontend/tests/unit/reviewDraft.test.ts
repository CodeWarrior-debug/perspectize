import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createReviewDraft } from '#lib/queries/perspectives/reviewDraft.svelte.js';
import { draftKey } from '#lib/utils/perspectiveDraft.js';

const SCOPE = { contentId: 10, userId: 42 };
const KEY = draftKey(SCOPE.contentId, SCOPE.userId);

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createReviewDraft', () => {
	it('restores nothing when no draft is stored', () => {
		const draft = createReviewDraft(() => SCOPE);
		expect(draft.restore('')).toBeNull();
		expect(draft.restored).toBe(false);
	});

	it('debounces the write: nothing is stored before 1s, then the draft is stored', () => {
		const draft = createReviewDraft(() => SCOPE);
		draft.restore('');
		draft.edit('<p>one</p>');
		vi.advanceTimersByTime(999);
		expect(localStorage.getItem(KEY)).toBeNull();
		vi.advanceTimersByTime(1);
		expect(localStorage.getItem(KEY)).not.toBeNull();
		expect(draft.status).toBe('Draft saved on this device');
	});

	it('flush writes the pending edit at once and shows the saved status', () => {
		const draft = createReviewDraft(() => SCOPE);
		draft.restore('');
		draft.edit('<p>two</p>');
		draft.flush();
		expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').html).toBe('<p>two</p>');
		expect(draft.status).toBe('Draft saved on this device');
	});

	it('restores a draft only against the same server review it was started from', () => {
		const first = createReviewDraft(() => SCOPE);
		first.restore('<p>server</p>');
		first.edit('<p>mine</p>');
		first.flush();

		const same = createReviewDraft(() => SCOPE);
		expect(same.restore('<p>server</p>')).toBe('<p>mine</p>');
		expect(same.restored).toBe(true);
	});

	it('drops a stale draft when the server review has since changed', () => {
		const first = createReviewDraft(() => SCOPE);
		first.restore('<p>old</p>');
		first.edit('<p>mine</p>');
		first.flush();

		const newer = createReviewDraft(() => SCOPE);
		expect(newer.restore('<p>newer elsewhere</p>')).toBeNull();
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('clear removes the stored draft and the status', () => {
		const draft = createReviewDraft(() => SCOPE);
		draft.restore('');
		draft.edit('<p>three</p>');
		draft.flush();
		draft.clear();
		expect(localStorage.getItem(KEY)).toBeNull();
		expect(draft.status).toBe('');
		expect(draft.restored).toBe(false);
	});

	it('an edit after a restore clears the restored flag', () => {
		const first = createReviewDraft(() => SCOPE);
		first.restore('');
		first.edit('<p>four</p>');
		first.flush();

		const again = createReviewDraft(() => SCOPE);
		again.restore('');
		expect(again.restored).toBe(true);
		again.edit('<p>five</p>');
		expect(again.restored).toBe(false);
	});
});

import { draftKey, saveDraft, loadDraft, clearDraft } from '#lib/utils/perspectiveDraft.js';

/**
 * The unsaved review text of one viewer's perspective on one content item, kept in
 * localStorage so a closed popover or a failed save doesn't lose it.
 *
 * `baseline` is the server copy of the review the draft began from (`''` for a new
 * perspective). A draft is only restored while the server copy still equals it, so an
 * older draft can't overwrite a newer save made elsewhere. Writes are debounced; `flush`
 * writes the pending edit now (on close, on page hide).
 */
export function createReviewDraft(scope: () => { contentId: number; userId: number }) {
	const DEBOUNCE_MS = 1000;
	const key = () => {
		const s = scope();
		return draftKey(s.contentId, s.userId);
	};
	let state = $state({ status: '', restored: false });
	let baseline = '';
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: string | null = null;

	function cancelTimer() {
		if (timer) clearTimeout(timer);
		timer = undefined;
		pending = null;
	}

	/** Write the pending edit now. Safe to call when nothing is pending. */
	function flush() {
		const html = pending;
		cancelTimer();
		if (html !== null && saveDraft(key(), html, baseline)) {
			state.status = 'Draft saved on this device';
		}
	}

	return {
		/** Shown under the writing area once the draft is stored; cleared by the next edit. */
		get status() {
			return state.status;
		},
		/** True while the text on screen is a restored draft rather than the server copy. */
		get restored() {
			return state.restored;
		},

		/**
		 * Start from `serverReview`. Returns the restored draft html, or null when the
		 * server copy should be shown.
		 */
		restore(serverReview: string): string | null {
			cancelTimer();
			baseline = serverReview;
			const draft = loadDraft(key(), serverReview);
			if (draft && draft !== serverReview) {
				state.restored = true;
				return draft;
			}
			state.restored = false;
			return null;
		},

		/** Record an edit and schedule the debounced write. */
		edit(html: string) {
			state.restored = false;
			state.status = '';
			pending = html;
			if (timer) clearTimeout(timer);
			timer = setTimeout(flush, DEBOUNCE_MS);
		},

		flush,

		/** Drop the draft (the user discarded it, or the save succeeded). */
		clear() {
			cancelTimer();
			clearDraft(key());
			state.status = '';
			state.restored = false;
		},

		/** Forget any pending write without touching the stored draft. */
		cancel() {
			cancelTimer();
		},
	};
}

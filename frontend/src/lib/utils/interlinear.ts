import type { InterlinearVerse, InterlinearWord } from '$lib/queries/bible';

/** 'H0430G' -> 'H430', 'H1254B' -> 'H1254'. Zero padding and the sense letter are internal. */
export function formatStrongs(tag: string): string {
	const m = /^([HG])0*(\d+)/.exec(tag);
	return m ? `${m[1]}${m[2]}` : '';
}

export function wordKey(verseId: number, wordId: number): string {
	return `${verseId}:${wordId}`;
}

export function phraseWordIds(verse: InterlinearVerse, segment: number): number[] {
	return verse.words.filter((w) => w.segment === segment).map((w) => w.id);
}

/** The word a phrase activates: its first source word in original order. */
export function primaryWordKey(verse: InterlinearVerse, segment: number): string | null {
	const ids = phraseWordIds(verse, segment);
	return ids.length ? wordKey(verse.verseId, ids[0]) : null;
}

/**
 * The verse's words in the order of their matched English phrases (for the chips row), so the
 * source words read left to right like the English above them. A word with no phrase sits just
 * before the next phrased word (or just after the previous one when none follows). Ties keep
 * original order. Returns a new array; `verse.words` is untouched.
 */
export function englishOrderWords(verse: InterlinearVerse): InterlinearWord[] {
	const words = verse.words;
	const pos = words.map((w, i) => {
		if (w.segment !== null) return w.segment;
		for (let j = i + 1; j < words.length; j++) {
			const seg = words[j].segment;
			if (seg !== null) return seg - 0.5;
		}
		for (let j = i - 1; j >= 0; j--) {
			const seg = words[j].segment;
			if (seg !== null) return seg + 0.5;
		}
		return 0; // no segmented word at all: equal positions, so sourceOrder keeps original order
	});
	return words
		.map((w, i) => ({ w, p: pos[i] }))
		.sort((a, b) => a.p - b.p || a.w.sourceOrder - b.w.sourceOrder)
		.map((x) => x.w);
}

export interface InterlinearState {
	hover: string | null;
	pinned: string | null;
}

export type InterlinearEvent =
	| { type: 'enter'; key: string }
	| { type: 'leave'; key: string }
	| { type: 'click'; key: string }
	| { type: 'dblclick' }
	| { type: 'escape' }
	| { type: 'outside' };

export const initialInterlinearState: InterlinearState = { hover: null, pinned: null };

export function reduceInterlinear(state: InterlinearState, event: InterlinearEvent): InterlinearState {
	switch (event.type) {
		case 'enter':
			return { ...state, hover: event.key };
		case 'leave':
			return state.hover === event.key ? { ...state, hover: null } : state;
		case 'click':
			return { hover: event.key, pinned: state.pinned === event.key ? null : event.key };
		case 'dblclick':
		case 'escape':
		case 'outside':
			return { hover: null, pinned: null };
	}
}

export function activeKey(state: InterlinearState): string | null {
	return state.pinned ?? state.hover;
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Popover position relative to `container`: below the anchor, left-aligned to it, clamped inside the container. */
export function placePopover(
	anchor: Rect,
	container: Rect,
	popoverWidth: number,
	gap = 9,
): { left: number; top: number } {
	const maxLeft = Math.max(0, container.right - container.left - popoverWidth);
	const left = Math.min(Math.max(anchor.left - container.left, 0), maxLeft);
	return { left, top: anchor.bottom - container.top + gap };
}

/** Line from the bottom-centre of the English word to the top-centre of its chip, relative to `container`. */
export function connectorLine(word: Rect, chip: Rect, container: Rect) {
	return {
		x1: (word.left + word.right) / 2 - container.left,
		y1: word.bottom - container.top,
		x2: (chip.left + chip.right) / 2 - container.left,
		y2: chip.top - container.top,
	};
}

import { describe, it, expect } from 'vitest';
import {
	formatStrongs,
	wordKey,
	phraseWordIds,
	primaryWordKey,
	initialInterlinearState,
	reduceInterlinear,
	activeKey,
	placePopover,
	connectorLine,
	englishOrderWords,
} from '$lib/utils/interlinear';
import type { InterlinearVerse, InterlinearWord } from '$lib/queries/bible';

const verse: InterlinearVerse = {
	verseId: 1,
	chapter: 1,
	verse: 1,
	segments: [
		{ text: 'In the beginning', spaceBefore: false },
		{ text: 'God', spaceBefore: true },
		{ text: 'created', spaceBefore: true },
	],
	// original (Hebrew) order: beginning, created, God, marker; two words share phrase 0
	words: [
		{
			id: 0,
			language: 'heb',
			source: 'a',
			translit: 'a',
			parsing: '',
			strongs: 'H7225G',
			gloss: 'first: beginning',
			tagSource: 'tagged',
			sourceOrder: 0,
			segment: 0,
		},
		{
			id: 1,
			language: 'heb',
			source: 'b',
			translit: 'b',
			parsing: '',
			strongs: 'H1254A',
			gloss: 'to create',
			tagSource: 'tagged',
			sourceOrder: 1,
			segment: 2,
		},
		{
			id: 2,
			language: 'heb',
			source: 'c',
			translit: 'c',
			parsing: '',
			strongs: 'H0430G',
			gloss: 'God',
			tagSource: 'tagged',
			sourceOrder: 2,
			segment: 1,
		},
		{
			id: 3,
			language: 'heb',
			source: 'd',
			translit: 'd',
			parsing: '',
			strongs: 'H0853',
			gloss: '[Obj.]',
			tagSource: 'tagged',
			sourceOrder: 3,
			segment: null,
		},
		{
			id: 4,
			language: 'heb',
			source: 'e',
			translit: 'e',
			parsing: '',
			strongs: 'H0001',
			gloss: 'x',
			tagSource: 'fallback',
			sourceOrder: 4,
			segment: 0,
		},
	],
};

describe('formatStrongs', () => {
	it('drops zero padding and the sense letter', () => {
		expect(formatStrongs('H0430G')).toBe('H430');
		expect(formatStrongs('H1254B')).toBe('H1254');
		expect(formatStrongs('G3439')).toBe('G3439');
		expect(formatStrongs('H0853')).toBe('H853');
	});
	it('returns an empty string for an empty tag', () => {
		expect(formatStrongs('')).toBe('');
	});
});

describe('phrase helpers', () => {
	it('wordKey is verse-qualified', () => {
		expect(wordKey(26137, 3)).toBe('26137:3');
	});
	it('a phrase can have several source words, in original order', () => {
		expect(phraseWordIds(verse, 0)).toEqual([0, 4]);
		expect(phraseWordIds(verse, 1)).toEqual([2]);
	});
	it('the primary word of a phrase is its first source word', () => {
		expect(primaryWordKey(verse, 0)).toBe('1:0');
		expect(primaryWordKey(verse, 2)).toBe('1:1');
	});
	it('a phrase with no words has no primary word', () => {
		expect(primaryWordKey(verse, 99)).toBeNull();
	});
});

describe('interlinear state machine', () => {
	const s0 = initialInterlinearState;

	it('starts idle', () => {
		expect(activeKey(s0)).toBeNull();
	});
	it('hover shows a word and leaving hides it', () => {
		const hovered = reduceInterlinear(s0, { type: 'enter', key: 'a' });
		expect(activeKey(hovered)).toBe('a');
		expect(activeKey(reduceInterlinear(hovered, { type: 'leave', key: 'a' }))).toBeNull();
	});
	it('leaving a different word does not clear the current hover', () => {
		const hovered = reduceInterlinear(s0, { type: 'enter', key: 'b' });
		expect(activeKey(reduceInterlinear(hovered, { type: 'leave', key: 'a' }))).toBe('b');
	});
	it('click pins, and the pin survives leaving', () => {
		let s = reduceInterlinear(s0, { type: 'enter', key: 'a' });
		s = reduceInterlinear(s, { type: 'click', key: 'a' });
		expect(s.pinned).toBe('a');
		s = reduceInterlinear(s, { type: 'leave', key: 'a' });
		expect(activeKey(s)).toBe('a');
	});
	it('clicking the pinned word again unpins it', () => {
		let s = reduceInterlinear(s0, { type: 'click', key: 'a' });
		s = reduceInterlinear(s, { type: 'click', key: 'a' });
		expect(s.pinned).toBeNull();
	});
	it('clicking another word moves the pin', () => {
		let s = reduceInterlinear(s0, { type: 'click', key: 'a' });
		s = reduceInterlinear(s, { type: 'click', key: 'b' });
		expect(s.pinned).toBe('b');
	});
	it('a pinned word wins over a hovered word', () => {
		let s = reduceInterlinear(s0, { type: 'click', key: 'a' });
		s = reduceInterlinear(s, { type: 'enter', key: 'b' });
		expect(activeKey(s)).toBe('a');
	});
	it('double-click, Escape and outside all clear everything', () => {
		const pinned = reduceInterlinear(reduceInterlinear(s0, { type: 'enter', key: 'a' }), { type: 'click', key: 'a' });
		for (const type of ['dblclick', 'escape', 'outside'] as const) {
			const cleared = reduceInterlinear(pinned, { type });
			expect(cleared).toEqual({ hover: null, pinned: null });
		}
	});
});

describe('geometry', () => {
	const container = { left: 100, top: 200, right: 700, bottom: 800 };

	it('popover sits below the anchor, left-aligned to it, relative to the container', () => {
		const chip = { left: 180, top: 500, right: 230, bottom: 530 };
		expect(placePopover(chip, container, 260)).toEqual({ left: 80, top: 339 }); // (180-100), (530-200)+9
	});
	it('popover is clamped inside the container on the right and left', () => {
		const far = { left: 690, top: 500, right: 700, bottom: 530 };
		expect(placePopover(far, container, 260).left).toBe(340); // container width 600 - 260
		const before = { left: 50, top: 500, right: 60, bottom: 530 };
		expect(placePopover(before, container, 260).left).toBe(0);
	});
	it('connector runs from the bottom-centre of the word to the top-centre of the chip', () => {
		const word = { left: 262, top: 368, right: 320, bottom: 390 };
		const chip = { left: 176, top: 500, right: 206, bottom: 534 };
		// verified live against the prototype: created -> H1254 chip
		expect(connectorLine(word, chip, { left: 77, top: 361, right: 1203, bottom: 562 })).toEqual({
			x1: 214, // 291 - 77
			y1: 29, // 390 - 361
			x2: 114, // 191 - 77
			y2: 139, // 500 - 361
		});
	});
});

describe('englishOrderWords', () => {
	const mk = (id: number, segment: number | null): InterlinearWord => ({
		id,
		language: 'heb',
		source: `s${id}`,
		translit: `t${id}`,
		parsing: '',
		strongs: 'H0001',
		gloss: '',
		tagSource: 'tagged',
		sourceOrder: id,
		segment,
	});
	const vs = (words: InterlinearWord[]): InterlinearVerse => ({
		verseId: 9,
		chapter: 1,
		verse: 1,
		segments: [],
		words,
	});
	const ids = (words: InterlinearWord[]) => words.map((w) => w.id);

	it('orders the fixture verse by English phrase; the marker precedes the phrase after it', () => {
		// pos: id0=0, id1=2, id2=1, id3=-0.5 (next segmented word is id4, segment 0), id4=0
		expect(ids(englishOrderWords(verse))).toEqual([3, 0, 4, 2, 1]);
	});
	it('a null-segment word in the middle sits just before the next phrase', () => {
		expect(ids(englishOrderWords(vs([mk(0, 0), mk(1, null), mk(2, 1)])))).toEqual([0, 1, 2]);
		expect(ids(englishOrderWords(vs([mk(0, 1), mk(1, null), mk(2, 0)])))).toEqual([1, 2, 0]);
	});
	it('a trailing null-segment word goes after its preceding phrase', () => {
		expect(ids(englishOrderWords(vs([mk(0, 1), mk(1, 0), mk(2, null)])))).toEqual([1, 2, 0]);
	});
	it('keeps original order when no word has a segment', () => {
		expect(ids(englishOrderWords(vs([mk(0, null), mk(1, null), mk(2, null)])))).toEqual([0, 1, 2]);
	});
	it('does not mutate the verse', () => {
		const before = ids(verse.words);
		const out = englishOrderWords(verse);
		expect(out).not.toBe(verse.words);
		expect(ids(verse.words)).toEqual(before);
	});
});

import { describe, it, expect } from 'vitest';
import { defaultRange, isRangeInBounds, isRangeOrdered } from '$lib/utils/passageRange';
import type { PassageRange } from '$lib/utils/bible';

// Real shapes from bible-books.json: Genesis (id 1) has 50 chapters, ch.1 = 31 verses,
// ch.2 = 25 verses, ch.3 = 24 verses. Obadiah (id 31) is a single chapter of 21 verses.
const GENESIS = 1;
const OBADIAH = 31;

const range = (bookId: number, sc: number, sv: number, ec: number, ev: number): PassageRange => ({
	bookId,
	startChapter: sc,
	startVerse: sv,
	endChapter: ec,
	endVerse: ev,
});

describe('isRangeOrdered', () => {
	it('accepts a single verse (end verse equal to start verse)', () => {
		expect(isRangeOrdered(range(GENESIS, 1, 5, 1, 5))).toBe(true);
	});

	it('accepts a later end verse in the same chapter', () => {
		expect(isRangeOrdered(range(GENESIS, 1, 5, 1, 6))).toBe(true);
	});

	it('rejects an earlier end verse in the same chapter', () => {
		expect(isRangeOrdered(range(GENESIS, 1, 5, 1, 4))).toBe(false);
	});

	it('accepts a later end chapter even when the end verse number is smaller', () => {
		expect(isRangeOrdered(range(GENESIS, 1, 20, 2, 3))).toBe(true);
	});

	it('rejects an earlier end chapter even when the end verse number is larger', () => {
		expect(isRangeOrdered(range(GENESIS, 2, 1, 1, 30))).toBe(false);
	});
});

describe('isRangeInBounds', () => {
	it('accepts a range wholly inside the book', () => {
		expect(isRangeInBounds(range(GENESIS, 1, 1, 2, 3))).toBe(true);
	});

	it('rejects an unknown book id', () => {
		expect(isRangeInBounds(range(9999, 1, 1, 1, 1))).toBe(false);
	});

	it('looks the verse count up in the requested book, not the first book', () => {
		// Genesis has 50 chapters, so chapter 2 exists there; Obadiah has only one.
		expect(isRangeInBounds(range(OBADIAH, 2, 1, 2, 1))).toBe(false);
	});

	it('uses the verse count of the named chapter (chapter N is index N-1)', () => {
		// ch.2 has 25 verses and ch.3 has 24: verse 25 fits ch.2, verse 25 does not fit ch.3
		expect(isRangeInBounds(range(GENESIS, 2, 25, 2, 25))).toBe(true);
		expect(isRangeInBounds(range(GENESIS, 3, 25, 3, 25))).toBe(false);
	});

	it('accepts the last verse of the last chapter and rejects one past it', () => {
		expect(isRangeInBounds(range(OBADIAH, 1, 21, 1, 21))).toBe(true);
		expect(isRangeInBounds(range(OBADIAH, 1, 22, 1, 22))).toBe(false);
	});

	it('rejects verse 0', () => {
		expect(isRangeInBounds(range(GENESIS, 1, 0, 1, 1))).toBe(false);
	});

	it('rejects chapter 0 and a chapter past the last', () => {
		expect(isRangeInBounds(range(GENESIS, 0, 1, 1, 1))).toBe(false);
		expect(isRangeInBounds(range(GENESIS, 51, 1, 51, 1))).toBe(false);
	});

	it('rejects the range when only the end point is out of bounds', () => {
		expect(isRangeInBounds(range(GENESIS, 1, 1, 1, 32))).toBe(false);
	});

	it('rejects the range when only the start point is out of bounds', () => {
		expect(isRangeInBounds(range(GENESIS, 1, 32, 2, 1))).toBe(false);
	});
});

describe('defaultRange', () => {
	it('starts at chapter 1 verse 1 as a single verse in the given book', () => {
		expect(defaultRange(OBADIAH)).toEqual({
			bookId: OBADIAH,
			startChapter: 1,
			startVerse: 1,
			endChapter: 1,
			endVerse: 1,
		});
	});
});

import { describe, it, expect } from 'vitest';
import {
	parseReference,
	formatReference,
	verseOrdinal,
	verseFromOrdinal,
	rangeToVerseIds,
	verseIdsToRange,
	TOTAL_VERSES,
	abbreviateBookName,
	formatChapterVerse,
	abbreviateReferenceFromVerseIds,
	passageIconLabels,
	type PassageRange,
} from '$lib/utils/bible';
import { BIBLE_BOOKS } from '$lib/utils/bibleStructure';

describe('parseReference', () => {
	const cases: Array<[string, PassageRange | null]> = [
		['Genesis 1:1-3', { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 }],
		['Genesis 1:1–3', { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 }],
		['John 3:16', { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }],
		['1 John 2:1', { bookId: 62, startChapter: 2, startVerse: 1, endChapter: 2, endVerse: 1 }],
		['I John 2:1', { bookId: 62, startChapter: 2, startVerse: 1, endChapter: 2, endVerse: 1 }],
		['1John 2:1', { bookId: 62, startChapter: 2, startVerse: 1, endChapter: 2, endVerse: 1 }],
		['  jn 3:16  ', { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }],
		['Psalm 23', { bookId: 19, startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 6 }],
		['Ps 23', { bookId: 19, startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 6 }],
		['John 3', { bookId: 43, startChapter: 3, startVerse: 1, endChapter: 3, endVerse: 36 }],
		['Psalm 119', { bookId: 19, startChapter: 119, startVerse: 1, endChapter: 119, endVerse: 176 }],
		['John 3:16-4:2', { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2 }],
		['not a reference', null],
		['', null],
		['Genesis 200:1', null],
		['Genesis 1:32', null], // Genesis 1 has 31 verses
		['Genesis 1:0', null],
		['Genesis 0', null],
		['Genesis 1:5-3', null], // end before start
		['John 3:16-2:1', null],
		['Psalm 23-24', null],
		['Jude 2', null], // Jude has one chapter
	];

	it.each(cases)('parses %s', (input, expected) => {
		expect(parseReference(input)).toEqual(expected);
	});
});

describe('formatReference', () => {
	it('formats a single verse', () => {
		expect(formatReference({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 })).toBe(
			'John 3:16',
		);
	});

	it('formats a single-chapter range', () => {
		expect(formatReference({ bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 })).toBe(
			'Genesis 1:1-3',
		);
	});

	it('formats a cross-chapter range', () => {
		expect(formatReference({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2 })).toBe(
			'John 3:16-4:2',
		);
	});

	it('round-trips through parseReference', () => {
		for (const original of ['Genesis 1:1-3', 'John 3:16', 'John 3:16-4:2', '1 John 2:1-5']) {
			expect(formatReference(parseReference(original)!)).toBe(original);
		}
	});

	it('throws for an unknown book id', () => {
		expect(() =>
			formatReference({ bookId: 999, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 }),
		).toThrow();
	});
});

describe('verse ordinals', () => {
	it('matches known anchors', () => {
		expect(TOTAL_VERSES).toBe(31102);
		expect(verseOrdinal(1, 1, 1)).toBe(1);
		expect(verseOrdinal(1, 1, 31)).toBe(31);
		expect(verseOrdinal(1, 2, 1)).toBe(32);
		expect(verseOrdinal(66, 22, 21)).toBe(31102);
	});

	it('rejects out-of-range references', () => {
		expect(verseOrdinal(999, 1, 1)).toBeNull();
		expect(verseOrdinal(1, 51, 1)).toBeNull();
		expect(verseOrdinal(1, 1, 32)).toBeNull();
		expect(verseOrdinal(1, 0, 1)).toBeNull();
		expect(verseOrdinal(1, 1, 0)).toBeNull();
		expect(verseFromOrdinal(0)).toBeNull();
		expect(verseFromOrdinal(31103)).toBeNull();
	});

	it('round-trips every verse in the Bible in strict sequence', () => {
		let expected = 0;
		for (const book of BIBLE_BOOKS) {
			for (let ch = 1; ch <= book.versesPerChapter.length; ch++) {
				for (let v = 1; v <= book.versesPerChapter[ch - 1]; v++) {
					expected++;
					expect(verseOrdinal(book.id, ch, v)).toBe(expected);
					expect(verseFromOrdinal(expected)).toEqual({ bookId: book.id, chapter: ch, verse: v });
				}
			}
		}
		expect(expected).toBe(31102);
	});

	it('converts ranges to ids and back', () => {
		const range = parseReference('John 3:16-4:2')!;
		const ids = rangeToVerseIds(range)!;
		expect(ids.endId).toBeGreaterThan(ids.startId);
		expect(verseIdsToRange(ids.startId, ids.endId)).toEqual(range);
	});

	it('returns null for cross-book or reversed id pairs', () => {
		expect(verseIdsToRange(1, 31102)).toBeNull();
		expect(verseIdsToRange(10, 5)).toBeNull();
	});
});

describe('abbreviateBookName', () => {
	it('picks the shortest known alias', () => {
		expect(abbreviateBookName(43)).toBe('Jn'); // John
		expect(abbreviateBookName(1)).toBe('Gn'); // Genesis
	});

	it('returns empty string for an unknown book id', () => {
		expect(abbreviateBookName(9999)).toBe('');
	});
});

describe('formatChapterVerse', () => {
	it('formats a single verse, a same-chapter range, and a cross-chapter range', () => {
		expect(formatChapterVerse({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 })).toBe(
			'3:16',
		);
		expect(formatChapterVerse({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18 })).toBe(
			'3:16-18',
		);
		expect(formatChapterVerse({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2 })).toBe(
			'3:16-4:2',
		);
	});
});

describe('abbreviateReferenceFromVerseIds', () => {
	it('splits a valid same-book range into book abbreviation + chapter:verse', () => {
		expect(abbreviateReferenceFromVerseIds(26137, 26137)).toEqual({ book: 'Jn', chapterVerse: '3:16' });
	});

	it('returns null for a cross-book or reversed pair', () => {
		expect(abbreviateReferenceFromVerseIds(1, 31102)).toBeNull();
		expect(abbreviateReferenceFromVerseIds(10, 5)).toBeNull();
	});
});

describe('passageIconLabels', () => {
	it('splits book abbreviation and chapter:verse across the flaps when there is no title', () => {
		expect(passageIconLabels({ verseStartID: 26137, verseEndID: 26137, displayTitle: null })).toEqual({
			left: 'Jn',
			right: '3:16',
		});
	});

	it('puts the abbreviated reference on the left and the title on the right when a title is set', () => {
		expect(passageIconLabels({ verseStartID: 26137, verseEndID: 26137, displayTitle: 'For God so loved' })).toEqual({
			left: 'Jn 3:16',
			right: 'For God so loved',
		});
	});

	it('returns empty labels when verse ids are missing (icon renders with no overlay)', () => {
		expect(passageIconLabels({ displayTitle: 'Creation' })).toEqual({ left: '', right: '' });
		expect(passageIconLabels({})).toEqual({ left: '', right: '' });
	});
});

import { describe, it, expect } from 'vitest';
import { rangeToVerseIds } from '$lib/utils/bible';
import { singleVerseRange, singleVerseReference } from '$lib/utils/verseJump';
import { activityContentHref } from '$lib/utils/contentLinks';

const john316 = rangeToVerseIds({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 })!.startId;

describe('verseJump helpers', () => {
	it('maps a verse ordinal to its single-verse range', () => {
		expect(singleVerseRange(john316)).toEqual({
			bookId: 43,
			startChapter: 3,
			startVerse: 16,
			endChapter: 3,
			endVerse: 16,
		});
	});

	it('formats a verse ordinal as a full reference', () => {
		expect(singleVerseReference(john316)).toBe('John 3:16');
		expect(singleVerseReference(1)).toBe('Genesis 1:1');
	});

	it('returns null for an out-of-range ordinal', () => {
		expect(singleVerseRange(0)).toBeNull();
		expect(singleVerseReference(10_000_000)).toBeNull();
	});
});

describe('activityContentHref', () => {
	it('deep-links to the Activity page with ?open=<id>', () => {
		expect(activityContentHref('42')).toBe('/?open=42');
		expect(activityContentHref('a b')).toBe('/?open=a%20b');
	});
});

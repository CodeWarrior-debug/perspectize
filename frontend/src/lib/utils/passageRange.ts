import type { PassageRange } from './bible';
import { BIBLE_BOOKS } from './bibleStructure';

const getBookById = (id: number) => BIBLE_BOOKS.find((b) => b.id === id);

/** True when the end of the range is at or after its start. */
export function isRangeOrdered(range: PassageRange): boolean {
	if (range.endChapter !== range.startChapter) return range.endChapter > range.startChapter;
	return range.endVerse >= range.startVerse;
}

/** True when every chapter/verse in the range exists in its book. */
export function isRangeInBounds(range: PassageRange): boolean {
	const book = getBookById(range.bookId);
	if (!book) return false;
	const inBounds = (chapter: number, verse: number) => {
		const count = book.versesPerChapter[chapter - 1];
		return count !== undefined && verse >= 1 && verse <= count;
	};
	return inBounds(range.startChapter, range.startVerse) && inBounds(range.endChapter, range.endVerse);
}

/** Default selection for a book: chapter 1, verse 1 (single verse). */
export function defaultRange(bookId: number): PassageRange {
	return { bookId, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 };
}

import { BIBLE_BOOKS, getBook, type BibleBook } from './bibleStructure';

export interface PassageRange {
	bookId: number;
	startChapter: number;
	startVerse: number;
	endChapter: number;
	endVerse: number;
}

// book name (may contain spaces/digits), chapter, optional :verse, optional
// -[endChapter:]endVerse. Hyphen, en dash, and em dash are all accepted.
const REF_PATTERN = /^(.+?)\s+(\d+)(?::(\d+))?(?:\s*[-–—]\s*(?:(\d+):)?(\d+))?$/;

/** Total verses in the whole Bible (Genesis 1:1 = 1 ... Revelation 22:21 = TOTAL_VERSES). */
export const TOTAL_VERSES = BIBLE_BOOKS.reduce((sum, b) => sum + b.versesPerChapter.reduce((a, n) => a + n, 0), 0);

const SORTED_BOOKS = [...BIBLE_BOOKS].sort((a, b) => a.id - b.id);
const BOOKS_BY_ID = new Map(BIBLE_BOOKS.map((b) => [b.id, b]));

// bookStartOffset[id] = verses in every book with a lower id.
const bookStartOffset = new Map<number, number>();
{
	let running = 0;
	for (const book of SORTED_BOOKS) {
		bookStartOffset.set(book.id, running);
		running += book.versesPerChapter.reduce((a, n) => a + n, 0);
	}
}

function bookById(id: number): BibleBook | undefined {
	return BOOKS_BY_ID.get(id);
}

/**
 * Global 1-based verse ordinal for (bookId, chapter, verse). Mirrors
 * backend BibleVerseOrdinal. Returns null when the reference does not exist.
 */
export function verseOrdinal(bookId: number, chapter: number, verse: number): number | null {
	const book = bookById(bookId);
	if (!book) return null;
	if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.versesPerChapter.length) {
		return null;
	}
	if (!Number.isInteger(verse) || verse < 1 || verse > book.versesPerChapter[chapter - 1]) {
		return null;
	}
	let offset = bookStartOffset.get(bookId)!;
	for (let i = 0; i < chapter - 1; i++) offset += book.versesPerChapter[i];
	return offset + verse;
}

/** Inverse of verseOrdinal. Mirrors backend BibleVerseFromOrdinal. */
export function verseFromOrdinal(ordinal: number): { bookId: number; chapter: number; verse: number } | null {
	if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > TOTAL_VERSES) return null;
	let remaining = ordinal;
	for (const book of SORTED_BOOKS) {
		for (let ch = 0; ch < book.versesPerChapter.length; ch++) {
			const n = book.versesPerChapter[ch];
			if (remaining <= n) return { bookId: book.id, chapter: ch + 1, verse: remaining };
			remaining -= n;
		}
	}
	return null;
}

/** Start/end verse ordinals for a range, or null if either endpoint is invalid. */
export function rangeToVerseIds(range: PassageRange): { startId: number; endId: number } | null {
	const startId = verseOrdinal(range.bookId, range.startChapter, range.startVerse);
	const endId = verseOrdinal(range.bookId, range.endChapter, range.endVerse);
	if (startId === null || endId === null || endId < startId) return null;
	return { startId, endId };
}

/** Resolve a verse-ordinal pair back to a PassageRange, or null if not a same-book range. */
export function verseIdsToRange(startId: number, endId: number): PassageRange | null {
	const s = verseFromOrdinal(startId);
	const e = verseFromOrdinal(endId);
	if (!s || !e || s.bookId !== e.bookId || endId < startId) return null;
	return {
		bookId: s.bookId,
		startChapter: s.chapter,
		startVerse: s.verse,
		endChapter: e.chapter,
		endVerse: e.verse,
	};
}

/**
 * Parse a human-typed reference ("John 3:16", "1 John 2:1-3", "John 3:16-4:2",
 * "Psalm 23") into a PassageRange, or null if it is not a valid reference.
 * A chapter-only reference resolves to the whole chapter. Ranges spanning
 * multiple books are not supported.
 */
export function parseReference(input: string): PassageRange | null {
	const match = REF_PATTERN.exec(input.trim());
	if (!match) return null;

	const [, rawBookName, chapterStr, verseStr, endChapterStr, endVerseStr] = match;
	const book = getBook(rawBookName.replace(/\s+/g, ' '));
	if (!book) return null;

	const startChapter = parseInt(chapterStr, 10);
	if (startChapter < 1 || startChapter > book.versesPerChapter.length) return null;

	if (!verseStr) {
		// Chapter-only ("Psalm 23"); a dash range without verses is not supported.
		if (endVerseStr !== undefined) return null;
		return {
			bookId: book.id,
			startChapter,
			startVerse: 1,
			endChapter: startChapter,
			endVerse: book.versesPerChapter[startChapter - 1],
		};
	}

	const startVerse = parseInt(verseStr, 10);
	const endChapter = endChapterStr ? parseInt(endChapterStr, 10) : startChapter;
	const endVerse = endVerseStr ? parseInt(endVerseStr, 10) : startVerse;

	const range: PassageRange = {
		bookId: book.id,
		startChapter,
		startVerse,
		endChapter,
		endVerse,
	};
	return rangeToVerseIds(range) ? range : null;
}

export function formatReference(range: PassageRange): string {
	const book = bookById(range.bookId);
	if (!book) throw new Error(`Unknown book id: ${range.bookId}`);

	if (range.startChapter === range.endChapter && range.startVerse === range.endVerse) {
		return `${book.name} ${range.startChapter}:${range.startVerse}`;
	}
	if (range.startChapter === range.endChapter) {
		return `${book.name} ${range.startChapter}:${range.startVerse}-${range.endVerse}`;
	}
	return `${book.name} ${range.startChapter}:${range.startVerse}-${range.endChapter}:${range.endVerse}`;
}

/** Shortest known alias for a book (e.g. "Jn" for John) — used where space is tight (icon tiles). */
export function abbreviateBookName(bookId: number): string {
	const book = bookById(bookId);
	if (!book) return '';
	if (book.aliases.length === 0) return book.name;
	return book.aliases.reduce((shortest, alias) => (alias.length < shortest.length ? alias : shortest));
}

/** The chapter:verse (or chapter:verse-verse) portion of a range, without the book name. */
export function formatChapterVerse(range: PassageRange): string {
	if (range.startChapter === range.endChapter && range.startVerse === range.endVerse) {
		return `${range.startChapter}:${range.startVerse}`;
	}
	if (range.startChapter === range.endChapter) {
		return `${range.startChapter}:${range.startVerse}-${range.endVerse}`;
	}
	return `${range.startChapter}:${range.startVerse}-${range.endChapter}:${range.endVerse}`;
}

/**
 * Abbreviated reference for a verse-ordinal pair (book abbreviation + chapter:verse),
 * split into its two halves for the icon tile's book-flap layout. Returns null if the
 * ordinals don't resolve to a valid same-book range.
 */
export function abbreviateReferenceFromVerseIds(
	startVerseId: number,
	endVerseId: number,
): { book: string; chapterVerse: string } | null {
	const range = verseIdsToRange(startVerseId, endVerseId);
	if (!range) return null;
	return { book: abbreviateBookName(range.bookId), chapterVerse: formatChapterVerse(range) };
}

/**
 * Left/right page-flap text for a Bible passage icon tile: with a display
 * title set, the left flap shows the abbreviated reference and the right
 * flap the title; otherwise the reference itself splits across the two
 * flaps — book abbreviation on the left, chapter:verse on the right.
 */
export function passageIconLabels(passage: {
	verseStartID?: number | null;
	verseEndID?: number | null;
	displayTitle?: string | null;
}): { left: string; right: string } {
	const ref =
		passage.verseStartID != null && passage.verseEndID != null
			? abbreviateReferenceFromVerseIds(passage.verseStartID, passage.verseEndID)
			: null;
	if (!ref) return { left: '', right: '' };
	if (passage.displayTitle) return { left: `${ref.book} ${ref.chapterVerse}`, right: passage.displayTitle };
	return { left: ref.book, right: ref.chapterVerse };
}

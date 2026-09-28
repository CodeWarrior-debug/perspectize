import { TOTAL_VERSES, verseFromOrdinal } from './bible';
import { BIBLE_BOOKS } from './bibleStructure';

const versesIn = (bookVerses: number[]) => bookVerses.reduce((a, n) => a + n, 0);

const OT_VERSES = BIBLE_BOOKS.filter((b) => b.testament === 'OLD').reduce(
	(s, b) => s + versesIn(b.versesPerChapter),
	0,
);
const NT_VERSES = TOTAL_VERSES - OT_VERSES;

export interface PassagePosition {
	label: string;
	tooltip: string;
	/** Segment start / width as a percentage of the whole Bible (true values; the view enforces a minimum width). */
	leftPct: number;
	widthPct: number;
	/** Where the New Testament begins, as a percentage of the whole Bible. */
	ntBoundaryPct: number;
}

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (n: number) => `${n.toFixed(2)}%`;

/**
 * Where a same-book verse-ordinal range sits within Scripture (AN Q14): an ordinal
 * label rather than a percentage, with percentages only in the tooltip. Returns
 * null for ordinals outside the seeded range or ranges spanning books.
 */
export function passagePosition(startId: number, endId: number): PassagePosition | null {
	const s = verseFromOrdinal(startId);
	const e = verseFromOrdinal(endId);
	if (!s || !e || s.bookId !== e.bookId || endId < startId) return null;

	const book = BIBLE_BOOKS.find((b) => b.id === s.bookId);
	if (!book) return null;

	const verses = startId === endId ? `Verse ${fmt(startId)}` : `Verses ${fmt(startId)}–${fmt(endId)}`;
	const label = `${verses} of ${fmt(TOTAL_VERSES)} · ${book.name} (book ${book.id} of ${BIBLE_BOOKS.length})`;

	const isOld = book.testament === 'OLD';
	const withinTestament = isOld ? endId / OT_VERSES : (endId - OT_VERSES) / NT_VERSES;
	const tooltip = `${pct((endId / TOTAL_VERSES) * 100)} through Scripture · ${pct(withinTestament * 100)} through the ${
		isOld ? 'Old' : 'New'
	} Testament`;

	return {
		label,
		tooltip,
		leftPct: ((startId - 1) / TOTAL_VERSES) * 100,
		widthPct: ((endId - startId + 1) / TOTAL_VERSES) * 100,
		ntBoundaryPct: (OT_VERSES / TOTAL_VERSES) * 100,
	};
}

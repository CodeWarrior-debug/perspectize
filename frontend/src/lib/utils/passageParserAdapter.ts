/**
 * Single seam between content-type detection and the Bible reference parser
 * (plan Task C1, owned by branch feature/bible-passage-frontend-display).
 *
 * The parser has not landed on this branch yet, so this adapter is a
 * placeholder that recognizes nothing. When C1 lands, replace the body of
 * `parseReference` with a re-export from './bible' (and `PassageRange` with the
 * real type); nothing else in detection changes.
 *
 * Contract expected from C1: chapter-only refs ("Psalm 23") resolve to a whole
 * chapter range, and out-of-range/unparseable input returns null.
 */
export interface PassageRange {
	bookId: number;
	startChapter: number;
	startVerse: number;
	endChapter: number;
	endVerse: number;
}

export function parseReference(_input: string): PassageRange | null {
	// TODO(C1 merge): replace with `export { parseReference } from './bible'`
	return null;
}

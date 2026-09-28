import { getContext, setContext } from 'svelte';
import { formatReference, verseFromOrdinal, type PassageRange } from '$lib/utils/bible';

/**
 * Lets a verse number anywhere inside a passage (plain text or the interlinear
 * view) open the "See <ref> only" prompt owned by the enclosing PassageText,
 * without threading callbacks through OriginalLanguage/InterlinearPassage.
 */
export interface VerseJump {
	/** false for a single-verse passage: "see this verse only" would go nowhere */
	readonly enabled: boolean;
	readonly activeVerseId: number | null;
	toggle(verseId: number, anchor: HTMLElement): void;
}

const KEY = Symbol('verse-jump');

export function setVerseJump(jump: VerseJump): void {
	setContext(KEY, jump);
}

export function getVerseJump(): VerseJump | undefined {
	return getContext<VerseJump | undefined>(KEY);
}

/** The single-verse range for a verse ordinal (verseId), or null if it's out of range. */
export function singleVerseRange(verseId: number): PassageRange | null {
	const v = verseFromOrdinal(verseId);
	if (!v) return null;
	return { bookId: v.bookId, startChapter: v.chapter, startVerse: v.verse, endChapter: v.chapter, endVerse: v.verse };
}

/** "John 3:16" for a verse ordinal, or null if it's out of range. */
export function singleVerseReference(verseId: number): string | null {
	const range = singleVerseRange(verseId);
	return range ? formatReference(range) : null;
}

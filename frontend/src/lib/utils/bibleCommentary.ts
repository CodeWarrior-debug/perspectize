import type { PassageRange } from './bible';
import { BIBLE_BOOKS } from './bibleStructure';

export interface CommentaryLink {
	label: string;
	url: string;
}

const BIBLEHUB = 'https://biblehub.com/commentaries';

// BibleHub slugs are the lowercase book name with underscores; the one irregular
// case among the 66 books is Song of Solomon. Checked against all 66 books on 2026-09-24.
const SLUG_OVERRIDES: Record<string, string> = { 'Song of Solomon': 'songs' };

function slug(name: string): string {
	return SLUG_OVERRIDES[name] ?? name.toLowerCase().replace(/ /g, '_');
}

/**
 * Historic commentary links (AN Q17). Only verified BibleHub URL shapes for now:
 * Matthew Henry by chapter, and the multi-commentator page by verse. StudyLight-hosted
 * commentaries (Gill, Barnes, JFB, Calvin) are deferred until their URL pattern and
 * Calvin's book coverage are hand-verified.
 */
export function commentaryLinks(range: PassageRange): CommentaryLink[] {
	const book = BIBLE_BOOKS.find((b) => b.id === range.bookId);
	if (!book) return [];
	const s = slug(book.name);
	return [
		{ label: 'Matthew Henry (chapter)', url: `${BIBLEHUB}/mhc/${s}/${range.startChapter}.htm` },
		{ label: 'Multiple commentators (verse)', url: `${BIBLEHUB}/${s}/${range.startChapter}-${range.startVerse}.htm` },
	];
}

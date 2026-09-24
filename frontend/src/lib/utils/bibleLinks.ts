import { formatReference, type PassageRange } from './bible';
import { BIBLE_BOOKS } from './bibleStructure';

/** Default Bible Gateway version (AN Q15). Bible Gateway cannot show the BSB we render on-platform. */
export const DEFAULT_VERSION = 'ESV';

const GATEWAY = 'https://www.biblegateway.com/passage/';

// Known versification divergences (AN Q16), by version code -> book ids whose
// verse/chapter numbering differs from our KJV-style ordinals. For these we
// link to the chapter rather than risk landing on the wrong verse.
// Psalms (19): Masoretic numbering counts the superscription as verse 1.
// Joel (29) and Malachi (39): chapter boundaries differ.
const DIVERGENT: Record<string, ReadonlySet<number>> = {
	NABRE: new Set([19, 29, 39]),
};

export interface GatewayLink {
	url: string;
	/** One-line explanation shown when we degraded to a chapter link; null otherwise. */
	note: string | null;
}

function link(search: string, version: string): string {
	return `${GATEWAY}?${new URLSearchParams({ search, version })}`;
}

/**
 * Outbound Bible Gateway link for a range in the given version. Always carries an
 * explicit `version` (the stored dedupe key stays version-less). Degrades to a
 * chapter link with a note for known-divergent (version x book) pairs.
 */
export function gatewayLink(range: PassageRange, version: string): GatewayLink {
	if (DIVERGENT[version]?.has(range.bookId)) {
		const book = BIBLE_BOOKS.find((b) => b.id === range.bookId);
		if (book) {
			return {
				url: link(`${book.name} ${range.startChapter}`, version),
				note: `Verse numbering differs in ${version} — linking to the chapter.`,
			};
		}
	}
	return { url: link(formatReference(range), version), note: null };
}

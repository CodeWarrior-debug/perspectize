import { validateYouTubeUrl } from './youtube';
import { validateMovieInput } from './movie';
import { parseReference, type PassageRange } from './passageParserAdapter';

export type { PassageRange };

export type DetectionResult =
	| { type: 'YOUTUBE_VIDEO'; url: string }
	/** `range` is the ONLY thing to persist; regenerate the canonical string from it, never store pasted text. */
	| { type: 'BIBLE_PASSAGE'; range: PassageRange; source: 'text' | 'biblegateway' }
	/** TMDB or IMDb title link (a bare IMDb id is also accepted, silently). */
	| { type: 'MOVIE'; url: string }
	| { type: null };

const BIBLE_GATEWAY_HOSTS = new Set(['biblegateway.com', 'www.biblegateway.com']);

function parseUrl(input: string): URL | null {
	// Only treat as a URL when it carries an explicit http(s) scheme, so "John 3:16" (which
	// `new URL` would read as scheme "john") is never mistaken for one.
	if (!/^https?:\/\//i.test(input)) return null;
	try {
		return new URL(input);
	} catch {
		return null;
	}
}

function parseBibleGatewayUrl(url: URL): PassageRange | null {
	if (!BIBLE_GATEWAY_HOSTS.has(url.hostname.toLowerCase())) return null;
	// URLSearchParams decodes "+" and %3A, so "Gen+1%3A1-3" becomes "Gen 1:1-3".
	const search = url.searchParams.get('search');
	if (!search) return null;
	return parseReference(search.trim());
}

/**
 * All plausible content types for the input, best first. Patterns are disjoint today
 * (AN Q21) so this has at most one entry, but the list shape lets a future ambiguous
 * type be added without a signature change.
 *
 * Precedence: YouTube URL > movie link > Bible Gateway URL > typed Bible reference. Anything else
 * (any other URL, free text) is no match: empty candidates, never guessed.
 */
export function detectContentCandidates(input: string): DetectionResult[] {
	const trimmed = input.trim();
	if (!trimmed) return [];

	if (validateYouTubeUrl(trimmed)) return [{ type: 'YOUTUBE_VIDEO', url: trimmed }];

	if (validateMovieInput(trimmed)) return [{ type: 'MOVIE', url: trimmed }];

	const url = parseUrl(trimmed);
	if (url) {
		const range = parseBibleGatewayUrl(url);
		return range ? [{ type: 'BIBLE_PASSAGE', range, source: 'biblegateway' }] : [];
	}

	const range = parseReference(trimmed);
	if (range) return [{ type: 'BIBLE_PASSAGE', range, source: 'text' }];

	return [];
}

/** Primary detection for the UI chip; `{ type: null }` means "Select a type". */
export function detectContentType(input: string): DetectionResult {
	return detectContentCandidates(input)[0] ?? { type: null };
}

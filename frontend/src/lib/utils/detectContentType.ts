import { validateYouTubeUrl } from './youtube';
import { validateMovieInput } from './movie';
import { validateBookInput } from './book';
import { parseReference, type PassageRange } from './passageParserAdapter';

export type { PassageRange };

export type DetectionResult =
	| { type: 'YOUTUBE_VIDEO'; url: string }
	/** `range` is the ONLY thing to persist; regenerate the canonical string from it, never store pasted text. */
	| { type: 'BIBLE_PASSAGE'; range: PassageRange; source: 'text' | 'biblegateway' }
	/** TMDB or IMDb title link (a bare IMDb id is also accepted, silently). */
	| { type: 'MOVIE'; url: string }
	/** Open Library work or edition link. Author and other Open Library links are never a book. */
	| { type: 'BOOK'; url: string }
	/** Any other http(s) URL that no type above claims. The server reads its `<head>` once. */
	| { type: 'WEB_PAGE'; url: string }
	| { type: null };

const BIBLE_GATEWAY_HOSTS = new Set(['biblegateway.com', 'www.biblegateway.com']);

/**
 * Hosts that belong to a claimed source (YouTube, TMDB/IMDb, Bible Gateway). A URL on one of
 * these is never a webpage, even when it matches no specific type (a channel page, a TV show).
 */
const CLAIMED_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'youtu.be',
	'themoviedb.org',
	'www.themoviedb.org',
	'imdb.com',
	'www.imdb.com',
	...BIBLE_GATEWAY_HOSTS,
]);

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
 * Precedence: YouTube URL > movie link > Open Library book link > Bible Gateway URL > other
 * http(s) URL on an unclaimed host (WEB_PAGE) > typed Bible reference. Free text is no match:
 * empty candidates, never guessed (claims are declared on the Declare page, not detected here).
 * A URL on a claimed host (YouTube, TMDB/IMDb, Bible Gateway) that matches no type is empty
 * candidates, never a webpage. Scheme-less or non-http(s) input is never guessed: a bare
 * host, `ftp://` or a single bare word gets no candidate.
 */
export function detectContentCandidates(input: string): DetectionResult[] {
	const trimmed = input.trim();
	if (!trimmed) return [];

	if (validateYouTubeUrl(trimmed)) return [{ type: 'YOUTUBE_VIDEO', url: trimmed }];

	if (validateMovieInput(trimmed)) return [{ type: 'MOVIE', url: trimmed }];

	if (validateBookInput(trimmed)) return [{ type: 'BOOK', url: trimmed }];

	const url = parseUrl(trimmed);
	if (url) {
		const range = parseBibleGatewayUrl(url);
		if (range) return [{ type: 'BIBLE_PASSAGE', range, source: 'biblegateway' }];
		if (CLAIMED_HOSTS.has(url.hostname.toLowerCase())) return [];
		return [{ type: 'WEB_PAGE', url: trimmed }];
	}

	const range = parseReference(trimmed);
	if (range) return [{ type: 'BIBLE_PASSAGE', range, source: 'text' }];

	return [];
}

/** Primary detection for the UI chip; `{ type: null }` means "Select a type". */
export function detectContentType(input: string): DetectionResult {
	return detectContentCandidates(input)[0] ?? { type: null };
}

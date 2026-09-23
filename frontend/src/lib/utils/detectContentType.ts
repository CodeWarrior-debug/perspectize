import { validateYouTubeUrl } from './youtube';
import { parseReference, type PassageRange } from './passageParserAdapter';

export type { PassageRange };

export type DetectionResult =
	| { type: 'YOUTUBE'; url: string }
	/** `range` is the ONLY thing to persist; regenerate the canonical string from it, never store pasted text. */
	| { type: 'BIBLE_PASSAGE'; range: PassageRange; source: 'text' | 'biblegateway' }
	| { type: 'CLAIM'; text: string }
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
 * Precedence: YouTube URL > Bible Gateway URL > typed Bible reference > free-text claim.
 * Any other URL is never a claim and never guessed: empty candidates. A single bare
 * word is also not guessed as a claim.
 */
export function detectContentCandidates(input: string): DetectionResult[] {
	const trimmed = input.trim();
	if (!trimmed) return [];

	if (validateYouTubeUrl(trimmed)) return [{ type: 'YOUTUBE', url: trimmed }];

	const url = parseUrl(trimmed);
	if (url) {
		const range = parseBibleGatewayUrl(url);
		return range ? [{ type: 'BIBLE_PASSAGE', range, source: 'biblegateway' }] : [];
	}

	const range = parseReference(trimmed);
	if (range) return [{ type: 'BIBLE_PASSAGE', range, source: 'text' }];

	// Free text: needs at least two words and must not look like a bare host or URL.
	if (/\s/.test(trimmed) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
		return [{ type: 'CLAIM', text: trimmed }];
	}

	return [];
}

/** Primary detection for the UI chip; `{ type: null }` means "Select a type". */
export function detectContentType(input: string): DetectionResult {
	return detectContentCandidates(input)[0] ?? { type: null };
}

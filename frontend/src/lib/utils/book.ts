// Mirrors the server's Open Library link parsing. Like validateMovieInput, the front is
// deliberately unanchored (scheme and any prefix are optional) so the client never rejects
// something the server would accept.
const OPEN_LIBRARY_BOOK_RE = /openlibrary\.org\/(?:works\/OL\d+W|books\/OL\d+M)(?:[-/?#]|$)/i;

/** A link target: no whitespace, and at most one level of balanced parentheses (`javascript:alert(1)`). */
const LINK_TARGET = String.raw`\((?:[^()\s]|\([^()\s]*\))*\)`;
const IMAGE_RE = new RegExp(String.raw`!\[[^\]]*\]${LINK_TARGET}`, 'g');
const LINK_RE = new RegExp(String.raw`\[([^\]]*)\]${LINK_TARGET}`, 'g');
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const REFERENCE_LINE_RE = /^[ \t]*\[[^\]]+\]:[^\n]*$/gm;
const RULE_LINE_RE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm;
const ITALIC_RE = /(^|[\s(])[*_]([^\s*_][^*_\n]*?)[*_](?=[\s).,;:!?]|$)/gm;

/** True when the input is an Open Library work or edition link (scheme optional, slug/query/hash allowed). */
export function validateBookInput(raw: string): boolean {
	return OPEN_LIBRARY_BOOK_RE.test(raw.trim());
}

/**
 * Open Library descriptions are external markdown. Returns plain text only: images are
 * dropped, links keep their label, tags, emphasis markers, rule lines, reference definitions
 * and heading markers are removed, and runs of blank lines collapse to one. The result must
 * only ever be rendered as text, never as HTML.
 */
export function descriptionText(markdown: string): string {
	return markdown
		.replace(IMAGE_RE, '')
		.replace(LINK_RE, '$1')
		.replace(HTML_TAG_RE, '')
		.replace(REFERENCE_LINE_RE, '')
		.replace(RULE_LINE_RE, '')
		.replace(/\*\*|__/g, '')
		.replace(ITALIC_RE, '$1$2')
		.replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function isOpenLibraryHttps(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && parsed.hostname === 'openlibrary.org';
	} catch {
		return false;
	}
}

/** Related-works links that are safe to render as anchors: only https links to openlibrary.org. */
export function safeRelatedWorks(
	works: { title: string; url: string }[] | undefined,
): { title: string; url: string }[] {
	return (works ?? []).filter((work) => isOpenLibraryHttps(work.url));
}

export type Segment = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

// Candidate: http(s):// followed by anything that is not whitespace or an angle bracket/quote.
const CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]$/;

function count(s: string, ch: string): number {
	let n = 0;
	for (const c of s) if (c === ch) n++;
	return n;
}

/** Strip sentence punctuation and unbalanced closing brackets from the end of a matched URL. */
function trimTrailing(url: string): string {
	let out = url;
	for (;;) {
		if (TRAILING_PUNCTUATION.test(out)) {
			out = out.slice(0, -1);
		} else if (out.endsWith(')') && count(out, ')') > count(out, '(')) {
			out = out.slice(0, -1);
		} else {
			return out;
		}
	}
}

function isHttpUrl(s: string): boolean {
	try {
		const { protocol } = new URL(s);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/** Split message text into plain-text and http(s) link segments. Concatenating all `text` fields reproduces the input. */
export function linkify(input: string): Segment[] {
	const segments: Segment[] = [];
	let cursor = 0;
	const push = (seg: Segment) => {
		const last = segments[segments.length - 1];
		if (seg.type === 'text' && last?.type === 'text') last.text += seg.text;
		else if (seg.text !== '') segments.push(seg);
	};

	for (const match of input.matchAll(CANDIDATE)) {
		const start = match.index;
		const url = trimTrailing(match[0]);
		if (!isHttpUrl(url)) continue;
		push({ type: 'text', text: input.slice(cursor, start) });
		push({ type: 'link', text: url, href: url });
		cursor = start + url.length;
	}
	push({ type: 'text', text: input.slice(cursor) });
	return segments;
}

/** True when `href` points at the app's own origin. `origin` is injectable for tests. */
export function isInternalHref(
	href: string,
	origin: string = typeof window === 'undefined' ? '' : window.location.origin,
): boolean {
	try {
		return new URL(href).origin === origin;
	} catch {
		return false;
	}
}

/** Path + search + hash of an internal href, suitable for SvelteKit goto(). */
export function internalPath(href: string): string {
	const u = new URL(href);
	return u.pathname + u.search + u.hash;
}

/** Cmd/Ctrl/Shift/Alt or non-primary button: leave to the browser. */
export function isModifiedClick(e: {
	button: number;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}): boolean {
	return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

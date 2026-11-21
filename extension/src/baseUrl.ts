/** The Perspectize web app the extension opens by default. */
export const PRODUCTION_BASE = 'https://app.perspectize.com';

/**
 * The origin to open /add on: a stored http(s) origin (localhost or a PR preview, chosen on the
 * options page), else production. Only the origin is kept, so a pasted path can't change the route.
 */
export function getBaseUrl(stored: string | undefined): string {
	if (!stored) return PRODUCTION_BASE;
	try {
		const url = new URL(stored);
		if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
	} catch {
		// Malformed value: fall through to production.
	}
	return PRODUCTION_BASE;
}

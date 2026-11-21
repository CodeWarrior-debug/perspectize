/**
 * The origin to open /add on: the http(s) origin the user entered on the options page, or null
 * when none is set. There is deliberately no built-in address, so no deployment's URL is
 * committed. Only the origin is kept, so a pasted path can't change the route.
 */
export function getBaseUrl(stored: string | undefined): string | null {
	if (!stored) return null;
	try {
		const url = new URL(stored);
		if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
	} catch {
		// Malformed value: treated as not set.
	}
	return null;
}

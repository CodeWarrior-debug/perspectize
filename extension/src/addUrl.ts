/** Hosts the Chrome Web Store serves from; Chrome blocks extensions there, so nothing can be added from them. */
const BLOCKED_HOSTS = new Set(['chromewebstore.google.com']);

/** The /add page URL for a page the user is on. The page's own URL and title ride as query params. */
export function buildAddUrl(base: string, pageUrl: string, title?: string): string {
	const params = new URLSearchParams({ url: pageUrl });
	if (title) params.set('title', title);
	return `${base.replace(/\/+$/, '')}/add?${params.toString()}`;
}

/** True for web pages Perspectize can fetch: http(s) only, and not the Chrome Web Store. */
export function isAddableUrl(url: string | undefined): boolean {
	if (!url) return false;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
	if (BLOCKED_HOSTS.has(parsed.hostname)) return false;
	if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return false;
	return true;
}

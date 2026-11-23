/**
 * Turn what someone types in the Link prompt into an absolute URL. A bare "example.com"
 * would otherwise be stored as a relative href and 404 on the app's own origin when clicked.
 * Anything that already has a scheme (https:, mailto:, tel:) or is an in-page / root-relative
 * reference is left alone.
 */
export function normalizeLinkUrl(raw: string): string {
	const url = raw.trim();
	if (url === '') return '';
	if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
	if (url.startsWith('//')) return `https:${url}`;
	if (url.startsWith('#') || url.startsWith('/')) return url;
	return `https://${url}`;
}

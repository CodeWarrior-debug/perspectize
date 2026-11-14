/**
 * Build-time helper for the GraphQL preconnect in app.html.
 *
 * The app's GraphQL requests start only after Clerk finishes (~780 ms on LCP), so the
 * backend's DNS/TCP/TLS and the CORS preflight wait behind it. A preconnect to the
 * endpoint's origin, rendered from the HTML shell, opens that connection in parallel.
 *
 * The endpoint is read the way lib/queries/client.ts reads it (`VITE_GRAPHQL_URL` only,
 * which Sevalla also defines). The localhost dev default in client.ts is deliberately not
 * applied here: a deployed page has no backend on loopback, so empty input yields an
 * empty origin.
 */

/**
 * Origin (`https://host[:port]`) of the GraphQL endpoint for a preconnect, or '' when the
 * endpoint is unset, relative, not http(s), or has a host that is not plain. The result is
 * written unescaped into app.html, so only a URL origin with a plain host passes.
 */
export function graphqlPreconnectOrigin(env: Record<string, string | undefined>): string {
	const endpoint = env.VITE_GRAPHQL_URL;
	if (!endpoint) return '';
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		// Relative paths and garbage land here: same-origin needs no hint.
		return '';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
	// Plain host only (letters, digits, dots, hyphens). Rejects IPv6 brackets and anything odd.
	if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return '';
	// `origin` drops the path, query and any userinfo; the port (if any) is kept.
	return url.origin;
}

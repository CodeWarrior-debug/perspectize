/**
 * Build-time helpers for the Clerk script preload in app.html.
 *
 * svelte-clerk injects clerk-js only after the app bundle boots, which starts the
 * Clerk chain (script → env/client calls → table query) late on LCP. Preloading the
 * same URL from the HTML shell starts that download earlier. The URL must match what
 * svelte-clerk requests exactly (crossorigin="anonymous", same version selector), or
 * the browser downloads clerk-js twice. Derivation mirrors @clerk/shared's
 * loadClerkJsScript (clerkJSScriptUrl + buildScriptHost) for an unproxied, unpinned
 * ClerkProvider with no `domain` prop.
 */

/** Major version svelte-clerk's @clerk/shared resolves to when no clerkJSVersion is set. */
export const CLERK_JS_MAJOR_VERSION = '6';

/**
 * Clerk's frontend API origin, encoded in the publishable key as
 * `pk_<test|live>_<base64(host + '$')>`. Returns '' when the key is missing or malformed.
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string {
	if (!publishableKey) return '';
	const encoded = publishableKey.split('_')[2];
	if (!encoded) return '';
	let decoded: string;
	try {
		decoded = atob(encoded);
	} catch {
		return '';
	}
	// Clerk's decoded value always ends in '$'. Only accept plain hostnames: this value is
	// written into app.html unescaped, so anything else (quotes, angle brackets) is rejected.
	if (!decoded.endsWith('$')) return '';
	const host = decoded.slice(0, -1);
	return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : '';
}

/** The exact clerk-js URL svelte-clerk requests for an origin ('' when no origin). */
export function clerkScriptUrl(origin: string): string {
	if (!origin) return '';
	return `${origin}/npm/@clerk/clerk-js@${CLERK_JS_MAJOR_VERSION}/dist/clerk.browser.js`;
}

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

/**
 * Env vars svelte-clerk's ClerkProvider reads (mergeWithPublicEnvVariables) that change
 * which URL clerk-js is fetched from. If any is set the default URL above is wrong, so
 * we emit no preload rather than a mismatched one (which would download clerk-js twice).
 */
const SCRIPT_URL_OVERRIDES = [
	'PUBLIC_CLERK_JS_URL',
	'PUBLIC_CLERK_JS_VERSION',
	'PUBLIC_CLERK_DOMAIN',
	'PUBLIC_CLERK_PROXY_URL',
] as const;

/**
 * Values for the app.html preconnect/preload, from the build env. The publishable key is
 * resolved the way the app does: layout prop (`VITE_CLERK_PUBLISHABLE_KEY`), else the
 * `PUBLIC_CLERK_PUBLISHABLE_KEY` svelte-clerk falls back to (what Sevalla defines).
 * Both fields are '' when there is no usable key or a URL override is set.
 */
export function clerkPreloadValues(env: Record<string, string | undefined>): {
	origin: string;
	scriptUrl: string;
} {
	if (SCRIPT_URL_OVERRIDES.some((name) => env[name])) return { origin: '', scriptUrl: '' };
	const origin = clerkFrontendApiOrigin(env.VITE_CLERK_PUBLISHABLE_KEY || env.PUBLIC_CLERK_PUBLISHABLE_KEY);
	return { origin, scriptUrl: clerkScriptUrl(origin) };
}

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { clerkFrontendApiOrigin, clerkPreloadValues, clerkScriptUrl } from '$lib/utils/clerkScript';

// The same @clerk/shared svelte-clerk resolves (it isn't hoisted, so resolve from its real path).
const svelteClerkEntry = realpathSync(createRequire(import.meta.url).resolve('svelte-clerk'));
const clerkShared = createRequire(svelteClerkEntry)('@clerk/shared/loadClerkJsScript') as {
	clerkJSScriptUrl: (opts: { publishableKey: string }) => string;
};

// pk_test_ + base64('fake-frontend.clerk.accounts.dev$'). Dummy host, not a real key.
const DEV_KEY = 'pk_test_ZmFrZS1mcm9udGVuZC5jbGVyay5hY2NvdW50cy5kZXYk';
// pk_live_ + base64('clerk.example.test$').
const LIVE_KEY = 'pk_live_Y2xlcmsuZXhhbXBsZS50ZXN0JA==';

describe('clerkFrontendApiOrigin', () => {
	it('decodes a development key to its frontend API origin', () => {
		expect(clerkFrontendApiOrigin(DEV_KEY)).toBe('https://fake-frontend.clerk.accounts.dev');
	});

	it('decodes a production key to its frontend API origin', () => {
		expect(clerkFrontendApiOrigin(LIVE_KEY)).toBe('https://clerk.example.test');
	});

	it.each([
		['missing key', undefined],
		['empty key', ''],
		['no encoded segment', 'pk_test_'],
		['a host with markup', 'pk_test_Ij48eC5jbGVyay5kZXYk'],
	])('returns an empty origin for %s', (_label, key) => {
		expect(clerkFrontendApiOrigin(key)).toBe('');
	});
});

describe('clerkScriptUrl', () => {
	it('builds the same URL svelte-clerk requests', () => {
		expect(clerkScriptUrl('https://fake-frontend.clerk.accounts.dev')).toBe(
			'https://fake-frontend.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js',
		);
	});

	it('returns an empty string when there is no origin', () => {
		expect(clerkScriptUrl('')).toBe('');
	});

	it('matches the URL svelte-clerk actually requests (fails if @clerk/shared changes the version)', () => {
		for (const key of [DEV_KEY, LIVE_KEY]) {
			expect(clerkScriptUrl(clerkFrontendApiOrigin(key))).toBe(clerkShared.clerkJSScriptUrl({ publishableKey: key }));
		}
	});
});

describe('clerkPreloadValues', () => {
	const DEV_ORIGIN = 'https://fake-frontend.clerk.accounts.dev';

	it('uses VITE_CLERK_PUBLISHABLE_KEY when set', () => {
		expect(clerkPreloadValues({ VITE_CLERK_PUBLISHABLE_KEY: DEV_KEY })).toEqual({
			origin: DEV_ORIGIN,
			scriptUrl: clerkScriptUrl(DEV_ORIGIN),
		});
	});

	it('falls back to PUBLIC_CLERK_PUBLISHABLE_KEY, the name Sevalla defines', () => {
		expect(clerkPreloadValues({ PUBLIC_CLERK_PUBLISHABLE_KEY: DEV_KEY }).origin).toBe(DEV_ORIGIN);
	});

	it('prefers the VITE_ key, as the layout prop does', () => {
		expect(
			clerkPreloadValues({
				VITE_CLERK_PUBLISHABLE_KEY: LIVE_KEY,
				PUBLIC_CLERK_PUBLISHABLE_KEY: DEV_KEY,
			}).origin,
		).toBe('https://clerk.example.test');
	});

	it('returns empty values when no key is set', () => {
		expect(clerkPreloadValues({})).toEqual({ origin: '', scriptUrl: '' });
	});

	it.each(['PUBLIC_CLERK_JS_URL', 'PUBLIC_CLERK_JS_VERSION', 'PUBLIC_CLERK_DOMAIN', 'PUBLIC_CLERK_PROXY_URL'])(
		'emits no preload when %s changes where clerk-js is fetched from',
		(name) => {
			expect(clerkPreloadValues({ PUBLIC_CLERK_PUBLISHABLE_KEY: DEV_KEY, [name]: 'x' })).toEqual({
				origin: '',
				scriptUrl: '',
			});
		},
	);
});

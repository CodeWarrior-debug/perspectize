import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { clerkFrontendApiOrigin, clerkScriptUrl } from '$lib/utils/clerkScript';

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

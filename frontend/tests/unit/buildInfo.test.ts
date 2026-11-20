import { describe, it, expect } from 'vitest';
import { APP_VERSION, GIT_SHA, clientPlatform, clientInfoHeaders } from '#lib/buildInfo.js';

describe('build info constants', () => {
	// Either value may be 'unknown' when the build/test run has no git checkout.
	it('APP_VERSION is the deterministic build tag (v<YYYY.MM.DD>-<short7sha>) or unknown', () => {
		expect(typeof APP_VERSION).toBe('string');
		if (APP_VERSION !== 'unknown') {
			expect(APP_VERSION).toMatch(/^v\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7}$/);
		}
	});

	it('GIT_SHA is a 7-char short commit SHA or unknown', () => {
		expect(typeof GIT_SHA).toBe('string');
		if (GIT_SHA !== 'unknown') {
			expect(GIT_SHA).toMatch(/^[0-9a-f]{7}$/);
		}
	});

	it('APP_VERSION ends with GIT_SHA when both are known', () => {
		if (APP_VERSION !== 'unknown' && GIT_SHA !== 'unknown') {
			expect(APP_VERSION.endsWith(`-${GIT_SHA}`)).toBe(true);
		}
	});

	it('is not the old package.json semver', () => {
		expect(APP_VERSION).not.toMatch(/^\d+\.\d+\.\d+/);
	});
});

describe('clientPlatform', () => {
	it("always reports 'web' (the app ships only as a web build)", () => {
		expect(clientPlatform()).toBe('web');
	});
});

describe('clientInfoHeaders', () => {
	it('returns exactly the X-Client-Version and X-Client-Platform headers', () => {
		expect(clientInfoHeaders()).toEqual({
			'X-Client-Version': APP_VERSION,
			'X-Client-Platform': 'web',
		});
	});
});

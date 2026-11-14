import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetPlatform } = vi.hoisted(() => ({ mockGetPlatform: vi.fn() }));

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: mockGetPlatform },
}));

import { APP_VERSION, GIT_SHA, clientPlatform, clientInfoHeaders } from '$lib/buildInfo';

beforeEach(() => {
	mockGetPlatform.mockReset();
	mockGetPlatform.mockReturnValue('web');
});

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
	it("returns 'web' when Capacitor reports web", () => {
		expect(clientPlatform()).toBe('web');
	});

	it("returns 'ios' when Capacitor reports ios", () => {
		mockGetPlatform.mockReturnValue('ios');
		expect(clientPlatform()).toBe('ios');
	});

	it("returns 'android' when Capacitor reports android", () => {
		mockGetPlatform.mockReturnValue('android');
		expect(clientPlatform()).toBe('android');
	});

	it("maps any other value to 'web'", () => {
		mockGetPlatform.mockReturnValue('electron');
		expect(clientPlatform()).toBe('web');
	});

	it("falls back to 'web' if Capacitor throws", () => {
		mockGetPlatform.mockImplementation(() => {
			throw new Error('no bridge');
		});
		expect(clientPlatform()).toBe('web');
	});
});

describe('clientInfoHeaders', () => {
	it('returns exactly the X-Client-Version and X-Client-Platform headers', () => {
		mockGetPlatform.mockReturnValue('ios');
		expect(clientInfoHeaders()).toEqual({
			'X-Client-Version': APP_VERSION,
			'X-Client-Platform': 'ios',
		});
	});
});

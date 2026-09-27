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
	it('APP_VERSION is the non-empty package.json version', () => {
		expect(typeof APP_VERSION).toBe('string');
		expect(APP_VERSION.length).toBeGreaterThan(0);
		expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('GIT_SHA is a non-empty string', () => {
		expect(typeof GIT_SHA).toBe('string');
		expect(GIT_SHA.length).toBeGreaterThan(0);
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

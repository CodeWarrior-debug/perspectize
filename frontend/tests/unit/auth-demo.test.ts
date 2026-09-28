import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DemoSession } from '$lib/auth/demo.svelte';

const STORAGE_KEY = 'perspectize.demoPersona';

describe('DemoSession', () => {
	beforeEach(() => localStorage.clear());

	it('starts signed out with no token', () => {
		const s = new DemoSession();
		s.init(new URL('http://localhost/'));
		expect(s.signedIn).toBe(false);
		expect(s.token).toBeNull();
		expect(s.userId).toBeNull();
	});

	it('signs in from ?demo_as= and persists it', () => {
		const s = new DemoSession();
		s.init(new URL('http://localhost/compare?demo_as=ben'));
		expect(s.persona).toBe('ben');
		expect(s.token).toBe('demo.ben');
		expect(s.userId).toBe('demo_ben');
		expect(s.current?.name).toBe('Ben');
		expect(localStorage.getItem(STORAGE_KEY)).toBe('ben');
	});

	it('restores the stored persona when the URL has no param', () => {
		localStorage.setItem(STORAGE_KEY, 'alice');
		const s = new DemoSession();
		s.init(new URL('http://localhost/'));
		expect(s.persona).toBe('alice');
	});

	it('an empty ?demo_as= signs out and clears storage', () => {
		localStorage.setItem(STORAGE_KEY, 'alice');
		const s = new DemoSession();
		s.init(new URL('http://localhost/?demo_as='));
		expect(s.signedIn).toBe(false);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('ignores unknown persona keys from the URL or storage', () => {
		const s = new DemoSession();
		s.init(new URL('http://localhost/?demo_as=mallory'));
		expect(s.signedIn).toBe(false);

		localStorage.setItem(STORAGE_KEY, 'not-a-persona');
		s.init(new URL('http://localhost/'));
		expect(s.signedIn).toBe(false);
	});

	it('signInAs closes the picker; signOut clears the persona', () => {
		const s = new DemoSession();
		s.pickerOpen = true;
		s.signInAs('carmen');
		expect(s.pickerOpen).toBe(false);
		expect(s.token).toBe('demo.carmen');
		s.signOut();
		expect(s.token).toBeNull();
	});
});

describe('getAuthToken', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		localStorage.clear();
	});

	it('returns the demo persona token in demo mode, never touching Clerk', async () => {
		vi.stubEnv('VITE_DEMO_MODE', 'true');
		vi.resetModules();
		const getToken = vi.fn();
		vi.stubGlobal('Clerk', { session: { getToken } });
		const { getAuthToken, demoSession } = await import('$lib/auth');

		expect(await getAuthToken()).toBeNull();
		demoSession.signInAs('alice');
		expect(await getAuthToken()).toBe('demo.alice');
		expect(getToken).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('uses the Clerk session outside demo mode', async () => {
		vi.stubEnv('VITE_DEMO_MODE', '');
		vi.resetModules();
		vi.stubGlobal('Clerk', { session: { getToken: vi.fn().mockResolvedValue('jwt-123') } });
		const { getAuthToken, DEMO_MODE } = await import('$lib/auth');

		expect(DEMO_MODE).toBe(false);
		expect(await getAuthToken()).toBe('jwt-123');
		vi.unstubAllGlobals();
	});
});

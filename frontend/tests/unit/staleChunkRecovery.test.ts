import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The recovery script lives inline in app.html (it has to run before
// SvelteKit's entry chunks load), so the test extracts and runs that exact
// source against a fake window/location/storage.
const html = readFileSync(resolve(__dirname, '../../src/app.html'), 'utf8');
const source = /<script id="stale-chunk-recovery">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

function makeStorage(throws = false): Storage {
	const data = new Map<string, string>();
	const guard = () => {
		if (throws) throw new Error('SecurityError');
	};
	return {
		getItem: (k: string) => (guard(), data.get(k) ?? null),
		setItem: (k: string, v: string) => (guard(), void data.set(k, v)),
		removeItem: (k: string) => (guard(), void data.delete(k)),
		clear: () => data.clear(),
		key: () => null,
		get length() {
			return data.size;
		},
	};
}

function install(opts: { storage?: Storage; onLine?: boolean } = {}) {
	const win = new EventTarget();
	const location = { reload: vi.fn() };
	const storage = opts.storage ?? makeStorage();
	const navigator = { onLine: opts.onLine ?? true };
	new Function('window', 'location', 'sessionStorage', 'navigator', source)(win, location, storage, navigator);
	return { win, location, storage };
}

function rejection(message: string) {
	const e = new Event('unhandledrejection') as PromiseRejectionEvent;
	Object.defineProperty(e, 'reason', { value: new TypeError(message) });
	return e;
}

function assetError(tag: 'script' | 'link', url: string) {
	const el = document.createElement(tag);
	if (tag === 'script') (el as HTMLScriptElement).src = url;
	else (el as HTMLLinkElement).href = url;
	const e = new Event('error');
	Object.defineProperty(e, 'target', { value: el });
	return e;
}

const banner = () => document.getElementById('stale-chunk-banner');

describe('app.html stale-chunk recovery', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('is present in app.html', () => {
		expect(source).toContain('vite:preloadError');
	});

	it('reloads on a Vite dynamic-import failure', () => {
		const { win, location } = install();
		win.dispatchEvent(new Event('vite:preloadError'));
		expect(location.reload).toHaveBeenCalledTimes(1);
	});

	it.each([
		'Failed to fetch dynamically imported module: https://x/_app/immutable/nodes/2.abc.js', // Chromium
		'Importing a module script failed.', // Safari / iOS
		'error loading dynamically imported module: https://x/_app/immutable/entry/app.js', // Firefox
	])('reloads on an unhandled chunk-load rejection: %s', (message) => {
		const { win, location } = install();
		win.dispatchEvent(rejection(message));
		expect(location.reload).toHaveBeenCalledTimes(1);
	});

	it('ignores unrelated unhandled rejections', () => {
		const { win, location } = install();
		win.dispatchEvent(rejection('GraphQL error: unauthorized'));
		expect(location.reload).not.toHaveBeenCalled();
	});

	it('reloads when a build asset <script>/<link> fails to load', () => {
		const { win, location } = install();
		win.dispatchEvent(assetError('link', 'https://x/_app/immutable/chunks/abc.js'));
		expect(location.reload).toHaveBeenCalledTimes(1);
	});

	it('ignores failures of non-build assets', () => {
		const { win, location } = install();
		win.dispatchEvent(assetError('script', 'https://clerk.accounts.dev/clerk.js'));
		expect(location.reload).not.toHaveBeenCalled();
	});

	it('only reloads once when several failures fire together', () => {
		const { win, location } = install();
		win.dispatchEvent(new Event('vite:preloadError'));
		win.dispatchEvent(rejection('Failed to fetch dynamically imported module: x'));
		expect(location.reload).toHaveBeenCalledTimes(1);
		expect(banner()).toBeNull();
	});

	it('shows a reload banner instead of looping when the reload did not help', () => {
		const storage = makeStorage();
		install({ storage }).win.dispatchEvent(new Event('vite:preloadError'));

		// The page after the reload fails again within the guard window.
		vi.advanceTimersByTime(5_000);
		const second = install({ storage });
		second.win.dispatchEvent(new Event('vite:preloadError'));

		expect(second.location.reload).not.toHaveBeenCalled();
		expect(banner()).not.toBeNull();

		banner()!.querySelector('button')!.click();
		expect(second.location.reload).toHaveBeenCalledTimes(1);
	});

	it('reloads again once the guard window has passed (a later deploy)', () => {
		const storage = makeStorage();
		install({ storage }).win.dispatchEvent(new Event('vite:preloadError'));

		vi.advanceTimersByTime(60_000);
		const later = install({ storage });
		later.win.dispatchEvent(new Event('vite:preloadError'));

		expect(later.location.reload).toHaveBeenCalledTimes(1);
	});

	it('never auto-reloads without sessionStorage (no loop guard)', () => {
		const { win, location } = install({ storage: makeStorage(true) });
		win.dispatchEvent(new Event('vite:preloadError'));
		expect(location.reload).not.toHaveBeenCalled();
		expect(banner()).not.toBeNull();
	});

	it('does not reload into a browser error page while offline', () => {
		const { win, location } = install({ onLine: false });
		win.dispatchEvent(new Event('vite:preloadError'));
		expect(location.reload).not.toHaveBeenCalled();
		expect(banner()).not.toBeNull();
	});
});

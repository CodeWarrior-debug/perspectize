import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { readable } from 'svelte/store';

// Mock $app/environment for tests
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false,
}));

// Mock $app/navigation if needed
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	preloadData: vi.fn(),
	preloadCode: vi.fn(),
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
}));

// Mock $app/state (Svelte 5 runes) — mutable so tests can override url
const mockPageState = {
	url: new URL('http://localhost'),
	params: {},
	route: { id: '/' },
	status: 200,
	error: null,
	data: {},
	form: null,
};

vi.mock('$app/state', () => ({
	page: mockPageState,
}));

// Export for tests that need to change the URL
export { mockPageState };

// Mock $app/stores for components that use page store
vi.mock('$app/stores', () => {
	return {
		page: readable({
			url: new URL('http://localhost'),
			params: {},
			route: { id: '/' },
			status: 200,
			error: null,
			data: {},
			form: null,
		}),
		navigating: readable(null),
		updated: { check: vi.fn(), subscribe: readable(false).subscribe },
	};
});

// Mock $lib/assets/favicon.svg
vi.mock('$lib/assets/favicon.svg', () => ({
	default: '/favicon.svg',
}));

// Mock IntersectionObserver (jsdom doesn't implement it). Fires immediately
// and synchronously with isIntersecting: true so components that lazy-load
// on intersection (e.g. VideoCard's thumbnail) render their real content
// right away in tests, instead of every test having to simulate a scroll.
class IntersectionObserverMock implements IntersectionObserver {
	readonly root: Element | Document | null = null;
	readonly rootMargin: string = '';
	readonly scrollMargin: string = '';
	readonly thresholds: ReadonlyArray<number> = [];
	private callback: IntersectionObserverCallback;

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
	}

	observe(target: Element) {
		this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
	}
	unobserve() {}
	disconnect() {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

// Mock localStorage. Node's own native (experimental) webstorage global
// shadows jsdom's proper implementation in this environment and is
// non-functional without a `--localstorage-file` path, so tests can't rely
// on the real thing — sessionStorage is unaffected since Node's webstorage
// feature only implements localStorage.
class LocalStorageMock implements Storage {
	private store = new Map<string, string>();

	get length(): number {
		return this.store.size;
	}
	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, String(value));
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	clear(): void {
		this.store.clear();
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}
}

Object.defineProperty(window, 'localStorage', {
	writable: true,
	value: new LocalStorageMock(),
});

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false, // Default to desktop (not mobile)
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

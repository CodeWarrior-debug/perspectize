import { describe, it, expect, vi, afterEach } from 'vitest';
import { isEditing, watchForNewVersion } from '$lib/utils/versionWatch';

function setVisibility(state: DocumentVisibilityState) {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
	document.dispatchEvent(new Event('visibilitychange'));
}

function pageShow(persisted: boolean) {
	const e = new Event('pageshow') as PageTransitionEvent;
	Object.defineProperty(e, 'persisted', { value: persisted });
	window.dispatchEvent(e);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchForNewVersion', () => {
	let stop: (() => void) | undefined;

	afterEach(() => {
		stop?.();
		stop = undefined;
		document.body.innerHTML = '';
	});

	it('reloads when the page becomes visible and a new build is deployed', async () => {
		const reload = vi.fn();
		stop = watchForNewVersion({ check: async () => true, reload });

		setVisibility('visible');
		await flush();

		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload when the build is current', async () => {
		const reload = vi.fn();
		stop = watchForNewVersion({ check: async () => false, reload });

		setVisibility('visible');
		await flush();

		expect(reload).not.toHaveBeenCalled();
	});

	it('does not check while the page is being hidden', async () => {
		const check = vi.fn(async () => true);
		stop = watchForNewVersion({ check, reload: vi.fn() });

		setVisibility('hidden');
		await flush();

		expect(check).not.toHaveBeenCalled();
	});

	it('reloads a page restored from the back-forward cache', async () => {
		const reload = vi.fn();
		stop = watchForNewVersion({ check: async () => true, reload });

		pageShow(false);
		await flush();
		expect(reload).not.toHaveBeenCalled();

		pageShow(true);
		await flush();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('keeps the page while the user is typing', async () => {
		const input = document.createElement('textarea');
		document.body.appendChild(input);
		input.focus();
		const reload = vi.fn();
		stop = watchForNewVersion({ check: async () => true, reload });

		setVisibility('visible');
		await flush();

		expect(reload).not.toHaveBeenCalled();
	});

	it('swallows a failed version check (offline)', async () => {
		const reload = vi.fn();
		stop = watchForNewVersion({
			check: () => Promise.reject(new Error('offline')),
			reload,
		});

		setVisibility('visible');
		await flush();

		expect(reload).not.toHaveBeenCalled();
	});

	it('stops listening after cleanup', async () => {
		const check = vi.fn(async () => true);
		watchForNewVersion({ check, reload: vi.fn() })();

		setVisibility('visible');
		await flush();

		expect(check).not.toHaveBeenCalled();
	});
});

describe('isEditing', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('is false with nothing focused', () => {
		expect(isEditing(document)).toBe(false);
	});

	it('is true for a focused input', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();
		expect(isEditing(document)).toBe(true);
	});

	it('is true for a focused contenteditable (the perspective editor)', () => {
		const div = document.createElement('div');
		div.contentEditable = 'true';
		div.tabIndex = 0;
		document.body.appendChild(div);
		div.focus();
		// jsdom doesn't compute isContentEditable from the attribute.
		Object.defineProperty(div, 'isContentEditable', { value: true });
		expect(isEditing(document)).toBe(true);
	});
});

/**
 * `/` used to be the Activity page. It is now rendered only for signed-in visitors (guests see
 * GuestLanding from the root layout) and forwards them to the Library at /content-library,
 * keeping the query and hash so old deep links still open the same view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { mockPageState } from '../setup';

vi.mock('$lib/components/ActivityTable.svelte', () => ({
	default: vi.fn(() => ({ $$: {}, $set: vi.fn(), $on: vi.fn(), $destroy: vi.fn() })),
}));

import RootPage from '../../src/routes/+page.svelte';

describe('root page (/)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('replaces / with /content-library', () => {
		mockPageState.url = new URL('http://localhost/');
		render(RootPage);
		expect(goto).toHaveBeenCalledWith('/content-library', { replaceState: true });
	});

	it('keeps an old deep link: /?open=<id> opens the same item on the Library', () => {
		mockPageState.url = new URL('http://localhost/?open=42');
		render(RootPage);
		expect(goto).toHaveBeenCalledWith('/content-library?open=42', { replaceState: true });
	});

	it('keeps grid filters and the hash', () => {
		mockPageState.url = new URL('http://localhost/?f.type=movie&page=2#top');
		render(RootPage);
		expect(goto).toHaveBeenCalledWith('/content-library?f.type=movie&page=2#top', { replaceState: true });
	});
});

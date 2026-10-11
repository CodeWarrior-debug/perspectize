/**
 * Tests for the Activity page's search-scope picker (src/routes/+page.svelte).
 * ActivityTable itself is stubbed out — it has its own extensive test suite
 * (tests/components/ActivityTable.test.ts) — so these focus purely on the
 * search box + scope popover writing the right `q`/`qf` URL params.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { goto } from '$app/navigation';
import { mockPageState } from '../setup';

vi.mock('$lib/components/ActivityTable.svelte', () => ({
	default: vi.fn(() => ({ $$: {}, $set: vi.fn(), $on: vi.fn(), $destroy: vi.fn() })),
}));

// The "Mine" toggle reads the signed-in user through useMe, which needs Clerk + a
// QueryClient — stub it with a mutable `me` so each test can sign in or out.
const meState = vi.hoisted(() => ({ me: null as { id: string; username: string } | null }));
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return meState.me;
		},
	}),
}));

import Page from '../../src/routes/+page.svelte';

describe('Activity page search scope picker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPageState.url = new URL('http://localhost/');
		meState.me = null;
	});

	async function openScopePicker() {
		render(Page);
		await fireEvent.click(screen.getByRole('button', { name: /choose which fields to search/i }));
		await tick();
	}

	it('renders the search input and the scope picker trigger', () => {
		render(Page);
		expect(screen.getByPlaceholderText('Search content...')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /choose which fields to search/i })).toBeInTheDocument();
	});

	it('defaults to all four scopes checked', async () => {
		await openScopePicker();
		const checkboxes = screen.getAllByRole('checkbox');
		expect(checkboxes).toHaveLength(4);
		for (const checkbox of checkboxes) {
			expect(checkbox).toBeChecked();
		}
	});

	it('reflects an existing qf param by unchecking the excluded scopes', async () => {
		mockPageState.url = new URL('http://localhost/?qf=title%2Cdesc%2Cchannel');
		await openScopePicker();
		expect(screen.getByRole('checkbox', { name: 'Title' })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: 'Description' })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: 'Channel' })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: 'Tags' })).not.toBeChecked();
	});

	it('unchecking a scope navigates with the remaining scopes in qf, resetting to page 1', async () => {
		await openScopePicker();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Tags' }));

		expect(goto).toHaveBeenCalledWith(expect.stringContaining('qf=title%2Cdesc%2Cchannel'), expect.anything());
	});

	it('does not allow unchecking the last remaining scope', async () => {
		mockPageState.url = new URL('http://localhost/?qf=title');
		await openScopePicker();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Title' }));

		expect(goto).not.toHaveBeenCalled();
	});

	it('re-checking a scope removes qf from the URL once all four are selected again', async () => {
		mockPageState.url = new URL('http://localhost/?qf=title%2Cdesc%2Cchannel');
		await openScopePicker();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Tags' }));

		const [url] = (goto as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(url).not.toContain('qf=');
	});

	it('debounces typed search input into a `q` URL param', async () => {
		vi.useFakeTimers();
		try {
			render(Page);
			const input = screen.getByPlaceholderText('Search content...');

			await fireEvent.input(input, { target: { value: 'cooking' } });
			expect(goto).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(300);
			expect(goto).toHaveBeenCalledWith(expect.stringContaining('q=cooking'), expect.anything());
		} finally {
			vi.useRealTimers();
		}
	});

	describe('"Mine" shortcut', () => {
		it('is hidden when signed out', () => {
			render(Page);
			expect(screen.queryByRole('button', { name: 'Mine' })).not.toBeInTheDocument();
		});

		it('filters the User column to the signed-in username, resetting to page 1', async () => {
			meState.me = { id: '7', username: 'ann' };
			mockPageState.url = new URL('http://localhost/?page=3');
			render(Page);

			const button = screen.getByRole('button', { name: 'Mine' });
			expect(button).toHaveAttribute('aria-pressed', 'false');
			await fireEvent.click(button);

			const target = vi.mocked(goto).mock.calls[0][0] as string;
			expect(target).toContain('f.user=ann');
			expect(target).not.toContain('page=');
		});

		it('is pressed when f.user matches the username (case-insensitive) and clears only that filter on click', async () => {
			meState.me = { id: '7', username: 'Ann' };
			mockPageState.url = new URL('http://localhost/?f.user=ann&f.type=youtube_video');
			render(Page);

			const button = screen.getByRole('button', { name: 'Mine' });
			expect(button).toHaveAttribute('aria-pressed', 'true');
			await fireEvent.click(button);

			const target = vi.mocked(goto).mock.calls[0][0] as string;
			expect(target).not.toContain('f.user');
		});

		it('is not pressed when the User filter is someone else', () => {
			meState.me = { id: '7', username: 'ann' };
			mockPageState.url = new URL('http://localhost/?f.user=bob');
			render(Page);
			expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'false');
		});
	});
});

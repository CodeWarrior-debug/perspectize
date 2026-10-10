import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ItemPicker from '$lib/components/plan/ItemPicker.svelte';

const mocks = vi.hoisted(() => ({
	useContentPicker: vi.fn(),
	seen: [] as { search: string; types: string[] }[],
	items: [] as { id: string; name: string; contentType: string; channelTitle: string | null }[],
	isPending: false,
}));

vi.mock('$lib/queries/content/useContentPicker', () => ({
	useContentPicker: mocks.useContentPicker,
}));

const ITEMS = [
	{ id: '9', name: 'A great video', contentType: 'YOUTUBE_VIDEO', channelTitle: 'Some Channel' },
	{ id: '12', name: 'Heat', contentType: 'MOVIE', channelTitle: null },
];

describe('ItemPicker', () => {
	beforeEach(() => {
		mocks.seen = [];
		mocks.items = ITEMS;
		mocks.isPending = false;
		// Like createQuery, re-read the options on every access, so a changed search or chip is seen.
		mocks.useContentPicker.mockReset().mockImplementation((opts: () => { search: string; types: string[] }) => ({
			get data() {
				mocks.seen.push(opts());
				return { content: { items: mocks.items } };
			},
			get isPending() {
				return mocks.isPending;
			},
		}));
	});

	it('asks password managers not to offer to fill the search box', () => {
		render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
		const search = screen.getByPlaceholderText(/Search/);
		expect(search).toHaveAttribute('data-lpignore', 'true');
		expect(search).toHaveAttribute('data-1p-ignore', 'true');
		expect(search).toHaveAttribute('data-bwignore', 'true');
	});

	describe('type chips', () => {
		it('offers one chip per content type, none pressed, and searches every type to begin with', () => {
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
			for (const label of ['YouTube Video', 'Bible Passage', 'Movie']) {
				expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
			}
			expect(mocks.seen.at(-1)).toEqual({ search: '', types: [] });
		});

		it('narrows the search to a pressed chip, and widens it again when pressed twice', async () => {
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
			const movie = screen.getByRole('button', { name: 'Movie' });

			await fireEvent.click(movie);
			expect(movie).toHaveAttribute('aria-pressed', 'true');
			expect(mocks.seen.at(-1)?.types).toEqual(['MOVIE']);

			await fireEvent.click(screen.getByRole('button', { name: 'YouTube Video' }));
			expect(mocks.seen.at(-1)?.types).toEqual(['MOVIE', 'YOUTUBE_VIDEO']);

			await fireEvent.click(movie);
			await fireEvent.click(screen.getByRole('button', { name: 'YouTube Video' }));
			expect(mocks.seen.at(-1)?.types).toEqual([]);
		});
	});

	describe('results', () => {
		it('lists each match with its type, and the channel when it has one', () => {
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
			const video = screen.getByRole('option', { name: /A great video/ });
			expect(video).toHaveTextContent('YouTube Video');
			expect(video).toHaveTextContent('Some Channel');
			const movie = screen.getByRole('option', { name: /Heat/ });
			expect(movie).toHaveTextContent('Movie');
		});

		it('hands the chosen item up as a numeric id and a name', async () => {
			const onPick = vi.fn();
			render(ItemPicker, { props: { onPick, onFreeText: vi.fn() } });
			await fireEvent.click(screen.getByRole('option', { name: /Heat/ }));
			expect(onPick).toHaveBeenCalledWith({ id: 12, name: 'Heat' });
		});

		it('says so when nothing matches', () => {
			mocks.items = [];
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
			expect(screen.getByText('No matching items')).toBeInTheDocument();
			expect(screen.queryAllByRole('option')).toHaveLength(0);
		});

		it('shows a loading line, not "No matching items", while the first fetch is pending', () => {
			mocks.items = [];
			mocks.isPending = true;
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
			expect(screen.getByText('Searching...')).toBeInTheDocument();
			expect(screen.queryByText('No matching items')).toBeNull();
		});

		it('searches what was typed once typing settles', async () => {
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText: vi.fn() } });
			await fireEvent.input(screen.getByPlaceholderText(/Search/), { target: { value: 'heat' } });
			await waitFor(() => expect(mocks.seen.at(-1)?.search).toBe('heat'));
		});
	});

	describe('not in Perspectize', () => {
		it('lets the user give up on search and name the item themselves', async () => {
			const onFreeText = vi.fn();
			render(ItemPicker, { props: { onPick: vi.fn(), onFreeText } });
			await fireEvent.click(screen.getByRole('button', { name: 'Not in Perspectize' }));
			expect(onFreeText).toHaveBeenCalledTimes(1);
		});
	});
});

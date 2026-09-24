import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PassageText from '$lib/components/PassageText.svelte';

const mocks = vi.hoisted(() => ({
	mockQueryState: { data: null as unknown, isLoading: false, isError: false },
	lastOptions: null as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (opts: () => unknown) => {
		mocks.lastOptions = opts();
		return mocks.mockQueryState;
	},
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

const COPYRIGHT = 'Berean Standard Bible, public domain (CC0)';

function makeVerses(n: number) {
	return Array.from({ length: n }, (_, i) => ({
		verseId: i + 1,
		chapter: 1,
		verse: i + 1,
		text: `Verse text ${i + 1}`,
	}));
}

describe('PassageText', () => {
	beforeEach(() => {
		mocks.mockQueryState.data = null;
		mocks.mockQueryState.isLoading = false;
		mocks.mockQueryState.isError = false;
		mocks.lastOptions = null;
	});

	it('shows a loading state', () => {
		mocks.mockQueryState.isLoading = true;
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.getByText(/loading passage/i)).toBeInTheDocument();
	});

	it('shows an error state', () => {
		mocks.mockQueryState.isError = true;
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument();
	});

	it('renders verses in full with attribution at or under the collapse threshold', () => {
		mocks.mockQueryState.data = {
			passageText: { verses: makeVerses(30), translation: 'BSB', copyright: COPYRIGHT },
		};
		render(PassageText, { props: { startVerseId: 1, endVerseId: 30 } });
		expect(screen.getByText(/Verse text 30/)).toBeInTheDocument();
		expect(screen.queryByText(/show full passage/i)).not.toBeInTheDocument();
		expect(screen.getByText(/public domain/i)).toBeInTheDocument();
		expect(mocks.lastOptions.enabled).toBe(true);
	});

	it('collapses a 31-150 verse passage, then expands and collapses again', async () => {
		mocks.mockQueryState.data = {
			passageText: { verses: makeVerses(60), translation: 'BSB', copyright: COPYRIGHT },
		};
		render(PassageText, { props: { startVerseId: 1, endVerseId: 60 } });
		expect(screen.getByText(/Verse text 1$/)).toBeInTheDocument();
		expect(screen.queryByText(/Verse text 60/)).not.toBeInTheDocument();
		expect(screen.getByText(/public domain/i)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /show full passage/i }));
		expect(screen.getByText(/Verse text 60/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /show less/i }));
		expect(screen.queryByText(/Verse text 60/)).not.toBeInTheDocument();
	});

	it('separates consecutive verses with a space so a verse number never runs into the previous verse', () => {
		mocks.mockQueryState.data = {
			passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(2) },
		};
		const { container } = render(PassageText, { props: { startVerseId: 1, endVerseId: 2 } });
		expect(container.textContent).toContain('Verse text 1 2Verse text 2');
	});

	it('shows no verse text, does not fetch, and points to the links below above the hard cap', () => {
		// Genesis 1:1 (id 1) through id 200 is 200 verses.
		render(PassageText, { props: { startVerseId: 1, endVerseId: 200 } });
		expect(mocks.lastOptions.enabled).toBe(false);
		expect(screen.queryByText(/Verse text/)).not.toBeInTheDocument();
		expect(screen.getByText(/200 verses — too long to display here/i)).toBeInTheDocument();
		// The outbound link now lives in PassageLinks (version-aware), not here.
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});
});

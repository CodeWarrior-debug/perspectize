import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PassageText from '$lib/components/PassageText.svelte';

const mocks = vi.hoisted(() => ({
	mockQueryState: { data: null as unknown, isLoading: false, isError: false },
	lastOptions: null as any,
	mutate: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (opts: () => unknown) => {
		mocks.lastOptions = opts();
		return mocks.mockQueryState;
	},
	// Only the "See <ref> only" prompt (VerseJumpPrompt → useOpenPassage) mutates.
	createMutation: () => ({ mutate: mocks.mutate, isPending: false }),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/components/interlinear/OriginalLanguage.svelte', async () => {
	const { default: Stub } = await import('../helpers/OriginalLanguageStub.svelte');
	return { default: Stub };
});

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

	it('offers "Show original language" once the text has loaded, off by default, without mounting the interlinear child', () => {
		mocks.mockQueryState.data = { passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(3) } };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		const toggle = screen.getByRole('button', { name: /show original language/i });
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByTestId('original-language-stub')).not.toBeInTheDocument();
	});

	it('pressing it mounts the interlinear view for the same range and keeps the plain verses available', async () => {
		mocks.mockQueryState.data = { passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(3) } };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		await fireEvent.click(screen.getByRole('button', { name: /show original language/i }));
		const stub = screen.getByTestId('original-language-stub');
		expect(stub.getAttribute('data-range')).toBe('1-3');
		expect(stub).toHaveTextContent('Verse text 1'); // the plain snippet still renders the verses
		expect(screen.getByRole('button', { name: /show original language/i })).toHaveAttribute('aria-pressed', 'true');
	});

	it('pressing it again turns the mode off', async () => {
		mocks.mockQueryState.data = { passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(2) } };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 2 } });
		const toggle = screen.getByRole('button', { name: /show original language/i });
		await fireEvent.click(toggle);
		await fireEvent.click(toggle);
		expect(screen.queryByTestId('original-language-stub')).not.toBeInTheDocument();
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
	});

	it('does not offer the toggle while loading, on error, or above the 150-verse cap', () => {
		mocks.mockQueryState.isLoading = true;
		const { unmount } = render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
		unmount();

		mocks.mockQueryState.isLoading = false;
		mocks.mockQueryState.isError = true;
		const second = render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
		second.unmount();

		mocks.mockQueryState.isError = false;
		render(PassageText, { props: { startVerseId: 1, endVerseId: 200 } });
		expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
	});

	describe('verse number → "See <ref> only"', () => {
		beforeEach(() => {
			mocks.mutate.mockReset();
			mocks.mockQueryState.data = {
				passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(3) },
			};
		});

		it('clicking a verse number opens a prompt for that verse alone', async () => {
			render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
			const verse2 = screen.getByRole('button', { name: 'Verse 2' });
			expect(verse2).toHaveAttribute('aria-expanded', 'false');
			await fireEvent.click(verse2);
			expect(verse2).toHaveAttribute('aria-expanded', 'true');
			expect(screen.getByRole('dialog', { name: /Genesis 1:2 on its own/ })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /See Genesis 1:2 only/ })).toHaveFocus();
		});

		it("the prompt's button find-or-creates that single verse", async () => {
			render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
			await fireEvent.click(screen.getByRole('button', { name: 'Verse 2' }));
			await fireEvent.click(screen.getByRole('button', { name: /See Genesis 1:2 only/ }));
			expect(mocks.mutate).toHaveBeenCalledWith(
				{ bookId: 1, startChapter: 1, startVerse: 2, endChapter: 1, endVerse: 2 },
				expect.anything(),
			);
		});

		it('clicking the same verse number again, pressing Escape, or tapping away closes it', async () => {
			render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
			const verse1 = screen.getByRole('button', { name: 'Verse 1' });

			await fireEvent.click(verse1);
			await fireEvent.click(verse1);
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

			await fireEvent.click(verse1);
			await fireEvent.keyDown(document, { key: 'Escape' });
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
			expect(verse1).toHaveFocus();

			await fireEvent.click(verse1);
			await fireEvent.pointerDown(document.body);
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});

		it('a single-verse passage keeps plain (non-clickable) verse numbers', () => {
			mocks.mockQueryState.data = {
				passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(1) },
			};
			const { container } = render(PassageText, { props: { startVerseId: 1, endVerseId: 1 } });
			expect(screen.queryByRole('button', { name: /^Verse/ })).not.toBeInTheDocument();
			expect(container.querySelector('sup')?.textContent).toBe('1');
		});
	});
});

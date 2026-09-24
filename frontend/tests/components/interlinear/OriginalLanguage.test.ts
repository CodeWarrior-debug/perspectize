import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import OriginalLanguage from '$lib/components/interlinear/OriginalLanguage.svelte';
import { queryKeys } from '$lib/queries/keys';

const mocks = vi.hoisted(() => ({
	state: { data: undefined as unknown, isPending: false, isLoading: false, isError: false, refetch: vi.fn() },
	lastOptions: null as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (opts: () => unknown) => {
		mocks.lastOptions = opts();
		return mocks.state;
	},
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

const plainSnippet = createRawSnippet(() => ({ render: () => '<div data-testid="plain">plain verses</div>' }));
const verses = [{ verseId: 1, chapter: 1, verse: 1, text: 'In the beginning' }];
const props = { startVerseId: 1, endVerseId: 1, verses, plain: plainSnippet };

const genesis = {
	passageInterlinear: {
		verses: [
			{
				verseId: 1,
				chapter: 1,
				verse: 1,
				segments: [{ text: 'In the beginning', spaceBefore: false }],
				words: [
					{
						id: 0,
						language: 'heb',
						source: 'רֵאשִׁית',
						translit: 're.shit',
						parsing: '',
						strongs: 'H7225G',
						gloss: 'first: beginning',
						tagSource: 'tagged',
						sourceOrder: 0,
						segment: 0,
					},
				],
			},
		],
	},
};

describe('OriginalLanguage', () => {
	beforeEach(() => {
		mocks.state.data = undefined;
		mocks.state.isPending = false;
		mocks.state.isLoading = false;
		mocks.state.isError = false;
		mocks.state.refetch = vi.fn();
		mocks.lastOptions = null;
	});

	it('loading: keeps showing the plain verses and says it is loading', () => {
		mocks.state.isPending = true;
		mocks.state.isLoading = true;
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
		expect(screen.getByText(/loading original language/i)).toBeInTheDocument();
	});

	it('paused/offline (pending but not fetching): the plain verses stay on screen', () => {
		mocks.state.isPending = true;
		mocks.state.isLoading = false;
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
	});

	it('error: keeps the plain verses, shows a message and a working Retry', async () => {
		mocks.state.isError = true;
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
		expect(screen.getByText(/couldn't load original language/i)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));
		expect(mocks.state.refetch).toHaveBeenCalledTimes(1);
	});

	it('no data for the passage: not an error, not a retry — a plain notice over the plain text', () => {
		mocks.state.data = { passageInterlinear: { verses: [] } };
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
		expect(screen.getByText(/original-language data isn.t available for this passage/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
		expect(screen.queryByText(/STEP Bible/)).not.toBeInTheDocument();
	});

	it('success: shows the interlinear passage and the STEP Bible credit, not the plain snippet', () => {
		mocks.state.data = genesis;
		render(OriginalLanguage, { props });
		expect(screen.queryByTestId('plain')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'In the beginning' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'STEP Bible' })).toBeInTheDocument();
	});

	it('requests the whole range, keyed by it, and never re-fetches (data never changes)', () => {
		mocks.state.data = genesis;
		render(OriginalLanguage, { props: { ...props, startVerseId: 1, endVerseId: 3 } });
		expect(mocks.lastOptions.queryKey).toEqual(queryKeys.bible.passageInterlinear(1, 3));
		expect(mocks.lastOptions.staleTime).toBe(Infinity);
	});
});

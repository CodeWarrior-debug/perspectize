import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import AddContentPopover from '$lib/components/AddContentPopover.svelte';

const mocks = vi.hoisted(() => ({
	video: { mutate: vi.fn(), isPending: false, isSuccess: false },
	passage: { mutate: vi.fn(), isPending: false, isSuccess: false },
	movie: {
		mutate: vi.fn(),
		reset: vi.fn(),
		isPending: false,
		isSuccess: false,
		isError: false,
		error: null as unknown,
	},
}));

vi.mock('$lib/queries/content/useAddVideo', () => ({ useAddVideo: () => mocks.video }));
vi.mock('$lib/queries/content/useAddMovie', () => ({ useAddMovie: () => mocks.movie }));
vi.mock('$lib/queries/content/useAddPassage', () => ({ useAddPassage: () => mocks.passage }));

const JOHN = 43;
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TMDB = 'https://www.themoviedb.org/movie/603-the-matrix';
const IMDB = 'https://www.imdb.com/title/tt0133093/';
const NOT_ALLOWED =
	'While Perspectize does not intend to act as censor, adding NSFW content is not enabled until traffic necessitates a long-term decision about content access policies.';
const ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';
const BG = 'https://www.biblegateway.com/passage/?search=John+3%3A16-18&version=NIV';

async function openWith(text?: string) {
	render(AddContentPopover);
	await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
	await tick();
	if (text !== undefined) await type(text);
}

async function type(text: string) {
	await fireEvent.input(screen.getByPlaceholderText(/paste a link or type a reference/i), { target: { value: text } });
	await tick();
}

const chip = () => screen.getByTestId('type-chip');
const submit = () => screen.getByRole('button', { name: 'Add' });
const pick = async (label: RegExp | string, value: string | number) => {
	await fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
	await tick();
};

beforeEach(() => {
	vi.clearAllMocks();
	for (const m of [mocks.video, mocks.passage, mocks.movie]) {
		m.isPending = false;
		m.isSuccess = false;
	}
	mocks.movie.isError = false;
	mocks.movie.error = null;
});

describe('AddContentPopover detection states', () => {
	it('empty: no type, submit disabled, no picker', async () => {
		await openWith();
		expect(chip()).toHaveTextContent('Select a type');
		expect(submit()).toBeDisabled();
		expect(screen.queryByTestId('passage-picker')).toBeNull();
	});

	it('detected YouTube: chip says YouTube, no picker, submit enabled and sends the url', async () => {
		await openWith(YT);
		expect(chip()).toHaveTextContent('Detected: YouTube');
		expect(screen.queryByTestId('passage-picker')).toBeNull();
		await fireEvent.click(submit());
		expect(mocks.video.mutate).toHaveBeenCalledWith(YT);
		expect(mocks.passage.mutate).not.toHaveBeenCalled();
	});

	it('detected passage from text: picker is prefilled from the reference', async () => {
		await openWith('John 3:16-18');
		expect(chip()).toHaveTextContent('Detected: Bible passage');
		expect(screen.getByLabelText('Book')).toHaveValue(String(JOHN));
		expect(screen.getByLabelText('Start chapter')).toHaveValue('3');
		expect(screen.getByLabelText('Start verse')).toHaveValue('16');
		expect(screen.getByLabelText('End verse')).toHaveValue('18');
	});

	it('detected passage from a Bible Gateway URL: prefilled, and only the numeric range is submitted', async () => {
		await openWith(BG);
		expect(chip()).toHaveTextContent('Detected: Bible passage');
		expect(screen.getByLabelText('Start verse')).toHaveValue('16');
		await fireEvent.click(submit());
		expect(mocks.passage.mutate).toHaveBeenCalledWith({
			bookId: JOHN,
			startChapter: 3,
			startVerse: 16,
			endChapter: 3,
			endVerse: 18,
		});
		expect(JSON.stringify(mocks.passage.mutate.mock.calls)).not.toContain('biblegateway');
	});

	it('chapter-only reference resolves to the whole chapter', async () => {
		await openWith('Psalm 23');
		expect(chip()).toHaveTextContent('Detected: Bible passage');
		expect(screen.getByLabelText('Start verse')).toHaveValue('1');
		expect(screen.getByLabelText('End verse')).toHaveValue('6');
		expect(submit()).toBeEnabled();
	});

	it('unparseable single word: no type, submit disabled', async () => {
		await openWith('grace');
		expect(chip()).toHaveTextContent('Select a type');
		expect(submit()).toBeDisabled();
	});

	it('claim-like text: chip says Claim, explained, submit disabled', async () => {
		await openWith('Grace is unearned favor');
		expect(chip()).toHaveTextContent('Detected: Claim');
		expect(screen.getByText(/claims can't be added from here yet/i)).toBeInTheDocument();
		expect(submit()).toBeDisabled();
	});
});

describe('AddContentPopover manual override', () => {
	it('a wrong autodetect can be overridden to another type', async () => {
		await openWith('John 3:16-18');
		await pick('Change type', 'YOUTUBE_VIDEO');
		expect(chip()).toHaveTextContent('Type: YouTube');
		expect(screen.queryByTestId('passage-picker')).toBeNull();
	});

	it('an undetected input can be given a type manually', async () => {
		await openWith('grace');
		await pick('Change type', 'BIBLE_PASSAGE');
		expect(chip()).toHaveTextContent('Type: Bible passage');
		expect(screen.getByTestId('passage-picker')).toBeInTheDocument();
		expect(submit()).toBeEnabled();
	});

	it('a manual YouTube type with a non-YouTube string shows an inline error and does not submit', async () => {
		await openWith('John 3:16-18');
		await pick('Change type', 'YOUTUBE_VIDEO');
		await fireEvent.click(submit());
		expect(screen.getByText(/valid youtube url/i)).toBeInTheDocument();
		expect(mocks.video.mutate).not.toHaveBeenCalled();
	});

	it('retyping after an override goes back to autodetect', async () => {
		await openWith('John 3:16-18');
		await pick('Change type', 'YOUTUBE_VIDEO');
		await type(YT + '&t=1');
		expect(chip()).toHaveTextContent('Detected: YouTube');
		await type('Genesis 1:1-3');
		expect(chip()).toHaveTextContent('Detected: Bible passage');
	});

	it('picker edits override the parsed range and are what gets submitted', async () => {
		await openWith('John 3:16-18');
		await pick('End verse', 20);
		await fireEvent.click(submit());
		expect(mocks.passage.mutate).toHaveBeenCalledWith(expect.objectContaining({ endVerse: 20, startVerse: 16 }));
	});

	it('changing the book resets the range to chapter 1 verse 1', async () => {
		await openWith('John 3:16-18');
		await pick('Book', 1);
		expect(screen.getByLabelText('Start chapter')).toHaveValue('1');
		expect(screen.getByLabelText('End verse')).toHaveValue('1');
	});
});

describe('AddContentPopover invalid range', () => {
	it('end verse before start verse blocks submit and shows an inline message', async () => {
		await openWith('John 3:16-18');
		await pick('End verse', 10);
		expect(screen.getByRole('alert')).toHaveTextContent(/can't come before/i);
		expect(submit()).toBeDisabled();
		expect(mocks.passage.mutate).not.toHaveBeenCalled();
	});

	it('end chapter before start chapter is also blocked', async () => {
		await openWith('John 3:16-18');
		await pick('End chapter', 2);
		expect(screen.getByRole('alert')).toBeInTheDocument();
		expect(submit()).toBeDisabled();
	});

	it('fixing the range clears the message and re-enables submit', async () => {
		await openWith('John 3:16-18');
		await pick('End verse', 10);
		await pick('End verse', 17);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(submit()).toBeEnabled();
	});

	it('an out-of-range typed reference is not detected as a passage', async () => {
		await openWith('Genesis 200:1');
		expect(chip()).not.toHaveTextContent('Bible passage');
	});
});

describe('AddContentPopover clear buttons', () => {
	it('Clear all wipes text, type override, and picker edits', async () => {
		await openWith('John 3:16-18');
		await pick('End verse', 20);
		await fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
		await tick();
		expect(screen.getByPlaceholderText(/paste a link or type a reference/i)).toHaveValue('');
		expect(chip()).toHaveTextContent('Select a type');
		expect(screen.queryByTestId('passage-picker')).toBeNull();
	});

	it('Clear all is disabled on a freshly opened, untouched form', async () => {
		await openWith();
		expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
	});

	it('Clear type resets only the passage fields, keeping the type selected', async () => {
		await openWith('John 3:16-18');
		await pick('End verse', 20);
		await fireEvent.click(screen.getByRole('button', { name: /clear type/i }));
		await tick();
		expect(chip()).toHaveTextContent('Type: Bible passage');
		expect(screen.getByLabelText('Start chapter')).toHaveValue('1');
		expect(screen.getByLabelText('Start verse')).toHaveValue('1');
		expect(screen.getByLabelText('End verse')).toHaveValue('1');
		expect(screen.getByPlaceholderText(/paste a link or type a reference/i)).toHaveValue('');
	});

	it('Clear type is disabled when no type is selected', async () => {
		await openWith();
		expect(screen.getByRole('button', { name: /clear type/i })).toBeDisabled();
	});
});

describe('AddContentPopover mutation states', () => {
	it('submitting: shows the pending label and disables the form', async () => {
		mocks.passage.isPending = true;
		await openWith('John 3:16-18');
		expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
		expect(screen.getByLabelText('Book')).toBeDisabled();
	});
});

describe('AddContentPopover movies', () => {
	it('a TMDB link autodetects Movie, shows the TMDB notice and submits the trimmed input', async () => {
		await openWith(`  ${TMDB}  `);
		expect(chip()).toHaveTextContent('Detected: Movie');
		expect(screen.getByText(ATTRIBUTION)).toBeInTheDocument();
		expect(screen.queryByTestId('passage-picker')).toBeNull();
		await fireEvent.click(submit());
		expect(mocks.movie.mutate).toHaveBeenCalledWith(TMDB);
		expect(mocks.video.mutate).not.toHaveBeenCalled();
	});

	it('an IMDb title link autodetects Movie', async () => {
		await openWith(IMDB);
		expect(chip()).toHaveTextContent('Detected: Movie');
		expect(submit()).toBeEnabled();
	});

	it('Movie can be chosen manually and the TMDB notice shows only for Movie', async () => {
		await openWith('grace');
		expect(screen.queryByText(ATTRIBUTION)).toBeNull();
		await pick('Change type', 'MOVIE');
		expect(chip()).toHaveTextContent('Type: Movie');
		expect(screen.getByText(ATTRIBUTION)).toBeInTheDocument();
		await type(YT);
		expect(chip()).toHaveTextContent('Detected: YouTube');
		expect(screen.queryByText(ATTRIBUTION)).toBeNull();
	});

	it('a manual Movie type with a non-movie string shows an inline error and does not submit', async () => {
		await openWith('grace');
		await pick('Change type', 'MOVIE');
		await fireEvent.click(submit());
		expect(screen.getByText('Please enter a valid TMDB or IMDb movie link')).toBeInTheDocument();
		expect(mocks.movie.mutate).not.toHaveBeenCalled();
	});

	it('Clear type keeps Movie selected and empties the text', async () => {
		await openWith(TMDB);
		await fireEvent.click(screen.getByRole('button', { name: /clear type/i }));
		await tick();
		expect(chip()).toHaveTextContent('Type: Movie');
		expect(screen.getByPlaceholderText(/paste a link or type a reference/i)).toHaveValue('');
	});

	it('a generic error shows the generic message', async () => {
		mocks.movie.isError = true;
		mocks.movie.error = { response: { errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }] } };
		await openWith(TMDB);
		expect(screen.getByText('Could not add this movie. Check the link and try again.')).toBeInTheDocument();
		expect(screen.queryByText('boom')).toBeNull();
	});

	it('CONTENT_NOT_ALLOWED shows the exact server text and stays open', async () => {
		mocks.movie.isError = true;
		mocks.movie.error = {
			response: { errors: [{ message: NOT_ALLOWED, extensions: { code: 'CONTENT_NOT_ALLOWED' } }] },
		};
		await openWith(TMDB);
		expect(screen.getByText(NOT_ALLOWED)).toBeInTheDocument();
		expect(screen.queryByText(/could not add this movie/i)).toBeNull();
		expect(screen.getByPlaceholderText(/paste a link or type a reference/i)).toBeEnabled();
	});

	it('pending disables the form', async () => {
		mocks.movie.isPending = true;
		await openWith(TMDB);
		expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
		expect(screen.getByPlaceholderText(/paste a link or type a reference/i)).toBeDisabled();
	});

	it('opening the popover resets the movie mutation', async () => {
		await openWith();
		expect(mocks.movie.reset).toHaveBeenCalled();
	});
});

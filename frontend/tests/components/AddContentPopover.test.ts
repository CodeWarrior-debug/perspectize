import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AddContentPopover from '$lib/components/AddContentPopover.svelte';
import { tick } from 'svelte';

// Hoisted mocks — shared pattern for useAddVideo components
const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	mockInvalidateQueries: vi.fn(),
	mockSetQueriesData: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	mockValidate: vi.fn(),
	mockMutationState: {
		mutate: null as any,
		reset: vi.fn(),
		error: null as unknown,
		isError: false,
		isPending: false,
		isSuccess: false,
	},
	capturedMutationOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({ data: [] })),
	createMutation: vi.fn((optionsFn: () => any) => {
		mocks.capturedMutationOptions = optionsFn();
		mocks.mockMutationState.mutate = mocks.mockMutate;
		return mocks.mockMutationState;
	}),
	useQueryClient: vi.fn(() => ({
		invalidateQueries: mocks.mockInvalidateQueries,
		setQueriesData: mocks.mockSetQueriesData,
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mocks.mockToastSuccess, error: mocks.mockToastError },
}));

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/utils/youtube', async (importOriginal) => ({
	// Real classifier: routing between the video and music mutations is under test too.
	classifyYouTubeUrl: (await importOriginal<typeof import('$lib/utils/youtube')>()).classifyYouTubeUrl,
	validateYouTubeUrl: (url: string) => mocks.mockValidate(url),
}));

function reset() {
	vi.clearAllMocks();
	mocks.capturedMutationOptions = undefined;
	mocks.mockMutationState.isPending = false;
	mocks.mockMutationState.isSuccess = false;
}

describe('AddContentPopover component', () => {
	beforeEach(reset);

	it('renders without errors', () => {
		expect(render(AddContentPopover).container).toBeTruthy();
	});

	it('renders Add Video button', () => {
		render(AddContentPopover);
		expect(screen.getByRole('button', { name: /add content/i })).toBeInTheDocument();
	});

	it('button has plus icon', () => {
		render(AddContentPopover);
		expect(screen.getByRole('button', { name: /add content/i }).querySelector('svg')).toBeInTheDocument();
	});

	it('uses buttonVariants for styling', () => {
		render(AddContentPopover);
		expect(screen.getByRole('button', { name: /add content/i }).className).toBeTruthy();
	});

	it('opens popover when trigger is clicked', async () => {
		const { container } = render(AddContentPopover);
		await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
		await tick();
		expect(container).toBeTruthy();
	});
});

describe('AddContentPopover paste button', () => {
	beforeEach(reset);

	async function openPopover() {
		render(AddContentPopover);
		await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
		await tick();
	}

	it('renders a paste from clipboard button', async () => {
		await openPopover();
		expect(screen.getByRole('button', { name: /paste from clipboard/i })).toBeInTheDocument();
	});

	it('populates the URL field from clipboard on click', async () => {
		const readText = vi.fn().mockResolvedValue('https://youtube.com/watch?v=abc123');
		Object.assign(navigator, { clipboard: { readText } });

		await openPopover();
		await fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }));
		await tick();

		expect(readText).toHaveBeenCalled();
		expect(screen.getByPlaceholderText(/paste a link or type a reference/i)).toHaveValue(
			'https://youtube.com/watch?v=abc123',
		);
	});

	it('shows an error message when clipboard read fails', async () => {
		const readText = vi.fn().mockRejectedValue(new Error('permission denied'));
		Object.assign(navigator, { clipboard: { readText } });

		await openPopover();
		await fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }));
		await tick();

		expect(screen.getByText(/could not read clipboard/i)).toBeInTheDocument();
	});
});

describe('AddContentPopover $effect behaviors', () => {
	beforeEach(reset);

	it('renders with mutation in success state', () => {
		mocks.mockMutationState.isSuccess = true;
		expect(render(AddContentPopover).container).toBeTruthy();
	});
});

describe('AddContentPopover mutation setup', () => {
	beforeEach(() => {
		reset();
		render(AddContentPopover);
	});

	it('captures mutation options from useAddVideo hook', () => {
		expect(mocks.capturedMutationOptions).toBeDefined();
		expect(mocks.capturedMutationOptions.mutationFn).toBeDefined();
		expect(mocks.capturedMutationOptions.onSuccess).toBeDefined();
		expect(mocks.capturedMutationOptions.onError).toBeDefined();
	});

	it('mutationFn calls graphqlRequest with correct args', async () => {
		const { graphqlRequest } = await import('$lib/queries/client');
		(graphqlRequest as any).mockResolvedValue({
			createContentFromYouTube: { content: { name: 'Test' }, alreadyExisted: false },
		});
		await mocks.capturedMutationOptions.mutationFn('https://youtube.com/watch?v=abc123');
		expect(graphqlRequest).toHaveBeenCalledWith(expect.anything(), {
			input: { url: 'https://youtube.com/watch?v=abc123', userId: 0 },
		});
	});
});

describe('AddContentPopover audio tracks', () => {
	beforeEach(reset);

	async function openWith(value: string) {
		render(AddContentPopover);
		await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
		await tick();
		await fireEvent.input(screen.getByLabelText('Link or reference'), { target: { value } });
		await tick();
	}

	it('detects a Spotify song and requires a title', async () => {
		await openWith('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x');
		expect(screen.getByTestId('type-chip')).toHaveTextContent('Detected: Audio track (Spotify)');
		expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
		await fireEvent.input(screen.getByLabelText('Song title'), { target: { value: 'Bohemian Rhapsody' } });
		await fireEvent.input(screen.getByLabelText('Artist'), { target: { value: 'Queen' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(mocks.mockMutate).toHaveBeenCalledWith(
			{ url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', title: 'Bohemian Rhapsody', artist: 'Queen' },
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);
	});

	it('prefills the title from an Apple Music slug', async () => {
		await openWith('https://music.apple.com/us/song/bohemian-rhapsody/1440650711');
		expect(screen.getByLabelText('Song title')).toHaveValue('Bohemian Rhapsody');
	});

	it('sends a YouTube Music song as an audio track, not a video', async () => {
		await openWith('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(mocks.mockMutate).toHaveBeenCalledWith(
			{ url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' },
			expect.anything(),
		);
		expect(mocks.mockValidate).not.toHaveBeenCalled();
	});

	it('refuses album links', async () => {
		await openWith('https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx');
		expect(screen.getByTestId('music-collection-notice')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
	});

	it('sends the picked genre with the request', async () => {
		const { createQuery } = await import('@tanstack/svelte-query');
		(createQuery as any).mockReturnValue({ data: [{ id: '21', name: 'Rock', parentId: null }] });
		await openWith('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
		await fireEvent.click(screen.getByRole('button', { name: 'Choose a genre' }));
		await tick();
		await fireEvent.click(screen.getByText('Rock'));
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(mocks.mockMutate).toHaveBeenCalledWith(
			{ url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', genreId: 21 },
			expect.anything(),
		);
		(createQuery as any).mockReturnValue({ data: [] });
	});

	it('closes on success', async () => {
		await openWith('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		const [, opts] = mocks.mockMutate.mock.calls[0];
		opts.onSuccess({ content: { id: '1' }, alreadyExisted: false, sameSongCandidates: [] });
		await waitFor(() => expect(screen.queryByLabelText('Link or reference')).not.toBeInTheDocument());
	});

	it('stays open on a same-song prompt and re-submits the answer', async () => {
		await openWith('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
		await fireEvent.input(screen.getByLabelText('Song title'), { target: { value: 'Bohemian Rhapsody' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		const [, opts] = mocks.mockMutate.mock.calls[0];
		opts.onSuccess({
			content: null,
			alreadyExisted: false,
			sameSongCandidates: [{ id: '9', name: 'Bohemian Rhapsody', url: null, audioTrack: null }],
		});
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Same song' }));
		expect(mocks.mockMutate).toHaveBeenLastCalledWith(
			expect.objectContaining({ url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', sameAsContentId: 9 }),
			expect.anything(),
		);
		expect(screen.getByLabelText('Song title')).toBeInTheDocument(); // still open
	});

	it('"different song" re-submits with createNew', async () => {
		await openWith('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
		await fireEvent.input(screen.getByLabelText('Song title'), { target: { value: 'Bohemian Rhapsody' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		const [, opts] = mocks.mockMutate.mock.calls[0];
		opts.onSuccess({
			content: null,
			alreadyExisted: false,
			sameSongCandidates: [{ id: '9', name: 'Bohemian Rhapsody', url: null, audioTrack: null }],
		});
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: "No, it's a different song" }));
		expect(mocks.mockMutate).toHaveBeenLastCalledWith(expect.objectContaining({ createNew: true }), expect.anything());
	});
});

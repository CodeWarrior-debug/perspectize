import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGraphqlRequest, mockToast, mockInvalidateQueries } = vi.hoisted(() => {
	const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() });
	return { mockGraphqlRequest: vi.fn(), mockToast: toast, mockInvalidateQueries: vi.fn() };
});

let options: any;

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		options = fn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries, setQueriesData: vi.fn() })),
}));
vi.mock('svelte-sonner', () => ({ toast: mockToast }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mockGraphqlRequest }));

const track = (relatedMedia: any[]) => ({
	createContentFromYouTubeMusic: {
		content: { id: '9', name: 'Bohemian Rhapsody', relatedMedia },
		alreadyExisted: false,
	},
});
const official = { videoId: 'VIDEOVIDEO1', kind: 'official_video', contentId: null, unavailable: false };

describe('useAddVideo — YouTube Music', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { useAddVideo } = await import('$lib/queries/content/useAddVideo');
		useAddVideo();
	});

	it('sends music.youtube.com track links to the music mutation', async () => {
		mockGraphqlRequest.mockResolvedValue(track([]));
		await options.mutationFn('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
		expect(String(mockGraphqlRequest.mock.calls[0][0])).toContain('createContentFromYouTubeMusic');
		expect(mockGraphqlRequest.mock.calls[0][1]).toEqual({
			input: { url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', userId: 0 },
		});
	});

	it('keeps regular YouTube links on the video mutation', async () => {
		mockGraphqlRequest.mockResolvedValue({ createContentFromYouTube: { content: { id: '1' }, alreadyExisted: false } });
		await options.mutationFn('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		const doc = String(mockGraphqlRequest.mock.calls[0][0]);
		expect(doc).toContain('createContentFromYouTube(');
		expect(doc).not.toContain('createContentFromYouTubeMusic');
	});

	it('offers the official video once, as a toast action', () => {
		options.onSuccess(track([official]));
		expect(mockToast.success).toHaveBeenCalledWith('Added: Bohemian Rhapsody');
		expect(mockToast).toHaveBeenCalledTimes(1);
		const [message, opts] = mockToast.mock.calls[0];
		expect(message).toBe('This song also has an official video.');
		expect(opts.action.label).toBe('Add video');
	});

	it('promotes only when the user clicks the action', async () => {
		options.onSuccess(track([official]));
		expect(mockGraphqlRequest).not.toHaveBeenCalled();

		mockGraphqlRequest.mockResolvedValue({ promoteRelatedMedia: { id: '10', name: 'Official Video' } });
		mockToast.mock.calls[0][1].action.onClick();
		await vi.waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Added: Official Video'));
		expect(String(mockGraphqlRequest.mock.calls[0][0])).toContain('promoteRelatedMedia');
		expect(mockGraphqlRequest.mock.calls[0][1]).toEqual({ contentId: 9, videoId: 'VIDEOVIDEO1' });
	});

	it.each([
		['a duplicate add', { ...track([official]).createContentFromYouTubeMusic, alreadyExisted: true }],
		['a video already in Perspectize', track([{ ...official, contentId: '4' }]).createContentFromYouTubeMusic],
		['a broken video', track([{ ...official, unavailable: true }]).createContentFromYouTubeMusic],
		['only non-official uploads', track([{ ...official, kind: 'live' }]).createContentFromYouTubeMusic],
	])('does not prompt for %s', (_name, result) => {
		options.onSuccess({ createContentFromYouTubeMusic: result });
		expect(mockToast).not.toHaveBeenCalled();
	});

	it('says "song" for a duplicate music add', () => {
		options.onSuccess({
			createContentFromYouTubeMusic: { ...track([]).createContentFromYouTubeMusic, alreadyExisted: true },
		});
		expect(mockToast.warning).toHaveBeenCalledWith('This song has already been added', {
			action: { label: 'Go to song', onClick: expect.any(Function) },
		});
	});

	it('shows the album/playlist message from the server', () => {
		options.onError(new Error('paste a song link, not an album, playlist, or artist'));
		expect(mockToast.error).toHaveBeenCalledWith('Paste a song link, not an album, playlist, or artist');
	});
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import AudioTrackFields from '$lib/components/AudioTrackFields.svelte';

const spotify = {
	provider: 'spotify',
	providerTrackId: '4uLU6hMCjMI75M1A2tKUQC',
	canonicalUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
	kind: 'LISTEN',
	suggestedTitle: '',
} as const;
const ytm = {
	provider: 'youtube',
	providerTrackId: 'dQw4w9WgXcQ',
	canonicalUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
	kind: 'EMBED',
	suggestedTitle: '',
} as const;
const base = {
	genres: [{ id: '21', name: 'Rock', parentId: null }],
	candidates: [],
	disabled: false,
	onSameSong: vi.fn(),
	onDifferentSong: vi.fn(),
};

describe('AudioTrackFields', () => {
	it('link-only providers ask for the title and artist', () => {
		render(AudioTrackFields, { props: { ...base, link: spotify } });
		expect(screen.getByLabelText('Song title')).toBeInTheDocument();
		expect(screen.getByLabelText('Artist')).toBeInTheDocument();
		expect(screen.getByText(/Spotify links are not looked up/)).toBeInTheDocument();
	});

	it('YouTube Music links are looked up, so only the genre is asked', () => {
		render(AudioTrackFields, { props: { ...base, link: ytm } });
		expect(screen.queryByLabelText('Song title')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Choose a genre' })).toBeInTheDocument();
	});

	it('shows no same-song prompt without candidates', () => {
		render(AudioTrackFields, { props: { ...base, link: spotify } });
		expect(screen.queryByRole('group', { name: 'Same song?' })).not.toBeInTheDocument();
	});

	it('shows the same-song prompt and reports each answer', async () => {
		const onSameSong = vi.fn();
		const onDifferentSong = vi.fn();
		render(AudioTrackFields, {
			props: {
				...base,
				link: spotify,
				onSameSong,
				onDifferentSong,
				candidates: [
					{
						id: '9',
						name: 'Bohemian Rhapsody',
						url: 'https://music.youtube.com/watch?v=x',
						audioTrack: { artist: 'Queen' },
					},
				],
			},
		});
		expect(screen.getByRole('group', { name: 'Same song?' })).toHaveTextContent('Bohemian Rhapsody — Queen');
		await fireEvent.click(screen.getByRole('button', { name: 'Same song' }));
		expect(onSameSong).toHaveBeenCalledWith('9');
		await fireEvent.click(screen.getByRole('button', { name: "No, it's a different song" }));
		expect(onDifferentSong).toHaveBeenCalledOnce();
	});
});

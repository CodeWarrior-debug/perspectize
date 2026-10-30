import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MovieCard from '$lib/components/discover/MovieCard.svelte';
import type { MovieSearchResult } from '$lib/services/tmdbApi';

const matrix: MovieSearchResult = {
	tmdbId: 603,
	title: 'The Matrix',
	releaseDate: '1999-03-31',
	overview: 'A computer hacker learns about the true nature of reality.',
	posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
	voteAverage: 8.2,
	url: 'https://www.themoviedb.org/movie/603',
};

describe('MovieCard', () => {
	it('links the title to the TMDB page in a new tab with safe rel', () => {
		render(MovieCard, { props: { result: matrix, onAdd: vi.fn() } });

		const link = screen.getByRole('link', { name: 'The Matrix' });
		expect(link).toHaveAttribute('href', 'https://www.themoviedb.org/movie/603');
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('shows the release year, the score and the overview', () => {
		render(MovieCard, { props: { result: matrix, onAdd: vi.fn() } });

		expect(screen.getByText('1999')).toBeInTheDocument();
		expect(screen.getByText('8.2')).toBeInTheDocument();
		expect(screen.getByText('A computer hacker learns about the true nature of reality.')).toBeInTheDocument();
	});

	it('uses the w185 poster and a descriptive alt text', () => {
		render(MovieCard, { props: { result: matrix, onAdd: vi.fn() } });

		const poster = screen.getByRole('img', { name: 'Poster for The Matrix' });
		expect(poster).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w185/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg');
	});

	it('falls back to a placeholder and "Year unknown" when TMDB has no poster, date or score', () => {
		render(MovieCard, {
			props: {
				result: { ...matrix, posterPath: null, releaseDate: null, voteAverage: null },
				onAdd: vi.fn(),
			},
		});

		expect(screen.queryByRole('img')).not.toBeInTheDocument();
		expect(screen.getByText('Year unknown')).toBeInTheDocument();
		expect(screen.queryByText('out of 10')).not.toBeInTheDocument();
	});

	it('adds by the canonical url when the Add button is clicked', async () => {
		const onAdd = vi.fn();
		render(MovieCard, { props: { result: matrix, onAdd } });

		await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));

		expect(onAdd).toHaveBeenCalledWith('https://www.themoviedb.org/movie/603');
	});

	it('shows a disabled "Adding…" button while this movie is being added', () => {
		render(MovieCard, { props: { result: matrix, onAdd: vi.fn(), isPending: true } });

		expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
	});

	it('shows a disabled "In Library" state with no Add button when the movie is already tracked', async () => {
		const onAdd = vi.fn();
		render(MovieCard, { props: { result: matrix, onAdd, isInLibrary: true } });

		expect(screen.getByRole('button', { name: 'In Library' })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Add to Perspectize' })).not.toBeInTheDocument();
	});
});

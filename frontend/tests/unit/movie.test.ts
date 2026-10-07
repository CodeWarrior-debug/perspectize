import { describe, it, expect } from 'vitest';
import { validateMovieInput } from '$lib/utils/movie';

describe('validateMovieInput', () => {
	it.each([
		['TMDB URL', 'https://www.themoviedb.org/movie/603'],
		['TMDB slug URL without scheme', 'themoviedb.org/movie/603-the-matrix'],
		['TMDB URL with trailing slash', 'https://www.themoviedb.org/movie/603/'],
		['TMDB URL with query', 'https://www.themoviedb.org/movie/603?language=en-US'],
		['TMDB URL with fragment', 'https://www.themoviedb.org/movie/603#cast'],
		['TMDB URL, upper case', 'HTTPS://WWW.THEMOVIEDB.ORG/MOVIE/603'],
		['IMDb URL', 'https://www.imdb.com/title/tt0133093/'],
		['IMDb URL without trailing slash', 'https://www.imdb.com/title/tt0133093'],
		['IMDb URL with query', 'https://m.imdb.com/title/tt0133093/?ref_=fn_al_tt_1'],
		['bare IMDb id', 'tt0133093'],
		['bare IMDb id, upper case', 'TT0133093'],
		['surrounding whitespace', '  https://www.themoviedb.org/movie/603  \n'],
	])('accepts %s', (_name, input) => {
		expect(validateMovieInput(input)).toBe(true);
	});

	it.each([
		['YouTube watch URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
		['YouTube short URL', 'https://youtu.be/dQw4w9WgXcQ'],
		['TMDB TV URL', 'https://www.themoviedb.org/tv/1396'],
		['TMDB movie with non-numeric id', 'https://www.themoviedb.org/movie/abc'],
		['TMDB movie id zero', 'https://www.themoviedb.org/movie/0'],
		['TMDB movie id with trailing letters', 'https://www.themoviedb.org/movie/603abc'],
		['TMDB movie id beyond int64', 'https://www.themoviedb.org/movie/99999999999999999999'],
		['IMDb name URL', 'https://www.imdb.com/name/nm0000206/'],
		['IMDb id too short', 'tt123'],
		['IMDb id with trailing letters', 'tt0133093x'],
		['empty string', ''],
		['whitespace only', '   \t '],
		['garbage', 'the matrix'],
		['bare number', '603'],
	])('rejects %s', (_name, input) => {
		expect(validateMovieInput(input)).toBe(false);
	});
});

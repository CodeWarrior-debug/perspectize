import { beforeEach, describe, expect, it } from 'vitest';
import {
	buildGenreTree,
	canChangeGenre,
	filterGenreTree,
	flattenGenres,
	GENRE_CHANGE_WINDOW_MS,
	loadRecentGenres,
	normalizeGenreText,
	pushRecent,
	saveRecentGenres,
} from '$lib/utils/genreTree';

const genres = [
	{ id: '21', name: 'Rock', parentId: null },
	{ id: '1152', name: 'Hard Rock', parentId: '21' },
	{ id: '19', name: 'Regional & Cultural', parentId: null },
	{ id: '1122', name: 'Brazilian', parentId: '19' },
	{ id: '1223', name: 'Forró', parentId: '1122' },
	{ id: '18', name: 'Hip-Hop/Rap', parentId: null },
	{ id: '5', name: 'Classical', parentId: null },
];

describe('genre tree', () => {
	it('is alphabetical at every level, with full paths', () => {
		const roots = buildGenreTree(genres);
		expect(roots.map((r) => r.name)).toEqual(['Classical', 'Hip-Hop/Rap', 'Regional & Cultural', 'Rock']);
		expect(flattenGenres(roots).get('1223')!.path).toEqual(['Regional & Cultural', 'Brazilian', 'Forró']);
	});

	it('normalizes accents, case and punctuation', () => {
		expect(normalizeGenreText('Forró')).toBe('forro');
		expect(normalizeGenreText('Hip-Hop/Rap')).toBe('hip hop rap');
	});

	it('search keeps matches and their ancestors only', () => {
		const out = filterGenreTree(buildGenreTree(genres), 'forro');
		expect(out.map((r) => r.name)).toEqual(['Regional & Cultural']);
		expect(out[0].children[0].children[0].name).toBe('Forró');
		expect(filterGenreTree(buildGenreTree(genres), 'hip hop').map((r) => r.name)).toEqual(['Hip-Hop/Rap']);
		expect(filterGenreTree(buildGenreTree(genres), '   ')).toHaveLength(4);
	});
});

describe('recent genres', () => {
	beforeEach(() => localStorage.clear());

	it('keeps five, most recent first, without duplicates', () => {
		let r: string[] = [];
		for (const id of ['1', '2', '3', '4', '5', '6', '3']) r = pushRecent(r, id);
		expect(r).toEqual(['3', '6', '5', '4', '2']);
	});

	it('round-trips through localStorage and survives garbage', () => {
		saveRecentGenres(['21', '19']);
		expect(loadRecentGenres()).toEqual(['21', '19']);
		localStorage.setItem('perspectize:recent-genres', '{bad');
		expect(loadRecentGenres()).toEqual([]);
	});
});

describe('canChangeGenre (mirrors ADR 0006)', () => {
	const now = Date.parse('2026-10-11T12:00:00Z');
	const added = new Date(now - 10 * 24 * 3600 * 1000).toISOString();
	it('anyone signed in may set an empty genre', () => {
		expect(canChangeGenre({ genreId: null, addedByUserID: '3', createdAt: added }, '7', now)).toBe(true);
		expect(canChangeGenre({ genreId: null, addedByUserID: '3', createdAt: added }, null, now)).toBe(false);
	});
	it('only the adder may change a set genre, within 30 days', () => {
		expect(canChangeGenre({ genreId: '21', addedByUserID: '3', createdAt: added }, '3', now)).toBe(true);
		expect(canChangeGenre({ genreId: '21', addedByUserID: '3', createdAt: added }, '7', now)).toBe(false);
		const old = new Date(now - GENRE_CHANGE_WINDOW_MS - 1000).toISOString();
		expect(canChangeGenre({ genreId: '21', addedByUserID: '3', createdAt: old }, '3', now)).toBe(false);
	});
});

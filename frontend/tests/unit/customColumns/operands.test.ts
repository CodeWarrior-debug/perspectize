import { describe, it, expect } from 'vitest';
import { OPERANDS, OPERANDS_BY_KEY, findOperandByLabel, type OperandRow } from '#lib/customColumns/operands';

const movie = (fields: Record<string, unknown>, extra: Partial<OperandRow> = {}): OperandRow =>
	({ contentType: 'MOVIE', movie: fields, ...extra }) as OperandRow;

const get = (key: string, row: OperandRow) => {
	const op = OPERANDS_BY_KEY.get(key);
	if (!op) throw new Error(`no operand ${key}`);
	return op.get(row);
};

describe('movie operand catalogue', () => {
	it('lists the movie operands in catalogue order', () => {
		expect(OPERANDS.map((o) => o.label)).toEqual([
			'TMDB score',
			'Votes',
			'Budget',
			'Box office',
			'Runtime',
			'Release year',
			'My overall',
			'My importance',
			'My agreement',
		]);
	});

	it('has unique keys', () => {
		expect(new Set(OPERANDS.map((o) => o.key)).size).toBe(OPERANDS.length);
		expect(OPERANDS_BY_KEY.size).toBe(OPERANDS.length);
	});

	it('uses the typed units', () => {
		const units = Object.fromEntries(OPERANDS.map((o) => [o.key, o.unit]));
		expect(units).toMatchObject({
			tmdbScore: 'rating',
			budget: 'money',
			boxOffice: 'money',
			runtime: 'minutes',
			releaseYear: 'year',
			myOverall: 'rating',
		});
	});

	it('contains no YouTube statistics (views, likes, comments) in keys, labels or aliases', () => {
		const banned = /youtube|views?|likes?|comments?/i;
		for (const o of OPERANDS) {
			expect(o.key, o.key).not.toMatch(banned);
			expect(o.label, o.label).not.toMatch(banned);
			for (const alias of o.aliases) expect(alias, alias).not.toMatch(banned);
		}
	});
});

describe('TMDB operands read the movie payload', () => {
	it('TMDB score is the vote average, and null with no votes', () => {
		expect(get('tmdbScore', movie({ voteAverage: 8.4, voteCount: 120 }))).toBe(8.4);
		expect(get('tmdbScore', movie({ voteAverage: 8.4, voteCount: 0 }))).toBeNull();
		expect(get('tmdbScore', movie({}))).toBeNull();
	});

	it('Votes is the vote count, null when absent or zero', () => {
		expect(get('votes', movie({ voteCount: 120 }))).toBe(120);
		expect(get('votes', movie({ voteCount: 0 }))).toBeNull();
		expect(get('votes', movie({}))).toBeNull();
	});

	it('Budget and Box office are dollars, null when unknown or zero', () => {
		expect(get('budget', movie({ budget: 40000 }))).toBe(40000);
		expect(get('budget', movie({ budget: 0 }))).toBeNull();
		expect(get('budget', movie({ budget: null }))).toBeNull();
		expect(get('boxOffice', movie({ revenue: 2500000 }))).toBe(2500000);
		expect(get('boxOffice', movie({ revenue: null }))).toBeNull();
	});

	it('Runtime is minutes, null when unknown', () => {
		expect(get('runtime', movie({ runtimeMinutes: 117 }))).toBe(117);
		expect(get('runtime', movie({}))).toBeNull();
	});

	it('Release year prefers year and falls back to the release date', () => {
		expect(get('releaseYear', movie({ year: 2010, releaseDate: '2009-01-01' }))).toBe(2010);
		expect(get('releaseYear', movie({ releaseDate: '2010-07-15' }))).toBe(2010);
		expect(get('releaseYear', movie({}))).toBeNull();
	});

	it('returns null for non-movie rows', () => {
		const youtube = { contentType: 'YOUTUBE_VIDEO', movie: { voteAverage: 9, voteCount: 10 } } as OperandRow;
		expect(get('tmdbScore', youtube)).toBeNull();
		expect(get('budget', youtube)).toBeNull();
	});
});

describe('my-rating operands show the 0-10 display scale', () => {
	const mine = (quality?: number | null, importance?: number | null, agreement?: number | null) =>
		movie({}, { myRatings: { quality, importance, agreement } });

	it('convert storage (0-10000) to 0-10 via ratingToDisplay', () => {
		expect(get('myOverall', mine(8250))).toBe(8.25);
		expect(get('myImportance', mine(undefined, 5000))).toBe(5);
		expect(get('myAgreement', mine(undefined, undefined, 10000))).toBe(10);
	});

	it('are null when the viewer has not rated the field', () => {
		expect(get('myOverall', mine(null))).toBeNull();
		expect(get('myOverall', movie({}))).toBeNull();
	});
});

describe('findOperandByLabel', () => {
	it('matches labels case-insensitively and returns undefined otherwise', () => {
		expect(findOperandByLabel('tmdb SCORE')?.key).toBe('tmdbScore');
		expect(findOperandByLabel('Rating')).toBeUndefined();
	});
});

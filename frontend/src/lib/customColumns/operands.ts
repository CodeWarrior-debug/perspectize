/**
 * The operand catalogue: every numeric field a custom column formula may read. Movies only for
 * now. The grid row is not enough on its own for the viewer's own ratings, so the caller attaches
 * `myRatings` (storage 0-10000) to each row before evaluating.
 *
 * No YouTube statistics belong here (views, likes, comments): YouTube's API policy forbids
 * metrics derived from them (issue #793). A test guards the keys, labels and aliases.
 */
import {
	budgetValueGetter,
	boxOfficeValueGetter,
	movieResponse,
	tmdbScoreValueGetter,
	votesValueGetter,
} from '../utils/formatting';
import type { MovieRow } from '../utils/formatting';
import { ratingToDisplay } from '../utils/ratings';

export type OperandUnit = 'number' | 'money' | 'minutes' | 'year' | 'rating';
export type OperandGroup = 'TMDB' | 'Your ratings';
export type MyRatingField = 'quality' | 'importance' | 'agreement';

/** A row as the operands read it: a content row plus the viewer's ratings for it. */
export type OperandRow = MovieRow & {
	myRatings?: Partial<Record<MyRatingField, number | null>>;
};

export type Operand = {
	key: string;
	label: string;
	group: OperandGroup;
	unit: OperandUnit;
	/** Other names people might type for this column; used only to suggest columns on a typo. */
	aliases: readonly string[];
	/** The value for one row, or null when the row has none. Never 0 for a missing value. */
	get: (row: OperandRow) => number | null;
};

const finiteOrNull = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

const positiveOrNull = (v: number | null | undefined): number | null =>
	finiteOrNull(v) !== null && v! > 0 ? v! : null;

function releaseYear(row: OperandRow): number | null {
	const m = movieResponse(row);
	if (!m) return null;
	const fromYear = positiveOrNull(m.year);
	if (fromYear !== null) return fromYear;
	const match = /^(\d{4})/.exec(m.releaseDate ?? '');
	return match ? positiveOrNull(Number(match[1])) : null;
}

/** The viewer's rating for a field on the 0-10 display scale, or null when not rated. */
function myRating(field: MyRatingField) {
	return (row: OperandRow): number | null => {
		const stored = row.myRatings?.[field];
		return stored == null ? null : Number(ratingToDisplay(stored));
	};
}

export const OPERANDS: readonly Operand[] = [
	{
		key: 'tmdbScore',
		label: 'TMDB score',
		group: 'TMDB',
		unit: 'rating',
		aliases: ['rating', 'score', 'tmdb rating', 'vote average'],
		get: (row) => finiteOrNull(tmdbScoreValueGetter({ data: row })),
	},
	{
		key: 'votes',
		label: 'Votes',
		group: 'TMDB',
		unit: 'number',
		aliases: ['vote count', 'voters'],
		get: (row) => finiteOrNull(votesValueGetter({ data: row })),
	},
	{
		key: 'budget',
		label: 'Budget',
		group: 'TMDB',
		unit: 'money',
		aliases: ['cost', 'spend'],
		get: (row) => finiteOrNull(budgetValueGetter({ data: row })),
	},
	{
		key: 'boxOffice',
		label: 'Box office',
		group: 'TMDB',
		unit: 'money',
		aliases: ['revenue', 'gross'],
		get: (row) => finiteOrNull(boxOfficeValueGetter({ data: row })),
	},
	{
		key: 'runtime',
		label: 'Runtime',
		group: 'TMDB',
		unit: 'minutes',
		aliases: ['length', 'duration', 'minutes'],
		get: (row) => positiveOrNull(movieResponse(row)?.runtimeMinutes),
	},
	{
		key: 'releaseYear',
		label: 'Release year',
		group: 'TMDB',
		unit: 'year',
		aliases: ['year', 'released'],
		get: releaseYear,
	},
	{
		key: 'myOverall',
		label: 'My overall',
		group: 'Your ratings',
		unit: 'rating',
		aliases: ['rating', 'overall', 'quality'],
		get: myRating('quality'),
	},
	{
		key: 'myImportance',
		label: 'My importance',
		group: 'Your ratings',
		unit: 'rating',
		aliases: ['importance'],
		get: myRating('importance'),
	},
	{
		key: 'myAgreement',
		label: 'My agreement',
		group: 'Your ratings',
		unit: 'rating',
		aliases: ['agreement', 'agree'],
		get: myRating('agreement'),
	},
];

export const OPERANDS_BY_KEY: ReadonlyMap<string, Operand> = new Map(OPERANDS.map((o) => [o.key, o]));

/** Looks a column up by its label, ignoring case and surrounding spaces. */
export function findOperandByLabel(label: string, operands: readonly Operand[] = OPERANDS): Operand | undefined {
	const wanted = label.trim().toLowerCase();
	return operands.find((o) => o.label.toLowerCase() === wanted);
}

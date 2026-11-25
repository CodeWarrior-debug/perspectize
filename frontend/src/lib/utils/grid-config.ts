/**
 * Extracted AG Grid configuration logic from ContentLibrary.svelte.
 * Pure functions and constants that can be unit-tested without a browser.
 */
import type { ContentItem, ContentType } from '#lib/queries/content/index.js';
import { ageRatingRank, moviePeople } from './formatting';

/**
 * Display label for a content type — used by the type column valueGetter.
 * Known types use CONTENT_TYPE_LABELS; others get first letter capitalized, rest lowercased.
 */
export function capitalizeContentType(contentType: string | undefined): string {
	if (!contentType) return '';
	const label = CONTENT_TYPE_LABELS[contentType.toUpperCase() as ContentType];
	if (label) return label;
	return contentType.charAt(0).toUpperCase() + contentType.slice(1).toLowerCase();
}

/**
 * Every content type, in the order the Type column's checkbox filter lists them.
 * Hardcoded on purpose (mirrors the backend ContentType enum) — the Record forces
 * a new ContentType to be given a label here.
 */
const CONTENT_TYPE_LABELS: Partial<Record<ContentType, string>> = {
	YOUTUBE_VIDEO: 'YouTube Video',
	CLAIM: 'Claim',
	BIBLE_PASSAGE: 'Bible Passage',
	MOVIE: 'Movie',
	BOOK: 'Book',
	WEB_PAGE: 'Webpage',
};

/** Type-filter options. `value` is the lowercased form used in the filter model and `f.type=` URL param. */
export const CONTENT_TYPE_OPTIONS: readonly { value: string; label: string }[] = Object.entries(
	CONTENT_TYPE_LABELS,
).map(([type, label]) => ({ value: type.toLowerCase(), label }));

/** Rated-filter options: the standard US certifications. `value` is lowercased like every set-filter URL value; the server gets it uppercased. */
export const AGE_RATING_OPTIONS: readonly { value: string; label: string }[] = [
	'G',
	'PG',
	'PG-13',
	'R',
	'NC-17',
	'NR',
].map((r) => ({ value: r.toLowerCase(), label: r }));

/** Display label for a set-filter value on column `colId` (content type name, or the certification in capitals). */
export function setFilterValueLabel(colId: string, value: string): string {
	return colId === 'rated' ? value.toUpperCase() : contentTypeLabel(value);
}

/** Display label for a lowercased content type value (falls back to the raw value). */
export function contentTypeLabel(value: string): string {
	return CONTENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Duration comparator for AG Grid column sorting.
 * Compares by raw length (seconds) from row data.
 */
export function durationComparator(
	_valueA: unknown,
	_valueB: unknown,
	nodeA: { data?: Pick<ContentItem, 'length'> } | undefined,
	nodeB: { data?: Pick<ContentItem, 'length'> } | undefined,
): number {
	const a = nodeA?.data?.length ?? 0;
	const b = nodeB?.data?.length ?? 0;
	return a - b;
}

/**
 * AG Grid comparator that keeps unknown (null) values last in BOTH directions.
 * AG Grid negates the comparator result for descending sorts, so when descending the
 * sign for a null is flipped. Used for Loaded-mode (client) sort of Movie columns,
 * matching the server (NULLs last) and compareContentBySorts.
 */
export function unknownLastComparator(
	valueA: number | null | undefined,
	valueB: number | null | undefined,
	_nodeA?: unknown,
	_nodeB?: unknown,
	isDescending?: boolean,
): number {
	const aNull = valueA == null;
	const bNull = valueB == null;
	if (aNull && bNull) return 0;
	if (aNull) return isDescending ? -1 : 1;
	if (bNull) return isDescending ? 1 : -1;
	return valueA - valueB;
}

/** Comparator for the Rated column (string certification values): by rating rank, unrated last in both directions. */
export function ratedComparator(
	valueA: string | null | undefined,
	valueB: string | null | undefined,
	nodeA?: unknown,
	nodeB?: unknown,
	isDescending?: boolean,
): number {
	return unknownLastComparator(ageRatingRank(valueA), ageRatingRank(valueB), nodeA, nodeB, isDescending);
}

/**
 * Comparator for the Category column (Wikidata label strings): case-insensitive, unknown
 * (no category) last in both directions. Same sign flip for descending as unknownLastComparator.
 */
export function labelComparator(
	valueA: string | null | undefined,
	valueB: string | null | undefined,
	_nodeA?: unknown,
	_nodeB?: unknown,
	isDescending?: boolean,
): number {
	const aNull = valueA == null;
	const bNull = valueB == null;
	if (aNull && bNull) return 0;
	if (aNull) return isDescending ? -1 : 1;
	if (bNull) return isDescending ? 1 : -1;
	return valueA.localeCompare(valueB, undefined, { sensitivity: 'base' });
}

/** Comparator for the Released column (ISO dates): chronological, unknown last in both directions. */
export function releasedComparator(
	valueA: string | null | undefined,
	valueB: string | null | undefined,
	nodeA?: unknown,
	nodeB?: unknown,
	isDescending?: boolean,
): number {
	const time = (v: string | null | undefined) => {
		const t = v ? Date.parse(v) : NaN;
		return Number.isNaN(t) ? null : t;
	};
	return unknownLastComparator(time(valueA), time(valueB), nodeA, nodeB, isDescending);
}

export type ResponsiveTier = 'xs' | 'sm' | 'md' | 'lg';

/**
 * The single lowercase type the `f.type` URL value names, or null when it names none or
 * several different types. Repeats of one type (`movie,movie`) still name exactly one.
 */
export function soloTypeFilter(typeFilter: string | undefined): string | null {
	if (!typeFilter) return null;
	const types = new Set(
		typeFilter
			.split(',')
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean),
	);
	return types.size === 1 ? [...types][0] : null;
}

export type PerspectiveRatingField = 'quality' | 'importance' | 'agreement';

/**
 * The signed-in viewer's rating for one row, from the perspective map the grid
 * carries in its context (keyed by content id). Null when the viewer has no
 * perspective on the row, or hasn't rated this field.
 */
export function perspectiveRating(
	byContentId: Map<string, Partial<Record<PerspectiveRatingField, number | null>>> | undefined,
	contentId: string | number | undefined,
	field: PerspectiveRatingField,
): number | null {
	if (contentId === undefined) return null;
	return byContentId?.get(String(contentId))?.[field] ?? null;
}

/** Distinct, lowercased types named by the `f.type` URL value (empty when unset). */
function selectedTypes(typeFilter: string | undefined): string[] {
	if (!typeFilter) return [];
	const types = typeFilter
		.split(',')
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);
	return [...new Set(types)];
}

/** True when the `f.type` URL value names exactly one type and it is MOVIE. */
export function isMovieOnlyTypeFilter(typeFilter: string | undefined): boolean {
	const types = selectedTypes(typeFilter);
	return types.length === 1 && types[0] === 'movie';
}

/** True when the `f.type` URL value names exactly one type and it is BOOK. */
export function isBookOnlyTypeFilter(typeFilter: string | undefined): boolean {
	const types = selectedTypes(typeFilter);
	return types.length === 1 && types[0] === 'book';
}

/** True when the `f.type` URL value names exactly one type and it is WEB_PAGE (`web_page`). */
export function isWebPageOnlyTypeFilter(typeFilter: string | undefined): boolean {
	const types = selectedTypes(typeFilter);
	return types.length === 1 && types[0] === 'web_page';
}

/** A default column set: one per single-type filter (Movie, Book, Webpage, Claim), otherwise the general (YouTube) set. */
export type ColumnView = 'movie' | 'book' | 'webpage' | 'claim' | 'general';

export function columnViewFor(typeFilter: string | undefined): ColumnView {
	if (soloTypeFilter(typeFilter) === 'claim') return 'claim';
	if (isMovieOnlyTypeFilter(typeFilter)) return 'movie';
	if (isBookOnlyTypeFilter(typeFilter)) return 'book';
	if (isWebPageOnlyTypeFilter(typeFilter)) return 'webpage';
	return 'general';
}

/**
 * True when the type filter is empty or names two or more types: the single
 * column set can't suit every row (Budget is blank for videos, Views for
 * movies), so the Activity page nudges the user to narrow to one type or
 * choose their own columns.
 */
export function showColumnRelevanceCallout(typeFilter: string | undefined): boolean {
	return selectedTypes(typeFilter).length !== 1;
}

// ---------------------------------------------------------------------------
// Person filter (`f.person=<tmdb id>[:cast|:director]`) — not a column filter
// ---------------------------------------------------------------------------

/** URL `f.*` key for the person filter. It has no grid column, so it is never part of the AG Grid filter model. */
export const PERSON_FILTER_KEY = 'person';

export interface PersonFilter {
	id: number;
	/** Omitted = either role, matching the server's `personRole` default. */
	role?: 'cast' | 'director';
}

/** Parse `123`, `123:cast` or `123:director`; null for anything else (bad ids are ignored, never sent). */
export function parsePersonFilter(value: string | undefined): PersonFilter | null {
	const m = /^(\d+)(?::(cast|director))?$/i.exec((value ?? '').trim());
	if (!m) return null;
	const id = Number(m[1]);
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	return m[2] ? { id, role: m[2].toLowerCase() as 'cast' | 'director' } : { id };
}

/** Client-side twin of the server's person filter: the row is a Movie crediting this person (in the role, if given). */
export function rowMatchesPerson(row: ContentItem, person: PersonFilter): boolean {
	return moviePeople(row).some((p) => p.id === person.id && (!person.role || p.role === person.role));
}

/** The slice of AG Grid's API that syncItemHeader needs (kept small so it is unit-testable). */
export interface HeaderApi {
	getColumn(colId: string): { getColDef(): { headerName?: string } } | null | undefined;
	refreshHeader(): void;
}

/**
 * Set the Item column's header text, redrawing the header only when it actually
 * changes. refreshHeader closes an open column-filter popup, and the caller's
 * effect re-runs on every filter change, so an unconditional redraw closed the
 * filter while the user was still typing. Returns whether it redrew.
 */
export function syncItemHeader(api: HeaderApi, name: string): boolean {
	const colDef = api.getColumn('item')?.getColDef();
	if (!colDef || colDef.headerName === name) return false;
	colDef.headerName = name;
	api.refreshHeader();
	return true;
}

/** Item column header: "Claim" for exactly CLAIM, "Film" for MOVIE, "Book" for BOOK, otherwise "Item". */
export function itemColumnHeader(typeFilter: string | undefined): string {
	const solo = soloTypeFilter(typeFilter);
	if (solo === 'claim') return 'Claim';
	if (isMovieOnlyTypeFilter(typeFilter)) return 'Film';
	if (isBookOnlyTypeFilter(typeFilter)) return 'Book';
	if (isWebPageOnlyTypeFilter(typeFilter)) return 'Webpage';
	return 'Item';
}

/**
 * The grid API only if its grid is still alive, else null. The cardMode breakpoint and the
 * error state destroy the grid while effects and click handlers still hold the old API, and
 * calling it then logs "Grid API function X() cannot be called as the grid has been destroyed"
 * (and applyColumnState throws). Use at the call site instead of a bare `!api` check.
 */
export function liveGridApi<T extends { isDestroyed(): boolean }>(api: T | null | undefined): T | null {
	return api && !api.isDestroyed() ? api : null;
}

/**
 * Readers and cell formatters for BOOK rows. Open Library leaves most fields unknown for some
 * works, so unknown is always EMPTY_VALUE (or null for a getter), never 0: a missing year, page
 * count or rating must not render as "0" or "NaN".
 */
import { EMPTY_VALUE } from './formatting';

export interface BookAuthor {
	name: string;
	openLibraryKey?: string;
}

/** The shaped Open Library payload (`book` on list rows, `response` on the details query). */
export interface BookResponse {
	workKey?: string;
	title?: string;
	authors?: BookAuthor[];
	coverId?: number | null;
	firstPublishYear?: number | null;
	pageCountMedian?: number | null;
	subjects?: string[];
	ratingsAverage?: number | null;
	ratingsCount?: number | null;
	editionCount?: number | null;
	/** Open Library reading-log counts (its users only). null/absent = unknown, 0 = a real zero. */
	wantToReadCount?: number | null;
	currentlyReadingCount?: number | null;
	alreadyReadCount?: number | null;
	readingLogCount?: number | null;
	/** ISO time the counts were fetched; they are a snapshot refreshed by "Update source data". */
	readingLogFetchedAt?: string;
	description?: string;
	relatedWorks?: { title: string; url: string }[];
	resolvedFromISBN?: string;
}

/** Minimal row shape the Book helpers read. */
export interface BookRow {
	contentType?: string;
	book?: unknown;
	response?: unknown;
}

/** The parsed Book payload, or null when the row isn't a Book or has no usable payload. */
export function bookResponse(row: BookRow | null | undefined): BookResponse | null {
	if (!row || row.contentType !== 'BOOK') return null;
	let r = row.book ?? row.response;
	if (typeof r === 'string') {
		try {
			r = JSON.parse(r);
		} catch {
			return null;
		}
	}
	if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
	return r as BookResponse;
}

/** Every named author in the order Open Library gives them. Empty when there are none. */
export function bookAuthors(row: BookRow | null | undefined): BookAuthor[] {
	return (bookResponse(row)?.authors ?? []).filter((a) => typeof a?.name === 'string' && a.name !== '');
}

/** The first author's name: the value the Author column sorts and filters on. */
export function authorValueGetter(params: { data?: BookRow }): string | null {
	return bookAuthors(params.data)[0]?.name ?? null;
}

/** `""` for no author, `"Name"` for one, `"Name +2"` for three: the first author plus a count of the rest. */
export function authorCellText(row: BookRow | null | undefined): string {
	const authors = bookAuthors(row);
	if (authors.length === 0) return '';
	const others = authors.length - 1;
	return others > 0 ? `${authors[0].name} +${others}` : authors[0].name;
}

/** The Author cell: the author text, or the dash when there is none. */
export function authorCellRenderer(params: { data?: BookRow }): HTMLElement | string {
	if (!params.data) return '';
	const span = document.createElement('span');
	span.className = 'truncate';
	span.textContent = authorCellText(params.data) || EMPTY_VALUE;
	return span;
}

export type CoverSize = 'S' | 'M' | 'L';

/**
 * Absolute Open Library cover URL for a cover id, or null when the work has no cover. S is for
 * grids and the Item cell, M for cards, L for details. Lives here (pure) so cell renderers can
 * use it without the GraphQL client; openLibraryApi.ts re-exports it.
 */
export function openLibraryCoverUrl(coverId: number | null | undefined, size: CoverSize = 'M'): string | null {
	return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}

/** A positive number, or null: 0 and missing both mean unknown. */
function known(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The first-publish year as a plain four-digit string. It is never run through the shared
 * number formatter, which would render 1952 as "1,952".
 */
export function publishedValueGetter(params: { data?: BookRow }): string | null {
	const year = known(bookResponse(params.data)?.firstPublishYear);
	return year === null ? null : String(year);
}

export function pagesValueGetter(params: { data?: BookRow }): number | null {
	return known(bookResponse(params.data)?.pageCountMedian);
}

/** The community rating out of 5. A null or 0 average is unknown. */
export function ratingValueGetter(params: { data?: BookRow }): number | null {
	return known(bookResponse(params.data)?.ratingsAverage);
}

/** One decimal, or the dash when unknown: "4.1". */
export function formatBookRating(value: number | null): string {
	return value === null ? EMPTY_VALUE : value.toFixed(1);
}

/**
 * True when the rating rests on fewer than 5 votes, so the cell is muted. Open Library ratings
 * are sparse. When the count is missing, a rating that exists still counts as low.
 */
export function hasLowRatingCount(params: { data?: BookRow }): boolean {
	const count = bookResponse(params.data)?.ratingsCount;
	if (count === null || count === undefined) return ratingValueGetter(params) !== null;
	return count < 5;
}

export function ratingTooltip(params: { data?: BookRow }): string {
	const rating = ratingValueGetter(params);
	if (rating === null) return 'No ratings yet';
	const base = `${formatBookRating(rating)} out of 5`;
	const count = known(bookResponse(params.data)?.ratingsCount);
	if (count === null) return base;
	return `${base} · ${count.toLocaleString('en-US')} ${count === 1 ? 'rating' : 'ratings'}`;
}

export function editionsValueGetter(params: { data?: BookRow }): number | null {
	return known(bookResponse(params.data)?.editionCount);
}

/** Open Library subjects, shown as the Tags column when the row has no real tags. Null when there are none. */
export function bookSubjects(row: BookRow | null | undefined): string[] | null {
	const subjects = bookResponse(row)?.subjects;
	return subjects && subjects.length > 0 ? subjects : null;
}

/** Why every reading-log figure carries a caveat: the shelves are Open Library members', not all readers. */
export const READING_LOG_CAVEAT = 'Open Library users only, not readers in general';

/** A count that may legitimately be 0: only null, undefined and non-numbers are unknown. */
function knownCount(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export interface ReadingLog {
	wantToRead: number | null;
	currentlyReading: number | null;
	alreadyRead: number | null;
	total: number | null;
}

/** The four reading-log counts from camelCase fields (a stored payload or a Discover result). */
export function readingLogOf(
	source:
		| {
				wantToReadCount?: number | null;
				currentlyReadingCount?: number | null;
				alreadyReadCount?: number | null;
				readingLogCount?: number | null;
		  }
		| null
		| undefined,
): ReadingLog {
	return {
		wantToRead: knownCount(source?.wantToReadCount),
		currentlyReading: knownCount(source?.currentlyReadingCount),
		alreadyRead: knownCount(source?.alreadyReadCount),
		total: knownCount(source?.readingLogCount),
	};
}

/** True when Open Library gave at least one of the counts. */
export function hasReadingLog(log: ReadingLog): boolean {
	return log.wantToRead !== null || log.currentlyReading !== null || log.alreadyRead !== null || log.total !== null;
}

function count(n: number): string {
	return n.toLocaleString('en-US');
}

/**
 * "1,189 want to read · 79 reading now · 153 have read". A missing count is left out (never
 * shown as 0); a real 0 stays. Empty string when nothing is known.
 */
export function readingLogBreakdown(log: ReadingLog): string {
	const parts = [
		log.wantToRead === null ? null : `${count(log.wantToRead)} want to read`,
		log.currentlyReading === null ? null : `${count(log.currentlyReading)} reading now`,
		log.alreadyRead === null ? null : `${count(log.alreadyRead)} have read`,
	].filter((part): part is string => part !== null);
	// Only the total is known: say so rather than showing nothing.
	if (parts.length === 0 && log.total !== null) return `${count(log.total)} shelved`;
	return parts.join(' · ');
}

/** "Nov 12, 2026" for a valid ISO time, or null (a row stored before the snapshot existed). */
export function formatAsOf(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The Readers column's value and sort key: the want-to-read count, null when unknown (0 is real). */
export function readersValueGetter(params: { data?: BookRow }): number | null {
	return readingLogOf(bookResponse(params.data)).wantToRead;
}

/** The Readers cell: the want-to-read count with a thousands separator, or the dash. */
export function formatReaders(value: number | null | undefined): string {
	return value === null || value === undefined ? EMPTY_VALUE : count(value);
}

/** Hover text for the Readers cell: breakdown, snapshot date and the Open-Library-only caveat. */
export function readersTooltip(params: { data?: BookRow }): string {
	const response = bookResponse(params.data);
	const log = readingLogOf(response);
	if (!hasReadingLog(log)) {
		return 'No Open Library reading-log data yet. Update source data to fetch it.';
	}
	const asOf = formatAsOf(response?.readingLogFetchedAt);
	const parts = [readingLogBreakdown(log), `${READING_LOG_CAVEAT}${asOf ? `, as of ${asOf}` : ''}`];
	return parts.filter((part) => part !== '').join('. ');
}

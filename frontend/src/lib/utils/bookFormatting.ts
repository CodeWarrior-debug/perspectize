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

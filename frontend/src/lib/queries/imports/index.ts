import { gql } from 'graphql-request';

/**
 * Import staging: anyone signed in requests an import (a YouTube channel, a
 * TMDB person's filmography); an admin approves it (an admin's own starts at
 * once) and its sources are listed in the background into a shared staging
 * sheet; signed-in users pick rows and import them, or mark them "don't
 * import". An admin closes an import when it's done with.
 *
 * The sheet loads every row of one import in one request (no pagination: the
 * grid filters and sorts client-side). Long text is fetched per row, lazily,
 * by IMPORT_ITEM_DETAILS.
 */

/** The imports list changes when someone requests, reviews or closes one (each evicts it). */
export const IMPORT_JOBS_STALE_TIME_MS = 60_000;

/** A finished sheet changes only when someone imports rows (which evicts it). */
export const IMPORT_JOB_STALE_TIME_MS = 60_000;

/**
 * While a source is listing, the sheet refetches this often. Importing is
 * followed by the importProgress subscription instead (one refetch at the end),
 * with polling only as the fallback when the live connection is down.
 */
export const IMPORT_JOB_POLL_MS = 3_000;

/** A row's description, chapters and tags are fixed once listed. */
export const IMPORT_ITEM_DETAILS_STALE_TIME_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type ImportSourceType = 'YOUTUBE_CHANNEL' | 'TMDB_PERSON';
export type ImportPersonRole = 'DIRECTOR' | 'CAST';
export type ImportSourceStatus = 'WAITING' | 'LISTING' | 'READY' | 'FAILED';
export type ImportRequestStatus = 'REQUESTED' | 'APPROVED' | 'DECLINED';
export type ImportItemStatus = 'QUEUED' | 'IMPORTED' | 'SKIPPED' | 'FAILED';
/** Destination content types an import can produce (a subset of ContentType). */
export type ImportDestinationType = 'YOUTUBE_VIDEO' | 'MOVIE';

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface ImportSource {
	id: string;
	sourceType: ImportSourceType;
	sourceRef: string;
	title: string | null;
	url: string | null;
	role: ImportPersonRole | null;
	destinationType: ImportDestinationType;
	status: ImportSourceStatus;
	statusDetail: string | null;
	itemCount: number;
	fetchedAt: string | null;
}

export interface ImportItem {
	id: string;
	sourceId: string;
	destinationType: ImportDestinationType;
	externalId: string;
	url: string;
	title: string;
	/**
	 * Decision facts, shown as sheet columns named after their keys. A key means
	 * the same thing for every content type (durationSeconds, viewCount, rating,
	 * genres, …); a missing key is unknown, never 0. The backend's
	 * domain.ImportFacts lists the keys.
	 */
	facts: ImportFacts;
	position: number;
	/** Marked "don't import" by someone: can't be imported until unmarked. */
	excluded: boolean;
	statsFetchedAt: string;
	inLibrary: boolean;
	contentId: string | null;
	importStatus: ImportItemStatus | null;
	importError: string | null;
	importedAt: string | null;
}

/** A fact value: a number, text, yes/no, an ISO time (keys ending in "At") or a list of names. */
export type ImportFactValue = string | number | boolean | string[];

export type ImportFacts = Record<string, ImportFactValue>;

export interface ImportJobSummary {
	id: string;
	name: string;
	requestStatus: ImportRequestStatus;
	requestedBy: { id: string; username: string } | null;
	/** The reviewing admin's reason; always set on a decline. */
	reviewNote: string | null;
	reviewedAt: string | null;
	/** Set when an admin closed it (hidden from non-admins, read-only). */
	closedAt: string | null;
	createdAt: string;
	updatedAt: string;
	sources: ImportSource[];
}

export interface ImportJob extends ImportJobSummary {
	items: ImportItem[];
}

export interface ImportChapter {
	startSeconds: number;
	title: string;
}

export interface ImportPerson {
	name: string;
	role: string;
}

export interface ImportItemDetails {
	item: ImportItem;
	description: string;
	tags: string[];
	chapters: ImportChapter[];
	links: string[];
	people: ImportPerson[];
	genres: string[];
	language: string | null;
}

export interface ImportItemsResult {
	queued: number;
	alreadyInLibrary: number;
	alreadyQueued: number;
	notFound: number;
	excluded: number;
}

/** Live progress of an import's running batch(es); done = imported + skipped + failed. */
export interface ImportProgress {
	jobId: string;
	total: number;
	done: number;
	imported: number;
	skipped: number;
	failed: number;
	running: boolean;
	updatedAt: string;
}

/**
 * Listing progress of one source (admins only). `staged` is the rows listed so
 * far and `batches` the listing batches written for it.
 */
export interface ImportSourceListingProgress {
	sourceId: string;
	staged: number;
	batches: number;
	status: ImportSourceStatus;
}

/**
 * Listing progress of an import's sources (admins only). `listing` is true while
 * any source is still listing; the last snapshot has it false.
 */
export interface ImportListingProgress {
	jobId: string;
	listing: boolean;
	sources: ImportSourceListingProgress[];
	updatedAt: string;
}

export interface CreateImportSourceInput {
	sourceType: ImportSourceType;
	ref: string;
	role?: ImportPersonRole | null;
}

export interface ImportJobsResponse {
	importJobs: ImportJobSummary[];
}

export interface ImportJobResponse {
	importJob: ImportJob | null;
}

export interface ImportItemDetailsResponse {
	importItemDetails: ImportItemDetails | null;
}

export interface ImportItemsResponse {
	importItems: ImportItemsResult;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const IMPORT_SOURCE_FIELDS = gql`
	fragment ImportSourceFields on ImportSource {
		id
		sourceType
		sourceRef
		title
		url
		role
		destinationType
		status
		statusDetail
		itemCount
		fetchedAt
	}
`;

const IMPORT_ITEM_FIELDS = gql`
	fragment ImportItemFields on ImportItem {
		id
		sourceId
		destinationType
		externalId
		url
		title
		facts
		position
		excluded
		statsFetchedAt
		inLibrary
		contentId
		importStatus
		importError
		importedAt
	}
`;

const IMPORT_JOB_FIELDS = gql`
	${IMPORT_SOURCE_FIELDS}
	fragment ImportJobFields on ImportJob {
		id
		name
		requestStatus
		requestedBy {
			id
			username
		}
		reviewNote
		reviewedAt
		closedAt
		createdAt
		updatedAt
		sources {
			...ImportSourceFields
		}
	}
`;

export const IMPORT_JOBS = gql`
	${IMPORT_JOB_FIELDS}
	query ImportJobs($includeClosed: Boolean) {
		importJobs(includeClosed: $includeClosed) {
			...ImportJobFields
		}
	}
`;

export const IMPORT_JOB = gql`
	${IMPORT_JOB_FIELDS}
	${IMPORT_ITEM_FIELDS}
	query ImportJob($id: ID!) {
		importJob(id: $id) {
			...ImportJobFields
			items {
				...ImportItemFields
			}
		}
	}
`;

export const IMPORT_ITEM_DETAILS = gql`
	${IMPORT_ITEM_FIELDS}
	query ImportItemDetails($id: ID!) {
		importItemDetails(id: $id) {
			item {
				...ImportItemFields
			}
			description
			tags
			chapters {
				startSeconds
				title
			}
			links
			people {
				name
				role
			}
			genres
			language
		}
	}
`;

export const IMPORT_ITEMS = gql`
	mutation ImportItems($input: ImportItemsInput!) {
		importItems(input: $input) {
			queued
			alreadyInLibrary
			alreadyQueued
			notFound
			excluded
		}
	}
`;

export const CREATE_IMPORT_JOB = gql`
	${IMPORT_JOB_FIELDS}
	mutation CreateImportJob($input: CreateImportJobInput!) {
		createImportJob(input: $input) {
			...ImportJobFields
		}
	}
`;

export const REVIEW_IMPORT_JOB = gql`
	${IMPORT_JOB_FIELDS}
	mutation ReviewImportJob($input: ReviewImportJobInput!) {
		reviewImportJob(input: $input) {
			...ImportJobFields
		}
	}
`;

export const CLOSE_IMPORT_JOB = gql`
	${IMPORT_JOB_FIELDS}
	mutation CloseImportJob($input: CloseImportJobInput!) {
		closeImportJob(input: $input) {
			...ImportJobFields
		}
	}
`;

export const SET_IMPORT_ITEMS_EXCLUDED = gql`
	mutation SetImportItemsExcluded($input: SetImportItemsExcludedInput!) {
		setImportItemsExcluded(input: $input)
	}
`;

/** Pushed at most twice a second while rows import (over the graphql-ws connection). */
export const IMPORT_PROGRESS = `
	subscription ImportProgress($jobId: ID!) {
		importProgress(jobId: $jobId) {
			jobId
			total
			done
			imported
			skipped
			failed
			running
			updatedAt
		}
	}
`;

/**
 * Admin only (the server refuses anyone else). Pushed on subscribe with the
 * current snapshot, then at most twice a second while a source lists, and once
 * more with listing false when the last source finishes. After a server restart
 * the snapshot can be empty until a new listing starts.
 */
export const IMPORT_LISTING_PROGRESS = `
	subscription ImportListingProgress($jobId: ID!) {
		importListingProgress(jobId: $jobId) {
			jobId
			listing
			sources {
				sourceId
				staged
				batches
				status
			}
			updatedAt
		}
	}
`;

export interface ImportListingProgressResponse {
	importListingProgress: ImportListingProgress;
}

export interface CreateImportJobResponse {
	createImportJob: ImportJobSummary;
}

export interface ReviewImportJobResponse {
	reviewImportJob: ImportJobSummary;
}

export interface CloseImportJobResponse {
	closeImportJob: ImportJobSummary;
}

export interface SetImportItemsExcludedResponse {
	setImportItemsExcluded: number;
}

export interface ImportProgressResponse {
	importProgress: ImportProgress;
}

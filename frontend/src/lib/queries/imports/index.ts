import { gql } from 'graphql-request';

/**
 * Import staging: admins create imports (a YouTube channel, a TMDB person's
 * filmography) whose sources are listed in the background into a shared
 * staging sheet; signed-in users pick rows and import them.
 *
 * The sheet loads every row of one import in one request (no pagination: the
 * grid filters and sorts client-side). Long text is fetched per row, lazily,
 * by IMPORT_ITEM_DETAILS.
 */

/** The imports list changes only when an admin creates one. */
export const IMPORT_JOBS_STALE_TIME_MS = 60_000;

/** A finished sheet changes only when someone imports rows (which evicts it). */
export const IMPORT_JOB_STALE_TIME_MS = 60_000;

/** While a source is listing or rows are importing, the sheet refetches this often. */
export const IMPORT_JOB_POLL_MS = 3_000;

/** A row's description, chapters and tags are fixed once listed. */
export const IMPORT_ITEM_DETAILS_STALE_TIME_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type ImportSourceType = 'YOUTUBE_CHANNEL' | 'TMDB_PERSON';
export type ImportPersonRole = 'DIRECTOR' | 'CAST';
export type ImportSourceStatus = 'LISTING' | 'READY' | 'FAILED';
export type ImportItemKind = 'VIDEO' | 'SHORT' | 'LIVE' | 'MOVIE';
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
	kind: ImportItemKind;
	externalId: string;
	url: string;
	title: string;
	summary: string | null;
	publishedAt: string | null;
	durationSeconds: number | null;
	viewCount: number | null;
	/** Null when the channel hides likes: never treat as 0. */
	likeCount: number | null;
	commentCount: number | null;
	/** 0-10 */
	rating: number | null;
	ratingCount: number | null;
	ratingSource: string | null;
	chapterCount: number;
	hasCaptions: boolean | null;
	/** Films: genre names and up to 3 top-billed cast; empty for videos. */
	genres: string[];
	topCast: string[];
	thumbnailUrl: string | null;
	position: number;
	statsFetchedAt: string;
	inLibrary: boolean;
	contentId: string | null;
	importStatus: ImportItemStatus | null;
	importError: string | null;
	importedAt: string | null;
}

export interface ImportJobSummary {
	id: string;
	name: string;
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
		kind
		externalId
		url
		title
		summary
		publishedAt
		durationSeconds
		viewCount
		likeCount
		commentCount
		rating
		ratingCount
		ratingSource
		chapterCount
		hasCaptions
		genres
		topCast
		thumbnailUrl
		position
		statsFetchedAt
		inLibrary
		contentId
		importStatus
		importError
		importedAt
	}
`;

export const IMPORT_JOBS = gql`
	${IMPORT_SOURCE_FIELDS}
	query ImportJobs {
		importJobs {
			id
			name
			createdAt
			updatedAt
			sources {
				...ImportSourceFields
			}
		}
	}
`;

export const IMPORT_JOB = gql`
	${IMPORT_SOURCE_FIELDS}
	${IMPORT_ITEM_FIELDS}
	query ImportJob($id: ID!) {
		importJob(id: $id) {
			id
			name
			createdAt
			updatedAt
			sources {
				...ImportSourceFields
			}
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
		}
	}
`;

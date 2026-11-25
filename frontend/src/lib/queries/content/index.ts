import { gql } from 'graphql-request';

/** Content.lengthDisplay: the source of a length and the smallest unit it reports. */
export interface LengthDisplay {
	source: string;
	/** LengthPrecision enum: SECONDS or MINUTES. Kept a string so a new value formats as seconds, not a type error. */
	precision: string;
}

export type { ContentFilterInput } from '#lib/utils/libraryColumns/filterCodec.js';
export { libraryListRequest, cursorsAfterPage, LIBRARY_LIST_STALE_TIME_MS, LOADED_MODE_FIRST } from './libraryList';

// Values the API returns in Content.contentType (a String, not a GraphQL enum).
export type ContentType = 'YOUTUBE_VIDEO' | 'CLAIM' | 'BIBLE_PASSAGE' | 'MOVIE' | 'BOOK' | 'WEB_PAGE';

/**
 * A webpage's role (the backend `WebPageRole` enum). Chosen by the adder, never read from the page.
 * The first entry is the primary role. Stored in `response.webPageRoles`.
 */
export type WebPageRole = 'BLOG_POST' | 'SESSION_TRANSCRIPT';

export type WebPageFetchStatus = 'OK' | 'BLOCKED' | 'ERROR' | 'TIMEOUT' | 'NOT_HTML' | 'TOO_LARGE';

/** `fetch` on a webpage: internal status (drives the fallback title and the dialog message) plus when it was read. */
export interface WebPageFetch {
	status: WebPageFetchStatus;
	/** Null when no HTTP response arrived (TIMEOUT, network ERROR). Never render it as "HTTP null". */
	httpStatus: number | null;
	at: string;
}

/** The metadata read from a webpage's `<head>`, as stored in `Content.response` for WEB_PAGE rows. */
export interface WebPageMeta {
	finalUrl: string;
	domain: string;
	siteName: string | null;
	title: string | null;
	description: string | null;
	imageUrl: string | null;
	faviconUrl: string | null;
	publishedAt: string | null;
	lang: string | null;
	author: string | null;
	webPageRoles: WebPageRole[];
	fetch: WebPageFetch;
}

/**
 * The shaped webpage fields a list row carries (`ContentItem.webPage`). Every field is nullable
 * except `webPageRoles`, which is never null (`[]` when the page has none). Missing is null, not a guess.
 */
export interface WebPageListMeta {
	siteName: string | null;
	domain: string | null;
	imageUrl: string | null;
	faviconUrl: string | null;
	publishedAt: string | null;
	author: string | null;
	webPageRoles: WebPageRole[];
}

/** The read-only import preview (`previewWebPage`). It never carries roles: the adder picks those. */
export interface WebPagePreview {
	finalUrl: string;
	domain: string;
	siteName: string | null;
	title: string | null;
	description: string | null;
	imageUrl: string | null;
	faviconUrl: string | null;
	publishedAt: string | null;
	lang: string | null;
	author: string | null;
	fetch: WebPageFetch;
	/** IntID: the id of a row already saved for this page, or null. Serialised as a string, like `ContentItem.id`. */
	alreadyExistsContentId: string | null;
}

/** The import job that created a content row. Mirrors the backend `ImportJobRef`. */
export interface ImportJobRef {
	id: string;
	name: string;
}

export interface ContentItem {
	id: string;
	name: string;
	addedByUserID: string;
	// Client-side only (not in the GraphQL selection): ContentLibrary fills it from the
	// cached users list, so the User column can render/sort/filter without a per-row join.
	addedByUsername?: string | null;
	url: string | null;
	contentType: string;
	// BIBLE_PASSAGE only: computed verse ordinals and the optional,
	// first-write-wins display title. Null/absent for other content types.
	verseStartID?: number | null;
	verseEndID?: number | null;
	displayTitle?: string | null;
	length: number | null;
	lengthUnits: string | null;
	/** Where `length` came from and its precision; format to it (MINUTES -> h:mm). */
	lengthDisplay?: LengthDisplay | null;
	viewCount: number | null;
	likeCount: number | null;
	channelTitle: string | null;
	publishedAt: string | null;
	tags: string[] | null;
	description: string | null;
	// Source payload (JSON scalar). Movie rows read cast/revenue/etc. from it; YouTube rows carry the API items.
	response?: Record<string, unknown> | null;
	// MOVIE rows only: the shaped TMDB payload. List rows select this instead of `response`
	// (so YouTube rows don't ship their snippet twice); null for every other type.
	movie?: Record<string, unknown> | null;
	// BOOK rows only: the shaped Open Library payload (same list-row/details split as `movie`);
	// null for every other type. Read it through bookFormatting's bookResponse().
	book?: Record<string, unknown> | null;
	// WEB_PAGE rows only: the shaped page fields for list rows (same split as `movie`/`book`; the raw
	// `response` is never selected in lists). Null for every other type. Read it through webPage.ts.
	webPage?: WebPageListMeta | null;
	// The WEBSITE a WEB_PAGE is filed under, and a WEBSITE's own id. Selected by the details query
	// only (GET_CONTENT_DETAILS), so list rows don't carry them. Null/absent when not filed.
	parentContentID?: number | null;
	parentContent?: { id: string; name: string; url: string | null } | null;
	primaryCategory: {
		id: string;
		wikidataQid: string;
		label: string;
		description: string | null;
		entityType: string | null;
		wikipediaUrl: string | null;
	} | null;
	createdAt: string;
	updatedAt: string;
	// CLAIM rows only: the claim's dates (YYYY-MM-DD). Null on other types and on legacy claims without dates.
	customFields?: { effectiveDate?: string; evaluateBy?: string } | null;
}

export interface ContentResponse {
	content: {
		items: ContentItem[];
		pageInfo: {
			hasNextPage: boolean;
			hasPreviousPage: boolean;
			startCursor: string | null;
			endCursor: string | null;
		};
		totalCount: number;
	};
}

export interface ContentSortInput {
	field: string; // ContentSortBy enum value
	order: 'ASC' | 'DESC';
}

export interface CreateContentResponse {
	createContentFromYouTube: {
		content: ContentItem;
		alreadyExisted: boolean;
	};
}

export interface UpdateContentSourceDataResponse {
	updateContentSourceData: ContentItem;
}

export const LIST_CONTENT = gql`
	query ListContent(
		$first: Int
		$after: String
		$sortBy: ContentSortBy = UPDATED_AT
		$sortOrder: SortOrder = DESC
		$sorts: [ContentSortInput!]
		$filter: ContentFilter
		$includeTotalCount: Boolean = true
	) {
		content(
			first: $first
			after: $after
			sortBy: $sortBy
			sortOrder: $sortOrder
			sorts: $sorts
			filter: $filter
			includeTotalCount: $includeTotalCount
		) {
			items {
				id
				name
				addedByUserID
				url
				contentType
				verseStartID
				verseEndID
				displayTitle
				length
				lengthUnits
				lengthDisplay {
					source
					precision
				}
				viewCount
				likeCount
				channelTitle
				publishedAt
				tags
				description
				movie
				customFields
				book
				webPage
				primaryCategory {
					id
					wikidataQid
					label
					description
					entityType
					wikipediaUrl
				}
				createdAt
				updatedAt
			}
			pageInfo {
				hasNextPage
				hasPreviousPage
				startCursor
				endCursor
			}
			totalCount
		}
	}
`;

// Compare page's "choose something to compare" picker: filters server-side to
// content with 2+ perspectives the viewer can read (minPerspectiveCount) and
// shows each row's visiblePerspectiveCount. A separate query from LIST_CONTENT
// (see the cost comment on GET_CONTENT_AGGREGATES below) — capped at a modest
// `first` so the added per-row dataloader cost stays bounded to this one
// picker fetch, not every Activity grid page load.
export interface ComparePickerContentItem {
	id: string;
	name: string;
	contentType: string;
	channelTitle: string | null;
	url: string | null;
	// Perspectives the viewer can read (public + their own). perspectiveCount
	// also counts other people's private ones, so it can read higher than the
	// Compare page can show.
	visiblePerspectiveCount: number | null;
}

export interface ListComparableContentResponse {
	content: {
		items: ComparePickerContentItem[];
	};
}

export const LIST_COMPARABLE_CONTENT = gql`
	query ListComparableContent($first: Int = 40, $filter: ContentFilter) {
		content(first: $first, sortBy: UPDATED_AT, sortOrder: DESC, filter: $filter, includeTotalCount: false) {
			items {
				id
				name
				contentType
				channelTitle
				url
				visiblePerspectiveCount
			}
		}
	}
`;

export interface ContentPickerItem {
	id: string;
	name: string;
	contentType: string;
	channelTitle: string | null;
}

export interface ContentPickerResponse {
	content: {
		items: ContentPickerItem[];
	};
}

/** Search-as-you-type item picker (Plan's Add Todo dialog): just enough to show and choose a row. */
export const LIST_CONTENT_PICKER = gql`
	query ListContentPicker($first: Int = 20, $filter: ContentFilter) {
		content(first: $first, sortBy: UPDATED_AT, sortOrder: DESC, filter: $filter, includeTotalCount: false) {
			items {
				id
				name
				contentType
				channelTitle
			}
		}
	}
`;

export const GET_CONTENT = gql`
	query GetContent($id: ID!) {
		contentByID(id: $id) {
			id
			name
			url
			contentType
			verseStartID
			verseEndID
			displayTitle
			length
			lengthUnits
			lengthDisplay {
				source
				precision
			}
			viewCount
			likeCount
			commentCount
			response
			createdAt
			updatedAt
		}
	}
`;

// Same fields as a LIST_CONTENT row, so the details modal can render an item
// that isn't in the currently loaded Activity page (deep link via `?open=<id>`).
export const GET_CONTENT_DETAILS = gql`
	query GetContentDetails($id: ID!) {
		contentByID(id: $id) {
			id
			name
			addedByUserID
			url
			contentType
			verseStartID
			verseEndID
			displayTitle
			length
			lengthUnits
			lengthDisplay {
				source
				precision
			}
			viewCount
			likeCount
			channelTitle
			publishedAt
			tags
			description
			response
			movie
			customFields
			book
			parentContentID
			parentContent {
				id
				name
				url
			}
			primaryCategory {
				id
				wikidataQid
				label
				description
				entityType
				wikipediaUrl
			}
			createdAt
			updatedAt
		}
	}
`;

export interface ContentDetailsResponse {
	contentByID: ContentItem | null;
}

/** How many of a website's pages the details view lists; `totalCount` covers the rest. */
export const WEBSITE_PAGES_LIMIT = 50;

// The pages filed under one WEBSITE, newest first (the website's details view). One request per
// opened website; `totalCount` is the whole filed set, not just the capped list.
export const LIST_WEBSITE_PAGES = gql`
	query ListWebsitePages($parentContentID: IntID!, $first: Int!) {
		content(
			first: $first
			sortBy: PUBLISHED_AT
			sortOrder: DESC
			filter: { parentContentID: $parentContentID }
			includeTotalCount: true
		) {
			items {
				id
				name
				url
				contentType
				publishedAt
				webPage
			}
			totalCount
		}
	}
`;

export interface WebsitePagesResponse {
	content: { items: ContentItem[]; totalCount: number };
}

// perspectiveCount/averageRating are computed aggregates over a content's
// perspectives (see backend Content.perspectiveCount/averageRating resolvers)
// — too expensive to include on every row of LIST_CONTENT, so they're
// fetched lazily via this dedicated query only when the details modal opens.
export interface ContentAggregates {
	perspectiveCount: number | null;
	averageRating: number | null;
	// The import that created this row, or null: hand-added content, and a closed import
	// the viewer can't see (the backend decides; the UI shows the row only when set).
	importedFrom?: ImportJobRef | null;
	// How many public perspectives set a Quality rating — i.e. how many
	// values averageRating was actually averaged over. Can be less than
	// perspectiveCount since Quality is optional. Shown in a tooltip on the
	// average rating tile.
	qualityRatingCount: number | null;
}

export interface ContentAggregatesResponse {
	contentByID: ({ id: string } & ContentAggregates) | null;
}

export const GET_CONTENT_AGGREGATES = gql`
	query GetContentAggregates($id: ID!) {
		contentByID(id: $id) {
			id
			perspectiveCount
			averageRating
			qualityRatingCount
			importedFrom {
				id
				name
			}
		}
	}
`;

export const CREATE_CONTENT_FROM_YOUTUBE = gql`
	mutation CreateContentFromYouTube($input: CreateContentFromYouTubeInput!) {
		createContentFromYouTube(input: $input) {
			content {
				id
				name
				url
				contentType
				length
				lengthUnits
				lengthDisplay {
					source
					precision
				}
				viewCount
				likeCount
				channelTitle
				publishedAt
				tags
				description
				primaryCategory {
					id
					wikidataQid
					label
					description
					entityType
					wikipediaUrl
				}
				createdAt
				updatedAt
			}
			alreadyExisted
		}
	}
`;

// Idempotent: the server find-or-creates the movie row, so an existing movie
// comes back as a normal Content (no "alreadyExisted" flag).
export const CREATE_CONTENT_FROM_MOVIE = gql`
	mutation CreateContentFromMovie($input: CreateContentFromMovieInput!) {
		createContentFromMovie(input: $input) {
			id
			name
			url
			contentType
		}
	}
`;

export interface CreateContentFromMovieResponse {
	createContentFromMovie: {
		id: string;
		name: string;
		url: string | null;
		contentType: string;
	};
}

// Idempotent like CREATE_CONTENT_FROM_MOVIE: an existing book (same work) comes back as a normal Content.
// `url` is a work URL or a bare ISBN; the server resolves either to the work.
export const CREATE_CONTENT_FROM_BOOK = gql`
	mutation CreateContentFromBook($input: CreateContentFromBookInput!) {
		createContentFromBook(input: $input) {
			id
			name
			url
			contentType
		}
	}
`;

export interface CreateContentFromBookResponse {
	createContentFromBook: {
		id: string;
		name: string;
		url: string | null;
		contentType: string;
	};
}

// Same result shape as CREATE_CONTENT_FROM_YOUTUBE: `alreadyExisted` tells the caller whether the
// page was already saved (find-or-create). `webPageRoles` is omitted from the input when none are
// picked, which stores a plain webpage. The server reads the page itself; the client sends only the url.
export const CREATE_CONTENT_FROM_WEB_PAGE = gql`
	mutation CreateContentFromWebPage($input: CreateContentFromWebPageInput!) {
		createContentFromWebPage(input: $input) {
			content {
				id
				name
				url
				contentType
			}
			alreadyExisted
		}
	}
`;

export interface CreateContentFromWebPageResponse {
	createContentFromWebPage: {
		content: { id: string; name: string; url: string | null; contentType: string };
		alreadyExisted: boolean;
	};
}

// Read-only: runs the same fetch and parse as the create, and writes nothing. Shown in the add dialog
// before Save. Never cached for long: `useWebPagePreview` sets its staleTime.
export const PREVIEW_WEB_PAGE = gql`
	query PreviewWebPage($url: String!) {
		previewWebPage(url: $url) {
			finalUrl
			domain
			siteName
			title
			description
			imageUrl
			faviconUrl
			publishedAt
			lang
			author
			fetch {
				status
				httpStatus
				at
			}
			alreadyExistsContentId
		}
	}
`;

export interface PreviewWebPageResponse {
	previewWebPage: WebPagePreview | null;
}

export const UPDATE_CONTENT_SOURCE_DATA = gql`
	mutation UpdateContentSourceData($contentId: IntID!) {
		updateContentSourceData(contentId: $contentId) {
			id
			name
			url
			contentType
			length
			lengthUnits
			lengthDisplay {
				source
				precision
			}
			viewCount
			likeCount
			channelTitle
			publishedAt
			tags
			description
			movie
			book
			createdAt
			updatedAt
		}
	}
`;

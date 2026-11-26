package domain

import "fmt"

// ContentSortBy represents sortable fields for content queries
type ContentSortBy string

const (
	ContentSortByCreatedAt    ContentSortBy = "CREATED_AT"
	ContentSortByUpdatedAt    ContentSortBy = "UPDATED_AT"
	ContentSortByName         ContentSortBy = "NAME"
	ContentSortByViewCount    ContentSortBy = "VIEW_COUNT"
	ContentSortByLikeCount    ContentSortBy = "LIKE_COUNT"
	ContentSortByPercentLiked ContentSortBy = "PERCENT_LIKED"
	ContentSortByPublishedAt  ContentSortBy = "PUBLISHED_AT"
	ContentSortByChannelTitle ContentSortBy = "CHANNEL_TITLE"
	ContentSortByLength       ContentSortBy = "LENGTH"
	ContentSortByBoxOffice    ContentSortBy = "BOX_OFFICE"
	ContentSortByVsBudget     ContentSortBy = "VS_BUDGET"
	ContentSortByAgeRating    ContentSortBy = "AGE_RATING"
	ContentSortByAddedBy      ContentSortBy = "ADDED_BY"
	ContentSortByReleaseDate  ContentSortBy = "RELEASE_DATE"
	ContentSortByTmdbScore    ContentSortBy = "TMDB_SCORE"
	ContentSortByAuthor       ContentSortBy = "AUTHOR"
)

// PersonRole is the role a person plays on a movie, used by ContentFilter.PersonRole.
type PersonRole string

const (
	PersonRoleCast     PersonRole = "CAST"
	PersonRoleDirector PersonRole = "DIRECTOR"
)

// SortOrder represents ascending or descending sort direction
type SortOrder string

const (
	SortOrderAsc  SortOrder = "ASC"
	SortOrderDesc SortOrder = "DESC"
)

// ContentSortRule is one column of a multi-column sort, in priority order
// (the first entry is the primary sort; later entries break ties).
type ContentSortRule struct {
	Field ContentSortBy
	Order SortOrder
}

// ContentFilter contains filter criteria for content queries
type ContentFilter struct {
	ContentType *ContentType
	// ContentTypes matches any of these types (OR'd). Empty = no type filter.
	ContentTypes     []ContentType
	MinLengthSeconds *int
	MaxLengthSeconds *int
	Search           *string
	// SearchFields scopes Search to these columns (OR'd). Empty = TITLE only.
	SearchFields []ContentSearchField
	// View/like count filters (JSONB extraction)
	MinViewCount *int
	MaxViewCount *int
	MinLikeCount *int
	MaxLikeCount *int
	// Published date filters (ISO 8601 string comparison)
	// PublishedAfter and PublishedBefore bound the published date of every row that
	// has one: YouTube videos and web pages (see ContentFactPublishedAt).
	PublishedAfter  *string
	PublishedBefore *string
	// WebPageSiteContains and WebPageAuthorContains match web page rows by the site
	// name and author they were saved with (webpage rows only).
	WebPageSiteContains   *string
	WebPageAuthorContains *string
	// Channel/tag/description filters (JSONB extraction + ILIKE)
	ChannelTitle      *string
	TagContains       *string
	DescriptionSearch *string
	// AddedByUsername matches the adder's username (ILIKE, via the users table)
	AddedByUsername *string
	// MinPerspectiveCount keeps content with at least this many perspectives
	// visible to ContentListParams.ViewerID (public, plus the viewer's own).
	MinPerspectiveCount *int
	// Record date filters (direct columns)
	CreatedAfter  *string
	CreatedBefore *string
	UpdatedAfter  *string
	UpdatedBefore *string
	// PersonID/PersonRole match movies by a person (cast or director).
	PersonID   *int
	PersonRole *PersonRole
	// Movie column filters (JSONB extraction on movie rows).
	GenreContains  *string
	CastContains   *string // cast or director name contains (case-insensitive)
	AgeRating      []string
	ReleasedAfter  *string // ISO date, inclusive
	ReleasedBefore *string // ISO date, inclusive
	MinBoxOffice   *float64
	MaxBoxOffice   *float64
	MinTmdbScore   *float64
	MaxTmdbScore   *float64
	// Book column filters (books only). AuthorContains matches the first author's name.
	AuthorContains *string
	// Book ranges (books only, inclusive). Year is the first publish year, pages the median
	// across editions, rating the Open Library average out of 5.
	MinPublishYear *int
	MaxPublishYear *int
	MinPages       *int
	MaxPages       *int
	MinBookRating  *float64
	MaxBookRating  *float64
	// WebPageRoles matches webpage rows that play any of these roles (OR'd). Other
	// content types never match. Empty = no role filter.
	WebPageRoles []WebPageRole
	// ParentContentID keeps only the rows filed under this content (a website's pages).
	ParentContentID *int
}

// ContentListParams contains parameters for paginated content queries
type ContentListParams struct {
	First     *int
	After     *string // Opaque cursor (base64-encoded id)
	Last      *int
	Before    *string
	SortBy    ContentSortBy
	SortOrder SortOrder
	// Sorts, when non-empty, is a multi-column sort that takes priority over
	// SortBy/SortOrder (kept as the single-column fallback for existing callers).
	Sorts             []ContentSortRule
	IncludeTotalCount bool
	Filter            *ContentFilter

	// ViewerID is the authenticated caller's local user id, or nil when
	// anonymous. The repository always limits results to public rows plus
	// the viewer's own private rows. Filter.MinPerspectiveCount also reads it.
	ViewerID *int
}

// PaginatedContent represents a paginated list of content
type PaginatedContent struct {
	Items       []*Content
	HasNext     bool
	HasPrev     bool
	StartCursor *string
	EndCursor   *string
	TotalCount  *int
}

// Page size bounds shared by every list (content, perspectives, user todos).
const (
	DefaultPageSize = 10
	MaxPageSize     = 100
)

// PageWindow is a validated paging request: how many rows to read and which
// cursor sets the direction. Exactly one of After and Before is set, or neither
// for the first page.
type PageWindow struct {
	Limit  int
	After  *string
	Before *string
}

// ResolvePage checks the paging arguments of a list and turns them into a
// PageWindow. Every list calls it, so the rules are the same everywhere:
//
//   - first and last are each 1..MaxPageSize.
//   - after moves forward; before moves backward. Both together are refused.
//   - last is only meaningful with before, so last without before is refused
//     rather than returning a first page. The clients here never send it.
//   - Backward pages use last as their size. first is never a backward size
//     when last is given. Forward pages use first.
//
// first defaults to DefaultPageSize at the schema, so it is always set. That is
// why a backward page reads last first and does not treat a set first as a
// conflict.
//
// Errors wrap ErrInvalidInput.
func ResolvePage(first, last *int, after, before *string) (PageWindow, error) {
	if first != nil && (*first < 1 || *first > MaxPageSize) {
		return PageWindow{}, fmt.Errorf("%w: first must be between 1 and %d", ErrInvalidInput, MaxPageSize)
	}
	if last != nil && (*last < 1 || *last > MaxPageSize) {
		return PageWindow{}, fmt.Errorf("%w: last must be between 1 and %d", ErrInvalidInput, MaxPageSize)
	}
	if after != nil && before != nil {
		return PageWindow{}, fmt.Errorf("%w: after and before cannot be combined", ErrInvalidInput)
	}
	if last != nil && before == nil {
		return PageWindow{}, fmt.Errorf("%w: last needs before; backward paging takes a cursor", ErrInvalidInput)
	}

	w := PageWindow{Limit: DefaultPageSize, After: after, Before: before}
	switch {
	case before != nil && last != nil:
		w.Limit = *last
	case first != nil:
		w.Limit = *first
	}
	return w, nil
}

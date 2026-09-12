package domain

// ContentSortBy represents sortable fields for content queries
type ContentSortBy string

const (
	ContentSortByCreatedAt    ContentSortBy = "CREATED_AT"
	ContentSortByUpdatedAt    ContentSortBy = "UPDATED_AT"
	ContentSortByName         ContentSortBy = "NAME"
	ContentSortByViewCount    ContentSortBy = "VIEW_COUNT"
	ContentSortByLikeCount    ContentSortBy = "LIKE_COUNT"
	ContentSortByPublishedAt  ContentSortBy = "PUBLISHED_AT"
	ContentSortByChannelTitle ContentSortBy = "CHANNEL_TITLE"
	ContentSortByLength       ContentSortBy = "LENGTH"
)

// SortOrder represents ascending or descending sort direction
type SortOrder string

const (
	SortOrderAsc  SortOrder = "ASC"
	SortOrderDesc SortOrder = "DESC"
)

// ContentFilter contains filter criteria for content queries
type ContentFilter struct {
	ContentType      *ContentType
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
	PublishedAfter  *string
	PublishedBefore *string
	// Channel/tag/description filters (JSONB extraction + ILIKE)
	ChannelTitle      *string
	TagContains       *string
	DescriptionSearch *string
	// Record date filters (direct columns)
	CreatedAfter  *string
	CreatedBefore *string
	UpdatedAfter  *string
	UpdatedBefore *string
}

// ContentListParams contains parameters for paginated content queries
type ContentListParams struct {
	First             *int
	After             *string // Opaque cursor (base64-encoded id)
	Last              *int
	Before            *string
	SortBy            ContentSortBy
	SortOrder         SortOrder
	IncludeTotalCount bool
	Filter            *ContentFilter
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

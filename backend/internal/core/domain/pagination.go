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

// ContentSortRule is one column of a multi-column sort, in priority order
// (the first entry is the primary sort; later entries break ties).
type ContentSortRule struct {
	Field ContentSortBy
	Order SortOrder
}

// ContentFilter contains filter criteria for content queries
type ContentFilter struct {
	ContentType      *ContentType
	MinLengthSeconds *int
	MaxLengthSeconds *int
	Search           *string
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
	// Sorts, when non-empty, is a multi-column sort that takes priority over
	// SortBy/SortOrder (kept as the single-column fallback for existing callers).
	Sorts             []ContentSortRule
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

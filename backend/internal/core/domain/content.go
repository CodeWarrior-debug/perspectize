package domain

import (
	"encoding/json"
	"time"
)

// ContentType represents the type of content
type ContentType string

const (
	ContentTypeYouTube ContentType = "YOUTUBE"
	ContentTypeClaim   ContentType = "CLAIM"
)

// ContentSearchField identifies a text column that a ContentFilter.search term
// may be scoped to via ContentFilter.searchFields. Omitted/empty selects TITLE only
// (preserves the historical default of matching on name alone).
type ContentSearchField string

const (
	ContentSearchFieldTitle        ContentSearchField = "TITLE"
	ContentSearchFieldDescription  ContentSearchField = "DESCRIPTION"
	ContentSearchFieldChannelTitle ContentSearchField = "CHANNEL_TITLE"
	ContentSearchFieldTags         ContentSearchField = "TAGS"
)

// Content represents a media item that users create perspectives on
type Content struct {
	ID                int
	Name              string
	URL               *string
	ContentType       ContentType
	AddedByUserID     int
	Length            *int
	LengthUnits       *string
	Response          json.RawMessage
	PrimaryCategoryID *int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

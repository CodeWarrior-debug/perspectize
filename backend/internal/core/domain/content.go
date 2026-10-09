package domain

import (
	"encoding/json"
	"time"
)

// ContentType represents the type of content
type ContentType string

const (
	ContentTypeYouTubeVideo ContentType = "YOUTUBE_VIDEO"
	ContentTypeClaim        ContentType = "CLAIM"
	ContentTypeBiblePassage ContentType = "BIBLE_PASSAGE"
	ContentTypeMovie        ContentType = "MOVIE"
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
	ContentSearchFieldCast         ContentSearchField = "CAST"
	ContentSearchFieldDirector     ContentSearchField = "DIRECTOR"
)

// Length precisions: the smallest unit a source reports a length in.
const (
	LengthPrecisionSeconds = "seconds"
	LengthPrecisionMinutes = "minutes"
)

// LengthDisplay records where Content.Length came from and the smallest unit
// that source reports. Length is always stored in seconds so it sorts and
// filters across types; clients format it to Precision (a TMDB runtime is whole
// minutes, so it shows as h:mm, not h:mm:00). Stored as JSONB so new sources
// and precisions need no migration.
type LengthDisplay struct {
	Source    string `json:"source"`
	Precision string `json:"precision"`
}

// Content represents a media item that users create perspectives on
type Content struct {
	ID                int
	Name              string
	URL               *string
	ContentType       ContentType
	AddedByUserID     int
	Length            *int
	LengthUnits       *string
	LengthDisplay     *LengthDisplay
	Response          json.RawMessage
	PrimaryCategoryID *int
	VerseStartID      *int    // BIBLE_PASSAGE only — computed ordinal (see BibleVerseOrdinal), not a table FK
	VerseEndID        *int    // BIBLE_PASSAGE only
	DisplayTitle      *string // BIBLE_PASSAGE only — optional, first-write-wins
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

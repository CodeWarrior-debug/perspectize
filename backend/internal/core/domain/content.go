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
	ContentTypeBook         ContentType = "BOOK"
	ContentTypeWebPage      ContentType = "WEB_PAGE"
)

// WebPageRole is a role a webpage plays, chosen by the person who added it
// (never read from the page). Stored uppercase in content.response under
// "webPageRoles"; the first entry is the primary role.
type WebPageRole string

const (
	WebPageRoleBlogPost          WebPageRole = "BLOG_POST"
	WebPageRoleSessionTranscript WebPageRole = "SESSION_TRANSCRIPT"
)

// webPageRoleSchemaOrg maps each role to its Schema.org type. Add one line per
// new role; this is the only place the mapping lives.
var webPageRoleSchemaOrg = map[WebPageRole]string{
	WebPageRoleBlogPost:          "BlogPosting",
	WebPageRoleSessionTranscript: "Conversation", // closest Schema.org match for a working-session record
}

// SchemaOrgType returns the Schema.org type for a role, or "" for an unknown role.
func (r WebPageRole) SchemaOrgType() string {
	return webPageRoleSchemaOrg[r]
}

// FetchStatus records how the metadata read of a webpage went. Internal to the
// add flow and the import preview: it is never shown as a value in the grid.
type FetchStatus string

const (
	FetchStatusOK       FetchStatus = "OK"
	FetchStatusBlocked  FetchStatus = "BLOCKED" // the page answered 4xx
	FetchStatusError    FetchStatus = "ERROR"   // 5xx, a network failure, or too many redirects
	FetchStatusTimeout  FetchStatus = "TIMEOUT"
	FetchStatusNotHTML  FetchStatus = "NOT_HTML"
	FetchStatusTooLarge FetchStatus = "TOO_LARGE"
)

// WebPageSchemaVersion is the version of the stored WebPageMeta shape.
const WebPageSchemaVersion = 1

// WebPageFetch is the outcome of one metadata read. HTTPStatus is nil when no
// response arrived (timeout, network error).
type WebPageFetch struct {
	Status     FetchStatus `json:"status"`
	HTTPStatus *int        `json:"httpStatus"`
	At         time.Time   `json:"at"`
}

// WebPageMeta is the metadata read from a webpage's <head> once, at add time
// (stored in content.response). Missing values are nil, never a guess.
type WebPageMeta struct {
	SchemaVersion int           `json:"schemaVersion"`
	FinalURL      string        `json:"finalUrl"`
	Domain        string        `json:"domain"`
	SiteName      *string       `json:"siteName"`
	Title         *string       `json:"title"`
	Description   *string       `json:"description"`
	ImageURL      *string       `json:"imageUrl"`
	FaviconURL    *string       `json:"faviconUrl"`
	PublishedAt   *string       `json:"publishedAt"`
	Roles         []WebPageRole `json:"webPageRoles"`
	Author        *string       `json:"author"`
	Lang          *string       `json:"lang"`
	Fetch         WebPageFetch  `json:"fetch"`
	// DeclaredCanonical is the page's <link rel=canonical>, absolute. It drives
	// dedupe only and is never stored (json:"-").
	DeclaredCanonical string `json:"-"`
}

// MarshalJSON writes a nil role list as [] (the API field is non-null).
func (m WebPageMeta) MarshalJSON() ([]byte, error) {
	type plain WebPageMeta // no methods, so no recursion
	p := plain(m)
	if p.Roles == nil {
		p.Roles = []WebPageRole{}
	}
	return json.Marshal(p)
}

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

// LengthPrecision is the smallest unit a source reports a length in. Stored
// lowercase in content.length_display; converted in the repository mappers.
type LengthPrecision string

const (
	LengthPrecisionSeconds LengthPrecision = "SECONDS"
	LengthPrecisionMinutes LengthPrecision = "MINUTES"
)

// Length sources. Migration 000030's backfill writes the same strings.
const (
	LengthSourceYouTube = "youtube"
	LengthSourceTMDB    = "tmdb"
)

// LengthDisplay records where Content.Length came from and the smallest unit
// that source reports. Length is always stored in seconds so it sorts and
// filters across types; clients format it to Precision (a TMDB runtime is whole
// minutes, so it shows as h:mm, not h:mm:00). Stored as JSONB so new sources
// and precisions need no migration.
type LengthDisplay struct {
	Source    string
	Precision LengthPrecision
}

// YouTubeLengthDisplay is a YouTube video's length: seconds from the Data API.
func YouTubeLengthDisplay() *LengthDisplay {
	return &LengthDisplay{Source: LengthSourceYouTube, Precision: LengthPrecisionSeconds}
}

// TMDBLengthDisplay is a movie runtime: TMDB reports whole minutes.
func TMDBLengthDisplay() *LengthDisplay {
	return &LengthDisplay{Source: LengthSourceTMDB, Precision: LengthPrecisionMinutes}
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
	// ImportJobID is the import that created this row; nil for hand-added content.
	// Set once at insert: a later re-add of the same URL never changes it.
	ImportJobID *int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

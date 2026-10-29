package domain

import (
	"encoding/json"
	"time"
)

// ImportSourceType is where an import source's candidates come from.
type ImportSourceType string

const (
	// ImportSourceYouTubeChannel lists a channel's uploads; items become YOUTUBE_VIDEO content.
	ImportSourceYouTubeChannel ImportSourceType = "YOUTUBE_CHANNEL"
	// ImportSourceTMDBPerson lists a person's filmography; items become MOVIE content.
	ImportSourceTMDBPerson ImportSourceType = "TMDB_PERSON"
)

// DestinationType is the content type every item of this source becomes.
func (t ImportSourceType) DestinationType() ContentType {
	switch t {
	case ImportSourceTMDBPerson:
		return ContentTypeMovie
	default:
		return ContentTypeYouTubeVideo
	}
}

// Valid reports whether t is a known source type.
func (t ImportSourceType) Valid() bool {
	return t == ImportSourceYouTubeChannel || t == ImportSourceTMDBPerson
}

// ImportPersonRole narrows a TMDB person source to one kind of credit.
type ImportPersonRole string

const (
	ImportPersonRoleDirector ImportPersonRole = "DIRECTOR"
	ImportPersonRoleCast     ImportPersonRole = "CAST"
)

// ImportSourceStatus is how far listing a source has got.
type ImportSourceStatus string

const (
	// ImportSourceStatusWaiting is a source of a request nobody has approved yet: nothing is listed.
	ImportSourceStatusWaiting ImportSourceStatus = "WAITING"
	ImportSourceStatusListing ImportSourceStatus = "LISTING"
	ImportSourceStatusReady   ImportSourceStatus = "READY"
	ImportSourceStatusFailed  ImportSourceStatus = "FAILED"
)

// ImportRequestStatus is whether an import may spend API quota. An admin's
// import is approved when created; anyone else's waits for an admin.
type ImportRequestStatus string

const (
	ImportRequestStatusRequested ImportRequestStatus = "REQUESTED"
	ImportRequestStatusApproved  ImportRequestStatus = "APPROVED"
	ImportRequestStatusDeclined  ImportRequestStatus = "DECLINED"
)

// ImportItemKind tells a channel's long-form videos, Shorts and livestreams
// apart (people include or exclude them as a group), and marks movies.
type ImportItemKind string

const (
	ImportItemKindVideo ImportItemKind = "VIDEO"
	ImportItemKindShort ImportItemKind = "SHORT"
	ImportItemKindLive  ImportItemKind = "LIVE"
	ImportItemKindMovie ImportItemKind = "MOVIE"
)

// ImportItemStatus is the outcome of importing one candidate. A nil status on
// an item means nobody has asked to import it.
type ImportItemStatus string

const (
	ImportItemStatusQueued   ImportItemStatus = "QUEUED"
	ImportItemStatusImported ImportItemStatus = "IMPORTED"
	// ImportItemStatusSkipped means the content already existed, so nothing new was created.
	ImportItemStatusSkipped ImportItemStatus = "SKIPPED"
	ImportItemStatusFailed  ImportItemStatus = "FAILED"
)

// MaxImportSourcesPerJob bounds how many sources one import can list at once.
const MaxImportSourcesPerJob = 10

// MaxImportItemsPerRequest bounds how many rows a non-admin may import in one
// importItems call ("select up to 1,000 at a time").
const MaxImportItemsPerRequest = 1000

// MaxAdminImportItemsPerRequest is an admin's bound: a whole channel listing
// (the YouTube lister stops at 5,000 videos).
const MaxAdminImportItemsPerRequest = 5000

// MaxPendingImportRequests bounds how many unreviewed requests one person may
// have open. Resolving a request's sources costs a little API quota, and an
// admin has to read each one.
const MaxPendingImportRequests = 3

// ImportJob is a named import: one or more sources whose candidates share one staging sheet.
type ImportJob struct {
	ID            int
	UserID        int // creator (the requester, for a request)
	Name          string
	RequestStatus ImportRequestStatus
	ReviewNote    *string // the admin's reason, when declined (optional on approve)
	ReviewedAt    *time.Time
	Sources       []*ImportSource
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ImportSource is one channel or filmography inside an import.
type ImportSource struct {
	ID              int
	JobID           int
	SourceType      ImportSourceType
	SourceRef       string // what was entered: channel id/handle, TMDB person id
	Title           *string
	URL             *string
	Role            *ImportPersonRole
	DestinationType ContentType
	Status          ImportSourceStatus
	StatusDetail    *string
	ItemCount       int
	FetchedAt       *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ImportItem is one candidate row of the staging sheet: everything needed to
// decide whether to import it, minus the long detail-panel fields.
type ImportItem struct {
	ID              int
	JobID           int
	SourceID        int
	ExternalID      string
	DestinationType ContentType
	CanonicalURL    string
	Kind            ImportItemKind
	Title           string
	Summary         *string
	PublishedAt     *time.Time
	DurationSeconds *int
	ViewCount       *int64
	LikeCount       *int64 // nil when the channel hides likes, never 0 for "unknown"
	CommentCount    *int64
	Rating          *float64 // 0-10
	RatingCount     *int
	RatingSource    *string
	ChapterCount    int
	HasCaptions     *bool
	Genres          []string // films only
	TopCast         []string // films only: up to 3 top-billed names
	Popularity      *float64 // films (TMDB): daily popularity score
	ReviewCount     *int     // films (TMDB): user reviews
	Revenue         *int64   // films: box office takings, USD
	Budget          *int64   // films: production budget, USD
	ThumbnailURL    *string
	Position        int
	StatsFetchedAt  time.Time
	ImportStatus    *ImportItemStatus
	ImportError     *string
	ImportedAt      *time.Time
	// ContentID is the content the item became, or the existing content with
	// the same URL (so already-imported rows link to it even if added by hand).
	ContentID *int
	// InLibrary is true when content with CanonicalURL exists. Computed at read time.
	InLibrary bool
}

// ImportItemDetails is the detail-panel payload, stored as JSONB and fetched lazily.
type ImportItemDetails struct {
	Description string          `json:"description,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	Chapters    []ImportChapter `json:"chapters,omitempty"`
	Links       []string        `json:"links,omitempty"` // outbound link domains, e.g. "gty.org"
	People      []ImportPerson  `json:"people,omitempty"`
	Genres      []string        `json:"genres,omitempty"`
	Language    string          `json:"language,omitempty"`
	Category    string          `json:"category,omitempty"`
	// Extra carries source-specific fields that have no column yet.
	Extra json.RawMessage `json:"extra,omitempty"`
}

// ImportChapter is one chapter marker parsed from a description.
type ImportChapter struct {
	StartSeconds int    `json:"startSeconds"`
	Title        string `json:"title"`
}

// ImportPerson is a credited person (director, cast member) on a movie candidate.
type ImportPerson struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// ImportItemWithDetails pairs a row with its detail payload.
type ImportItemWithDetails struct {
	Item    ImportItem
	Details ImportItemDetails
}

// CreateImportSourceInput is one source to list in a new import.
type CreateImportSourceInput struct {
	SourceType ImportSourceType
	Ref        string
	Role       *ImportPersonRole
}

// CreateImportJobInput is what an admin supplies to start an import.
type CreateImportJobInput struct {
	Name    string
	Sources []CreateImportSourceInput
}

// ImportBatchResult reports what an importItems call did with the requested rows.
type ImportBatchResult struct {
	// Queued rows will be imported in the background.
	Queued int
	// AlreadyInLibrary rows had matching content, so they were not queued.
	AlreadyInLibrary int
	// AlreadyQueued rows were already queued or imported by an earlier call.
	AlreadyQueued int
	// NotFound ids were not rows of this import.
	NotFound int
}

// ImportProgress is a live count of an import's running batch(es), kept in
// memory while rows import and pushed to subscribers. Done counts every
// finished row (imported + skipped + failed).
type ImportProgress struct {
	JobID    int
	Total    int
	Done     int
	Imported int
	Skipped  int
	Failed   int
	// Running is true while any batch of this import is still importing.
	Running   bool
	UpdatedAt time.Time
}

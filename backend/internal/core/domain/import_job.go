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
	// ImportRequestStatusPending is a request no admin has reviewed yet (the
	// stored default, so a row written without a status never spends quota).
	ImportRequestStatusPending  ImportRequestStatus = "PENDING"
	ImportRequestStatusApproved ImportRequestStatus = "APPROVED"
	ImportRequestStatusDeclined ImportRequestStatus = "DECLINED"
)

// ImportItemKind tells a channel's long-form videos, Shorts and livestreams
// apart (people include or exclude them as a group), and marks movies. It is
// the "kind" fact.
type ImportItemKind string

const (
	ImportItemKindVideo ImportItemKind = "video"
	ImportItemKindShort ImportItemKind = "short"
	ImportItemKindLive  ImportItemKind = "live"
	ImportItemKindMovie ImportItemKind = "movie"
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
	// ClosedAt is set when an admin closes the import: hidden from non-admins, read-only.
	ClosedAt  *time.Time
	Sources   []*ImportSource
	CreatedAt time.Time
	UpdatedAt time.Time
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
	Title           string
	// Facts is what the row shows to help decide (stored as one jsonb object).
	Facts    ImportFacts
	Position int
	// Excluded is the shared "don't import" mark: such a row can't be queued.
	Excluded       bool
	StatsFetchedAt time.Time
	ImportStatus   *ImportItemStatus
	ImportError    *string
	ImportedAt     *time.Time
	// ContentID is the content the item became, or the existing content with
	// the same URL (so already-imported rows link to it even if added by hand).
	ContentID *int
	// InLibrary is true when content with CanonicalURL exists. Computed at read time.
	InLibrary bool
}

// ImportFacts is enough about a candidate to decide whether it is worth
// importing: not everything needed to import it (the import fetches that
// again). It is stored as one jsonb object, so a new source or content type
// adds keys here rather than columns, and the sheet makes a column of every
// key present, labelled from the key name.
//
// Key names are shared across content types, so the same idea is one column
// whatever the source: a video's and a film's length are both
// duration_seconds. A key a source can't supply is left out, never 0. The
// suffix says how to show it: _seconds a duration, _count a count, _usd
// money, _at a date.
type ImportFacts struct {
	Kind         ImportItemKind `json:"kind,omitempty"` // video, short, live, movie
	Summary      string         `json:"summary,omitempty"`
	ThumbnailURL string         `json:"thumbnail_url,omitempty"`
	PublishedAt  *time.Time     `json:"published_at,omitempty"`

	DurationSeconds *int `json:"duration_seconds,omitempty"`

	// Reach and reception (YouTube). LikesHidden marks a channel that hides
	// likes: like_count is then absent, and the sheet says "hidden".
	ViewCount    *int64 `json:"view_count,omitempty"`
	LikeCount    *int64 `json:"like_count,omitempty"`
	LikesHidden  bool   `json:"likes_hidden,omitempty"`
	CommentCount *int64 `json:"comment_count,omitempty"`

	// Ratings: a 0-10 score, how many ratings (or critic reviews) it rests on, and whose.
	Rating       *float64 `json:"rating,omitempty"`
	RatingCount  *int     `json:"rating_count,omitempty"`
	RatingSource string   `json:"rating_source,omitempty"`

	// Films (TMDB, or Wikidata for the demo).
	ReviewCount  *int     `json:"review_count,omitempty"`
	Popularity   *float64 `json:"popularity,omitempty"`
	BoxOfficeUSD *int64   `json:"box_office_usd,omitempty"`
	BudgetUSD    *int64   `json:"budget_usd,omitempty"`
	Genres       []string `json:"genres,omitempty"`
	TopCast      []string `json:"top_cast,omitempty"`

	// Videos.
	ChapterCount *int  `json:"chapter_count,omitempty"`
	HasCaptions  *bool `json:"has_captions,omitempty"`
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
	// Excluded rows are marked "don't import", so they were not queued.
	Excluded int
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

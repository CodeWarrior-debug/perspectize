package domain

import (
	"encoding/json"
	"time"
)

// Privacy represents the visibility level of a perspective
type Privacy string

const (
	PrivacyPublic  Privacy = "PUBLIC"
	PrivacyPrivate Privacy = "PRIVATE"
)

// ReviewStatus represents the review state of a perspective
type ReviewStatus string

const (
	ReviewStatusPending  ReviewStatus = "PENDING"
	ReviewStatusApproved ReviewStatus = "APPROVED"
	ReviewStatusRejected ReviewStatus = "REJECTED"
)

// CategorizedRating represents a rating with a category label
type CategorizedRating struct {
	Category string `json:"category"`
	Rating   int    `json:"rating"`
}

// FeelingEntry represents one emoji feeling attached to a perspective, picked
// from the feel-wheel (or its extended search set) with an intensity and an
// optional freeform note. See docs/superpowers/specs/2026-09-12-feel-wheel-design.md.
type FeelingEntry struct {
	Emoji     string  `json:"emoji"`           // literal emoji grapheme, e.g. "🥰"
	Label     string  `json:"label,omitempty"` // human label, prefilled for curated entries
	Intensity int     `json:"intensity"`       // 0-10000, see RatingMin/RatingMax
	Note      *string `json:"note,omitempty"`  // freeform why/nuance
}

// MaxFeelings is the app-level cap on feelings per perspective, matching the
// cap pattern used for RelatedPerspectiveIDs.
const MaxFeelings = 10

// Perspective represents a user's viewpoint on content
type Perspective struct {
	ID        int
	UserID    int  // Required, FK to users
	ContentID *int // Optional, FK to content

	// Optional ratings (0-10000 range enforced by DB domain)
	Quality    *int
	Agreement  *int
	Importance *int
	Confidence *int

	// Optional fields
	Like         *string // Freeform text
	Privacy      Privacy
	Description  *string
	Category     *string
	ReviewStatus *ReviewStatus

	// Array fields
	Parts  []int    // Array of part identifiers
	Labels []string // Array of label strings

	// JSONB field
	CategorizedRatings []CategorizedRating

	// Feelings is the emoji feel-wheel selections for this perspective (JSONB array).
	Feelings []FeelingEntry

	// Perspective reference fields (Phase 4)
	PrimaryPerspectiveID  *int            // FK to another perspective (optional)
	RelatedPerspectiveIDs []int           // array of perspective IDs (max 50 app-level cap)
	CustomFields          json.RawMessage // JSONB custom fields
	Review                *string         // review text (freeform)

	// Timestamps
	CreatedAt time.Time
	UpdatedAt time.Time
}

// RatingMin is the minimum valid rating value
const RatingMin = 0

// RatingMax is the maximum valid rating value
const RatingMax = 10000

// ValidateRating checks if a rating value is within the valid range
func ValidateRating(rating *int) bool {
	if rating == nil {
		return true // nil is valid (optional field)
	}
	return *rating >= RatingMin && *rating <= RatingMax
}

// ValidateFeelingEntry checks that a feeling entry has a non-empty emoji and
// an intensity within the shared rating range.
func ValidateFeelingEntry(f FeelingEntry) bool {
	if f.Emoji == "" {
		return false
	}
	intensity := f.Intensity
	return ValidateRating(&intensity)
}

// PerspectiveSortBy represents sortable fields for perspective queries
type PerspectiveSortBy string

const (
	PerspectiveSortByCreatedAt PerspectiveSortBy = "CREATED_AT"
	PerspectiveSortByUpdatedAt PerspectiveSortBy = "UPDATED_AT"
)

// PerspectiveFilter contains filter criteria for perspective queries
type PerspectiveFilter struct {
	UserID    *int
	ContentID *int
	Privacy   *Privacy
}

// PerspectiveListParams contains parameters for paginated perspective queries
type PerspectiveListParams struct {
	First             *int
	After             *string
	Last              *int
	Before            *string
	SortBy            PerspectiveSortBy
	SortOrder         SortOrder
	IncludeTotalCount bool
	Filter            *PerspectiveFilter

	// ViewerID is the authenticated caller's local user id, or nil when the
	// request is anonymous. Set by the resolver from auth.ForContext.
	ViewerID *int

	// RestrictToPublicOrOwner, when true, limits results to rows that are
	// public OR owned by ViewerID. Set by PerspectiveService.ListPerspectives;
	// the repository translates it into a WHERE predicate.
	RestrictToPublicOrOwner bool
}

// PaginatedPerspectives represents a paginated list of perspectives
type PaginatedPerspectives struct {
	Items       []*Perspective
	HasNext     bool
	HasPrev     bool
	StartCursor *string
	EndCursor   *string
	TotalCount  *int
}

// PerspectiveAggregate summarizes ALL perspectives on a single piece of
// content — public and private alike; Privacy controls who can read a
// perspective's content, not whether it counts here (see FEATURE_BACKLOG.md
// for a possible future opt-out of aggregates) — how many there are, how
// many of those set a Quality rating (the "headline" rating dimension - see
// RatingInput.svelte's field order on the frontend), and their average
// Quality. QualityCount can be less than Count since Quality is optional.
// AverageQuality is nil when QualityCount is 0 (COUNT/AVG over an all-NULL
// column), which is distinct from Count == 0.
type PerspectiveAggregate struct {
	ContentID      int
	Count          int
	QualityCount   int
	AverageQuality *float64
}

// FeelingStats summarizes how many perspectives in scope (one content item,
// or every perspective when unscoped) carry a given feeling -- matched by
// exact Emoji grapheme and, if Label is set, case-insensitively narrowed
// further by Label too -- plus the average and population standard
// deviation of that feeling's Intensity across those perspectives.
// TotalPerspectives is the perspective count over the same scope (matching
// PerspectiveAggregate.Count), so PercentOfPerspectives is "of ALL
// perspectives in scope", not just of those that set any feeling at all.
// AverageIntensity/StdDevIntensity are nil when Count is 0; StdDevIntensity
// is also nil when Count is 1 (standard deviation of one value is
// undefined here, not 0). Counts public and private perspectives alike,
// matching PerspectiveAggregate's privacy stance -- see its doc comment.
type FeelingStats struct {
	Emoji             string
	Label             *string
	Count             int
	TotalPerspectives int
	AverageIntensity  *float64
	StdDevIntensity   *float64
}

// PercentOfPerspectives returns Count as a percentage (0-100) of
// TotalPerspectives, or nil when TotalPerspectives is 0 (nothing to take a
// percentage of).
func (f *FeelingStats) PercentOfPerspectives() *float64 {
	if f.TotalPerspectives == 0 {
		return nil
	}
	pct := 100 * float64(f.Count) / float64(f.TotalPerspectives)
	return &pct
}

// CustomFieldStats summarizes how many perspectives in scope set the given
// top-level CustomFields key (any value). See FeelingStats for the scoping
// and privacy rules this mirrors.
type CustomFieldStats struct {
	Key               string
	Count             int
	TotalPerspectives int
}

// PercentOfPerspectives returns Count as a percentage (0-100) of
// TotalPerspectives, or nil when TotalPerspectives is 0.
func (c *CustomFieldStats) PercentOfPerspectives() *float64 {
	if c.TotalPerspectives == 0 {
		return nil
	}
	pct := 100 * float64(c.Count) / float64(c.TotalPerspectives)
	return &pct
}

// MarshalCategorizedRatings converts CategorizedRatings to JSON for storage
func (p *Perspective) MarshalCategorizedRatings() ([]json.RawMessage, error) {
	if len(p.CategorizedRatings) == 0 {
		return nil, nil
	}
	result := make([]json.RawMessage, len(p.CategorizedRatings))
	for i, cr := range p.CategorizedRatings {
		data, err := json.Marshal(cr)
		if err != nil {
			return nil, err
		}
		result[i] = data
	}
	return result, nil
}

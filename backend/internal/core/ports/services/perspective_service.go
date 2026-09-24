package services

import (
	"context"
	"encoding/json"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// CreatePerspectiveInput contains the data needed to create a perspective
type CreatePerspectiveInput struct {
	UserID                int
	ContentID             *int
	Quality               *int
	Agreement             *int
	Importance            *int
	Confidence            *int
	Like                  *string
	Privacy               *domain.Privacy
	Description           *string
	Category              *string
	Parts                 []int
	Labels                []string
	CategorizedRatings    []domain.CategorizedRating
	Feelings              []domain.FeelingEntry
	PrimaryPerspectiveID  *int
	RelatedPerspectiveIDs []int
	CustomFields          json.RawMessage
	Review                *string
}

// UpdatePerspectiveInput contains the data needed to update a perspective
type UpdatePerspectiveInput struct {
	ID                    int
	ContentID             *int
	Quality               *int
	Agreement             *int
	Importance            *int
	Confidence            *int
	Like                  *string
	Privacy               *domain.Privacy
	Description           *string
	Category              *string
	ReviewStatus          *domain.ReviewStatus
	Parts                 []int
	Labels                []string
	CategorizedRatings    []domain.CategorizedRating
	Feelings              []domain.FeelingEntry
	PrimaryPerspectiveID  *int
	RelatedPerspectiveIDs []int
	CustomFields          json.RawMessage
	Review                *string

	// Clear* requests that the matching field be reset to "no value". Set only
	// by the GraphQL adapter (modelToUpdatePerspectiveInput in helpers.go) when
	// the client sent an explicit null (or, for Feelings/CustomFields, an empty
	// list/object) -- distinct from omitting the field, which leaves it
	// unchanged. When true, the paired value field above is ignored. See the UI
	// gap audit, gap #2: without this, there was no way to clear a rating,
	// review, feelings, or customFields once set.
	ClearQuality      bool
	ClearAgreement    bool
	ClearImportance   bool
	ClearConfidence   bool
	ClearLike         bool
	ClearReview       bool
	ClearCustomFields bool
	ClearFeelings     bool
}

// PerspectiveService defines the contract for perspective business logic
type PerspectiveService interface {
	// Create creates a new perspective with validation
	Create(ctx context.Context, input CreatePerspectiveInput) (*domain.Perspective, error)

	// GetByID retrieves a perspective by ID
	GetByID(ctx context.Context, id int) (*domain.Perspective, error)

	// Update updates an existing perspective
	Update(ctx context.Context, input UpdatePerspectiveInput) (*domain.Perspective, error)

	// Delete removes a perspective by ID
	Delete(ctx context.Context, id int) error

	// ListPerspectives retrieves a paginated list of perspectives
	ListPerspectives(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error)

	// AggregateByContentIDs computes the public-perspective count and average
	// Quality rating for each given content ID, batched into a single query.
	AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error)
}

package services_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func validFeelings(n int) []domain.FeelingEntry {
	out := make([]domain.FeelingEntry, n)
	for i := range out {
		out[i] = domain.FeelingEntry{Emoji: "x", Intensity: 5000}
	}
	return out
}

func TestPerspectiveCreate_LimitBoundaries(t *testing.T) {
	like := "up"
	tests := []struct {
		name    string
		input   portservices.CreatePerspectiveInput
		wantErr bool
	}{
		{name: "user id zero rejected", input: portservices.CreatePerspectiveInput{UserID: 0, Like: &like}, wantErr: true},
		{name: "user id one accepted", input: portservices.CreatePerspectiveInput{UserID: 1, Like: &like}},
		{name: "exactly 50 related ids accepted", input: portservices.CreatePerspectiveInput{UserID: 1, Like: &like, RelatedPerspectiveIDs: make([]int, 50)}},
		{name: "51 related ids rejected", input: portservices.CreatePerspectiveInput{UserID: 1, Like: &like, RelatedPerspectiveIDs: make([]int, 51)}, wantErr: true},
		{name: "exactly max feelings accepted", input: portservices.CreatePerspectiveInput{UserID: 1, Like: &like, Feelings: validFeelings(domain.MaxFeelings)}},
		{name: "max feelings plus one rejected", input: portservices.CreatePerspectiveInput{UserID: 1, Like: &like, Feelings: validFeelings(domain.MaxFeelings + 1)}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepoForPerspective{})

			_, err := svc.Create(context.Background(), tt.input)

			if tt.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func newUpdateSvc(existing *domain.Perspective) (*services.PerspectiveService, *domain.Perspective) {
	var saved domain.Perspective
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			cp := *existing
			return &cp, nil
		},
		updateFn: func(ctx context.Context, p *domain.Perspective, actorUserID int) (*domain.Perspective, error) {
			saved = *p
			return p, nil
		},
	}
	return services.NewPerspectiveService(repo, &mockUserRepoForPerspective{}), &saved
}

func TestPerspectiveUpdate_IDMustBePositive(t *testing.T) {
	svc, _ := newUpdateSvc(&domain.Perspective{ID: 1, UserID: 1})

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 0}, 1)

	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestPerspectiveUpdate_FeelingsCapBoundary(t *testing.T) {
	svc, saved := newUpdateSvc(&domain.Perspective{ID: 1, UserID: 1})

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Feelings: validFeelings(domain.MaxFeelings)}, 1)
	require.NoError(t, err)
	assert.Len(t, saved.Feelings, domain.MaxFeelings)

	_, err = svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Feelings: validFeelings(domain.MaxFeelings + 1)}, 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestPerspectiveUpdate_OmittedFieldsAreLeftUntouched(t *testing.T) {
	contentID := 9
	desc := "keep me"
	existing := &domain.Perspective{
		ID: 1, UserID: 1,
		ContentID:          &contentID,
		Description:        &desc,
		CategorizedRatings: []domain.CategorizedRating{{Category: "style", Rating: 100}},
	}
	svc, saved := newUpdateSvc(existing)
	like := "up"

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Like: &like}, 1)

	require.NoError(t, err)
	require.NotNil(t, saved.ContentID)
	assert.Equal(t, 9, *saved.ContentID)
	require.NotNil(t, saved.Description)
	assert.Equal(t, "keep me", *saved.Description)
	assert.Equal(t, []domain.CategorizedRating{{Category: "style", Rating: 100}}, saved.CategorizedRatings)
}

func TestPerspectiveUpdate_ProvidedFieldsAreApplied(t *testing.T) {
	oldContent := 9
	oldDesc := "old"
	existing := &domain.Perspective{ID: 1, UserID: 1, ContentID: &oldContent, Description: &oldDesc}
	svc, saved := newUpdateSvc(existing)
	newContent := 10
	newDesc := "new"
	ratings := []domain.CategorizedRating{{Category: "style", Rating: 7000}}

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID: 1, ContentID: &newContent, Description: &newDesc, CategorizedRatings: ratings,
	}, 1)

	require.NoError(t, err)
	require.NotNil(t, saved.ContentID)
	assert.Equal(t, 10, *saved.ContentID)
	require.NotNil(t, saved.Description)
	assert.Equal(t, "new", *saved.Description)
	assert.Equal(t, ratings, saved.CategorizedRatings)
}

func TestPerspectiveUpdate_InvalidCategorizedRatingRejected(t *testing.T) {
	svc, _ := newUpdateSvc(&domain.Perspective{ID: 1, UserID: 1})

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID: 1, CategorizedRatings: []domain.CategorizedRating{{Category: "style", Rating: 10001}},
	}, 1)

	assert.ErrorIs(t, err, domain.ErrInvalidRating)
}

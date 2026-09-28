package services_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Gap #2 in the UI gap audit: there was no way to clear a rating, like, review,
// feelings, or customFields once set on a perspective -- every optional
// UpdatePerspectiveInput field was a plain nullable pointer, so "omitted" and
// "explicit null" both decoded to nil, and Update() treated nil as "no change"
// for every field. These tests cover the tri-state fix: omitted leaves a field
// alone, a value applies it, and the new Clear* flags reset it to nil.

func intPtr(v int) *int       { return &v }
func strPtr(v string) *string { return &v }

func existingPerspectiveWithEverythingSet() *domain.Perspective {
	like := "up"
	review := "Great video."
	return &domain.Perspective{
		ID:           1,
		UserID:       1,
		Quality:      intPtr(7500),
		Agreement:    intPtr(7500),
		Importance:   intPtr(7500),
		Confidence:   intPtr(7500),
		Like:         &like,
		Review:       &review,
		CustomFields: json.RawMessage(`{"depth":8000}`),
		Feelings: []domain.FeelingEntry{
			{Emoji: "😀", Intensity: 3},
		},
	}
}

func TestPerspectiveUpdate_OmittedFieldsLeaveExistingValuesUnchanged(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1})

	require.NoError(t, err)
	assert.Equal(t, intPtr(7500), result.Quality)
	assert.Equal(t, intPtr(7500), result.Agreement)
	assert.Equal(t, intPtr(7500), result.Importance)
	assert.Equal(t, intPtr(7500), result.Confidence)
	assert.Equal(t, "up", *result.Like)
	assert.Equal(t, "Great video.", *result.Review)
	assert.JSONEq(t, `{"depth":8000}`, string(result.CustomFields))
	assert.Len(t, result.Feelings, 1)
}

func TestPerspectiveUpdate_SetsRatings(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Quality: intPtr(3000)})

	require.NoError(t, err)
	assert.Equal(t, intPtr(3000), result.Quality)
	// Untouched siblings stay at their prior value.
	assert.Equal(t, intPtr(7500), result.Agreement)
}

func TestPerspectiveUpdate_InvalidRating(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Quality: intPtr(99999)})

	require.Error(t, err)
	assert.ErrorIs(t, err, domain.ErrInvalidRating)
}

func TestPerspectiveUpdate_ClearRatings(t *testing.T) {
	tests := []struct {
		name  string
		input portservices.UpdatePerspectiveInput
		get   func(*domain.Perspective) *int
	}{
		{"quality", portservices.UpdatePerspectiveInput{ID: 1, ClearQuality: true}, func(p *domain.Perspective) *int { return p.Quality }},
		{"agreement", portservices.UpdatePerspectiveInput{ID: 1, ClearAgreement: true}, func(p *domain.Perspective) *int { return p.Agreement }},
		{"importance", portservices.UpdatePerspectiveInput{ID: 1, ClearImportance: true}, func(p *domain.Perspective) *int { return p.Importance }},
		{"confidence", portservices.UpdatePerspectiveInput{ID: 1, ClearConfidence: true}, func(p *domain.Perspective) *int { return p.Confidence }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			existing := existingPerspectiveWithEverythingSet()
			repo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
			}
			svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

			result, err := svc.Update(context.Background(), tt.input)

			require.NoError(t, err)
			assert.Nil(t, tt.get(result))
		})
	}
}

func TestPerspectiveUpdate_ClearWinsOverAnInvalidValue(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	// The mapper never sends both Clear and an out-of-range Quality together in
	// practice, but Update() itself should still resolve this sanely: clear
	// wins, and the (unused) value is never validated.
	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID: 1, ClearQuality: true, Quality: intPtr(99999),
	})

	require.NoError(t, err)
	assert.Nil(t, result.Quality)
}

func TestPerspectiveUpdate_ClearLike(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearLike: true})

	require.NoError(t, err)
	assert.Nil(t, result.Like)
}

func TestPerspectiveUpdate_SetsLikeWhenProvided(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Like: strPtr("down")})

	require.NoError(t, err)
	require.NotNil(t, result.Like)
	assert.Equal(t, "down", *result.Like)
}

func TestPerspectiveUpdate_ClearReview(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearReview: true})

	require.NoError(t, err)
	assert.Nil(t, result.Review)
}

func TestPerspectiveUpdate_ClearFeelings(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearFeelings: true})

	require.NoError(t, err)
	assert.Nil(t, result.Feelings)
}

func TestPerspectiveUpdate_FeelingsOverMaxStillRejected(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	tooMany := make([]domain.FeelingEntry, domain.MaxFeelings+1)
	for i := range tooMany {
		tooMany[i] = domain.FeelingEntry{Emoji: "😀", Intensity: 1}
	}

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Feelings: tooMany})

	require.Error(t, err)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestPerspectiveUpdate_ClearCustomFields(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearCustomFields: true})

	require.NoError(t, err)
	assert.Nil(t, result.CustomFields)
}

func TestPerspectiveUpdate_SetsCustomFieldsWhenProvided(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID: 1, CustomFields: json.RawMessage(`{"clarity":9000}`),
	})

	require.NoError(t, err)
	assert.JSONEq(t, `{"clarity":9000}`, string(result.CustomFields))
}

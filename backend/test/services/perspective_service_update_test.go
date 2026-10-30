package services_test

import (
	"context"
	"encoding/json"
	"errors"
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

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1}, 1)

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

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Quality: intPtr(3000)}, 1)

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

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Quality: intPtr(99999)}, 1)

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

			result, err := svc.Update(context.Background(), tt.input, 1)

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
	}, 1)

	require.NoError(t, err)
	assert.Nil(t, result.Quality)
}

func TestPerspectiveUpdate_ClearLike(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearLike: true}, 1)

	require.NoError(t, err)
	assert.Nil(t, result.Like)
}

func TestPerspectiveUpdate_SetsLikeWhenProvided(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Like: strPtr("down")}, 1)

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

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearReview: true}, 1)

	require.NoError(t, err)
	assert.Nil(t, result.Review)
}

func TestPerspectiveUpdate_ClearFeelings(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearFeelings: true}, 1)

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

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Feelings: tooMany}, 1)

	require.Error(t, err)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestPerspectiveUpdate_ClearCustomFields(t *testing.T) {
	existing := existingPerspectiveWithEverythingSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, ClearCustomFields: true}, 1)

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
	}, 1)

	require.NoError(t, err)
	assert.JSONEq(t, `{"clarity":9000}`, string(result.CustomFields))
}

// --- Ownership / actor handling ---

func TestPerspectiveUpdate_Ownership(t *testing.T) {
	tests := []struct {
		name       string
		ownerID    int
		privacy    domain.Privacy
		actor      int
		wantErr    error
		wantGet    bool
		wantUpdate bool
	}{
		{"owner succeeds", 7, domain.PrivacyPrivate, 7, nil, true, true},
		{"non-owner on public is forbidden", 7, domain.PrivacyPublic, 8, domain.ErrForbidden, true, false},
		{"non-owner on private looks not found", 7, domain.PrivacyPrivate, 8, domain.ErrNotFound, true, false},
		{"zero actor is forbidden before any read", 7, domain.PrivacyPublic, 0, domain.ErrForbidden, false, false},
		{"negative actor is forbidden before any read", 7, domain.PrivacyPublic, -1, domain.ErrForbidden, false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotRead, gotUpdate bool
			var gotOwner int
			repo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
					gotRead = true
					return &domain.Perspective{ID: id, UserID: tt.ownerID, Privacy: tt.privacy}, nil
				},
				updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
					gotUpdate = true
					gotOwner = ownerUserID
					return p, nil
				},
			}
			svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

			result, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Like: strPtr("up")}, tt.actor)

			assert.Equal(t, tt.wantGet, gotRead)
			assert.Equal(t, tt.wantUpdate, gotUpdate)
			if tt.wantErr != nil {
				assert.Nil(t, result)
				assert.True(t, errors.Is(err, tt.wantErr), "expected %v, got %v", tt.wantErr, err)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, result)
			assert.Equal(t, tt.actor, gotOwner, "repo.Update must receive the actor id")
		})
	}
}

func TestPerspectiveUpdate_RepoUpdateNotFoundIsPropagated(t *testing.T) {
	// Row vanished or changed hands between the read and the owner-scoped UPDATE.
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: id, UserID: 7}, nil
		},
		updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Like: strPtr("up")}, 7)

	assert.True(t, errors.Is(err, domain.ErrNotFound), "got %v", err)
}

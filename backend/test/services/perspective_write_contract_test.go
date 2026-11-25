package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// fakeLinkedReader answers which linked perspectives the viewer may read, and
// records each batch it was asked about.
type fakeLinkedReader struct {
	readable map[int]bool
	calls    int
	lastIDs  []int
}

func (f *fakeLinkedReader) VisibleIDs(_ context.Context, ids []int, _ int) ([]int, error) {
	f.calls++
	f.lastIDs = ids
	var out []int
	for _, id := range ids {
		if f.readable[id] {
			out = append(out, id)
		}
	}
	return out, nil
}

// emptyExistingPerspective is an owned perspective with no content, so an
// update's outcome depends only on its input.
func emptyExistingPerspective() *domain.Perspective {
	return &domain.Perspective{ID: 1, UserID: 1, Privacy: domain.PrivacyPublic}
}

func TestPerspectiveWriteContract_CreateAndUpdateAgree(t *testing.T) {
	custom := json.RawMessage(`{"belief":7}`)
	tooMany := make([]int, domain.MaxRelatedPerspectiveIDs+1)
	cases := []struct {
		name    string
		create  portservices.CreatePerspectiveInput
		update  portservices.UpdatePerspectiveInput
		wantErr error
	}{
		{
			name:   "quality",
			create: portservices.CreatePerspectiveInput{Quality: intPtr(5000)},
			update: portservices.UpdatePerspectiveInput{Quality: intPtr(5000)},
		},
		{
			name:   "custom fields only",
			create: portservices.CreatePerspectiveInput{CustomFields: custom},
			update: portservices.UpdatePerspectiveInput{CustomFields: custom},
		},
		{
			name:   "categorized rating only",
			create: portservices.CreatePerspectiveInput{CategorizedRatings: []domain.CategorizedRating{{Category: "c", Rating: 3}}},
			update: portservices.UpdatePerspectiveInput{CategorizedRatings: []domain.CategorizedRating{{Category: "c", Rating: 3}}},
		},
		{
			name:   "labels only",
			create: portservices.CreatePerspectiveInput{Labels: []string{"tag"}},
			update: portservices.UpdatePerspectiveInput{Labels: []string{"tag"}},
		},
		{
			name:    "nothing but privacy",
			create:  portservices.CreatePerspectiveInput{Privacy: privacyPtr(domain.PrivacyPrivate)},
			update:  portservices.UpdatePerspectiveInput{Privacy: privacyPtr(domain.PrivacyPrivate)},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name:    "quality out of range",
			create:  portservices.CreatePerspectiveInput{Quality: intPtr(10001)},
			update:  portservices.UpdatePerspectiveInput{Quality: intPtr(10001)},
			wantErr: domain.ErrInvalidRating,
		},
		{
			name:    "categorized rating out of range",
			create:  portservices.CreatePerspectiveInput{CategorizedRatings: []domain.CategorizedRating{{Category: "c", Rating: -1}}},
			update:  portservices.UpdatePerspectiveInput{CategorizedRatings: []domain.CategorizedRating{{Category: "c", Rating: -1}}},
			wantErr: domain.ErrInvalidRating,
		},
		{
			name:    "related ids over the cap",
			create:  portservices.CreatePerspectiveInput{Quality: intPtr(1), RelatedPerspectiveIDs: tooMany},
			update:  portservices.UpdatePerspectiveInput{Quality: intPtr(1), RelatedPerspectiveIDs: tooMany},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name:    "feeling without an emoji",
			create:  portservices.CreatePerspectiveInput{Feelings: []domain.FeelingEntry{{Intensity: 1}}},
			update:  portservices.UpdatePerspectiveInput{Feelings: []domain.FeelingEntry{{Intensity: 1}}},
			wantErr: domain.ErrInvalidInput,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockPerspectiveRepository{
				createFn: func(_ context.Context, p *domain.Perspective) (*domain.Perspective, error) { return p, nil },
				getByIDFn: func(_ context.Context, _ int) (*domain.Perspective, error) {
					return emptyExistingPerspective(), nil
				},
				updateFn: func(_ context.Context, p *domain.Perspective, _ int) (*domain.Perspective, error) { return p, nil },
			}
			svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

			tc.create.UserID = 1
			_, createErr := svc.Create(context.Background(), tc.create)
			tc.update.ID = 1
			_, updateErr := svc.Update(context.Background(), tc.update, 1)

			if tc.wantErr == nil {
				assert.NoError(t, createErr, "create")
				assert.NoError(t, updateErr, "update")
				return
			}
			assert.ErrorIs(t, createErr, tc.wantErr, "create")
			assert.ErrorIs(t, updateErr, tc.wantErr, "update")
		})
	}
}

func TestPerspectiveWriteContract_OwnerCannotSetReviewStatus(t *testing.T) {
	updated := false
	repo := &mockPerspectiveRepository{
		getByIDFn: func(_ context.Context, _ int) (*domain.Perspective, error) { return emptyExistingPerspective(), nil },
		updateFn: func(_ context.Context, p *domain.Perspective, _ int) (*domain.Perspective, error) {
			updated = true
			return p, nil
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})
	approved := domain.ReviewStatusApproved

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, Quality: intPtr(1), ReviewStatus: &approved}, 1)

	assert.ErrorIs(t, err, domain.ErrReviewStatusLocked)
	assert.ErrorIs(t, err, domain.ErrForbidden)
	assert.False(t, updated, "nothing is persisted when review status is rejected")
}

func TestPerspectiveWriteContract_LinkedPerspectivesMustBeReadable(t *testing.T) {
	missingOrHidden := func(err error) bool { return errors.Is(err, domain.ErrLinkedPerspectiveNotFound) }

	t.Run("create: unreadable primary is refused like a missing one", func(t *testing.T) {
		reader := &fakeLinkedReader{readable: map[int]bool{}}
		repo := &mockPerspectiveRepository{
			createFn: func(_ context.Context, p *domain.Perspective) (*domain.Perspective, error) { return p, nil },
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{}, services.WithLinkedPerspectiveReader(reader))

		_, hidden := svc.Create(context.Background(), portservices.CreatePerspectiveInput{UserID: 1, Quality: intPtr(1), PrimaryPerspectiveID: intPtr(7)})
		_, missing := svc.Create(context.Background(), portservices.CreatePerspectiveInput{UserID: 1, Quality: intPtr(1), PrimaryPerspectiveID: intPtr(8)})

		require.Error(t, hidden)
		require.Error(t, missing)
		assert.True(t, missingOrHidden(hidden))
		assert.Equal(t, hidden.Error(), missing.Error(), "hidden and missing answer the same")
	})

	t.Run("create: a readable related id is accepted", func(t *testing.T) {
		reader := &fakeLinkedReader{readable: map[int]bool{3: true, 4: true}}
		repo := &mockPerspectiveRepository{
			createFn: func(_ context.Context, p *domain.Perspective) (*domain.Perspective, error) { return p, nil },
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{}, services.WithLinkedPerspectiveReader(reader))

		_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{UserID: 1, Quality: intPtr(1), RelatedPerspectiveIDs: []int{3, 4}})

		require.NoError(t, err)
		assert.Equal(t, 1, reader.calls, "all linked ids are checked in one batch")
		assert.Equal(t, []int{3, 4}, reader.lastIDs)
	})

	t.Run("create: one unreadable related id refuses the save", func(t *testing.T) {
		reader := &fakeLinkedReader{readable: map[int]bool{3: true}}
		created := false
		repo := &mockPerspectiveRepository{
			createFn: func(_ context.Context, p *domain.Perspective) (*domain.Perspective, error) {
				created = true
				return p, nil
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{}, services.WithLinkedPerspectiveReader(reader))

		_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{UserID: 1, Quality: intPtr(1), RelatedPerspectiveIDs: []int{3, 4}})

		assert.True(t, missingOrHidden(err))
		assert.False(t, created)
	})

	t.Run("create: no linked ids means no lookup", func(t *testing.T) {
		reader := &fakeLinkedReader{readable: map[int]bool{}}
		repo := &mockPerspectiveRepository{
			createFn: func(_ context.Context, p *domain.Perspective) (*domain.Perspective, error) { return p, nil },
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{}, services.WithLinkedPerspectiveReader(reader))

		_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{UserID: 1, Quality: intPtr(1)})

		require.NoError(t, err)
		assert.Equal(t, 0, reader.calls)
	})

	t.Run("update: links already attached are not re-checked", func(t *testing.T) {
		reader := &fakeLinkedReader{readable: map[int]bool{9: true}}
		repo := &mockPerspectiveRepository{
			getByIDFn: func(_ context.Context, _ int) (*domain.Perspective, error) {
				p := emptyExistingPerspective()
				p.Quality = intPtr(1)
				p.PrimaryPerspectiveID = intPtr(11)
				p.RelatedPerspectiveIDs = []int{5, 6}
				return p, nil
			},
			updateFn: func(_ context.Context, p *domain.Perspective, _ int) (*domain.Perspective, error) { return p, nil },
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{}, services.WithLinkedPerspectiveReader(reader))

		_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
			ID:                    1,
			PrimaryPerspectiveID:  intPtr(11),
			RelatedPerspectiveIDs: []int{5, 6, 9},
		}, 1)

		require.NoError(t, err)
		assert.Equal(t, []int{9}, reader.lastIDs, "only the newly attached id is checked")
	})
}

func TestPerspectiveWriteContract_DuplicatePassesThroughWithItsKind(t *testing.T) {
	repo := &mockPerspectiveRepository{
		createFn: func(_ context.Context, _ *domain.Perspective) (*domain.Perspective, error) {
			return nil, domain.ErrDuplicatePerspective
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{UserID: 1, Quality: intPtr(1)})

	assert.ErrorIs(t, err, domain.ErrDuplicatePerspective)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, domain.KindDuplicate, domain.KindOf(err))
}

func privacyPtr(p domain.Privacy) *domain.Privacy { return &p }

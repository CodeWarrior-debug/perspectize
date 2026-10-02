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

// existingPerspectiveWithOptionalsSet returns a perspective with every plain
// optional field populated, so an "omitted" update can prove none is touched.
func existingPerspectiveWithOptionalsSet() *domain.Perspective {
	cat := "original-category"
	status := domain.ReviewStatusPending
	primary := 11
	return &domain.Perspective{
		ID:                    1,
		UserID:                1,
		Category:              &cat,
		ReviewStatus:          &status,
		Parts:                 []int{1, 2},
		Labels:                []string{"old"},
		PrimaryPerspectiveID:  &primary,
		RelatedPerspectiveIDs: []int{5, 6},
	}
}

func updateWith(t *testing.T, input portservices.UpdatePerspectiveInput) *domain.Perspective {
	t.Helper()
	existing := existingPerspectiveWithOptionalsSet()
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) { return existing, nil },
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})
	input.ID = 1
	result, err := svc.Update(context.Background(), input, 1)
	require.NoError(t, err)
	return result
}

func TestPerspectiveUpdate_OmittedOptionalFieldsAreUntouched(t *testing.T) {
	result := updateWith(t, portservices.UpdatePerspectiveInput{})

	require.NotNil(t, result.Category)
	assert.Equal(t, "original-category", *result.Category)
	require.NotNil(t, result.ReviewStatus)
	assert.Equal(t, domain.ReviewStatusPending, *result.ReviewStatus)
	assert.Equal(t, []int{1, 2}, result.Parts)
	assert.Equal(t, []string{"old"}, result.Labels)
	require.NotNil(t, result.PrimaryPerspectiveID)
	assert.Equal(t, 11, *result.PrimaryPerspectiveID)
	assert.Equal(t, []int{5, 6}, result.RelatedPerspectiveIDs)
}

func TestPerspectiveUpdate_ProvidedOptionalFieldsAreApplied(t *testing.T) {
	tests := []struct {
		name   string
		input  portservices.UpdatePerspectiveInput
		assert func(t *testing.T, p *domain.Perspective)
	}{
		{
			name:  "category",
			input: portservices.UpdatePerspectiveInput{Category: strPtr("new-category")},
			assert: func(t *testing.T, p *domain.Perspective) {
				require.NotNil(t, p.Category)
				assert.Equal(t, "new-category", *p.Category)
			},
		},
		{
			name: "review status",
			input: func() portservices.UpdatePerspectiveInput {
				s := domain.ReviewStatusApproved
				return portservices.UpdatePerspectiveInput{ReviewStatus: &s}
			}(),
			assert: func(t *testing.T, p *domain.Perspective) {
				require.NotNil(t, p.ReviewStatus)
				assert.Equal(t, domain.ReviewStatusApproved, *p.ReviewStatus)
			},
		},
		{
			name:  "parts",
			input: portservices.UpdatePerspectiveInput{Parts: []int{9}},
			assert: func(t *testing.T, p *domain.Perspective) {
				assert.Equal(t, []int{9}, p.Parts)
			},
		},
		{
			name:  "labels",
			input: portservices.UpdatePerspectiveInput{Labels: []string{"a", "b"}},
			assert: func(t *testing.T, p *domain.Perspective) {
				assert.Equal(t, []string{"a", "b"}, p.Labels)
			},
		},
		{
			name:  "primary perspective id",
			input: portservices.UpdatePerspectiveInput{PrimaryPerspectiveID: intPtr(42)},
			assert: func(t *testing.T, p *domain.Perspective) {
				require.NotNil(t, p.PrimaryPerspectiveID)
				assert.Equal(t, 42, *p.PrimaryPerspectiveID)
			},
		},
		{
			name:  "related perspective ids",
			input: portservices.UpdatePerspectiveInput{RelatedPerspectiveIDs: []int{7, 8, 9}},
			assert: func(t *testing.T, p *domain.Perspective) {
				assert.Equal(t, []int{7, 8, 9}, p.RelatedPerspectiveIDs)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.assert(t, updateWith(t, tt.input))
		})
	}
}

func TestPerspectiveUpdate_RelatedPerspectiveIDsCapIsFifty(t *testing.T) {
	ids := func(n int) []int {
		out := make([]int, n)
		for i := range out {
			out[i] = i + 1
		}
		return out
	}

	t.Run("exactly 50 accepted", func(t *testing.T) {
		result := updateWith(t, portservices.UpdatePerspectiveInput{RelatedPerspectiveIDs: ids(50)})
		assert.Len(t, result.RelatedPerspectiveIDs, 50)
	})

	t.Run("51 rejected and nothing persisted", func(t *testing.T) {
		updated := false
		repo := &mockPerspectiveRepository{
			getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
				return existingPerspectiveWithOptionalsSet(), nil
			},
			updateFn: func(ctx context.Context, p *domain.Perspective, actorUserID int) (*domain.Perspective, error) {
				updated = true
				return p, nil
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

		_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{ID: 1, RelatedPerspectiveIDs: ids(51)}, 1)

		require.Error(t, err)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
		assert.False(t, updated)
	})
}

func TestPerspectiveListPerspectives_FirstAndLastBounds(t *testing.T) {
	tests := []struct {
		name    string
		first   *int
		last    *int
		wantErr bool
	}{
		{"first 0 rejected", intPtr(0), nil, true},
		{"first 1 accepted", intPtr(1), nil, false},
		{"first 100 accepted", intPtr(100), nil, false},
		{"first 101 rejected", intPtr(101), nil, true},
		{"first negative rejected", intPtr(-1), nil, true},
		{"last 0 rejected", nil, intPtr(0), true},
		{"last 1 accepted", nil, intPtr(1), false},
		{"last 100 accepted", nil, intPtr(100), false},
		{"last 101 rejected", nil, intPtr(101), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			listed := false
			repo := &mockPerspectiveRepository{
				listFn: func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
					listed = true
					return &domain.PaginatedPerspectives{}, nil
				},
			}
			svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

			_, err := svc.ListPerspectives(context.Background(), domain.PerspectiveListParams{First: tt.first, Last: tt.last})

			if tt.wantErr {
				require.Error(t, err)
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				assert.False(t, listed, "repo must not be queried for an out-of-range page size")
			} else {
				require.NoError(t, err)
				assert.True(t, listed)
			}
		})
	}
}

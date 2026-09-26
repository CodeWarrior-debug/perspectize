package services_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockPerspectiveRepository implements repositories.PerspectiveRepository for testing
type mockPerspectiveRepository struct {
	createFn    func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error)
	getByIDFn   func(ctx context.Context, id int) (*domain.Perspective, error)
	updateFn    func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error)
	deleteFn    func(ctx context.Context, id int, ownerUserID int) error
	listFn      func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error)
	aggregateFn func(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error)

	feelingStatsFn     func(ctx context.Context, contentID *int, emoji string, label *string) (*domain.FeelingStats, error)
	customFieldStatsFn func(ctx context.Context, contentID *int, key string) (*domain.CustomFieldStats, error)
}

func (m *mockPerspectiveRepository) Create(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	if m.createFn != nil {
		return m.createFn(ctx, p)
	}
	p.ID = 1
	return p, nil
}

func (m *mockPerspectiveRepository) GetByID(ctx context.Context, id int) (*domain.Perspective, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockPerspectiveRepository) Update(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	if m.updateFn != nil {
		return m.updateFn(ctx, p)
	}
	return p, nil
}

func (m *mockPerspectiveRepository) Delete(ctx context.Context, id int, ownerUserID int) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id, ownerUserID)
	}
	return nil
}

func (m *mockPerspectiveRepository) List(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	if m.listFn != nil {
		return m.listFn(ctx, params)
	}
	return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
}

func (m *mockPerspectiveRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return nil
}

func (m *mockPerspectiveRepository) AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	if m.aggregateFn != nil {
		return m.aggregateFn(ctx, contentIDs)
	}
	return map[int]*domain.PerspectiveAggregate{}, nil
}

func (m *mockPerspectiveRepository) FeelingStats(ctx context.Context, contentID *int, emoji string, label *string) (*domain.FeelingStats, error) {
	if m.feelingStatsFn != nil {
		return m.feelingStatsFn(ctx, contentID, emoji, label)
	}
	return &domain.FeelingStats{Emoji: emoji, Label: label}, nil
}

func (m *mockPerspectiveRepository) CustomFieldStats(ctx context.Context, contentID *int, key string) (*domain.CustomFieldStats, error) {
	if m.customFieldStatsFn != nil {
		return m.customFieldStatsFn(ctx, contentID, key)
	}
	return &domain.CustomFieldStats{Key: key}, nil
}

// mockUserRepoForPerspective implements repositories.UserRepository for perspective tests
type mockUserRepoForPerspective struct {
	getByIDFn func(ctx context.Context, id int) (*domain.User, error)
}

func (m *mockUserRepoForPerspective) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	return user, nil
}

func (m *mockUserRepoForPerspective) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &domain.User{ID: id, Username: "testuser", Email: "test@example.com"}, nil
}

func (m *mockUserRepoForPerspective) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepoForPerspective) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepoForPerspective) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepoForPerspective) ListAll(ctx context.Context) ([]*domain.User, error) {
	return []*domain.User{}, nil
}

func (m *mockUserRepoForPerspective) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	return user, nil
}

func (m *mockUserRepoForPerspective) Delete(ctx context.Context, id int) error {
	return nil
}

func (m *mockUserRepoForPerspective) CreateFromClerk(ctx context.Context, clerkID string, username string, email string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepoForPerspective) UpdateByClerkID(ctx context.Context, clerkID string, username string, email string) error {
	return domain.ErrNotFound
}

func (m *mockUserRepoForPerspective) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	return domain.ErrNotFound
}

func (m *mockUserRepoForPerspective) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	return &domain.User{ID: userID, Onboarding: onboarding}, nil
}

// --- Create Tests ---

func TestPerspectiveCreate_Success(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
			p.ID = 1
			return p, nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	like := "up"
	input := portservices.CreatePerspectiveInput{
		UserID: 1,
		Like:   &like, // at least one field required by validation
	}

	result, err := svc.Create(context.Background(), input)

	require.NoError(t, err)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, 1, result.UserID)
	assert.Equal(t, domain.PrivacyPublic, result.Privacy)
}

func TestPerspectiveCreate_WithRatings(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
			p.ID = 1
			return p, nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	quality := 8000
	agreement := 5000
	input := portservices.CreatePerspectiveInput{
		UserID:    1,
		Quality:   &quality,
		Agreement: &agreement,
	}

	result, err := svc.Create(context.Background(), input)

	require.NoError(t, err)
	assert.Equal(t, &quality, result.Quality)
	assert.Equal(t, &agreement, result.Agreement)
}

func TestPerspectiveCreate_UserNotFound(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return nil, domain.ErrNotFound
		},
	}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	input := portservices.CreatePerspectiveInput{
		UserID: 999,
	}

	result, err := svc.Create(context.Background(), input)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestPerspectiveCreate_InvalidUserID(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	input := portservices.CreatePerspectiveInput{
		UserID: 0,
	}

	result, err := svc.Create(context.Background(), input)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestPerspectiveCreate_RatingTooHigh(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	quality := 10001
	input := portservices.CreatePerspectiveInput{
		UserID:  1,
		Quality: &quality,
	}

	result, err := svc.Create(context.Background(), input)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidRating))
}

func TestPerspectiveCreate_RatingNegative(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	agreement := -1
	input := portservices.CreatePerspectiveInput{
		UserID:    1,
		Agreement: &agreement,
	}

	result, err := svc.Create(context.Background(), input)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidRating))
}

func TestPerspectiveCreate_RepositoryError(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
			return nil, fmt.Errorf("database error")
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	like := "up"
	input := portservices.CreatePerspectiveInput{
		UserID: 1,
		Like:   &like, // at least one field required by validation
	}

	result, err := svc.Create(context.Background(), input)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to create perspective")
}

func TestPerspectiveCreate_NoFieldsProvided(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	input := portservices.CreatePerspectiveInput{
		UserID: 1,
		// No quality, agreement, importance, confidence, like, review, or description
	}

	result, err := svc.Create(context.Background(), input)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "at least one field must be provided")
}

// --- GetByID Tests ---

func TestPerspectiveGetByID_Success(t *testing.T) {
	expected := &domain.Perspective{
		ID:      1,
		UserID:  1,
		Privacy: domain.PrivacyPublic,
	}

	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return expected, nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	result, err := svc.GetByID(context.Background(), 1)

	require.NoError(t, err)
	assert.Equal(t, expected, result)
}

func TestPerspectiveGetByID_NotFound(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return nil, domain.ErrNotFound
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	result, err := svc.GetByID(context.Background(), 999)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestPerspectiveGetByID_InvalidID(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	result, err := svc.GetByID(context.Background(), 0)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

// --- Delete Tests ---

func TestPerspectiveDelete_OwnerSucceeds(t *testing.T) {
	var gotID, gotOwner int
	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: id, UserID: 42}, nil
		},
		deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
			gotID, gotOwner = id, ownerUserID
			return nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	err := svc.Delete(context.Background(), 1, 42)

	require.NoError(t, err)
	assert.Equal(t, 1, gotID)
	// The actor is forwarded so the repository can scope the DELETE by owner.
	assert.Equal(t, 42, gotOwner)
}

func TestPerspectiveDelete_OwnerCanDeletePrivate(t *testing.T) {
	deleted := false
	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: id, UserID: 42, Privacy: domain.PrivacyPrivate}, nil
		},
		deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
			deleted = true
			return nil
		},
	}

	svc := services.NewPerspectiveService(perspectiveRepo, &mockUserRepoForPerspective{})
	require.NoError(t, svc.Delete(context.Background(), 1, 42))
	assert.True(t, deleted)
}

func TestPerspectiveDelete_NonOwnerForbidden(t *testing.T) {
	for _, privacy := range []domain.Privacy{domain.PrivacyPublic, domain.PrivacyPrivate} {
		t.Run(string(privacy), func(t *testing.T) {
			deleteCalled := false
			perspectiveRepo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
					return &domain.Perspective{ID: id, UserID: 99, Privacy: privacy}, nil
				},
				deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
					deleteCalled = true
					return nil
				},
			}

			svc := services.NewPerspectiveService(perspectiveRepo, &mockUserRepoForPerspective{})
			err := svc.Delete(context.Background(), 1, 42)

			require.Error(t, err)
			assert.True(t, errors.Is(err, domain.ErrForbidden))
			assert.False(t, deleteCalled, "repository Delete must not run for a non-owner")
		})
	}
}

func TestPerspectiveDelete_NoActorForbidden(t *testing.T) {
	getCalled := false
	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			getCalled = true
			return &domain.Perspective{ID: id, UserID: 0}, nil
		},
	}

	svc := services.NewPerspectiveService(perspectiveRepo, &mockUserRepoForPerspective{})
	err := svc.Delete(context.Background(), 1, 0)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrForbidden))
	// A zero actor must never match a (corrupt) zero UserID row.
	assert.False(t, getCalled)
}

func TestPerspectiveDelete_NotFound(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return nil, domain.ErrNotFound
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	err := svc.Delete(context.Background(), 999, 42)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestPerspectiveDelete_RepoScopedDeleteMissPropagatesNotFound(t *testing.T) {
	// Row changed hands (or vanished) between GetByID and Delete: the
	// owner-scoped DELETE matches nothing and reports ErrNotFound.
	perspectiveRepo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: id, UserID: 42}, nil
		},
		deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
			return domain.ErrNotFound
		},
	}

	svc := services.NewPerspectiveService(perspectiveRepo, &mockUserRepoForPerspective{})
	err := svc.Delete(context.Background(), 1, 42)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestPerspectiveDelete_InvalidID(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	err := svc.Delete(context.Background(), 0, 42)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

// --- ListPerspectives Tests ---

func TestPerspectiveList_Success(t *testing.T) {
	expected := &domain.PaginatedPerspectives{
		Items: []*domain.Perspective{
			{ID: 1, UserID: 1},
			{ID: 2, UserID: 1},
		},
		HasNext: false,
		HasPrev: false,
	}

	perspectiveRepo := &mockPerspectiveRepository{
		listFn: func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
			return expected, nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	result, err := svc.ListPerspectives(context.Background(), domain.PerspectiveListParams{})

	require.NoError(t, err)
	assert.Equal(t, 2, len(result.Items))
}

func TestPerspectiveList_InvalidFirst(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	first := 0
	result, err := svc.ListPerspectives(context.Background(), domain.PerspectiveListParams{First: &first})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestPerspectiveList_FirstTooLarge(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)
	first := 101
	result, err := svc.ListPerspectives(context.Background(), domain.PerspectiveListParams{First: &first})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

// --- NewPerspectiveService Tests ---

func TestNewPerspectiveService(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{}
	userRepo := &mockUserRepoForPerspective{}

	svc := services.NewPerspectiveService(perspectiveRepo, userRepo)

	assert.NotNil(t, svc)
}

// --- ValidateRating Tests ---

func TestValidateRating_Valid(t *testing.T) {
	testCases := []int{0, 5000, 10000}

	for _, rating := range testCases {
		t.Run(fmt.Sprintf("rating_%d", rating), func(t *testing.T) {
			assert.True(t, domain.ValidateRating(&rating))
		})
	}
}

func TestValidateRating_Invalid(t *testing.T) {
	testCases := []int{-1, 10001, -100}

	for _, rating := range testCases {
		t.Run(fmt.Sprintf("rating_%d", rating), func(t *testing.T) {
			assert.False(t, domain.ValidateRating(&rating))
		})
	}
}

func TestValidateRating_Nil(t *testing.T) {
	assert.True(t, domain.ValidateRating(nil))
}

func TestPerspectiveService_ListPerspectives_PrivacyEnforcement(t *testing.T) {
	ctx := context.Background()
	pInt := func(i int) *int { return &i }

	newSvc := func(capture *domain.PerspectiveListParams) *services.PerspectiveService {
		repo := &mockPerspectiveRepository{
			listFn: func(_ context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
				*capture = params
				return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
			},
		}
		return services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})
	}

	t.Run("owner viewing their own list is not restricted", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: pInt(7),
			Filter:   &domain.PerspectiveFilter{UserID: pInt(7)},
		})
		require.NoError(t, err)
		assert.False(t, got.RestrictToPublicOrOwner)
	})

	t.Run("different signed-in user is restricted", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: pInt(7),
			Filter:   &domain.PerspectiveFilter{UserID: pInt(9)},
		})
		require.NoError(t, err)
		assert.True(t, got.RestrictToPublicOrOwner)
		require.NotNil(t, got.ViewerID)
		assert.Equal(t, 7, *got.ViewerID)
	})

	t.Run("anonymous viewer is restricted", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: nil,
			Filter:   &domain.PerspectiveFilter{UserID: pInt(9)},
		})
		require.NoError(t, err)
		assert.True(t, got.RestrictToPublicOrOwner)
		assert.Nil(t, got.ViewerID)
	})

	t.Run("no user filter is restricted even for a signed-in caller", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: pInt(7),
			Filter:   nil,
		})
		require.NoError(t, err)
		assert.True(t, got.RestrictToPublicOrOwner)
	})
}

func TestPerspectiveService_AggregateByContentIDs(t *testing.T) {
	ctx := context.Background()

	t.Run("passes through the repository's aggregates", func(t *testing.T) {
		avg := 8234.5
		repo := &mockPerspectiveRepository{
			aggregateFn: func(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
				assert.Equal(t, []int{1, 2}, contentIDs)
				return map[int]*domain.PerspectiveAggregate{
					1: {ContentID: 1, Count: 3, QualityCount: 2, AverageQuality: &avg},
				}, nil
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

		got, err := svc.AggregateByContentIDs(ctx, []int{1, 2})
		require.NoError(t, err)
		require.Contains(t, got, 1)
		assert.Equal(t, 3, got[1].Count)
		assert.Equal(t, 2, got[1].QualityCount)
		assert.Equal(t, &avg, got[1].AverageQuality)
		assert.NotContains(t, got, 2)
	})

	t.Run("wraps a repository error", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			aggregateFn: func(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
				return nil, fmt.Errorf("db exploded")
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

		_, err := svc.AggregateByContentIDs(ctx, []int{1})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "db exploded")
	})
}

func TestPerspectiveService_FeelingStats(t *testing.T) {
	ctx := context.Background()

	t.Run("passes through the repository's stats", func(t *testing.T) {
		avg, stddev := 8500.0, 1200.0
		contentID := 42
		repo := &mockPerspectiveRepository{
			feelingStatsFn: func(ctx context.Context, gotContentID *int, gotEmoji string, gotLabel *string) (*domain.FeelingStats, error) {
				require.NotNil(t, gotContentID)
				assert.Equal(t, 42, *gotContentID)
				assert.Equal(t, "🥰", gotEmoji)
				require.NotNil(t, gotLabel)
				assert.Equal(t, "Love", *gotLabel)
				return &domain.FeelingStats{
					Emoji: "🥰", Label: gotLabel,
					Count: 3, TotalPerspectives: 10,
					AverageIntensity: &avg, StdDevIntensity: &stddev,
				}, nil
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

		label := "Love"
		got, err := svc.FeelingStats(ctx, &contentID, "🥰", &label)
		require.NoError(t, err)
		assert.Equal(t, 3, got.Count)
		assert.Equal(t, 10, got.TotalPerspectives)
		assert.Equal(t, &avg, got.AverageIntensity)
		assert.Equal(t, &stddev, got.StdDevIntensity)
		require.NotNil(t, got.PercentOfPerspectives())
		assert.Equal(t, 30.0, *got.PercentOfPerspectives())
	})

	t.Run("rejects an empty emoji", func(t *testing.T) {
		svc := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepoForPerspective{})
		_, err := svc.FeelingStats(ctx, nil, "", nil)
		require.Error(t, err)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	t.Run("wraps a repository error", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			feelingStatsFn: func(ctx context.Context, contentID *int, emoji string, label *string) (*domain.FeelingStats, error) {
				return nil, fmt.Errorf("db exploded")
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})
		_, err := svc.FeelingStats(ctx, nil, "🥰", nil)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "db exploded")
	})
}

func TestPerspectiveService_CustomFieldStats(t *testing.T) {
	ctx := context.Background()

	t.Run("passes through the repository's stats", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			customFieldStatsFn: func(ctx context.Context, contentID *int, key string) (*domain.CustomFieldStats, error) {
				assert.Nil(t, contentID)
				assert.Equal(t, "mood", key)
				return &domain.CustomFieldStats{Key: "mood", Count: 5, TotalPerspectives: 20}, nil
			},
		}
		svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

		got, err := svc.CustomFieldStats(ctx, nil, "mood")
		require.NoError(t, err)
		assert.Equal(t, 5, got.Count)
		require.NotNil(t, got.PercentOfPerspectives())
		assert.Equal(t, 25.0, *got.PercentOfPerspectives())
	})

	t.Run("rejects an empty key", func(t *testing.T) {
		svc := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepoForPerspective{})
		_, err := svc.CustomFieldStats(ctx, nil, "")
		require.Error(t, err)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
	})
}

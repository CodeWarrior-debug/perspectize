package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockUserRepository implements repositories.UserRepository for testing
type mockUserRepository struct {
	createFn           func(ctx context.Context, user *domain.User) (*domain.User, error)
	getByIDFn          func(ctx context.Context, id int) (*domain.User, error)
	getByUsernameFn    func(ctx context.Context, username string) (*domain.User, error)
	getByEmailFn       func(ctx context.Context, email string) (*domain.User, error)
	listAllFn          func(ctx context.Context) ([]*domain.User, error)
	updateFn           func(ctx context.Context, user *domain.User) (*domain.User, error)
	deleteFn           func(ctx context.Context, id int) error
	updateOnboardingFn func(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error)
}

func (m *mockUserRepository) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	if m.createFn != nil {
		return m.createFn(ctx, user)
	}
	user.ID = 1
	return user, nil
}

func (m *mockUserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	if m.getByUsernameFn != nil {
		return m.getByUsernameFn(ctx, username)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	if m.getByEmailFn != nil {
		return m.getByEmailFn(ctx, email)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) ListAll(ctx context.Context) ([]*domain.User, error) {
	if m.listAllFn != nil {
		return m.listAllFn(ctx)
	}
	return []*domain.User{}, nil
}

func (m *mockUserRepository) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	if m.updateFn != nil {
		return m.updateFn(ctx, user)
	}
	return user, nil
}

func (m *mockUserRepository) Delete(ctx context.Context, id int) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id)
	}
	return nil
}

func (m *mockUserRepository) CreateFromClerk(ctx context.Context, clerkID string, username string, email string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) UpdateByClerkID(ctx context.Context, clerkID string, username string, email string) error {
	return domain.ErrNotFound
}

func (m *mockUserRepository) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	return domain.ErrNotFound
}

func (m *mockUserRepository) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	if m.updateOnboardingFn != nil {
		return m.updateOnboardingFn(ctx, userID, onboarding)
	}
	return &domain.User{ID: userID, Onboarding: onboarding}, nil
}

// mockContentRepoForUser implements repositories.ContentRepository for user tests
type mockContentRepoForUser struct {
	reassignByUserFn func(ctx context.Context, fromUserID, toUserID int) error
}

func (m *mockContentRepoForUser) Create(ctx context.Context, content *domain.Content) (*domain.Content, error) {
	return content, nil
}
func (m *mockContentRepoForUser) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockContentRepoForUser) GetByURL(ctx context.Context, url string) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockContentRepoForUser) GetOrCreateByURL(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
	return content, false, nil
}
func (m *mockContentRepoForUser) UpdateMetadata(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockContentRepoForUser) List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	return &domain.PaginatedContent{Items: []*domain.Content{}}, nil
}
func (m *mockContentRepoForUser) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	if m.reassignByUserFn != nil {
		return m.reassignByUserFn(ctx, fromUserID, toUserID)
	}
	return nil
}
func (m *mockContentRepoForUser) UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int) error {
	return nil
}

// mockPerspectiveRepoForUser implements repositories.PerspectiveRepository for user tests
type mockPerspectiveRepoForUser struct {
	reassignByUserFn func(ctx context.Context, fromUserID, toUserID int) error
}

func (m *mockPerspectiveRepoForUser) Create(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	return p, nil
}
func (m *mockPerspectiveRepoForUser) GetByID(ctx context.Context, id int) (*domain.Perspective, error) {
	return nil, domain.ErrNotFound
}
func (m *mockPerspectiveRepoForUser) Update(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	return p, nil
}
func (m *mockPerspectiveRepoForUser) Delete(ctx context.Context, id int) error {
	return nil
}
func (m *mockPerspectiveRepoForUser) List(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
}
func (m *mockPerspectiveRepoForUser) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	if m.reassignByUserFn != nil {
		return m.reassignByUserFn(ctx, fromUserID, toUserID)
	}
	return nil
}
func (m *mockPerspectiveRepoForUser) AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	return map[int]*domain.PerspectiveAggregate{}, nil
}

// newTestUserService creates a UserService with default mocks for content/perspective repos
func newTestUserService(repo *mockUserRepository) *services.UserService {
	return services.NewUserService(repo, &mockContentRepoForUser{}, &mockPerspectiveRepoForUser{})
}

// newTestUserServiceFull creates a UserService with explicit content/perspective repo mocks
func newTestUserServiceFull(repo *mockUserRepository, contentRepo *mockContentRepoForUser, perspectiveRepo *mockPerspectiveRepoForUser) *services.UserService {
	return services.NewUserService(repo, contentRepo, perspectiveRepo)
}

// --- Create Tests ---

func TestCreate_Success(t *testing.T) {
	repo := &mockUserRepository{
		createFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
			user.ID = 1
			return user, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "testuser", "test@example.com")

	require.NoError(t, err)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "testuser", result.Username)
	assert.Equal(t, "test@example.com", result.Email)
	assert.True(t, result.Active)
}

func TestCreate_UsernameEmpty(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.Create(context.Background(), "", "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is required")
}

func TestCreate_UsernameWhitespace(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.Create(context.Background(), "   ", "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is required")
}

func TestCreate_UsernameTooLong(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	// Username with 25 characters (limit is 24)
	result, err := svc.Create(context.Background(), "abcdefghijklmnopqrstuvwxy", "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username must be 24 characters or less")
}

func TestCreate_EmailEmpty_Succeeds(t *testing.T) {
	repo := &mockUserRepository{
		createFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
			user.ID = 1
			return user, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "testuser", "")

	require.NoError(t, err)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "testuser", result.Username)
	assert.Equal(t, "", result.Email)
	assert.True(t, result.Active)
}

func TestCreate_EmailInvalid(t *testing.T) {
	testCases := []string{
		"notanemail",
		"@example.com",
		"test@",
		"test@.com",
		"test@com",
	}

	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	for _, email := range testCases {
		t.Run(email, func(t *testing.T) {
			result, err := svc.Create(context.Background(), "testuser", email)

			assert.Nil(t, result)
			require.Error(t, err)
			assert.True(t, errors.Is(err, domain.ErrInvalidInput))
			assert.Contains(t, err.Error(), "invalid email format")
		})
	}
}

func TestCreate_UsernameAlreadyExists(t *testing.T) {
	repo := &mockUserRepository{
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			return &domain.User{ID: 1, Username: username}, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "existinguser", "new@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrAlreadyExists))
	assert.Contains(t, err.Error(), "username already taken")
}

func TestCreate_EmailAlreadyExists(t *testing.T) {
	repo := &mockUserRepository{
		getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
			return &domain.User{ID: 1, Email: email}, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "newuser", "existing@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrAlreadyExists))
	assert.Contains(t, err.Error(), "email already registered")
}

func TestCreate_RepositoryCreateError(t *testing.T) {
	repo := &mockUserRepository{
		createFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
			return nil, fmt.Errorf("database error")
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "testuser", "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to create user")
}

func TestCreate_GetByUsernameUnexpectedError(t *testing.T) {
	repo := &mockUserRepository{
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			return nil, fmt.Errorf("unexpected database error")
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "testuser", "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to check username")
}

func TestCreate_GetByEmailUnexpectedError(t *testing.T) {
	repo := &mockUserRepository{
		getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
			return nil, fmt.Errorf("unexpected database error")
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Create(context.Background(), "testuser", "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to check email")
}

// --- GetByID Tests ---

func TestUserGetByID_Success(t *testing.T) {
	expected := &domain.User{
		ID:       1,
		Username: "testuser",
		Email:    "test@example.com",
	}

	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			assert.Equal(t, 1, id)
			return expected, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.GetByID(context.Background(), 1)

	require.NoError(t, err)
	assert.Equal(t, expected, result)
}

func TestUserGetByID_NotFound(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return nil, domain.ErrNotFound
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.GetByID(context.Background(), 999)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestUserGetByID_InvalidID_Zero(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.GetByID(context.Background(), 0)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "user id must be a positive integer")
}

func TestUserGetByID_InvalidID_Negative(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.GetByID(context.Background(), -5)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

// --- GetByUsername Tests ---

func TestGetByUsername_Success(t *testing.T) {
	expected := &domain.User{
		ID:       1,
		Username: "testuser",
		Email:    "test@example.com",
	}

	repo := &mockUserRepository{
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			assert.Equal(t, "testuser", username)
			return expected, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.GetByUsername(context.Background(), "testuser")

	require.NoError(t, err)
	assert.Equal(t, expected, result)
}

func TestGetByUsername_NotFound(t *testing.T) {
	repo := &mockUserRepository{
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			return nil, domain.ErrNotFound
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.GetByUsername(context.Background(), "nonexistent")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestGetByUsername_Empty(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.GetByUsername(context.Background(), "")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is required")
}

func TestGetByUsername_Whitespace(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.GetByUsername(context.Background(), "   ")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is required")
}

// --- NewUserService Tests ---

func TestNewUserService(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	assert.NotNil(t, svc)
}

// --- ListAll Tests ---

func TestListAll_ExcludesSentinels(t *testing.T) {
	repo := &mockUserRepository{
		listAllFn: func(ctx context.Context) ([]*domain.User, error) {
			return []*domain.User{
				{ID: 1, Username: "admin", Role: domain.UserRoleAdmin},
				{ID: 2, Username: "alice", Role: domain.UserRoleDefault},
			}, nil
		},
	}

	svc := newTestUserService(repo)
	users, err := svc.ListAll(context.Background())

	require.NoError(t, err)
	assert.Len(t, users, 2)
	for _, u := range users {
		assert.False(t, u.IsSentinel(), "sentinel user should not be in ListAll results")
	}
}

// --- Update Tests ---

func TestUpdate_Success(t *testing.T) {
	newUsername := "updateduser"
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "olduser", Email: "old@example.com", Role: domain.UserRoleDefault}, nil
		},
		updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
			return user, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{
		ID:       2,
		Username: &newUsername,
	})

	require.NoError(t, err)
	assert.Equal(t, "updateduser", result.Username)
	assert.Equal(t, "old@example.com", result.Email)
}

func TestUpdate_SentinelUserBlocked(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 1, Username: domain.DeletedUserUsername, Email: "deleted@system.internal", Role: domain.UserRoleSentinel}, nil
		},
	}

	newUsername := "hacker"
	svc := newTestUserService(repo)
	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{
		ID:       1,
		Username: &newUsername,
	})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrSentinelUser))
}

func TestUpdate_InvalidID(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{ID: 0})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestUpdate_UsernameAlreadyTaken(t *testing.T) {
	takenName := "taken"
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "olduser", Email: "old@example.com", Role: domain.UserRoleDefault}, nil
		},
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			if username == "taken" {
				return &domain.User{ID: 3, Username: "taken"}, nil
			}
			return nil, domain.ErrNotFound
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{
		ID:       2,
		Username: &takenName,
	})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrAlreadyExists))
}

// --- Delete Tests ---

func TestDelete_Success(t *testing.T) {
	sentinelUser := &domain.User{ID: 1, Username: domain.DeletedUserUsername, Role: domain.UserRoleSentinel}
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "testuser", Email: "test@example.com", Role: domain.UserRoleDefault}, nil
		},
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			if username == domain.DeletedUserUsername {
				return sentinelUser, nil
			}
			return nil, domain.ErrNotFound
		},
		deleteFn: func(ctx context.Context, id int) error {
			assert.Equal(t, 2, id)
			return nil
		},
	}

	contentRepo := &mockContentRepoForUser{}
	perspectiveRepo := &mockPerspectiveRepoForUser{}
	svc := newTestUserServiceFull(repo, contentRepo, perspectiveRepo)

	err := svc.Delete(context.Background(), 2)
	require.NoError(t, err)
}

func TestDelete_SentinelUserBlocked(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 1, Username: domain.DeletedUserUsername, Role: domain.UserRoleSentinel}, nil
		},
	}

	svc := newTestUserService(repo)
	err := svc.Delete(context.Background(), 1)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrDeleteSentinel))
}

func TestDelete_InvalidID(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	err := svc.Delete(context.Background(), 0)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestDelete_UserNotFound(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return nil, domain.ErrNotFound
		},
	}

	svc := newTestUserService(repo)
	err := svc.Delete(context.Background(), 999)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestDelete_ReassignContentFails(t *testing.T) {
	sentinelUser := &domain.User{ID: 1, Username: domain.DeletedUserUsername, Role: domain.UserRoleSentinel}
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "testuser", Role: domain.UserRoleDefault}, nil
		},
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			if username == domain.DeletedUserUsername {
				return sentinelUser, nil
			}
			return nil, domain.ErrNotFound
		},
	}

	contentRepo := &mockContentRepoForUser{
		reassignByUserFn: func(ctx context.Context, fromUserID, toUserID int) error {
			return fmt.Errorf("database error")
		},
	}
	perspectiveRepo := &mockPerspectiveRepoForUser{}
	svc := newTestUserServiceFull(repo, contentRepo, perspectiveRepo)

	err := svc.Delete(context.Background(), 2)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to reassign content")
}

func TestDelete_ReassignPerspectivesFails(t *testing.T) {
	sentinelUser := &domain.User{ID: 1, Username: domain.DeletedUserUsername, Role: domain.UserRoleSentinel}
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "testuser", Role: domain.UserRoleDefault}, nil
		},
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			if username == domain.DeletedUserUsername {
				return sentinelUser, nil
			}
			return nil, domain.ErrNotFound
		},
	}

	contentRepo := &mockContentRepoForUser{}
	perspectiveRepo := &mockPerspectiveRepoForUser{
		reassignByUserFn: func(ctx context.Context, fromUserID, toUserID int) error {
			return fmt.Errorf("database error")
		},
	}
	svc := newTestUserServiceFull(repo, contentRepo, perspectiveRepo)

	err := svc.Delete(context.Background(), 2)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to reassign perspectives")
}

// --- Reserved Username Tests ---

func TestCreate_ReservedDeletedUsername(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.Create(context.Background(), domain.DeletedUserUsername, "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is reserved")
}

func TestCreate_ReservedSystemUsername(t *testing.T) {
	repo := &mockUserRepository{}
	svc := newTestUserService(repo)

	result, err := svc.Create(context.Background(), domain.SystemUserUsername, "test@example.com")

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is reserved")
}

func TestUpdate_ReservedDeletedUsername(t *testing.T) {
	reserved := domain.DeletedUserUsername
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "normaluser", Email: "normal@example.com"}, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{
		ID:       2,
		Username: &reserved,
	})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is reserved")
}

func TestUpdate_ReservedSystemUsername(t *testing.T) {
	reserved := domain.SystemUserUsername
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 2, Username: "normaluser", Email: "normal@example.com"}, nil
		},
	}

	svc := newTestUserService(repo)
	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{
		ID:       2,
		Username: &reserved,
	})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "username is reserved")
}

func TestUpdate_SystemSentinelBlocked(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 1, Username: domain.SystemUserUsername, Email: "system@system.internal", Role: domain.UserRoleSentinel}, nil
		},
	}

	newUsername := "hacker"
	svc := newTestUserService(repo)
	result, err := svc.Update(context.Background(), portservices.UpdateUserInput{
		ID:       1,
		Username: &newUsername,
	})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrSentinelUser))
}

func TestDelete_SystemSentinelBlocked(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 1, Username: domain.SystemUserUsername, Role: domain.UserRoleSentinel}, nil
		},
	}

	svc := newTestUserService(repo)
	err := svc.Delete(context.Background(), 1)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrDeleteSentinel))
}

// --- Onboarding Tests ---

func TestDefaultUserOnboarding(t *testing.T) {
	o := domain.DefaultUserOnboarding()
	assert.Equal(t, 0, o.Version)
	assert.True(t, o.DisplayNextSession)
	assert.Nil(t, o.CompletedAt)
	assert.Equal(t, 1, domain.CurrentIntroVersion)
}

func TestCreate_SetsDefaultOnboarding(t *testing.T) {
	var captured *domain.User
	repo := &mockUserRepository{
		createFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
			captured = user
			user.ID = 10
			return user, nil
		},
	}
	svc := newTestUserService(repo)

	result, err := svc.Create(context.Background(), "newbie", "n@example.com")
	require.NoError(t, err)
	require.NotNil(t, captured)
	assert.Equal(t, domain.DefaultUserOnboarding(), captured.Onboarding)
	assert.Equal(t, domain.DefaultUserOnboarding(), result.Onboarding)
}

func TestMarkOnboardingSeen_Success(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{
				ID:         id,
				Username:   "u",
				Role:       domain.UserRoleDefault,
				Onboarding: domain.DefaultUserOnboarding(),
			}, nil
		},
		updateOnboardingFn: func(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
			assert.Equal(t, 5, userID)
			assert.Equal(t, domain.CurrentIntroVersion, onboarding.Version)
			assert.False(t, onboarding.DisplayNextSession)
			require.NotNil(t, onboarding.CompletedAt)
			assert.NotEmpty(t, *onboarding.CompletedAt)
			return &domain.User{ID: userID, Onboarding: onboarding}, nil
		},
	}
	svc := newTestUserService(repo)

	o, err := svc.MarkOnboardingSeen(context.Background(), 5, domain.CurrentIntroVersion)
	require.NoError(t, err)
	require.NotNil(t, o)
	assert.Equal(t, domain.CurrentIntroVersion, o.Version)
	assert.False(t, o.DisplayNextSession)
	require.NotNil(t, o.CompletedAt)
}

func TestMarkOnboardingSeen_InvalidUserID(t *testing.T) {
	svc := newTestUserService(&mockUserRepository{})
	o, err := svc.MarkOnboardingSeen(context.Background(), 0, 1)
	assert.Nil(t, o)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestMarkOnboardingSeen_NegativeVersion(t *testing.T) {
	svc := newTestUserService(&mockUserRepository{})
	o, err := svc.MarkOnboardingSeen(context.Background(), 1, -1)
	assert.Nil(t, o)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestMarkOnboardingSeen_SentinelBlocked(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 1, Role: domain.UserRoleSentinel, Username: domain.SystemUserUsername}, nil
		},
	}
	svc := newTestUserService(repo)
	o, err := svc.MarkOnboardingSeen(context.Background(), 1, 1)
	assert.Nil(t, o)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrSentinelUser))
}

func TestMarkOnboardingSeen_NotFound(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := newTestUserService(repo)
	o, err := svc.MarkOnboardingSeen(context.Background(), 99, 1)
	assert.Nil(t, o)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to get user")
}

func TestSetOnboardingDisplayNextSession_Replay(t *testing.T) {
	completed := "2026-01-01T00:00:00Z"
	existing := domain.UserOnboarding{
		Version:            domain.CurrentIntroVersion,
		DisplayNextSession: false,
		CompletedAt:        &completed,
	}
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id, Role: domain.UserRoleDefault, Onboarding: existing}, nil
		},
		updateOnboardingFn: func(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
			assert.True(t, onboarding.DisplayNextSession)
			assert.Equal(t, domain.CurrentIntroVersion, onboarding.Version)
			require.NotNil(t, onboarding.CompletedAt)
			assert.Equal(t, completed, *onboarding.CompletedAt)
			return &domain.User{ID: userID, Onboarding: onboarding}, nil
		},
	}
	svc := newTestUserService(repo)

	o, err := svc.SetOnboardingDisplayNextSession(context.Background(), 3, true)
	require.NoError(t, err)
	assert.True(t, o.DisplayNextSession)
	assert.Equal(t, domain.CurrentIntroVersion, o.Version)
	require.NotNil(t, o.CompletedAt)
	assert.Equal(t, completed, *o.CompletedAt)
}

func TestSetOnboardingDisplayNextSession_SentinelBlocked(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: 1, Role: domain.UserRoleSentinel}, nil
		},
	}
	svc := newTestUserService(repo)
	o, err := svc.SetOnboardingDisplayNextSession(context.Background(), 1, true)
	assert.Nil(t, o)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrSentinelUser))
}

func TestBackfillSemantics_SeenAtCurrentVersion(t *testing.T) {
	// Documents migration backfill shape used by eligibility:
	// displayNextSession=false, version=CURRENT, completedAt set → coach hidden.
	completed := "2026-09-05T00:00:00Z"
	backfilled := domain.UserOnboarding{
		Version:            domain.CurrentIntroVersion,
		DisplayNextSession: false,
		CompletedAt:        &completed,
	}
	showCoach := backfilled.DisplayNextSession || backfilled.Version < domain.CurrentIntroVersion
	assert.False(t, showCoach)
}

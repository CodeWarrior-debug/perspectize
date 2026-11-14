package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	repositories "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// pgUniqueViolation is Postgres' SQLSTATE for a unique violation (23505).
const pgUniqueViolation = "23505"

// GormUserRepository implements the UserRepository interface using GORM
type GormUserRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.UserRepository = (*GormUserRepository)(nil)

// NewGormUserRepository creates a new GORM-based user repository
func NewGormUserRepository(db *gorm.DB) *GormUserRepository {
	return &GormUserRepository{db: db}
}

// Create inserts a new user record into the database
func (r *GormUserRepository) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	model := userDomainToModel(user)

	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return nil, err
	}

	// GORM auto-fills ID, CreatedAt, UpdatedAt
	return userModelToDomain(model), nil
}

// GetByID retrieves a user by their ID
func (r *GormUserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	var model UserModel

	err := r.db.WithContext(ctx).First(&model, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	return userModelToDomain(&model), nil
}

// GetByIDs loads many users in one query (the per-request user dataloader).
func (r *GormUserRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.User, error) {
	if len(ids) == 0 {
		return []*domain.User{}, nil
	}
	var models []UserModel
	if err := r.db.WithContext(ctx).Where("id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Find(&models).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.User, len(models))
	for i := range models {
		out[i] = userModelToDomain(&models[i])
	}
	return out, nil
}

// GetByClerkID retrieves a user by their Clerk user ID
func (r *GormUserRepository) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	var model UserModel
	err := r.db.WithContext(ctx).Where("clerk_user_id = ?", clerkID).First(&model).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return userModelToDomain(&model), nil
}

// GetByUsername retrieves a user by their username
func (r *GormUserRepository) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	var model UserModel

	err := r.db.WithContext(ctx).Where("username = ?", username).First(&model).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	return userModelToDomain(&model), nil
}

// GetByEmail retrieves a user by their email address
func (r *GormUserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	var model UserModel

	err := r.db.WithContext(ctx).Where("email = ?", email).First(&model).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	return userModelToDomain(&model), nil
}

// ListAll retrieves all non-sentinel users ordered by username
func (r *GormUserRepository) ListAll(ctx context.Context) ([]*domain.User, error) {
	var models []UserModel

	err := r.db.WithContext(ctx).
		Where("role != ?", "sentinel").
		Order("username ASC").
		Find(&models).Error
	if err != nil {
		return nil, err
	}

	users := make([]*domain.User, len(models))
	for i := range models {
		users[i] = userModelToDomain(&models[i])
	}

	return users, nil
}

// Update saves changes to an existing user record
func (r *GormUserRepository) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	model := userDomainToModel(user)
	model.ID = user.ID

	// RETURNING * hands back the row with its new updated_at: no re-read.
	var updated UserModel
	result := r.db.WithContext(ctx).Model(&updated).
		Clauses(clause.Returning{}).
		Where("id = ?", user.ID).
		Updates(map[string]interface{}{
			"username":      model.Username,
			"email":         model.Email,
			"clerk_user_id": model.ClerkUserID,
		})
	if result.Error != nil {
		// The unique constraints are the uniqueness check (no pre-query).
		var pgErr *pgconn.PgError
		if errors.As(result.Error, &pgErr) && pgErr.Code == pgUniqueViolation {
			switch pgErr.ConstraintName {
			case "users_unique_username":
				return nil, fmt.Errorf("%w: username already taken", domain.ErrAlreadyExists)
			case "users_unique_email":
				return nil, fmt.Errorf("%w: email already registered", domain.ErrAlreadyExists)
			}
		}
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}

	return userModelToDomain(&updated), nil
}

// Delete removes a user record by ID
func (r *GormUserRepository) Delete(ctx context.Context, id int) error {
	result := r.db.WithContext(ctx).Delete(&UserModel{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// CreateFromClerk inserts a new user record seeded from Clerk webhook data.
func (r *GormUserRepository) CreateFromClerk(ctx context.Context, clerkID string, username string, email string) (*domain.User, error) {
	var emailPtr *string
	if email != "" {
		emailPtr = &email
	}
	model := &UserModel{
		ClerkUserID: &clerkID,
		Username:    username,
		Email:       emailPtr,
		Role:        "default",
		Active:      true,
		Onboarding:  onboardingToJSON(domain.DefaultUserOnboarding()),
	}
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return nil, err
	}
	return userModelToDomain(model), nil
}

// UpdateByClerkID updates username and email for the user with the given Clerk ID.
func (r *GormUserRepository) UpdateByClerkID(ctx context.Context, clerkID string, username string, email string) error {
	var emailPtr *string
	if email != "" {
		emailPtr = &email
	}
	result := r.db.WithContext(ctx).Model(&UserModel{}).
		Where("clerk_user_id = ?", clerkID).
		Updates(map[string]interface{}{
			"username": username,
			"email":    emailPtr,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// DeactivateByClerkID sets active=false for the user with the given Clerk ID.
func (r *GormUserRepository) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	result := r.db.WithContext(ctx).Model(&UserModel{}).
		Where("clerk_user_id = ?", clerkID).
		Update("active", false)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// sentinelRole is how UserRoleSentinel is stored (roles are lowercased; see
// userDomainToModel). The system user's onboarding is never writable.
const sentinelRole = "sentinel"

// UpdateOnboarding replaces the onboarding JSONB for a non-sentinel user in
// one round trip (UPDATE ... RETURNING *). Returns domain.ErrNotFound when no
// such user exists -- or it is the sentinel; the caller disambiguates.
func (r *GormUserRepository) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	return r.updateOnboarding(ctx, userID, onboardingToJSON(onboarding))
}

// SetOnboardingDisplayNextSession flips only onboarding.displayNextSession,
// in SQL, so the caller doesn't need to read the current onboarding first.
// Same not-found/sentinel contract as UpdateOnboarding.
func (r *GormUserRepository) SetOnboardingDisplayNextSession(ctx context.Context, userID int, display bool) (*domain.User, error) {
	return r.updateOnboarding(ctx, userID,
		gorm.Expr(`jsonb_set(onboarding, '{displayNextSession}', to_jsonb(?::boolean))`, display))
}

func (r *GormUserRepository) updateOnboarding(ctx context.Context, userID int, value interface{}) (*domain.User, error) {
	var updated UserModel
	result := r.db.WithContext(ctx).Model(&updated).
		Clauses(clause.Returning{}).
		Where("id = ? AND role <> ?", userID, sentinelRole).
		Update("onboarding", value)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}
	return userModelToDomain(&updated), nil
}

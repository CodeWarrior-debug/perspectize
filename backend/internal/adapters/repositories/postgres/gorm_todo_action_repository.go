package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// todoActionsUserKeyUnique is UNIQUE NULLS NOT DISTINCT (user_id, key) on todo_actions.
const todoActionsUserKeyUnique = "todo_actions_user_key_unique"

// GormTodoActionRepository implements repositories.TodoActionRepository using GORM
type GormTodoActionRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.TodoActionRepository = (*GormTodoActionRepository)(nil)

// NewGormTodoActionRepository creates a new GORM todo action repository
func NewGormTodoActionRepository(db *gorm.DB) *GormTodoActionRepository {
	return &GormTodoActionRepository{db: db}
}

// GetByID fetches an action by primary key
func (r *GormTodoActionRepository) GetByID(ctx context.Context, id int) (*domain.TodoAction, error) {
	var model TodoActionModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get todo action by id: %w", err)
	}
	return todoActionModelToDomain(&model), nil
}

// GetByIDs fetches actions by primary key in one query. Missing ids are
// omitted; an empty input issues no query.
func (r *GormTodoActionRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.TodoAction, error) {
	if len(ids) == 0 {
		return []*domain.TodoAction{}, nil
	}

	var models []TodoActionModel
	if err := r.db.WithContext(ctx).Where("id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get todo actions by ids: %w", err)
	}

	actions := make([]*domain.TodoAction, 0, len(models))
	for i := range models {
		actions = append(actions, todoActionModelToDomain(&models[i]))
	}
	return actions, nil
}

// ListForUser returns the presets plus the actions userID entered, in picker
// order: typical_sequence NULLS LAST, then label.
func (r *GormTodoActionRepository) ListForUser(ctx context.Context, userID int) ([]*domain.TodoAction, error) {
	var models []TodoActionModel
	err := r.db.WithContext(ctx).
		Where("user_id IS NULL OR user_id = ?", userID).
		Order("typical_sequence ASC NULLS LAST, label ASC, id ASC").
		Find(&models).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list todo actions: %w", err)
	}

	actions := make([]*domain.TodoAction, 0, len(models))
	for i := range models {
		actions = append(actions, todoActionModelToDomain(&models[i]))
	}
	return actions, nil
}

// GetByKey fetches an action by key. A nil userID looks up a preset; a set
// userID looks up that user's action. IS NOT DISTINCT FROM makes NULL match NULL.
func (r *GormTodoActionRepository) GetByKey(ctx context.Context, userID *int, key string) (*domain.TodoAction, error) {
	var model TodoActionModel
	err := r.db.WithContext(ctx).
		Where("key = ? AND user_id IS NOT DISTINCT FROM ?", key, userID).
		Take(&model).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get todo action by key: %w", err)
	}
	return todoActionModelToDomain(&model), nil
}

// Create inserts an action in one round trip (INSERT ... RETURNING *). A
// duplicate key for the same owner (or preset) returns domain.ErrAlreadyExists.
func (r *GormTodoActionRepository) Create(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
	model := todoActionDomainToModel(action)

	if err := r.db.WithContext(ctx).Clauses(clause.Returning{}).Create(model).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == todoActionsUserKeyUnique {
			return nil, fmt.Errorf("%w: an action with this key already exists", domain.ErrAlreadyExists)
		}
		return nil, fmt.Errorf("failed to insert todo action: %w", err)
	}
	return todoActionModelToDomain(model), nil
}

// ReassignByUser moves ownership of the user's actions to toUserID. The key gets
// a " (#<id>)" suffix in the same statement, so the move can't collide with the
// NULLS NOT DISTINCT (user_id, key) unique key. Presets (user_id NULL) are not
// matched.
func (r *GormTodoActionRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	err := r.db.WithContext(ctx).
		Model(&TodoActionModel{}).
		Where("user_id = ?", fromUserID).
		Updates(map[string]any{
			"user_id": toUserID,
			"key":     gorm.Expr("key || ' (#' || id || ')'"),
		}).Error
	if err != nil {
		return fmt.Errorf("failed to reassign todo actions: %w", err)
	}
	return nil
}

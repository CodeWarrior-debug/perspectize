package postgres

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/jackc/pgx/v5/pgconn"
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Constraint names from migration 000031_add_user_todos.
const (
	userTodosOpenUniqueIndex    = "user_todos_open_content_action_unique"
	userTodosUserFK             = "user_todos_user_fk"
	userTodosContentFK          = "user_todos_content_fk"
	userTodosActionFK           = "user_todos_action_fk"
	userTodosListFK             = "user_todos_list_fk"
	userTodoListsUserNameUnique = "user_todo_lists_user_name_unique"
	userTodoListsUserFK         = "user_todo_lists_user_fk"
)

// GormUserTodoRepository implements repositories.UserTodoRepository using GORM
type GormUserTodoRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.UserTodoRepository = (*GormUserTodoRepository)(nil)

// NewGormUserTodoRepository creates a new GORM user todo repository
func NewGormUserTodoRepository(db *gorm.DB) *GormUserTodoRepository {
	return &GormUserTodoRepository{db: db}
}

// List retrieves one page of todos. The privacy predicate is applied when
// RestrictToPublicOrOwner is set: public rows, plus the viewer's own rows when
// there is a viewer. The total count is a separate query, issued only when
// IncludeTotalCount is set.
func (r *GormUserTodoRepository) List(ctx context.Context, params domain.UserTodoListParams) (*domain.PaginatedUserTodos, error) {
	limit := 10
	if params.First != nil {
		limit = *params.First
	}

	opts := []paginator.Option{
		paginator.WithRules(buildUserTodoSortRules(params.SortBy, params.SortOrder)...),
		paginator.WithLimit(limit),
		paginator.WithAllowTupleCmp(paginator.TRUE),
	}
	if params.After != nil {
		opts = append(opts, paginator.WithAfter(*params.After))
	}
	if params.Before != nil {
		opts = append(opts, paginator.WithBefore(*params.Before))
	}
	p := paginator.New(opts...)

	query := r.db.WithContext(ctx).Model(&UserTodoModel{})
	query = applyUserTodoFilter(query, params.Filter)

	// Read-authorization predicate, same shape as perspectives (see
	// GormPerspectiveRepository.List).
	if params.RestrictToPublicOrOwner {
		public := privacyToDBValue(domain.PrivacyPublic)
		if params.ViewerID != nil {
			query = query.Where("privacy = ? OR user_id = ?", public, *params.ViewerID)
		} else {
			query = query.Where("privacy = ?", public)
		}
	}

	// Total count (before cursor/limit, respects filters and privacy only)
	var totalCountInt *int
	if params.IncludeTotalCount {
		countQuery := query.Session(&gorm.Session{})
		var count int64
		if err := countQuery.Count(&count).Error; err != nil {
			return nil, fmt.Errorf("failed to count user todos: %w", err)
		}
		countInt := int(count)
		totalCountInt = &countInt
	}

	var models []UserTodoModel
	pageResult, cursor, err := p.Paginate(query, &models)
	if err != nil {
		return nil, fmt.Errorf("failed to list user todos: %w", err)
	}
	// Paginate() returns the query error on pageResult, not as err (issue #327).
	if pageResult.Error != nil {
		return nil, fmt.Errorf("failed to list user todos: %w", pageResult.Error)
	}

	items := make([]*domain.UserTodo, len(models))
	for i := range models {
		items[i] = userTodoModelToDomain(&models[i])
	}

	return &domain.PaginatedUserTodos{
		Items:       items,
		HasNext:     cursor.After != nil,
		HasPrev:     cursor.Before != nil,
		StartCursor: cursor.Before,
		EndCursor:   cursor.After,
		TotalCount:  totalCountInt,
	}, nil
}

// applyUserTodoFilter adds the WHERE clauses for the filter fields that are set.
// ListID wins over Unlisted; an empty Statuses slice filters nothing.
func applyUserTodoFilter(query *gorm.DB, f *domain.UserTodoFilter) *gorm.DB {
	if f == nil {
		return query
	}
	if f.UserID != nil {
		query = query.Where("user_id = ?", *f.UserID)
	}
	if f.ContentID != nil {
		query = query.Where("content_id = ?", *f.ContentID)
	}
	if f.ListID != nil {
		query = query.Where("list_id = ?", *f.ListID)
	} else if f.Unlisted {
		query = query.Where("list_id IS NULL")
	}
	if f.ActionID != nil {
		query = query.Where("action_id = ?", *f.ActionID)
	}
	if len(f.Statuses) > 0 {
		statuses := make(StringArray, len(f.Statuses))
		for i, s := range f.Statuses {
			statuses[i] = userTodoStatusToDBValue(s)
		}
		query = query.Where("status = ANY(CAST(? AS text[]))", statuses)
	}
	return query
}

// GetByID fetches a todo by primary key
func (r *GormUserTodoRepository) GetByID(ctx context.Context, id int) (*domain.UserTodo, error) {
	var model UserTodoModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get user todo by id: %w", err)
	}
	return userTodoModelToDomain(&model), nil
}

// GetByIDs fetches todos by primary key in one query. Missing ids are omitted;
// an empty input issues no query.
func (r *GormUserTodoRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.UserTodo, error) {
	if len(ids) == 0 {
		return []*domain.UserTodo{}, nil
	}

	var models []UserTodoModel
	if err := r.db.WithContext(ctx).Where("id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get user todos by ids: %w", err)
	}

	todos := make([]*domain.UserTodo, 0, len(models))
	for i := range models {
		todos = append(todos, userTodoModelToDomain(&models[i]))
	}
	return todos, nil
}

// Create inserts a todo in one round trip (INSERT ... RETURNING *).
func (r *GormUserTodoRepository) Create(ctx context.Context, todo *domain.UserTodo) (*domain.UserTodo, error) {
	model := userTodoDomainToModel(todo)

	if err := r.db.WithContext(ctx).Clauses(clause.Returning{}).Create(model).Error; err != nil {
		return nil, mapUserTodoWriteError("failed to insert user todo", err)
	}
	return userTodoModelToDomain(model), nil
}

// Update writes every mutable column of todo, scoped to its owner:
// UPDATE ... WHERE id = ? AND user_id = ? RETURNING *. The domain object is the
// full post-merge state, so every column is written explicitly (a nil field
// becomes NULL). user_id, id and created_at are never written.
//
// Deliberately not Save(): Save falls back to an upsert on a zero-row UPDATE,
// which would bypass the owner predicate.
func (r *GormUserTodoRepository) Update(ctx context.Context, todo *domain.UserTodo, actorUserID int) (*domain.UserTodo, error) {
	if actorUserID <= 0 {
		return nil, domain.ErrNotFound
	}
	model := userTodoDomainToModel(todo)

	result := r.db.WithContext(ctx).
		Model(model).
		Clauses(clause.Returning{}).
		Where("user_id = ?", actorUserID).
		Updates(map[string]any{
			"content_id":       model.ContentID,
			"name":             model.Name,
			"action_id":        model.ActionID,
			"priority":         model.Priority,
			"status":           model.Status,
			"percent_complete": model.PercentComplete,
			"start_date":       model.StartDate,
			"end_date":         model.EndDate,
			"due_date":         model.DueDate,
			"comments":         model.Comments,
			"privacy":          model.Privacy,
			"list_id":          model.ListID,
			"list_position":    model.ListPosition,
		})
	if result.Error != nil {
		return nil, mapUserTodoWriteError("failed to update user todo", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ownerScopedMissError(ctx, r.db, &UserTodoModel{}, todo.ID)
	}
	return userTodoModelToDomain(model), nil
}

// Delete removes a todo, scoped to its owner: DELETE ... WHERE user_id = ? AND id = ?.
func (r *GormUserTodoRepository) Delete(ctx context.Context, id int, actorUserID int) error {
	if actorUserID <= 0 {
		return domain.ErrNotFound
	}
	result := r.db.WithContext(ctx).Where("user_id = ?", actorUserID).Delete(&UserTodoModel{}, id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete user todo: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownerScopedMissError(ctx, r.db, &UserTodoModel{}, id)
	}
	return nil
}

// NextListPosition returns max(list_position)+1 for the list, or 1 when empty.
func (r *GormUserTodoRepository) NextListPosition(ctx context.Context, listID int) (int, error) {
	var next int
	err := r.db.WithContext(ctx).
		Model(&UserTodoModel{}).
		Select("COALESCE(MAX(list_position), 0) + 1").
		Where("list_id = ?", listID).
		Scan(&next).Error
	if err != nil {
		return 0, fmt.Errorf("failed to get next list position: %w", err)
	}
	return next, nil
}

// UnlistAll clears list_id and list_position on the owner's todos in the list.
// Called before a list is deleted, because the list FK blocks deletion.
func (r *GormUserTodoRepository) UnlistAll(ctx context.Context, listID int, actorUserID int) error {
	err := r.db.WithContext(ctx).
		Model(&UserTodoModel{}).
		Where("list_id = ? AND user_id = ?", listID, actorUserID).
		Updates(map[string]any{"list_id": nil, "list_position": nil}).Error
	if err != nil {
		return fmt.Errorf("failed to unlist user todos: %w", err)
	}
	return nil
}

// Reorder rewrites list_position to 1..N in the order of todoIDs in ONE
// statement. The UPDATE only touches rows that are in listID, owned by
// actorUserID, and whose list is also owned by actorUserID (the EXISTS clause is
// the list-ownership check, so it costs no extra round trip). Duplicate ids keep
// their first position. Ids that don't match are skipped. The result is sorted
// by the new position.
func (r *GormUserTodoRepository) Reorder(ctx context.Context, listID int, todoIDs []int, actorUserID int) ([]*domain.UserTodo, error) {
	seen := make(map[int]bool, len(todoIDs))
	values := make([]string, 0, len(todoIDs))
	args := make([]any, 0, 2*len(todoIDs)+3)
	for _, id := range todoIDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		// Only placeholders are interpolated into the SQL; the values are bound.
		values = append(values, "(CAST(? AS integer), CAST(? AS integer))")
		args = append(args, id, len(values))
	}
	if len(values) == 0 {
		return []*domain.UserTodo{}, nil
	}

	query := fmt.Sprintf(`UPDATE user_todos AS t
		SET list_position = v.pos
		FROM (VALUES %s) AS v(id, pos)
		WHERE t.id = v.id
		  AND t.list_id = ?
		  AND t.user_id = ?
		  AND EXISTS (SELECT 1 FROM user_todo_lists l WHERE l.id = t.list_id AND l.user_id = ?)
		RETURNING t.*`, strings.Join(values, ", "))
	args = append(args, listID, actorUserID, actorUserID)

	var models []UserTodoModel
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to reorder user todos: %w", err)
	}

	sort.SliceStable(models, func(i, j int) bool {
		pi, pj := models[i].ListPosition, models[j].ListPosition
		if pi == nil || pj == nil {
			return pj == nil && pi != nil
		}
		return *pi < *pj
	})
	todos := make([]*domain.UserTodo, len(models))
	for i := range models {
		todos[i] = userTodoModelToDomain(&models[i])
	}
	return todos, nil
}

// ReassignByUser moves ownership of every todo from fromUserID to toUserID.
func (r *GormUserTodoRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	err := r.db.WithContext(ctx).
		Model(&UserTodoModel{}).
		Where("user_id = ?", fromUserID).
		Update("user_id", toUserID).Error
	if err != nil {
		return fmt.Errorf("failed to reassign user todos: %w", err)
	}
	return nil
}

// mapUserTodoWriteError turns constraint violations on user_todos into domain
// errors. Anything else is wrapped with op.
//   - open-todo unique index  -> ErrAlreadyExists
//   - missing user           -> ErrNotFound (same as perspectives)
//   - missing content/action/list -> ErrInvalidInput
func mapUserTodoWriteError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == userTodosOpenUniqueIndex {
			return fmt.Errorf("%w: an open todo already exists for this content and action", domain.ErrAlreadyExists)
		}
		if pgErr.Code == pgForeignKeyViolation {
			switch pgErr.ConstraintName {
			case userTodosUserFK:
				return fmt.Errorf("%w: user not found", domain.ErrNotFound)
			case userTodosContentFK:
				return fmt.Errorf("%w: content not found", domain.ErrInvalidInput)
			case userTodosActionFK:
				return fmt.Errorf("%w: action not found", domain.ErrInvalidInput)
			case userTodosListFK:
				return fmt.Errorf("%w: list not found", domain.ErrInvalidInput)
			}
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}

// ownerScopedMissError is called after an owner-scoped UPDATE or DELETE matched
// no row. It reads the row's owner to tell the two cases apart:
// domain.ErrNotFound when no row has that id, domain.ErrForbidden when a row
// exists under another owner. Only runs on a zero-row miss.
func ownerScopedMissError(ctx context.Context, db *gorm.DB, model any, id int) error {
	var owner struct{ UserID int }
	err := db.WithContext(ctx).Model(model).Select("user_id").Where("id = ?", id).Take(&owner).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("failed to look up row owner: %w", err)
	}
	return domain.ErrForbidden
}

// GormUserTodoListRepository implements repositories.UserTodoListRepository using GORM
type GormUserTodoListRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.UserTodoListRepository = (*GormUserTodoListRepository)(nil)

// NewGormUserTodoListRepository creates a new GORM user todo list repository
func NewGormUserTodoListRepository(db *gorm.DB) *GormUserTodoListRepository {
	return &GormUserTodoListRepository{db: db}
}

// ListByUser returns the owner's lists by name. Private lists are included only
// when includePrivate is true.
func (r *GormUserTodoListRepository) ListByUser(ctx context.Context, userID int, includePrivate bool) ([]*domain.UserTodoList, error) {
	query := r.db.WithContext(ctx).Model(&UserTodoListModel{}).Where("user_id = ?", userID)
	if !includePrivate {
		query = query.Where("privacy = ?", privacyToDBValue(domain.PrivacyPublic))
	}

	var models []UserTodoListModel
	if err := query.Order("name ASC, id ASC").Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list user todo lists: %w", err)
	}

	lists := make([]*domain.UserTodoList, 0, len(models))
	for i := range models {
		lists = append(lists, userTodoListModelToDomain(&models[i]))
	}
	return lists, nil
}

// GetByID fetches a list by primary key
func (r *GormUserTodoListRepository) GetByID(ctx context.Context, id int) (*domain.UserTodoList, error) {
	var model UserTodoListModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get user todo list by id: %w", err)
	}
	return userTodoListModelToDomain(&model), nil
}

// GetByIDs fetches lists by primary key in one query. Missing ids are omitted;
// an empty input issues no query.
func (r *GormUserTodoListRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.UserTodoList, error) {
	if len(ids) == 0 {
		return []*domain.UserTodoList{}, nil
	}

	var models []UserTodoListModel
	if err := r.db.WithContext(ctx).Where("id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get user todo lists by ids: %w", err)
	}

	lists := make([]*domain.UserTodoList, 0, len(models))
	for i := range models {
		lists = append(lists, userTodoListModelToDomain(&models[i]))
	}
	return lists, nil
}

// Create inserts a list in one round trip (INSERT ... RETURNING *).
func (r *GormUserTodoListRepository) Create(ctx context.Context, list *domain.UserTodoList) (*domain.UserTodoList, error) {
	model := userTodoListDomainToModel(list)

	if err := r.db.WithContext(ctx).Clauses(clause.Returning{}).Create(model).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == userTodoListsUserNameUnique {
				return nil, fmt.Errorf("%w: a list with this name already exists", domain.ErrAlreadyExists)
			}
			if pgErr.Code == pgForeignKeyViolation && pgErr.ConstraintName == userTodoListsUserFK {
				return nil, fmt.Errorf("%w: user with id %d not found", domain.ErrNotFound, list.UserID)
			}
		}
		return nil, fmt.Errorf("failed to insert user todo list: %w", err)
	}
	return userTodoListModelToDomain(model), nil
}

// Update writes the list's name, description and privacy, scoped to its owner
// (UPDATE ... WHERE user_id = ? AND id = ? RETURNING *). A nil description is
// written as NULL. Returns ErrForbidden / ErrNotFound on a zero-row miss.
func (r *GormUserTodoListRepository) Update(ctx context.Context, list *domain.UserTodoList, actorUserID int) (*domain.UserTodoList, error) {
	if actorUserID <= 0 {
		return nil, domain.ErrNotFound
	}
	model := userTodoListDomainToModel(list)

	result := r.db.WithContext(ctx).
		Model(model).
		Clauses(clause.Returning{}).
		Where("user_id = ?", actorUserID).
		Updates(map[string]any{
			"name":        model.Name,
			"description": model.Description,
			"privacy":     model.Privacy,
		})
	if result.Error != nil {
		var pgErr *pgconn.PgError
		if errors.As(result.Error, &pgErr) && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == userTodoListsUserNameUnique {
			return nil, fmt.Errorf("%w: a list with this name already exists", domain.ErrAlreadyExists)
		}
		return nil, fmt.Errorf("failed to update user todo list: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ownerScopedMissError(ctx, r.db, &UserTodoListModel{}, list.ID)
	}
	return userTodoListModelToDomain(model), nil
}

// Delete removes a list, scoped to its owner. Returns domain.ErrInvalidInput
// when todos still reference the list (the service unlists them first).
func (r *GormUserTodoListRepository) Delete(ctx context.Context, id int, actorUserID int) error {
	if actorUserID <= 0 {
		return domain.ErrNotFound
	}
	result := r.db.WithContext(ctx).Where("user_id = ?", actorUserID).Delete(&UserTodoListModel{}, id)
	if result.Error != nil {
		var pgErr *pgconn.PgError
		if errors.As(result.Error, &pgErr) && pgErr.Code == pgForeignKeyViolation && pgErr.ConstraintName == userTodosListFK {
			return fmt.Errorf("%w: list still has todos", domain.ErrInvalidInput)
		}
		return fmt.Errorf("failed to delete user todo list: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownerScopedMissError(ctx, r.db, &UserTodoListModel{}, id)
	}
	return nil
}

// ReassignByUser moves ownership of every list from fromUserID to toUserID.
// The name gets a " (#<id>)" suffix in the same statement, so the move can't
// collide with a UNIQUE (user_id, name) entry already on the target user.
// left(name, 80) keeps the result within varchar(100).
func (r *GormUserTodoListRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	err := r.db.WithContext(ctx).
		Model(&UserTodoListModel{}).
		Where("user_id = ?", fromUserID).
		Updates(map[string]any{
			"user_id": toUserID,
			"name":    gorm.Expr("left(name, 80) || ' (#' || id || ')'"),
		}).Error
	if err != nil {
		return fmt.Errorf("failed to reassign user todo lists: %w", err)
	}
	return nil
}

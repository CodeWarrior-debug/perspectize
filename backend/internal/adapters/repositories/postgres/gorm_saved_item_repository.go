package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/jackc/pgx/v5/pgconn"
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Constraint names from the user_saved_items migration.
const (
	savedItemNameUniqueIndex = "user_saved_items_user_type_name_unique"

	// pgCheckViolation is SQLSTATE 23514 (check_violation).
	pgCheckViolation = "23514"
)

// savedItemSourceReadable is the rule for a source being readable: it exists,
// is live and is public. The read join and the link conversion both use it.
const savedItemSourceReadable = "src.id IS NOT NULL AND src.deleted_at IS NULL AND src.privacy = 'public'"

// savedItemReadSelect is the select list of every read. The row is aliased s and
// its source src (LEFT JOIN). A LINK's payload and payload version come from the
// source, in the same statement, and only while the source is readable.
// source_available is also set for COPY rows, so a copy can show that its credit
// is gone.
const savedItemReadSelect = `s.id, s.user_id, s.type, s.name,
	CASE WHEN s.origin = 'link' THEN CASE WHEN (` + savedItemSourceReadable + `) THEN src.payload END ELSE s.payload END AS resolved_payload,
	CASE WHEN s.origin = 'link' AND (` + savedItemSourceReadable + `) THEN src.payload_version ELSE s.payload_version END AS resolved_payload_version,
	s.privacy, s.origin, s.source_id,
	(` + savedItemSourceReadable + `) AS source_available,
	s.created_at, s.updated_at`

// GormSavedItemRepository implements repositories.SavedItemRepository using GORM
type GormSavedItemRepository struct {
	db *gorm.DB
}

// Compile-time interface check
var _ repositories.SavedItemRepository = (*GormSavedItemRepository)(nil)

// NewGormSavedItemRepository creates a new GORM saved item repository
func NewGormSavedItemRepository(db *gorm.DB) *GormSavedItemRepository {
	return &GormSavedItemRepository{db: db}
}

// readBase starts every saved item read: the rows as s, with the source joined
// as src. Callers add liveRows and their own predicates.
func (r *GormSavedItemRepository) readBase(ctx context.Context) *gorm.DB {
	return r.db.WithContext(ctx).
		Model(&SavedItemReadModel{}).
		Table("user_saved_items AS s")
}

// readQuery is readBase with the source join and the resolved select list.
func (r *GormSavedItemRepository) readQuery(ctx context.Context) *gorm.DB {
	return r.readBase(ctx).
		Joins("LEFT JOIN user_saved_items AS src ON src.id = s.source_id").
		Select(savedItemReadSelect)
}

// liveRows is the one soft-delete scope. Every read passes through it, so a
// deleted item never reaches a caller. Writes carry the same predicate in their
// own WHERE clauses.
func liveRows(q *gorm.DB) *gorm.DB {
	return q.Where("s.deleted_at IS NULL")
}

// applySavedItemScope adds the type and visibility predicates of a list. MINE is
// the viewer's own rows. SHARED is public rows plus the viewer's own, or public
// rows only when anonymous. An unknown scope matches nothing.
func applySavedItemScope(q *gorm.DB, params domain.SavedItemListParams) *gorm.DB {
	q = q.Where("s.type = ?", savedItemTypeToDBValue(params.Type))
	public := privacyToDBValue(domain.PrivacyPublic)
	switch params.Scope {
	case domain.SavedItemScopeMine:
		if params.ViewerID == nil {
			return q.Where("1 = 0")
		}
		return q.Where("s.user_id = ?", *params.ViewerID)
	case domain.SavedItemScopeShared:
		// Other people's links are left out: copy and link both refuse a link
		// as their source, so a picker row for one could never be used.
		link := savedItemOriginToDBValue(domain.SavedItemOriginLink)
		if params.ViewerID != nil {
			return q.Where("(s.privacy = ? OR s.user_id = ?) AND NOT (s.origin = ? AND s.user_id <> ?)",
				public, *params.ViewerID, link, *params.ViewerID)
		}
		return q.Where("s.privacy = ? AND s.origin <> ?", public, link)
	default:
		return q.Where("1 = 0")
	}
}

// List returns one page of saved items. The total count is a separate query,
// issued only when IncludeTotalCount is set, and it has no source join.
func (r *GormSavedItemRepository) List(ctx context.Context, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error) {
	limit := 10
	if params.First != nil {
		limit = *params.First
	}

	opts := []paginator.Option{
		paginator.WithRules(buildSavedItemSortRules(params.SortBy, params.SortOrder)...),
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

	query := applySavedItemScope(liveRows(r.readQuery(ctx)), params)

	var totalCountInt *int
	if params.IncludeTotalCount {
		countQuery := applySavedItemScope(liveRows(r.readBase(ctx)), params)
		var count int64
		if err := countQuery.Count(&count).Error; err != nil {
			return nil, fmt.Errorf("failed to count saved items: %w", err)
		}
		countInt := int(count)
		totalCountInt = &countInt
	}

	var rows []SavedItemReadModel
	pageResult, cursor, err := p.Paginate(query, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to list saved items: %w", err)
	}
	// Paginate() returns the query error on pageResult, not as err.
	if pageResult.Error != nil {
		return nil, fmt.Errorf("failed to list saved items: %w", pageResult.Error)
	}

	items := make([]*domain.SavedItem, len(rows))
	for i := range rows {
		items[i] = savedItemReadToDomain(&rows[i])
	}

	return &domain.PaginatedSavedItems{
		Items:       items,
		HasNext:     cursor.After != nil,
		HasPrev:     cursor.Before != nil,
		StartCursor: cursor.Before,
		EndCursor:   cursor.After,
		TotalCount:  totalCountInt,
	}, nil
}

// GetByID fetches a live saved item by primary key, with its link payload
// resolved in the same statement.
func (r *GormSavedItemRepository) GetByID(ctx context.Context, id int) (*domain.SavedItem, error) {
	var row SavedItemReadModel
	if err := liveRows(r.readQuery(ctx)).Where("s.id = ?", id).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get saved item by id: %w", err)
	}
	return savedItemReadToDomain(&row), nil
}

// NamesWithPrefix returns the live names of the owner's items of one type that
// start with prefix. starts_with avoids escaping LIKE wildcards in the prefix.
func (r *GormSavedItemRepository) NamesWithPrefix(ctx context.Context, userID int, itemType domain.SavedItemType, prefix string) ([]string, error) {
	var names []string
	err := liveRows(r.readBase(ctx)).
		Where("s.user_id = ? AND s.type = ? AND starts_with(s.name, ?)", userID, savedItemTypeToDBValue(itemType), prefix).
		Pluck("s.name", &names).Error
	if err != nil {
		return nil, fmt.Errorf("failed to read saved item names: %w", err)
	}
	return names, nil
}

// Create inserts the item in one round trip (INSERT ... RETURNING *). A LINK is
// written with a NULL payload.
func (r *GormSavedItemRepository) Create(ctx context.Context, item *domain.SavedItem) (*domain.SavedItem, error) {
	model := savedItemDomainToModel(item)

	if err := r.db.WithContext(ctx).Clauses(clause.Returning{}).Create(model).Error; err != nil {
		return nil, mapSavedItemWriteError("failed to insert saved item", err)
	}
	return savedItemModelToDomain(model), nil
}

// Update writes the name and, for a non-LINK, the payload. The UPDATE carries the
// owner and live predicates. The domain object is the full post-merge state, and
// a LINK's payload is never written: the column must stay NULL.
//
// Deliberately not Save(): Save falls back to an upsert on a zero-row UPDATE,
// which would bypass the owner predicate.
func (r *GormSavedItemRepository) Update(ctx context.Context, item *domain.SavedItem, actorUserID int) (*domain.SavedItem, error) {
	if actorUserID <= 0 || item.ID <= 0 {
		return nil, domain.ErrNotFound
	}
	model := savedItemDomainToModel(item)

	updates := map[string]any{"name": model.Name}
	if item.Origin != domain.SavedItemOriginLink {
		updates["payload"] = model.Payload
	}

	result := r.db.WithContext(ctx).
		Model(model).
		Clauses(clause.Returning{}).
		Where("user_id = ? AND deleted_at IS NULL", actorUserID).
		Updates(updates)
	if result.Error != nil {
		return nil, mapSavedItemWriteError("failed to update saved item", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}
	return savedItemModelToDomain(model), nil
}

// SetPrivacy changes the privacy of a live row owned by actorUserID.
func (r *GormSavedItemRepository) SetPrivacy(ctx context.Context, id int, privacy domain.Privacy, actorUserID int) (*domain.SavedItem, error) {
	if actorUserID <= 0 || id <= 0 {
		return nil, domain.ErrNotFound
	}
	model := &SavedItemModel{ID: id}

	result := r.db.WithContext(ctx).
		Model(model).
		Clauses(clause.Returning{}).
		Where("user_id = ? AND deleted_at IS NULL", actorUserID).
		Updates(map[string]any{"privacy": privacyToDBValue(privacy)})
	if result.Error != nil {
		return nil, mapSavedItemWriteError("failed to set saved item privacy", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, domain.ErrNotFound
	}
	return savedItemModelToDomain(model), nil
}

// Delete soft-deletes a live row owned by actorUserID. The trigger sets updated_at.
func (r *GormSavedItemRepository) Delete(ctx context.Context, id int, actorUserID int) error {
	if actorUserID <= 0 {
		return domain.ErrNotFound
	}
	result := r.db.WithContext(ctx).
		Model(&SavedItemModel{}).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, actorUserID).
		Update("deleted_at", gorm.Expr("NOW()"))
	if result.Error != nil {
		return fmt.Errorf("failed to delete saved item: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Restore clears deleted_at on a deleted row owned by actorUserID.
func (r *GormSavedItemRepository) Restore(ctx context.Context, id int, actorUserID int) error {
	if actorUserID <= 0 {
		return domain.ErrNotFound
	}
	result := r.db.WithContext(ctx).
		Model(&SavedItemModel{}).
		Where("id = ? AND user_id = ? AND deleted_at IS NOT NULL", id, actorUserID).
		Update("deleted_at", nil)
	if result.Error != nil {
		return mapSavedItemWriteError("failed to restore saved item", result.Error)
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// convertLinkToCopySQL makes the link a copy in one statement. The source's
// payload and version are copied in the same UPDATE, and the source must be live
// and public at the moment of the write.
const convertLinkToCopySQL = `UPDATE user_saved_items AS s
SET origin = 'copy', payload = src.payload, payload_version = src.payload_version
FROM user_saved_items AS src
WHERE src.id = s.source_id
  AND src.deleted_at IS NULL
  AND src.privacy = 'public'
  AND s.id = ? AND s.user_id = ? AND s.origin = 'link' AND s.deleted_at IS NULL
RETURNING s.*`

// ConvertLinkToCopy turns a live LINK owned by actorUserID into a COPY, taking the
// source's payload, in one statement. A zero-row result is domain.ErrNotFound.
func (r *GormSavedItemRepository) ConvertLinkToCopy(ctx context.Context, id int, actorUserID int) (*domain.SavedItem, error) {
	if actorUserID <= 0 {
		return nil, domain.ErrNotFound
	}
	var models []SavedItemModel
	if err := r.db.WithContext(ctx).Raw(convertLinkToCopySQL, id, actorUserID).Scan(&models).Error; err != nil {
		return nil, mapSavedItemWriteError("failed to convert saved item link", err)
	}
	if len(models) == 0 {
		return nil, domain.ErrNotFound
	}
	return savedItemModelToDomain(&models[0]), nil
}

// ReassignByUser moves every saved item from fromUserID to toUserID in one
// statement. Each name gets a " (#<id>)" suffix, so the move can't collide with a
// name the target user already holds. left(name, 80) keeps the result within
// varchar(100). Each item is made private and soft-deleted, unless it already
// was deleted.
func (r *GormSavedItemRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	err := r.db.WithContext(ctx).
		Model(&SavedItemModel{}).
		Where("user_id = ?", fromUserID).
		Updates(map[string]any{
			"user_id":    toUserID,
			"name":       gorm.Expr("left(name, 80) || ' (#' || id || ')'"),
			"privacy":    privacyToDBValue(domain.PrivacyPrivate),
			"deleted_at": gorm.Expr("COALESCE(deleted_at, NOW())"),
		}).Error
	if err != nil {
		return fmt.Errorf("failed to reassign saved items: %w", err)
	}
	return nil
}

// mapSavedItemWriteError turns constraint violations on user_saved_items into
// domain errors. Any other error is wrapped with op.
//   - the live-name unique index -> ErrAlreadyExists
//   - a foreign key or check violation -> ErrInvalidInput
func mapSavedItemWriteError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgUniqueViolation:
			if pgErr.ConstraintName == savedItemNameUniqueIndex {
				return fmt.Errorf("%w: a saved item with this name already exists", domain.ErrAlreadyExists)
			}
		case pgForeignKeyViolation:
			return fmt.Errorf("%w: referenced user or source not found", domain.ErrInvalidInput)
		case pgCheckViolation:
			return fmt.Errorf("%w: saved item violates a rule of its type, origin or privacy", domain.ErrInvalidInput)
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}

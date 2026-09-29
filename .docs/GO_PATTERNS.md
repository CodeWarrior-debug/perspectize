# Go Patterns

Error handling and DB query patterns, taken from the current code. The ORM is
**GORM + pgx** (see `backend/CLAUDE.md` → ORM); there is no sqlx.

## Error Handling

```go
// Domain errors (core/domain/errors.go): sentinels, matched with errors.Is
var (
    ErrNotFound  = errors.New("resource not found")
    ErrForbidden = errors.New("access denied")
    // ...
)

// Repositories translate GORM errors to domain sentinels and wrap the rest
// (postgres/gorm_category_repository.go)
func (r *GormCategoryRepository) GetByID(ctx context.Context, id int) (*domain.Category, error) {
    var model CategoryModel
    err := r.db.WithContext(ctx).First(&model, id).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, domain.ErrNotFound
        }
        return nil, fmt.Errorf("failed to get category by id: %w", err)
    }
    return categoryModelToDomain(&model), nil
}

// Resolvers map sentinels to client-facing messages; log and hide the rest
// (resolvers/perspective.resolvers.go)
perspective, err := r.PerspectiveService.Update(ctx, modelToUpdatePerspectiveInput(input))
if err != nil {
    if errors.Is(err, domain.ErrNotFound) {
        return nil, fmt.Errorf("perspective not found")
    }
    if errors.Is(err, domain.ErrInvalidInput) {
        return nil, fmt.Errorf("invalid input: %w", err)
    }
    slog.Error("updating perspective failed", "error", err)
    return nil, fmt.Errorf("failed to update perspective: %v", err)
}
```

## Database Queries

```go
// Always scope to the request context; GORM structs stay in the adapter and
// are mapped to domain models before returning (gorm_mappers.go)
var models []CategoryModel
if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&models).Error; err != nil {
    return nil, fmt.Errorf("failed to get categories by ids: %w", err)
}

// Writes that must hit a row: RowsAffected == 0 means not found (or not owned)
// (gorm_perspective_repository.go Delete)
result := r.db.WithContext(ctx).Where("user_id = ?", ownerUserID).Delete(&PerspectiveModel{}, id)
if result.Error != nil {
    return fmt.Errorf("failed to delete perspective: %w", result.Error)
}
if result.RowsAffected == 0 {
    return domain.ErrNotFound
}

// Multi-step writes: Transaction commits on nil, rolls back on any error
// (gorm_thread_repository.go CreateThread)
err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
    if err := tx.Create(thread).Error; err != nil {
        return fmt.Errorf("failed to create thread: %w", err)
    }
    // ... more tx.* calls; use tx, never r.db, inside the closure
    return nil
})
```

Pagination with `gorm-cursor-paginator`: check both the returned `err` **and**
`pageResult.Error` (see `backend/CLAUDE.md` → ORM, issue #327).

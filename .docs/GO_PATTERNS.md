# Go Patterns

## Error Handling

```go
// Domain errors (core/domain/errors.go)
var ErrNotFound = errors.New("resource not found")

// Services return domain errors
func (s *Service) GetById(id int) (*Model, error) {
    result, err := s.repo.FindById(id)
    if err != nil {
        return nil, fmt.Errorf("failed to get resource: %w", err)
    }
    return result, nil
}

// Resolvers translate to GraphQL errors
func (r *Resolver) GetById(ctx context.Context, id int) (*Model, error) {
    result, err := r.service.GetById(id)
    if errors.Is(err, domain.ErrNotFound) {
        return nil, fmt.Errorf("resource not found")
    }
    return result, err
}
```

## Database Queries

```go
// Use sqlx for queries
var content Content
err := db.Get(&content, "SELECT * FROM content WHERE id = $1", id)

// Use transactions for multi-step operations
tx, err := db.Beginx()
defer tx.Rollback() // Safe to call after commit

// ... perform operations
if err := tx.Commit(); err != nil {
    return err
}
```

package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"gorm.io/gorm"
)

// GormBibleReferenceRepository reads the seeded bible_book table. The table is
// static reference data, so the 66 rows are loaded once and cached.
type GormBibleReferenceRepository struct {
	db *gorm.DB

	mu    sync.Mutex
	books []domain.BibleBook
}

var _ repositories.BibleReferenceRepository = (*GormBibleReferenceRepository)(nil)

// NewGormBibleReferenceRepository creates a new GORM bible reference repository
func NewGormBibleReferenceRepository(db *gorm.DB) *GormBibleReferenceRepository {
	return &GormBibleReferenceRepository{db: db}
}

type bibleBookRow struct {
	ID               int             `gorm:"column:id"`
	Name             string          `gorm:"column:name"`
	VersesPerChapter json.RawMessage `gorm:"column:verses_per_chapter;type:jsonb"`
}

// ListBooks returns all books ordered by id. An empty table (seeder not yet
// run) is an error rather than an empty result, so callers fail loudly instead
// of reporting every passage as out of range.
func (r *GormBibleReferenceRepository) ListBooks(ctx context.Context) ([]domain.BibleBook, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.books != nil {
		return r.books, nil
	}

	var rows []bibleBookRow
	if err := r.db.WithContext(ctx).Table("bible_book").
		Select("id", "name", "verses_per_chapter").Order("id").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to load bible books: %w", err)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("bible_book is empty — run `go run ./cmd/seed-bible`")
	}

	books := make([]domain.BibleBook, len(rows))
	for i, row := range rows {
		var vpc []int
		if err := json.Unmarshal(row.VersesPerChapter, &vpc); err != nil {
			return nil, fmt.Errorf("failed to parse verses_per_chapter for book %d: %w", row.ID, err)
		}
		books[i] = domain.BibleBook{ID: row.ID, Name: row.Name, VersesPerChapter: vpc}
	}
	r.books = books
	return books, nil
}

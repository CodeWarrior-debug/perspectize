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

// GetVerseTexts reads bible_verse_text for an inclusive ordinal range.
func (r *GormBibleReferenceRepository) GetVerseTexts(ctx context.Context, translation string, startID, endID int) ([]domain.BibleVerseText, error) {
	var rows []struct {
		VerseID int    `gorm:"column:verse_id"`
		Text    string `gorm:"column:text"`
	}
	err := r.db.WithContext(ctx).Table("bible_verse_text").
		Select("verse_id", "text").
		Where("translation = ? AND verse_id BETWEEN ? AND ?", translation, startID, endID).
		Order("verse_id").Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to load verse text: %w", err)
	}
	out := make([]domain.BibleVerseText, len(rows))
	for i, row := range rows {
		out[i] = domain.BibleVerseText{VerseID: row.VerseID, Text: row.Text}
	}
	return out, nil
}

// GetInterlinearWords reads bible_word for an inclusive ordinal range, joined with
// bible_lexicon for the gloss. The primary key (verse_id, bsb_sort) serves the range.
func (r *GormBibleReferenceRepository) GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error) {
	var rows []struct {
		VerseID       int    `gorm:"column:verse_id"`
		BSBSort       int    `gorm:"column:bsb_sort"`
		Language      string `gorm:"column:language"`
		SourceSort    *int   `gorm:"column:source_sort"`
		Source        string `gorm:"column:source"`
		Translit      string `gorm:"column:translit"`
		ParseShort    string `gorm:"column:parse_short"`
		ParseFull     string `gorm:"column:parse_full"`
		OrigStrongs   *int   `gorm:"column:orig_strongs"`
		Strongs       string `gorm:"column:strongs"`
		StrongsSource string `gorm:"column:strongs_source"`
		SpanHead      *int   `gorm:"column:span_head"`
		ChunkText     string `gorm:"column:chunk_text"`
		SpaceBefore   bool   `gorm:"column:space_before"`
		Gloss         string `gorm:"column:gloss"`
	}
	err := r.db.WithContext(ctx).
		Table("bible_word AS w").
		Select("w.verse_id", "w.bsb_sort", "w.language", "w.source_sort", "w.source", "w.translit", "w.parse_short",
			"w.parse_full", "w.orig_strongs", "w.strongs", "w.strongs_source", "w.span_head", "w.chunk_text",
			"w.space_before", "COALESCE(l.gloss, '') AS gloss").
		Joins("LEFT JOIN bible_lexicon AS l ON l.tag = w.strongs").
		Where("w.verse_id BETWEEN ? AND ?", startID, endID).
		Order("w.verse_id, w.bsb_sort").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to load interlinear words: %w", err)
	}
	out := make([]domain.InterlinearWordRow, len(rows))
	for i, x := range rows {
		out[i] = domain.InterlinearWordRow{
			VerseID: x.VerseID, BSBSort: x.BSBSort, Language: x.Language, SourceSort: x.SourceSort, Source: x.Source,
			Translit: x.Translit, ParseShort: x.ParseShort, ParseFull: x.ParseFull, OrigStrongs: x.OrigStrongs,
			Strongs: x.Strongs, StrongsSource: x.StrongsSource, SpanHead: x.SpanHead, ChunkText: x.ChunkText,
			SpaceBefore: x.SpaceBefore, Gloss: x.Gloss,
		}
	}
	return out, nil
}

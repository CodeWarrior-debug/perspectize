package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// BibleReferenceRepository exposes the static bible_book reference data.
// Verse ordinals are computed from it (domain.BibleVerseOrdinal); there is no
// per-verse table to query.
type BibleReferenceRepository interface {
	// ListBooks returns every book with its per-chapter verse counts.
	// The data is static, so implementations may cache it for the process lifetime.
	ListBooks(ctx context.Context) ([]domain.BibleBook, error)
	// GetVerseTexts returns the stored text of a translation for verse ordinals
	// startID..endID inclusive, ordered by ordinal. Missing verses are simply absent.
	GetVerseTexts(ctx context.Context, translation string, startID, endID int) ([]domain.BibleVerseText, error)
}

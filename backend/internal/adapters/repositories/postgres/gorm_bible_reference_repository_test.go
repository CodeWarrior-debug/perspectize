package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGormBibleReferenceRepository_ListBooks(t *testing.T) {
	ctx := context.Background()

	t.Run("parses verses_per_chapter and caches after first load", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT .* FROM "bible_book"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "verses_per_chapter"}).
				AddRow(1, "Genesis", []byte(`[31,25]`)).
				AddRow(2, "Exodus", []byte(`[22]`)))

		repo := NewGormBibleReferenceRepository(db)
		books, err := repo.ListBooks(ctx)
		require.NoError(t, err)
		require.Len(t, books, 2)
		assert.Equal(t, "Genesis", books[0].Name)
		assert.Equal(t, []int{31, 25}, books[0].VersesPerChapter)

		// Second call must not hit the DB (no further expectations queued).
		again, err := repo.ListBooks(ctx)
		require.NoError(t, err)
		assert.Equal(t, books, again)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty table is an error, not an empty result", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT .* FROM "bible_book"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "verses_per_chapter"}))

		_, err := NewGormBibleReferenceRepository(db).ListBooks(ctx)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "seed-bible")
	})

	t.Run("wraps query errors and does not cache failure", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT .* FROM "bible_book"`).WillReturnError(errors.New("boom"))
		mock.ExpectQuery(`SELECT .* FROM "bible_book"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "verses_per_chapter"}).AddRow(1, "Genesis", []byte(`[31]`)))

		repo := NewGormBibleReferenceRepository(db)
		_, err := repo.ListBooks(ctx)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to load bible books")

		books, err := repo.ListBooks(ctx)
		require.NoError(t, err)
		assert.Len(t, books, 1)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormBibleReferenceRepository_GetVerseTexts(t *testing.T) {
	ctx := context.Background()

	t.Run("maps rows in ordinal order", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT .* FROM "bible_verse_text" WHERE translation = \$1 AND verse_id BETWEEN \$2 AND \$3`).
			WithArgs("BSB", 1, 2).
			WillReturnRows(sqlmock.NewRows([]string{"verse_id", "text"}).AddRow(1, "In the beginning").AddRow(2, ""))

		got, err := NewGormBibleReferenceRepository(db).GetVerseTexts(ctx, "BSB", 1, 2)
		require.NoError(t, err)
		require.Len(t, got, 2)
		assert.Equal(t, 1, got[0].VerseID)
		assert.Equal(t, "In the beginning", got[0].Text)
		assert.Equal(t, "", got[1].Text)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps query errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT .* FROM "bible_verse_text"`).WillReturnError(errors.New("boom"))

		_, err := NewGormBibleReferenceRepository(db).GetVerseTexts(ctx, "BSB", 1, 2)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to load verse text")
	})
}

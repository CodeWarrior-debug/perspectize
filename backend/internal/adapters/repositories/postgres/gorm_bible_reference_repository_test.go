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

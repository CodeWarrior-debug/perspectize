package postgres

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

const setGenreRe = `UPDATE content SET genre_id = \$1, updated_at = NOW\(\) WHERE id = \$2 AND content_type = 'audio_track' ` +
	`AND \(genre_id IS NULL OR \(added_by_user_id = \$3 AND created_at > NOW\(\) - make_interval\(days => \$4\)\)\) RETURNING \*`

func TestMusicGenreList_OneQuery(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "music_genres" ORDER BY id`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "apple_name", "parent_id"}).
			AddRow(19, "Regional & Cultural", "Worldwide", nil).AddRow(1188, "Polka", "Polka", 19))

	c := querycount.Attach(t, db)
	got, err := NewGormMusicGenreRepository(db).List(context.Background())
	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, "Worldwide", got[0].AppleName)
	assert.Equal(t, 19, *got[1].ParentID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestSetContentGenre_SuccessIsOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(setGenreRe).WithArgs(21, 5, 7, 30).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type", "genre_id"}).AddRow(5, "Song", "audio_track", 21))

	c := querycount.Attach(t, db)
	got, err := NewGormMusicGenreRepository(db).SetContentGenre(context.Background(), 5, 21, 7, 30)
	require.NoError(t, err)
	require.NotNil(t, got.GenreID)
	assert.Equal(t, 21, *got.GenreID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestSetContentGenre_LockedReturnsErrGenreLocked(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(setGenreRe).WithArgs(21, 5, 8, 30).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT id FROM content WHERE id = \$1 AND content_type = 'audio_track'`).WithArgs(5).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(5))

	c := querycount.Attach(t, db)
	_, err := NewGormMusicGenreRepository(db).SetContentGenre(context.Background(), 5, 21, 8, 30)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)
	c.AssertExactly(t, 2) // the read only happens on the miss path
	assertAllExpectationsMet(t, mock)
}

func TestSetContentGenre_MissingOrNotATrackIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(setGenreRe).WithArgs(21, 99, 7, 30).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT id FROM content WHERE id = \$1 AND content_type = 'audio_track'`).WithArgs(99).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := NewGormMusicGenreRepository(db).SetContentGenre(context.Background(), 99, 21, 7, 30)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assertAllExpectationsMet(t, mock)
}

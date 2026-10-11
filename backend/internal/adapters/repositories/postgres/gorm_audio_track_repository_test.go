package postgres

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

func spotifyLink() domain.TrackLink {
	return domain.TrackLink{Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC",
		URL: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", Kind: domain.TrackLinkKindListen, Source: domain.TrackLinkSourcePasted}
}

func newTrack() *domain.Content {
	u := "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
	g := 21
	return &domain.Content{Name: "Never Gonna Give You Up", URL: &u, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: 7,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Rick Astley"}}`), GenreID: &g}
}

func TestCreateWithLink_IsOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`WITH new_content AS \(\s*INSERT INTO content .* ON CONFLICT \(url\) DO NOTHING RETURNING \* \), new_link AS \(\s*INSERT INTO track_links .* ON CONFLICT \(provider, provider_track_id\) DO NOTHING RETURNING id \) SELECT \* FROM new_content`).
		WithArgs("Never Gonna Give You Up", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", 7, nil, nil,
			`{"music":{"provider":"spotify","artist":"Rick Astley"}}`, 21,
			"spotify", "4uLU6hMCjMI75M1A2tKUQC", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "listen", "pasted").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type", "genre_id"}).AddRow(40, "Never Gonna Give You Up", "audio_track", 21))

	c := querycount.Attach(t, db)
	got, existed, err := NewGormAudioTrackRepository(db).CreateWithLink(context.Background(), newTrack(), spotifyLink())
	require.NoError(t, err)
	assert.False(t, existed)
	assert.Equal(t, 40, got.ID)
	assert.Equal(t, domain.ContentTypeAudioTrack, got.ContentType)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestCreateWithLink_URLConflictReadsExisting(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`WITH new_content AS`).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT \* FROM "content" WHERE url = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type"}).AddRow(12, "Old", "audio_track"))

	c := querycount.Attach(t, db)
	got, existed, err := NewGormAudioTrackRepository(db).CreateWithLink(context.Background(), newTrack(), spotifyLink())
	require.NoError(t, err)
	assert.True(t, existed)
	assert.Equal(t, 12, got.ID)
	c.AssertExactly(t, 2)
	assertAllExpectationsMet(t, mock)
}

func TestAddLink_ConflictReportsNotAdded(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`INSERT INTO track_links \(content_id, provider, provider_track_id, url, kind, source\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6\) ON CONFLICT \(provider, provider_track_id\) DO NOTHING RETURNING id`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	l := spotifyLink()
	l.ContentID = 40
	added, err := NewGormAudioTrackRepository(db).AddLink(context.Background(), l)
	require.NoError(t, err)
	assert.False(t, added)
	assertAllExpectationsMet(t, mock)
}

func TestGetByLink_OneJoinQuery(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT content\.\* FROM content JOIN track_links tl ON tl\.content_id = content\.id WHERE tl\.provider = \$1 AND tl\.provider_track_id = \$2 LIMIT 1`).
		WithArgs("spotify", "4uLU6hMCjMI75M1A2tKUQC").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "content_type"}).AddRow(40, "Song", "audio_track"))

	c := querycount.Attach(t, db)
	got, err := NewGormAudioTrackRepository(db).GetByLink(context.Background(), domain.ProviderSpotify, "4uLU6hMCjMI75M1A2tKUQC")
	require.NoError(t, err)
	assert.Equal(t, 40, got.ID)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestGetByLink_MissIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`FROM content JOIN track_links`).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	_, err := NewGormAudioTrackRepository(db).GetByLink(context.Background(), domain.ProviderSpotify, "x")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestFindSameSongCandidates_TitleArtistAndNoUploads(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`content_type = \$1 AND lower\(name\) = lower\(\$2\) AND lower\(response->'music'->>'artist'\) = lower\(\$3\) AND COALESCE\(response->'music'->>'videoType', ''\) <> 'other' ORDER BY id LIMIT \$4`).
		WithArgs("audio_track", "Song", "Queen", 5).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(3))
	got, err := NewGormAudioTrackRepository(db).FindSameSongCandidates(context.Background(), "Song", "Queen", 5)
	require.NoError(t, err)
	assert.Len(t, got, 1)
	assertAllExpectationsMet(t, mock)
}

func TestLinksByContentIDs_OneQueryAnyBatchAndZeroForEmpty(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "track_links" WHERE content_id = ANY\(CAST\(\$1 AS bigint\[\]\)\) ORDER BY content_id, id`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "content_id", "provider", "provider_track_id", "url", "kind", "source"}).
			AddRow(1, 1, "youtube", "abc", "https://music.youtube.com/watch?v=abc", "embed", "pasted").
			AddRow(2, 1, "spotify", "def", "https://open.spotify.com/track/def", "listen", "pasted"))

	repo := NewGormAudioTrackRepository(db)
	c := querycount.Attach(t, db)
	got, err := repo.LinksByContentIDs(context.Background(), seqIDs(50))
	require.NoError(t, err)
	require.Len(t, got[1], 2)
	assert.Equal(t, domain.TrackLinkKindEmbed, got[1][0].Kind)
	assert.Equal(t, domain.TrackLinkSourcePasted, got[1][1].Source)
	c.AssertExactly(t, 1)

	empty, err := repo.LinksByContentIDs(context.Background(), nil)
	require.NoError(t, err)
	assert.Empty(t, empty)
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestContentByURLs_OneQueryKeyedByURL(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "content" WHERE url IN \(\$1,\$2\)`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "url", "content_type"}).AddRow(5, "https://www.youtube.com/watch?v=a", "youtube_video"))
	c := querycount.Attach(t, db)
	got, err := NewGormAudioTrackRepository(db).ContentByURLs(context.Background(), []string{"https://www.youtube.com/watch?v=a", "https://www.youtube.com/watch?v=b"})
	require.NoError(t, err)
	assert.Equal(t, 5, got["https://www.youtube.com/watch?v=a"].ID)
	assert.NotContains(t, got, "https://www.youtube.com/watch?v=b")
	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestMarkLinkUnavailable_EmbedOnlyOneStatement(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`UPDATE track_links SET unavailable_at = COALESCE\(unavailable_at, NOW\(\)\) WHERE id = \$1 AND kind = 'embed' RETURNING \*`).
		WithArgs(9).WillReturnRows(sqlmock.NewRows([]string{"id", "content_id", "provider", "kind", "unavailable_at"}).AddRow(9, 1, "youtube", "embed", time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)))
	mock.ExpectQuery(`UPDATE track_links`).WithArgs(10).WillReturnRows(sqlmock.NewRows([]string{"id"}))

	repo := NewGormAudioTrackRepository(db)
	got, err := repo.MarkLinkUnavailable(context.Background(), 9)
	require.NoError(t, err)
	assert.NotNil(t, got.UnavailableAt)
	_, err = repo.MarkLinkUnavailable(context.Background(), 10)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assertAllExpectationsMet(t, mock)
}

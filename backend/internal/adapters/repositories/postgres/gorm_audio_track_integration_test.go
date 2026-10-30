package postgres

// Real-Postgres checks for the AUDIO_TRACK SQL that sqlmock cannot judge: the
// CTE insert, the conflict paths, and the genre window. Runs only against a
// local database named testdb (see openLocalUserTodoTestDB). Task 18 runs it:
//
//	DATABASE_URL="postgres://demo:demo@127.0.0.1:5434/testdb?sslmode=disable" \
//	  go test -p 1 ./internal/adapters/repositories/postgres/ -run AudioTrackIntegration -v

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestAudioTrackIntegration(t *testing.T) {
	db := openLocalUserTodoTestDB(t)
	ctx := context.Background()
	users := NewGormUserRepository(db)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	adder, err := users.CreateFromClerk(ctx, "at-a-"+suffix[len(suffix)-12:], "at-a-"+suffix[len(suffix)-12:], "")
	require.NoError(t, err)
	other, err := users.CreateFromClerk(ctx, "at-o-"+suffix[len(suffix)-12:], "at-o-"+suffix[len(suffix)-12:], "")
	require.NoError(t, err)
	var contentIDs []int
	t.Cleanup(func() {
		_ = db.Exec("DELETE FROM content WHERE id IN ?", append(contentIDs, 0)).Error
		_ = db.Exec("DELETE FROM users WHERE id IN ?", []int{adder.ID, other.ID}).Error
	})

	audio := NewGormAudioTrackRepository(db)
	genres := NewGormMusicGenreRepository(db)

	url := "https://open.spotify.com/track/it" + suffix
	c := &domain.Content{Name: "Integration Song", URL: &url, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: adder.ID,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Tester"}}`)}
	link := domain.TrackLink{Provider: domain.ProviderSpotify, ProviderTrackID: "it" + suffix, URL: url, Kind: domain.TrackLinkKindListen, Source: domain.TrackLinkSourcePasted}

	created, existed, err := audio.CreateWithLink(ctx, c, link)
	require.NoError(t, err)
	assert.False(t, existed)
	contentIDs = append(contentIDs, created.ID)

	again, existed, err := audio.CreateWithLink(ctx, c, link)
	require.NoError(t, err)
	assert.True(t, existed)
	assert.Equal(t, created.ID, again.ID)

	links, err := audio.LinksByContentIDs(ctx, []int{created.ID})
	require.NoError(t, err)
	require.Len(t, links[created.ID], 1, "the CTE inserted exactly one link")

	byLink, err := audio.GetByLink(ctx, domain.ProviderSpotify, "it"+suffix)
	require.NoError(t, err)
	assert.Equal(t, created.ID, byLink.ID)

	cands, err := audio.FindSameSongCandidates(ctx, "integration song", "TESTER", 5)
	require.NoError(t, err)
	require.NotEmpty(t, cands)

	// Genre: anyone may set it while empty; then only the adder, inside 30 days.
	_, err = genres.SetContentGenre(ctx, created.ID, 21, other.ID, domain.GenreChangeWindowDays)
	require.NoError(t, err)
	_, err = genres.SetContentGenre(ctx, created.ID, 14, other.ID, domain.GenreChangeWindowDays)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)
	got, err := genres.SetContentGenre(ctx, created.ID, 14, adder.ID, domain.GenreChangeWindowDays)
	require.NoError(t, err)
	assert.Equal(t, 14, *got.GenreID)
	require.NoError(t, db.Exec("UPDATE content SET created_at = NOW() - INTERVAL '31 days' WHERE id = ?", created.ID).Error)
	_, err = genres.SetContentGenre(ctx, created.ID, 21, adder.ID, domain.GenreChangeWindowDays)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)

	// Only EMBED links can be marked unavailable.
	_, err = audio.MarkLinkUnavailable(ctx, links[created.ID][0].ID)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// ON DELETE SET NULL is not exercised: genres are never deleted at runtime.
	all, err := genres.List(ctx)
	require.NoError(t, err)
	assert.Len(t, all, 523)
}

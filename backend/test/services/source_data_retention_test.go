package services_test

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSourceDataRetention_PurgeRefusesNonAdmins(t *testing.T) {
	s := services.NewSourceDataRetention(nil) // never reaches the database
	for _, actor := range []*domain.AuthenticatedUser{nil, {ID: 1, Role: domain.UserRoleDefault}} {
		_, err := s.Purge(context.Background(), actor, domain.SourceDataTargetYouTubeStatistics, 30)
		assert.ErrorIs(t, err, domain.ErrForbidden)
	}
}

func TestSourceDataRetention_PurgeValidatesArguments(t *testing.T) {
	s := services.NewSourceDataRetention(nil)
	admin := &domain.AuthenticatedUser{ID: 1, Role: domain.UserRoleAdmin}
	_, err := s.Purge(context.Background(), admin, domain.SourceDataTarget("NOPE"), 30)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	for _, days := range []int{0, -3} {
		_, err = s.Purge(context.Background(), admin, domain.SourceDataTargetYouTubeStatistics, days)
		assert.ErrorIs(t, err, domain.ErrInvalidInput, "days=%d", days)
	}
}

// Runs the real clearing SQL in a private schema holding a minimal content
// table, so it never touches real rows. Skips without DATABASE_URL.
func TestSourceDataRetention_PurgeClearsOnlyOldYouTubeCounts(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("Skipping - PostgreSQL not available")
	}
	schema := fmt.Sprintf("sdr_test_%d", time.Now().UnixNano())
	admin, err := database.ConnectGORM(dsn, database.DefaultPoolConfig())
	if err != nil {
		t.Skip("Skipping - PostgreSQL not available")
	}
	require.NoError(t, admin.Exec("CREATE SCHEMA "+schema).Error)
	t.Cleanup(func() { admin.Exec("DROP SCHEMA " + schema + " CASCADE") })

	u, err := url.Parse(dsn)
	require.NoError(t, err)
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := database.ConnectGORM(u.String(), database.DefaultPoolConfig())
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE content (
		id serial PRIMARY KEY, content_type text NOT NULL, response jsonb,
		created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`).Error)

	now := time.Now().UTC()
	stats := `"statistics":{"viewCount":"9","likeCount":"3"}`
	// fetchedDaysAgo < 0 stores no fetch stamp at all.
	row := func(ct string, fetchedDaysAgo, createdDaysAgo int, withStats bool) int {
		s := ""
		if withStats {
			s = "," + stats
		}
		resp := fmt.Sprintf(`{"items":[{"snippet":{"title":"x"}%s}],"perspectizeFetchedAt":"%s"}`,
			s, now.AddDate(0, 0, -fetchedDaysAgo).Format(time.RFC3339))
		if fetchedDaysAgo < 0 {
			resp = fmt.Sprintf(`{"items":[{"snippet":{"title":"x"}%s}]}`, s)
		}
		var id int
		require.NoError(t, db.Raw(`INSERT INTO content (content_type, response, created_at, updated_at)
			VALUES (?, ?::jsonb, ?, ?) RETURNING id`, ct, resp, now.AddDate(0, 0, -createdDaysAgo), now.AddDate(0, 0, -1)).Scan(&id).Error)
		return id
	}
	old := row("YOUTUBE_VIDEO", 40, 100, true)
	fresh := row("YOUTUBE_VIDEO", 5, 100, true)         // old row, recently refreshed
	unstampedOld := row("YOUTUBE_VIDEO", -1, 100, true) // ages from created_at
	unstampedNew := row("YOUTUBE_VIDEO", -1, 3, true)
	movie := row("MOVIE", 40, 100, true)
	cleared := row("YOUTUBE_VIDEO", 40, 100, false)

	svc := services.NewSourceDataRetention(db)
	adminUser := &domain.AuthenticatedUser{ID: 1, Role: domain.UserRoleAdmin}
	n, err := svc.Purge(context.Background(), adminUser, domain.SourceDataTargetYouTubeStatistics, 30)
	require.NoError(t, err)
	assert.EqualValues(t, 2, n, "the stale stamped row and the stale unstamped row")

	hasStats := func(id int) bool {
		var ok bool
		require.NoError(t, db.Raw(`SELECT response #> '{items,0,statistics}' IS NOT NULL FROM content WHERE id = ?`, id).Scan(&ok).Error)
		return ok
	}
	assert.False(t, hasStats(old))
	assert.True(t, hasStats(fresh))
	assert.False(t, hasStats(unstampedOld))
	assert.True(t, hasStats(unstampedNew))
	assert.True(t, hasStats(movie), "other content types are untouched")
	assert.False(t, hasStats(cleared))

	var title string
	require.NoError(t, db.Raw(`SELECT response->'items'->0->'snippet'->>'title' FROM content WHERE id = ?`, old).Scan(&title).Error)
	assert.Equal(t, "x", title, "only the counts go; the rest of the response stays")

	var updated time.Time
	require.NoError(t, db.Raw(`SELECT updated_at FROM content WHERE id = ?`, old).Scan(&updated).Error)
	assert.WithinDuration(t, now.AddDate(0, 0, -1), updated, time.Minute, "a clear is not a refresh")

	again, err := svc.Purge(context.Background(), adminUser, domain.SourceDataTargetYouTubeStatistics, 30)
	require.NoError(t, err)
	assert.EqualValues(t, 0, again, "running it twice changes nothing")
}

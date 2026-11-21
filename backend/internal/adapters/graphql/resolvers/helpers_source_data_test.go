package resolvers

import (
	"fmt"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ytContent(ct domain.ContentType, stats string, fetched time.Time, created time.Time) *domain.Content {
	stamp := ""
	if !fetched.IsZero() {
		stamp = fmt.Sprintf(`,"perspectizeFetchedAt":"%s"`, fetched.UTC().Format(time.RFC3339))
	}
	return &domain.Content{
		ID:          1,
		ContentType: ct,
		CreatedAt:   created,
		Response:    []byte(`{"items":[{"snippet":{"channelTitle":"c"}` + stats + `}]` + stamp + `}`),
	}
}

func TestDomainToModel_SourceDataStates(t *testing.T) {
	now := time.Now()
	stats := `,"statistics":{"viewCount":"12","likeCount":"3","commentCount":"1"}`

	t.Run("fresh counts are shown", func(t *testing.T) {
		m := domainToModel(ytContent(domain.ContentTypeYouTubeVideo, stats, now.Add(-24*time.Hour), now.Add(-900*24*time.Hour)))
		assert.False(t, m.SourceDataExpired)
		require.NotNil(t, m.ViewCount)
		assert.Equal(t, 12, *m.ViewCount)
	})

	t.Run("counts past the window read as null and flag expired", func(t *testing.T) {
		m := domainToModel(ytContent(domain.ContentTypeYouTubeVideo, stats, now.Add(-45*24*time.Hour), now.Add(-900*24*time.Hour)))
		assert.True(t, m.SourceDataExpired)
		assert.Nil(t, m.ViewCount)
		assert.Nil(t, m.LikeCount)
		assert.Nil(t, m.CommentCount)
		items := m.Response["items"].([]interface{})
		_, hasStats := items[0].(map[string]interface{})["statistics"]
		assert.False(t, hasStats, "the raw response must not leak the stale numbers either")
		require.NotNil(t, m.ChannelTitle, "the rest of the row stays readable")
	})

	t.Run("cleared counts are null, never zero", func(t *testing.T) {
		m := domainToModel(ytContent(domain.ContentTypeYouTubeVideo, "", now, now.Add(-900*24*time.Hour)))
		assert.True(t, m.SourceDataExpired)
		assert.Nil(t, m.ViewCount)
	})

	t.Run("a row with no stamp ages from created_at", func(t *testing.T) {
		old := domainToModel(ytContent(domain.ContentTypeYouTubeVideo, stats, time.Time{}, now.Add(-60*24*time.Hour)))
		assert.True(t, old.SourceDataExpired)
		recent := domainToModel(ytContent(domain.ContentTypeYouTubeVideo, stats, time.Time{}, now.Add(-2*24*time.Hour)))
		assert.False(t, recent.SourceDataExpired)
		assert.NotNil(t, recent.ViewCount)
	})

	t.Run("other content types are never flagged", func(t *testing.T) {
		m := domainToModel(ytContent(domain.ContentTypeMovie, "", now, now.Add(-900*24*time.Hour)))
		assert.False(t, m.SourceDataExpired)
	})

	t.Run("a shorter window is honoured", func(t *testing.T) {
		orig := domain.SourceDataMaxAge()
		t.Cleanup(func() { domain.SetSourceDataMaxAgeDays(int(orig / (24 * time.Hour))) })
		domain.SetSourceDataMaxAgeDays(7)
		m := domainToModel(ytContent(domain.ContentTypeYouTubeVideo, stats, now.Add(-10*24*time.Hour), now.Add(-900*24*time.Hour)))
		assert.True(t, m.SourceDataExpired)
	})
}

package domain_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const day = 24 * time.Hour

func ytResponse(stats string, fetchedAt string) json.RawMessage {
	body := `{"items":[{"snippet":{"title":"t"}` + stats + `}]`
	if fetchedAt != "" {
		body += `,"perspectizeFetchedAt":"` + fetchedAt + `"`
	}
	return json.RawMessage(body + `}`)
}

func TestYouTubeStatisticsExpired(t *testing.T) {
	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	stats := `,"statistics":{"viewCount":"5"}`
	cases := []struct {
		name      string
		response  json.RawMessage
		createdAt time.Time
		maxAge    time.Duration
		want      bool
	}{
		{"fresh stamp", ytResponse(stats, now.Add(-29*day).Format(time.RFC3339)), now.Add(-400 * day), 30 * day, false},
		{"old stamp", ytResponse(stats, now.Add(-31*day).Format(time.RFC3339)), now.Add(-31 * day), 30 * day, true},
		{"stamp beats old created_at", ytResponse(stats, now.Add(-1*day).Format(time.RFC3339)), now.Add(-400 * day), 30 * day, false},
		{"no stamp, recent created_at", ytResponse(stats, ""), now.Add(-5 * day), 30 * day, false},
		{"no stamp, old created_at", ytResponse(stats, ""), now.Add(-40 * day), 30 * day, true},
		{"no stamp, no created_at: cannot judge", ytResponse(stats, ""), time.Time{}, 30 * day, false},
		{"already cleared", ytResponse("", now.Format(time.RFC3339)), now, 30 * day, true},
		{"statistics null", ytResponse(`,"statistics":null`, now.Format(time.RFC3339)), now, 30 * day, true},
		{"shorter window is honoured", ytResponse(stats, now.Add(-8*day).Format(time.RFC3339)), now, 7 * day, true},
		{"not a video response", json.RawMessage(`{"cast":[]}`), now.Add(-400 * day), 30 * day, false},
		{"unparseable", json.RawMessage(`nope`), now, 30 * day, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, domain.YouTubeStatisticsExpired(tc.response, tc.createdAt, now, tc.maxAge))
		})
	}
}

func TestStampSourceDataFetchedAt(t *testing.T) {
	at := time.Date(2026, 11, 20, 12, 0, 0, 0, time.FixedZone("x", 3600))
	out := domain.StampSourceDataFetchedAt(json.RawMessage(`{"items":[{"a":1}]}`), at)
	var got map[string]any
	require.NoError(t, json.Unmarshal(out, &got))
	assert.Equal(t, "2026-11-20T11:00:00Z", got[domain.SourceDataFetchedAtKey])
	assert.NotNil(t, got["items"], "existing keys survive")

	notObject := json.RawMessage(`[1]`)
	assert.Equal(t, notObject, domain.StampSourceDataFetchedAt(notObject, at))
}

func TestSetSourceDataMaxAgeDays(t *testing.T) {
	orig := domain.SourceDataMaxAge()
	t.Cleanup(func() { domain.SetSourceDataMaxAgeDays(int(orig / day)) })
	domain.SetSourceDataMaxAgeDays(7)
	assert.Equal(t, 7*day, domain.SourceDataMaxAge())
	domain.SetSourceDataMaxAgeDays(0)
	assert.Equal(t, 7*day, domain.SourceDataMaxAge(), "values below 1 are ignored")
}

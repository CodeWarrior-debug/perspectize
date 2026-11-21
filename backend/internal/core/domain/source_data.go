package domain

import (
	"encoding/json"
	"time"
)

// SourceDataFetchedAtKey is the top-level key in a content row's stored
// response holding when the source API was last asked for it (RFC 3339, UTC).
// It lives inside the response JSON so recording it needs no schema change.
const SourceDataFetchedAtKey = "perspectizeFetchedAt"

// DefaultSourceDataMaxAgeDays is how long fetched counts are kept before they
// are hidden and, once a sweep or purge runs, deleted. One variable
// (SOURCE_DATA_MAX_AGE_DAYS) changes it everywhere: the read path, the sweep
// and the "expired" flag the UI shows.
const DefaultSourceDataMaxAgeDays = 30

// SourceDataTarget names a kind of stored source data a purge can clear.
type SourceDataTarget string

const (
	// SourceDataTargetYouTubeStatistics is the view, like and comment counts
	// stored under items[0].statistics of a YouTube video's response.
	SourceDataTargetYouTubeStatistics SourceDataTarget = "YOUTUBE_STATISTICS"
)

// IsValid reports whether the target is one a purge knows how to clear.
func (t SourceDataTarget) IsValid() bool {
	return t == SourceDataTargetYouTubeStatistics
}

// sourceDataMaxAge is the process-wide retention window, set once at startup.
var sourceDataMaxAge = time.Duration(DefaultSourceDataMaxAgeDays) * 24 * time.Hour

// SetSourceDataMaxAgeDays sets the retention window; values below 1 are ignored.
func SetSourceDataMaxAgeDays(days int) {
	if days >= 1 {
		sourceDataMaxAge = time.Duration(days) * 24 * time.Hour
	}
}

// SourceDataMaxAge is the retention window read paths compare against.
func SourceDataMaxAge() time.Duration { return sourceDataMaxAge }

// StampSourceDataFetchedAt returns response with the fetch time recorded under
// SourceDataFetchedAtKey. Input that is not a JSON object is returned unchanged.
func StampSourceDataFetchedAt(response json.RawMessage, at time.Time) json.RawMessage {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(response, &obj); err != nil || obj == nil {
		return response
	}
	stamp, err := json.Marshal(at.UTC().Format(time.RFC3339))
	if err != nil {
		return response
	}
	obj[SourceDataFetchedAtKey] = stamp
	out, err := json.Marshal(obj)
	if err != nil {
		return response
	}
	return out
}

// YouTubeStatisticsExpired reports whether a YouTube row's counts must not be
// shown: they were already cleared (no statistics object), or they were fetched
// more than maxAge before now. A row with no fetch stamp is aged from
// createdAt, which can only over-expire it, never keep stale numbers.
func YouTubeStatisticsExpired(response json.RawMessage, createdAt, now time.Time, maxAge time.Duration) bool {
	var probe struct {
		FetchedAt string `json:"perspectizeFetchedAt"`
		Items     []struct {
			Statistics json.RawMessage `json:"statistics"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response, &probe); err != nil {
		return false
	}
	if len(probe.Items) == 0 {
		return false
	}
	if len(probe.Items[0].Statistics) == 0 || string(probe.Items[0].Statistics) == "null" {
		return true
	}
	fetched := createdAt
	if t, err := time.Parse(time.RFC3339, probe.FetchedAt); err == nil {
		fetched = t
	}
	if fetched.IsZero() {
		return false // no stamp and no creation time: nothing to age it from
	}
	return now.Sub(fetched) > maxAge
}

package domain

import "time"

// RelatedMediaKind classifies an upload related to a content item.
type RelatedMediaKind string

const (
	RelatedMediaKindAudio         RelatedMediaKind = "audio"
	RelatedMediaKindOfficialVideo RelatedMediaKind = "official_video"
	RelatedMediaKindLyricVideo    RelatedMediaKind = "lyric_video"
	RelatedMediaKindLive          RelatedMediaKind = "live"
	RelatedMediaKindOther         RelatedMediaKind = "other"
)

// RelatedMedia is a lightweight reference to another upload of the same work.
// It is never enriched or validated and is not a content row; ContentID is set
// only once a user has promoted it (or it already existed as content).
type RelatedMedia struct {
	Provider    string           `json:"provider"`
	VideoID     string           `json:"videoId"`
	Kind        RelatedMediaKind `json:"kind"`
	Title       string           `json:"title,omitempty"`
	AddedFrom   string           `json:"addedFrom,omitempty"`
	ContentID   *int             `json:"contentId,omitempty"`
	Unavailable bool             `json:"unavailable,omitempty"`
}

// AddRelatedMedia appends ref unless an entry with the same provider and video ID
// already exists. It reports whether the list changed.
func AddRelatedMedia(existing []RelatedMedia, ref RelatedMedia) ([]RelatedMedia, bool) {
	for _, r := range existing {
		if r.Provider == ref.Provider && r.VideoID == ref.VideoID {
			return existing, false
		}
	}
	return append(existing, ref), true
}

// LinkRelatedMedia sets ContentID on the matching entry. It reports whether a match was found.
func LinkRelatedMedia(existing []RelatedMedia, provider, videoID string, contentID int) bool {
	for i := range existing {
		if existing[i].Provider == provider && existing[i].VideoID == videoID {
			id := contentID
			existing[i].ContentID = &id
			return true
		}
	}
	return false
}

// MarkRelatedMediaUnavailable flags the matching entry. It reports whether a match was found.
func MarkRelatedMediaUnavailable(existing []RelatedMedia, provider, videoID string) bool {
	for i := range existing {
		if existing[i].Provider == provider && existing[i].VideoID == videoID {
			existing[i].Unavailable = true
			return true
		}
	}
	return false
}

// LyricsAvailability records whether lyrics exist for a track. Lyrics text is
// never stored — only this result.
type LyricsAvailability struct {
	Available bool      `json:"available"`
	LRCLibID  *int      `json:"lrclibId,omitempty"`
	HasSynced bool      `json:"hasSynced"`
	CheckedAt time.Time `json:"checkedAt"`
}

// LyricsRecheckAfter is how long a negative lyrics check is trusted.
const LyricsRecheckAfter = 30 * 24 * time.Hour

// NeedsRecheck reports whether a stored result should be refreshed. Positive
// results are never re-checked; negative ones are after LyricsRecheckAfter.
func (l *LyricsAvailability) NeedsRecheck(now time.Time) bool {
	if l == nil {
		return true
	}
	return !l.Available && now.Sub(l.CheckedAt) > LyricsRecheckAfter
}

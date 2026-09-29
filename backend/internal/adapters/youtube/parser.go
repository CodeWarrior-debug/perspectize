package youtube

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// NormalizeYouTubeURL returns the canonical watch URL for a YouTube video ID.
// This is the canonical form stored in the database for deduplication.
// Example: "dQw4w9WgXcQ" -> "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
func NormalizeYouTubeURL(videoID string) string {
	return "https://www.youtube.com/watch?v=" + videoID
}

// ExtractVideoID extracts the video ID from various YouTube URL formats.
// Supported: /watch?v=, youtu.be/, /embed/, /v/, /e/, /shorts/, /live/,
// youtube-nocookie.com, music.youtube.com, m.youtube.com
func ExtractVideoID(url string) (string, error) {
	patterns := []string{
		// Standard watch URL (matches www., m., music. subdomains)
		`youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})`,
		// Short URL
		`youtu\.be/([a-zA-Z0-9_-]{11})`,
		// Path-based: /embed/, /v/, /e/, /shorts/, /live/ (including youtube-nocookie.com)
		`(?:youtube\.com|youtube-nocookie\.com)/(?:embed|v|e|shorts|live)/([a-zA-Z0-9_-]{11})`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(url)
		if len(matches) > 1 {
			return matches[1], nil
		}
	}

	return "", fmt.Errorf("could not extract video ID from URL: %s", url)
}

// ParseISO8601Duration converts ISO 8601 duration string to seconds
// Examples: PT1H30M45S -> 5445, PT10M -> 600, PT45S -> 45
func ParseISO8601Duration(duration string) (int, error) {
	if !strings.HasPrefix(duration, "PT") {
		return 0, fmt.Errorf("invalid duration format: %s", duration)
	}

	duration = strings.TrimPrefix(duration, "PT")

	var hours, minutes, seconds int
	var err error

	// Parse hours
	if idx := strings.Index(duration, "H"); idx != -1 {
		hours, err = strconv.Atoi(duration[:idx])
		if err != nil {
			return 0, fmt.Errorf("invalid hours in duration: %w", err)
		}
		duration = duration[idx+1:]
	}

	// Parse minutes
	if idx := strings.Index(duration, "M"); idx != -1 {
		minutes, err = strconv.Atoi(duration[:idx])
		if err != nil {
			return 0, fmt.Errorf("invalid minutes in duration: %w", err)
		}
		duration = duration[idx+1:]
	}

	// Parse seconds
	if idx := strings.Index(duration, "S"); idx != -1 {
		seconds, err = strconv.Atoi(duration[:idx])
		if err != nil {
			return 0, fmt.Errorf("invalid seconds in duration: %w", err)
		}
	}

	return hours*3600 + minutes*60 + seconds, nil
}

// URLKind is what a YouTube-family URL points at.
type URLKind string

const (
	URLKindVideo           URLKind = "video"
	URLKindMusicTrack      URLKind = "musicTrack"
	URLKindMusicCollection URLKind = "musicCollection"
)

// NormalizeYouTubeMusicURL returns the canonical YouTube Music URL for a video ID.
// It differs from NormalizeYouTubeURL on purpose, so a track and the same video
// saved as a YOUTUBE row never collide on UNIQUE(url).
func NormalizeYouTubeMusicURL(videoID string) string {
	return "https://music.youtube.com/watch?v=" + videoID
}

var musicWatchRe = regexp.MustCompile(`^https?://music\.youtube\.com/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})(?:[&#]|$)`)
var musicCollectionRe = regexp.MustCompile(`^https?://music\.youtube\.com/(?:playlist|browse|channel)(?:[/?]|$)`)

// ClassifyURL decides which create flow a URL belongs to. It must run before
// normalization, because NormalizeYouTubeURL discards the music. host.
func ClassifyURL(url string) (URLKind, string, error) {
	if m := musicWatchRe.FindStringSubmatch(url); m != nil {
		return URLKindMusicTrack, m[1], nil
	}
	if musicCollectionRe.MatchString(url) {
		return URLKindMusicCollection, "", nil
	}
	id, err := ExtractVideoID(url)
	if err != nil {
		return "", "", err
	}
	return URLKindVideo, id, nil
}

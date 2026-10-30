// Package musiclinks parses pasted music links into a provider identity. It is
// pure (no network): Spotify, Apple Music and Amazon Music adds are link-only
// (ADR 0002), and YouTube Music identity comes from the existing parser.
package musiclinks

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// Link is the identity of one pasted track link.
type Link struct {
	Provider        domain.TrackProvider
	ProviderTrackID string
	CanonicalURL    string
	Kind            domain.TrackLinkKind
	SuggestedTitle  string
}

var (
	spotifyID   = regexp.MustCompile(`^[A-Za-z0-9]{22}$`)
	appleID     = regexp.MustCompile(`^[0-9]{5,15}$`)
	amazonASIN  = regexp.MustCompile(`^[A-Z0-9]{10}$`)
	spotifyURI  = regexp.MustCompile(`^spotify:track:([A-Za-z0-9]{22})$`)
	countryCode = regexp.MustCompile(`^[a-z]{2}$`)
)

func invalid(reason string) error {
	return fmt.Errorf("%w: %s", domain.ErrInvalidURL, reason)
}

// Parse identifies a pasted track link.
func Parse(raw string) (Link, error) {
	s := strings.TrimSpace(raw)
	if m := spotifyURI.FindStringSubmatch(s); m != nil {
		return spotify(m[1]), nil
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" || (!strings.EqualFold(u.Scheme, "https") && !strings.EqualFold(u.Scheme, "http")) {
		return Link{}, invalid("not a link")
	}
	host := strings.ToLower(u.Hostname())
	parts := strings.FieldsFunc(u.Path, func(r rune) bool { return r == '/' })

	switch {
	case host == "open.spotify.com" || host == "play.spotify.com":
		return parseSpotify(parts)
	case host == "music.apple.com" || host == "geo.music.apple.com":
		return parseApple(parts, u.Query())
	case strings.HasPrefix(host, "music.amazon."):
		return parseAmazon(host, parts, u.Query())
	case host == "music.youtube.com":
		kind, videoID, err := youtube.ClassifyURL(s)
		if err != nil {
			return Link{}, invalid("not a YouTube Music song link")
		}
		if kind == youtube.URLKindMusicCollection {
			return Link{}, domain.ErrNotATrack
		}
		if kind != youtube.URLKindMusicTrack {
			return Link{}, invalid("not a YouTube Music song link")
		}
		return Link{Provider: domain.ProviderYouTube, ProviderTrackID: videoID,
			CanonicalURL: youtube.NormalizeYouTubeMusicURL(videoID), Kind: domain.TrackLinkKindEmbed}, nil
	}
	return Link{}, invalid("unsupported music link")
}

func spotify(id string) Link {
	return Link{Provider: domain.ProviderSpotify, ProviderTrackID: id,
		CanonicalURL: "https://open.spotify.com/track/" + id, Kind: domain.TrackLinkKindListen}
}

func parseSpotify(parts []string) (Link, error) {
	if len(parts) > 0 && strings.HasPrefix(parts[0], "intl-") {
		parts = parts[1:]
	}
	if len(parts) < 2 {
		return Link{}, invalid("not a Spotify track link")
	}
	switch parts[0] {
	case "track":
		if !spotifyID.MatchString(parts[1]) {
			return Link{}, invalid("bad Spotify track id")
		}
		return spotify(parts[1]), nil
	case "album", "playlist", "artist", "show", "episode":
		return Link{}, domain.ErrNotATrack
	}
	return Link{}, invalid("not a Spotify track link")
}

func parseApple(parts []string, q url.Values) (Link, error) {
	if len(parts) < 2 || !countryCode.MatchString(parts[0]) {
		return Link{}, invalid("not an Apple Music link")
	}
	cc, kind, rest := parts[0], parts[1], parts[2:]
	apple := func(id, title string) Link {
		return Link{Provider: domain.ProviderAppleMusic, ProviderTrackID: id,
			CanonicalURL: "https://music.apple.com/" + cc + "/song/" + id, Kind: domain.TrackLinkKindListen, SuggestedTitle: title}
	}
	switch kind {
	case "song":
		switch {
		case len(rest) == 1 && appleID.MatchString(rest[0]):
			return apple(rest[0], ""), nil
		case len(rest) == 2 && appleID.MatchString(rest[1]):
			return apple(rest[1], titleFromSlug(rest[0])), nil
		}
		return Link{}, invalid("bad Apple Music song link")
	case "album":
		if i := q.Get("i"); appleID.MatchString(i) {
			return apple(i, ""), nil
		}
		return Link{}, domain.ErrNotATrack
	case "playlist", "artist", "station", "music-video":
		return Link{}, domain.ErrNotATrack
	}
	return Link{}, invalid("not an Apple Music song link")
}

func parseAmazon(host string, parts []string, q url.Values) (Link, error) {
	if len(parts) < 2 {
		return Link{}, invalid("not an Amazon Music link")
	}
	amazon := func(asin string) Link {
		return Link{Provider: domain.ProviderAmazonMusic, ProviderTrackID: asin,
			CanonicalURL: "https://" + host + "/tracks/" + asin, Kind: domain.TrackLinkKindListen}
	}
	switch parts[0] {
	case "tracks":
		if amazonASIN.MatchString(parts[1]) {
			return amazon(parts[1]), nil
		}
		return Link{}, invalid("bad Amazon Music track id")
	case "albums":
		if t := q.Get("trackAsin"); amazonASIN.MatchString(t) {
			return amazon(t), nil
		}
		return Link{}, domain.ErrNotATrack
	case "playlists", "artists", "user-playlists", "podcasts":
		return Link{}, domain.ErrNotATrack
	}
	return Link{}, invalid("not an Amazon Music track link")
}

// titleFromSlug turns "bohemian-rhapsody" into "Bohemian Rhapsody". A hint only:
// the user confirms the title in the add form.
func titleFromSlug(slug string) string {
	words := strings.FieldsFunc(slug, func(r rune) bool { return r == '-' })
	for i, w := range words {
		if w != "" {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

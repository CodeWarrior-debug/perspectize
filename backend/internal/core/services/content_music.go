package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	providerYouTube    = "youtube"
	keyRelatedMedia    = "relatedMedia"
	keyLyrics          = "lyrics"
	musicEnrichTimeout = 8 * time.Second
	lyricsCheckTimeout = 10 * time.Second
)

// WithMusicEnrichment enables YOUTUBE_MUSIC enrichment and lyrics checks. Any client may be nil;
// the matching enrichment step is then skipped.
func WithMusicEnrichment(yt portservices.YTMusicClient, mb portservices.MusicBrainzClient, lyrics portservices.LyricsClient) ContentServiceOption {
	return func(s *ContentService) {
		s.ytMusic, s.musicBrainz, s.lyrics = yt, mb, lyrics
	}
}

// WithAsync replaces how background work is started (default: a goroutine). Tests run it inline.
func WithAsync(run func(func())) ContentServiceOption {
	return func(s *ContentService) { s.async = run }
}

func (s *ContentService) runAsync(f func()) {
	if s.async != nil {
		s.async(f)
		return
	}
	go f()
}

// CreateFromYouTubeMusic creates a YOUTUBE_MUSIC row from a music.youtube.com track URL.
// Only the YouTube Data API call is fatal; YouTube Music and MusicBrainz enrichment are
// best-effort. A duplicate (by URL or ISRC) returns the existing row with ErrAlreadyExists
// after recording the pasted video as related media.
func (s *ContentService) CreateFromYouTubeMusic(ctx context.Context, url string, userID int) (*domain.Content, error) {
	kind, videoID, err := youtube.ClassifyURL(url)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrInvalidURL, err)
	}
	switch kind {
	case youtube.URLKindMusicCollection:
		return nil, domain.ErrNotATrack
	case youtube.URLKindVideo:
		return nil, fmt.Errorf("%w: not a YouTube Music track link", domain.ErrInvalidURL)
	}

	canonicalURL := youtube.NormalizeYouTubeMusicURL(videoID)
	if existing, err := s.repo.GetByURL(ctx, canonicalURL); err == nil && existing != nil {
		return existing, domain.ErrAlreadyExists
	} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}

	metadata, err := s.youtubeClient.GetVideoMetadata(ctx, videoID)
	if err != nil {
		slog.Error("failed to fetch YouTube metadata for music track", "videoID", videoID, "userID", userID, "error", err)
		return nil, fmt.Errorf("failed to fetch video metadata")
	}

	enrichCtx, cancel := context.WithTimeout(ctx, musicEnrichTimeout)
	defer cancel()
	music := s.enrichMusic(enrichCtx, videoID, metadata)

	if music.ISRC != "" {
		if existing, err := s.repo.GetByISRC(ctx, music.ISRC); err == nil && existing != nil {
			ref := domain.RelatedMedia{Provider: providerYouTube, VideoID: videoID, Kind: domain.RelatedMediaKindOther, Title: metadata.Title, AddedFrom: "duplicate-isrc"}
			if err := s.addRelatedMedia(ctx, existing, ref); err != nil {
				slog.Warn("failed to record duplicate as related media", "contentID", existing.ID, "error", err)
			}
			return existing, domain.ErrAlreadyExists
		} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing isrc: %w", err)
		}
	}

	music.RelatedMedia = s.linkExistingVideos(ctx, music.RelatedMedia)
	response, err := music.merge(metadata.Response)
	if err != nil {
		return nil, fmt.Errorf("failed to build music response: %w", err)
	}

	lengthUnits := "seconds"
	content := &domain.Content{
		Name:          metadata.Title,
		URL:           &canonicalURL,
		ContentType:   domain.ContentTypeYouTubeMusic,
		AddedByUserID: userID,
		Length:        &metadata.Duration,
		LengthUnits:   &lengthUnits,
		Response:      response,
	}
	if music.Title != "" {
		content.Name = music.Title
	}

	// refreshOnConflict=false: a refresh would overwrite relatedMedia and lyrics.
	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, false)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}
	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}

	id := created.ID
	s.runAsync(func() {
		bg, cancel := context.WithTimeout(context.Background(), lyricsCheckTimeout)
		defer cancel()
		if _, err := s.CheckLyrics(bg, id, true); err != nil {
			slog.Warn("background lyrics check failed", "contentID", id, "error", err)
		}
	})
	return created, nil
}

// musicFields are the top-level response keys a YOUTUBE_MUSIC row adds beside the
// YouTube Data API payload.
type musicFields struct {
	VideoID           string                `json:"videoId"`
	Title             string                `json:"-"`
	Artist            string                `json:"artist,omitempty"`
	Artists           []string              `json:"artists,omitempty"`
	Album             string                `json:"album,omitempty"`
	VideoType         string                `json:"videoType,omitempty"`
	ISRC              string                `json:"isrc,omitempty"`
	ReleaseDate       string                `json:"releaseDate,omitempty"`
	Genre             string                `json:"genre,omitempty"`
	MusicBrainzID     string                `json:"musicbrainzId,omitempty"`
	CoverImageURL     string                `json:"coverImageUrl,omitempty"`
	EnrichmentPending bool                  `json:"enrichmentPending,omitempty"`
	RelatedMedia      []domain.RelatedMedia `json:"relatedMedia"`
}

func (s *ContentService) enrichMusic(ctx context.Context, videoID string, meta *portservices.VideoMetadata) *musicFields {
	m := &musicFields{VideoID: videoID, RelatedMedia: []domain.RelatedMedia{}}

	if s.ytMusic == nil {
		m.EnrichmentPending = true
	} else if track, err := s.ytMusic.GetTrack(ctx, videoID); err != nil {
		slog.Warn("YouTube Music enrichment failed", "videoID", videoID, "error", err)
		m.EnrichmentPending = true
	} else {
		m.Title, m.Artists, m.Album, m.VideoType = track.Title, track.Artists, track.Album, track.VideoType
		for _, c := range track.Counterparts {
			m.RelatedMedia, _ = domain.AddRelatedMedia(m.RelatedMedia, domain.RelatedMedia{
				Provider: providerYouTube, VideoID: c.VideoID, Kind: relatedKind(c.VideoType), Title: c.Title, AddedFrom: "ytmusic-counterpart",
			})
		}
	}
	if len(m.Artists) > 0 {
		m.Artist = strings.Join(m.Artists, ", ")
	} else if meta.ChannelName != "" {
		m.Artist = strings.TrimSuffix(meta.ChannelName, " - Topic")
	}

	title := m.Title
	if title == "" {
		title = meta.Title
	}
	if s.musicBrainz != nil && len(m.Artists) > 0 {
		rec, err := s.musicBrainz.FindRecording(ctx, m.Artists[0], title, meta.Duration)
		switch {
		case err == nil:
			m.ISRC, m.ReleaseDate, m.Genre, m.MusicBrainzID, m.CoverImageURL = rec.ISRC, rec.ReleaseDate, rec.Genre, rec.MBID, rec.CoverImageURL
		case errors.Is(err, domain.ErrNotFound):
		default:
			slog.Warn("MusicBrainz lookup failed", "videoID", videoID, "error", err)
		}
	}
	return m
}

func relatedKind(videoType string) domain.RelatedMediaKind {
	switch videoType {
	case "audio":
		return domain.RelatedMediaKindAudio
	case "official_video":
		return domain.RelatedMediaKindOfficialVideo
	default:
		return domain.RelatedMediaKindOther
	}
}

// merge adds the music keys to the YouTube Data API payload.
func (m *musicFields) merge(ytResponse json.RawMessage) (json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	if len(ytResponse) > 0 {
		if err := json.Unmarshal(ytResponse, &out); err != nil {
			return nil, err
		}
	}
	fields, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	var extra map[string]json.RawMessage
	if err := json.Unmarshal(fields, &extra); err != nil {
		return nil, err
	}
	for k, v := range extra {
		out[k] = v
	}
	return json.Marshal(out)
}

// linkExistingVideos sets ContentID on references that already exist as YOUTUBE rows.
func (s *ContentService) linkExistingVideos(ctx context.Context, refs []domain.RelatedMedia) []domain.RelatedMedia {
	for i := range refs {
		if existing, err := s.repo.GetByURL(ctx, youtube.NormalizeYouTubeURL(refs[i].VideoID)); err == nil && existing != nil {
			id := existing.ID
			refs[i].ContentID = &id
		}
	}
	return refs
}

func readRelatedMedia(c *domain.Content) ([]domain.RelatedMedia, error) {
	return domain.ReadRelatedMedia(c.Response)
}

func (s *ContentService) writeRelatedMedia(ctx context.Context, contentID int, refs []domain.RelatedMedia) error {
	raw, err := json.Marshal(refs)
	if err != nil {
		return err
	}
	return s.repo.SetResponseKey(ctx, contentID, keyRelatedMedia, raw)
}

func (s *ContentService) addRelatedMedia(ctx context.Context, c *domain.Content, ref domain.RelatedMedia) error {
	if canonicalVideoID(c) == ref.VideoID {
		return nil
	}
	refs, err := readRelatedMedia(c)
	if err != nil {
		return err
	}
	refs, changed := domain.AddRelatedMedia(refs, ref)
	if !changed {
		return nil
	}
	return s.writeRelatedMedia(ctx, c.ID, refs)
}

func canonicalVideoID(c *domain.Content) string {
	if c.URL == nil {
		return ""
	}
	_, id, err := youtube.ClassifyURL(*c.URL)
	if err != nil {
		return ""
	}
	return id
}

// PromoteRelatedMedia turns a related video into its own YOUTUBE content row (or finds the
// existing one) and links it both ways. It runs only on an explicit user action.
func (s *ContentService) PromoteRelatedMedia(ctx context.Context, contentID int, videoID string, userID int) (*domain.Content, error) {
	track, err := s.GetByID(ctx, contentID)
	if err != nil {
		return nil, err
	}
	refs, err := readRelatedMedia(track)
	if err != nil {
		return nil, err
	}
	known := false
	for _, r := range refs {
		if r.Provider == providerYouTube && r.VideoID == videoID {
			known = true
		}
	}
	if !known {
		return nil, fmt.Errorf("%w: video is not related to this content", domain.ErrNotFound)
	}

	video, err := s.CreateFromYouTube(ctx, youtube.NormalizeYouTubeURL(videoID), userID)
	if err != nil && !errors.Is(err, domain.ErrAlreadyExists) {
		return nil, err
	}

	domain.LinkRelatedMedia(refs, providerYouTube, videoID, video.ID)
	if err := s.writeRelatedMedia(ctx, track.ID, refs); err != nil {
		return nil, fmt.Errorf("failed to link related media: %w", err)
	}
	if err := s.repo.SetResponseKey(ctx, video.ID, "relatedTo", json.RawMessage(fmt.Sprintf("%d", track.ID))); err != nil {
		slog.Warn("failed to back-link promoted video", "videoContentID", video.ID, "trackID", track.ID, "error", err)
	}
	return video, nil
}

// MarkRelatedMediaUnavailable records that a related video failed to play.
func (s *ContentService) MarkRelatedMediaUnavailable(ctx context.Context, contentID int, videoID string) error {
	c, err := s.GetByID(ctx, contentID)
	if err != nil {
		return err
	}
	refs, err := readRelatedMedia(c)
	if err != nil {
		return err
	}
	if !domain.MarkRelatedMediaUnavailable(refs, providerYouTube, videoID) {
		return fmt.Errorf("%w: video is not related to this content", domain.ErrNotFound)
	}
	return s.writeRelatedMedia(ctx, contentID, refs)
}

func readMusicSummary(c *domain.Content) musicSummary {
	var m musicSummary
	if len(c.Response) > 0 {
		_ = json.Unmarshal(c.Response, &m)
	}
	return m
}

type musicSummary struct {
	Artist  string                     `json:"artist"`
	Artists []string                   `json:"artists"`
	Lyrics  *domain.LyricsAvailability `json:"lyrics"`
}

// CheckLyrics looks up lyrics availability and stores only the result. Unless force is
// set, a stored result is reused until LyricsAvailability.NeedsRecheck says otherwise.
func (s *ContentService) CheckLyrics(ctx context.Context, contentID int, force bool) (*domain.LyricsAvailability, error) {
	c, err := s.GetByID(ctx, contentID)
	if err != nil {
		return nil, err
	}
	if c.ContentType != domain.ContentTypeYouTubeMusic {
		return nil, fmt.Errorf("%w: lyrics are only checked for music tracks", domain.ErrInvalidInput)
	}
	summary := readMusicSummary(c)
	now := time.Now().UTC()
	if !force && !summary.Lyrics.NeedsRecheck(now) {
		return summary.Lyrics, nil
	}
	if s.lyrics == nil {
		return summary.Lyrics, nil
	}

	artist := summary.Artist
	if len(summary.Artists) > 0 {
		artist = summary.Artists[0]
	}
	duration := 0
	if c.Length != nil {
		duration = *c.Length
	}
	match, err := s.lyrics.Check(ctx, artist, c.Name, duration)
	if err != nil {
		return nil, fmt.Errorf("failed to check lyrics: %w", err)
	}

	result := &domain.LyricsAvailability{Available: match.Available, HasSynced: match.HasSynced, CheckedAt: now}
	if match.Available {
		id := match.LRCLibID
		result.LRCLibID = &id
	}
	raw, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SetResponseKey(ctx, contentID, keyLyrics, raw); err != nil {
		return nil, fmt.Errorf("failed to store lyrics availability: %w", err)
	}
	return result, nil
}

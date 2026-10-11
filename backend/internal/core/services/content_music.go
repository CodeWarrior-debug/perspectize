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

// WithMusicEnrichment enables AUDIO_TRACK enrichment and lyrics checks. Any client may be nil;
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

type enriched struct {
	music        domain.MusicFields
	title        string
	relatedMedia []domain.RelatedMedia
}

func (s *ContentService) enrichMusic(ctx context.Context, videoID string, meta *portservices.VideoMetadata) *enriched {
	e := &enriched{music: domain.MusicFields{Provider: domain.ProviderYouTube, VideoID: videoID}, relatedMedia: []domain.RelatedMedia{}}
	m := &e.music

	if s.ytMusic == nil {
		m.EnrichmentPending = true
	} else if track, err := s.ytMusic.GetTrack(ctx, videoID); err != nil {
		slog.Warn("YouTube Music enrichment failed", "videoID", videoID, "error", err)
		m.EnrichmentPending = true
	} else {
		e.title, m.Artists, m.Album, m.VideoType = track.Title, track.Artists, track.Album, track.VideoType
		m.Explicit = track.Explicit
		for _, c := range track.Counterparts {
			e.relatedMedia, _ = domain.AddRelatedMedia(e.relatedMedia, domain.RelatedMedia{
				Provider: providerYouTube, VideoID: c.VideoID, Kind: relatedKind(c.VideoType), Title: c.Title, AddedFrom: "ytmusic-counterpart",
			})
		}
	}
	if len(m.Artists) > 0 {
		m.Artist = strings.Join(m.Artists, ", ")
	} else if meta.ChannelName != "" {
		m.Artist = strings.TrimSuffix(meta.ChannelName, " - Topic")
	}

	title := e.title
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
	return e
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

// buildMusicResponse stores the YouTube Data API payload with music and relatedMedia beside it.
func buildMusicResponse(ytResponse json.RawMessage, music domain.MusicFields, related []domain.RelatedMedia) (json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	if len(ytResponse) > 0 {
		if err := json.Unmarshal(ytResponse, &out); err != nil {
			return nil, err
		}
	}
	mj, err := json.Marshal(music)
	if err != nil {
		return nil, err
	}
	rj, err := json.Marshal(related)
	if err != nil {
		return nil, err
	}
	out[domain.ResponseKeyMusic] = mj
	out[keyRelatedMedia] = rj
	return json.Marshal(out)
}

// linkExistingVideos sets ContentID on references that already exist as
// YOUTUBE rows, in one query for the whole list.
func (s *ContentService) linkExistingVideos(ctx context.Context, refs []domain.RelatedMedia) []domain.RelatedMedia {
	if len(refs) == 0 || s.audio == nil {
		return refs
	}
	urls := make([]string, len(refs))
	for i := range refs {
		urls[i] = youtube.NormalizeYouTubeURL(refs[i].VideoID)
	}
	found, err := s.audio.ContentByURLs(ctx, urls)
	if err != nil {
		slog.Warn("failed to look up existing related videos", "error", err)
		return refs
	}
	for i := range refs {
		if c, ok := found[urls[i]]; ok {
			id := c.ID
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
	m := domain.ReadMusic(c.Response)
	out := musicSummary{Artist: m.Artist, Artists: m.Artists}
	if len(c.Response) > 0 {
		var wrap struct {
			Lyrics *domain.LyricsAvailability `json:"lyrics"`
		}
		_ = json.Unmarshal(c.Response, &wrap)
		out.Lyrics = wrap.Lyrics
	}
	return out
}

type musicSummary struct {
	Artist  string
	Artists []string
	Lyrics  *domain.LyricsAvailability
}

// CheckLyrics looks up lyrics availability and stores only the result. Unless force is
// set, a stored result is reused until LyricsAvailability.NeedsRecheck says otherwise.
func (s *ContentService) CheckLyrics(ctx context.Context, contentID int, force bool) (*domain.LyricsAvailability, error) {
	c, err := s.GetByID(ctx, contentID)
	if err != nil {
		return nil, err
	}
	if c.ContentType != domain.ContentTypeAudioTrack {
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

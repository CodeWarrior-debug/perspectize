package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/musiclinks"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	maxTrackTitleLength   = 200
	maxTrackArtistLength  = 200
	maxSameSongCandidates = 5
)

var errAudioTracksOff = errors.New("audio tracks are not configured")

// WithAudioTracks enables AUDIO_TRACK adds, track links and genres.
func WithAudioTracks(audio repositories.AudioTrackRepository, genres repositories.MusicGenreRepository) ContentServiceOption {
	return func(s *ContentService) { s.audio, s.genres = audio, genres }
}

// CreateAudioTrack adds one recording from a pasted link (ADR 0005). Dedupe
// order: (provider, id) and exact URL here; ISRC and MusicBrainz id on the
// YouTube Music path, which is the only one that learns them. A fuzzy
// same-title match is returned as Candidates and nothing is created until the
// caller answers with SameAsContentID or CreateNew.
func (s *ContentService) CreateAudioTrack(ctx context.Context, in portservices.CreateAudioTrackInput) (*portservices.CreateAudioTrackResult, error) {
	if s.audio == nil || s.genres == nil {
		return nil, errAudioTracksOff
	}
	link, err := musiclinks.Parse(in.URL)
	if err != nil {
		return nil, err
	}
	if in.GenreID != nil {
		if err := s.validateGenre(ctx, *in.GenreID); err != nil {
			return nil, err
		}
	}
	if in.SameAsContentID != nil {
		return s.attachToTrack(ctx, *in.SameAsContentID, link)
	}
	existing, err := s.existingByLink(ctx, link)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return &portservices.CreateAudioTrackResult{Content: existing, AlreadyExisted: true}, nil
	}
	if link.Provider == domain.ProviderYouTube {
		return s.createFromYouTubeLink(ctx, in, link)
	}
	return s.createLinkOnly(ctx, in, link)
}

func toTrackLink(contentID int, l musiclinks.Link) domain.TrackLink {
	return domain.TrackLink{ContentID: contentID, Provider: l.Provider, ProviderTrackID: l.ProviderTrackID,
		URL: l.CanonicalURL, Kind: l.Kind, Source: domain.TrackLinkSourcePasted}
}

// existingByLink: dedupe steps 3 and 4 (provider+id, then exact URL).
func (s *ContentService) existingByLink(ctx context.Context, link musiclinks.Link) (*domain.Content, error) {
	c, err := s.audio.GetByLink(ctx, link.Provider, link.ProviderTrackID)
	if err == nil && c != nil {
		return c, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing track link: %w", err)
	}
	c, err = s.repo.GetByURL(ctx, link.CanonicalURL)
	if err == nil && c != nil {
		return c, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}
	return nil, nil
}

// attachToTrack adds the pasted link to a track the user confirmed is the same song.
func (s *ContentService) attachToTrack(ctx context.Context, contentID int, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	target, err := s.repo.GetByID(ctx, contentID)
	if err != nil {
		return nil, err
	}
	if target.ContentType != domain.ContentTypeAudioTrack {
		return nil, domain.ErrNotFound
	}
	added, err := s.audio.AddLink(ctx, toTrackLink(target.ID, link))
	if err != nil {
		return nil, fmt.Errorf("failed to attach link: %w", err)
	}
	if !added {
		// The link already belongs to a track; that track is the answer.
		if owner, err := s.audio.GetByLink(ctx, link.Provider, link.ProviderTrackID); err == nil && owner != nil {
			return &portservices.CreateAudioTrackResult{Content: owner, AlreadyExisted: true}, nil
		}
	}
	return &portservices.CreateAudioTrackResult{Content: target, AlreadyExisted: true}, nil
}

// createLinkOnly stores a Spotify / Apple Music / Amazon Music link with the
// title and artist the user typed. No provider API is called (ADR 0002).
func (s *ContentService) createLinkOnly(ctx context.Context, in portservices.CreateAudioTrackInput, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = link.SuggestedTitle
	}
	artist := strings.TrimSpace(in.Artist)
	switch {
	case title == "":
		return nil, fmt.Errorf("%w: a title is required for %s links", domain.ErrInvalidInput, link.Provider)
	case len(title) > maxTrackTitleLength:
		return nil, fmt.Errorf("%w: title is longer than %d characters", domain.ErrInvalidInput, maxTrackTitleLength)
	case len(artist) > maxTrackArtistLength:
		return nil, fmt.Errorf("%w: artist is longer than %d characters", domain.ErrInvalidInput, maxTrackArtistLength)
	}

	if !in.CreateNew {
		cands, err := s.audio.FindSameSongCandidates(ctx, title, artist, maxSameSongCandidates)
		if err != nil {
			return nil, fmt.Errorf("failed to check same-song candidates: %w", err)
		}
		if len(cands) > 0 {
			return &portservices.CreateAudioTrackResult{Candidates: cands}, nil
		}
	}

	response, err := json.Marshal(map[string]domain.MusicFields{domain.ResponseKeyMusic: {Provider: link.Provider, Artist: artist}})
	if err != nil {
		return nil, err
	}
	url := link.CanonicalURL
	created, existed, err := s.audio.CreateWithLink(ctx, &domain.Content{
		Name: title, URL: &url, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: in.UserID,
		Response: response, GenreID: in.GenreID,
	}, toTrackLink(0, link))
	if err != nil {
		return nil, fmt.Errorf("failed to save track: %w", err)
	}
	return &portservices.CreateAudioTrackResult{Content: created, AlreadyExisted: existed}, nil
}

// createFromYouTubeLink is the YouTube Music flow: Data API (fatal), then
// best-effort InnerTube + MusicBrainz enrichment (ADR 0002).
func (s *ContentService) createFromYouTubeLink(ctx context.Context, in portservices.CreateAudioTrackInput, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	videoID := link.ProviderTrackID
	metadata, err := s.youtubeClient.GetVideoMetadata(ctx, videoID)
	if err != nil {
		slog.Error("failed to fetch YouTube metadata for audio track", "videoID", videoID, "userID", in.UserID, "error", err)
		return nil, fmt.Errorf("failed to fetch video metadata")
	}
	if metadata.AgeRestricted {
		return nil, domain.ErrContentNotAllowed
	}

	enrichCtx, cancel := context.WithTimeout(ctx, musicEnrichTimeout)
	defer cancel()
	e := s.enrichMusic(enrichCtx, videoID, metadata)
	unofficial := domain.IsUnofficialUpload(e.music)

	// Dedupe steps 1-2 (ISRC, MusicBrainz id). Never for unofficial uploads (ADR 0005).
	if !unofficial {
		existing, err := s.existingByIdentifier(ctx, e.music)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			if _, err := s.audio.AddLink(ctx, toTrackLink(existing.ID, link)); err != nil {
				slog.Warn("failed to add YouTube Music link to existing track", "contentID", existing.ID, "error", err)
			}
			return &portservices.CreateAudioTrackResult{Content: existing, AlreadyExisted: true}, nil
		}
	}

	title := e.title
	if title == "" {
		title = metadata.Title
	}
	if !unofficial && !in.CreateNew {
		cands, err := s.audio.FindSameSongCandidates(ctx, title, e.music.Artist, maxSameSongCandidates)
		if err != nil {
			return nil, fmt.Errorf("failed to check same-song candidates: %w", err)
		}
		if len(cands) > 0 {
			return &portservices.CreateAudioTrackResult{Candidates: cands}, nil
		}
	}

	if g := s.suggestGenre(ctx, e.music.Genre); g != nil {
		id := g.ID
		e.music.SuggestedGenreID = &id // suggest, never apply (ADR 0006)
	}
	related := s.linkExistingVideos(ctx, e.relatedMedia)
	response, err := buildMusicResponse(metadata.Response, e.music, related)
	if err != nil {
		return nil, fmt.Errorf("failed to build music response: %w", err)
	}

	lengthUnits := "seconds"
	url := link.CanonicalURL
	created, existed, err := s.audio.CreateWithLink(ctx, &domain.Content{
		Name: title, URL: &url, ContentType: domain.ContentTypeAudioTrack, AddedByUserID: in.UserID,
		Length: &metadata.Duration, LengthUnits: &lengthUnits, Response: response, GenreID: in.GenreID,
	}, toTrackLink(0, link))
	if err != nil {
		return nil, fmt.Errorf("failed to save track: %w", err)
	}
	if existed {
		return &portservices.CreateAudioTrackResult{Content: created, AlreadyExisted: true}, nil
	}

	id := created.ID
	s.runAsync(func() {
		bg, cancel := context.WithTimeout(context.Background(), lyricsCheckTimeout)
		defer cancel()
		if _, err := s.CheckLyrics(bg, id, true); err != nil {
			slog.Warn("background lyrics check failed", "contentID", id, "error", err)
		}
	})
	return &portservices.CreateAudioTrackResult{Content: created}, nil
}

func (s *ContentService) existingByIdentifier(ctx context.Context, m domain.MusicFields) (*domain.Content, error) {
	if m.ISRC != "" {
		c, err := s.repo.GetByISRC(ctx, m.ISRC)
		if err == nil && c != nil {
			return c, nil
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing isrc: %w", err)
		}
	}
	if m.MusicBrainzID != "" {
		c, err := s.audio.GetByMusicBrainzID(ctx, m.MusicBrainzID)
		if err == nil && c != nil {
			return c, nil
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing musicbrainz id: %w", err)
		}
	}
	return nil, nil
}

// suggestGenre maps a provider genre string onto the seeded tree. Source order
// (ADR 0006): the pasted provider (YouTube gives none), Apple (not called in
// v1), then MusicBrainz. No match means no suggestion.
func (s *ContentService) suggestGenre(ctx context.Context, name string) *domain.MusicGenre {
	if name == "" {
		return nil
	}
	genres, err := s.MusicGenres(ctx)
	if err != nil {
		slog.Warn("genre suggestion skipped", "error", err)
		return nil
	}
	return domain.MatchGenre(name, genres)
}

// MusicGenres is the seeded genre tree (cached by the repository).
func (s *ContentService) MusicGenres(ctx context.Context) ([]domain.MusicGenre, error) {
	if s.genres == nil {
		return nil, errAudioTracksOff
	}
	return s.genres.List(ctx)
}

func (s *ContentService) validateGenre(ctx context.Context, id int) error {
	genres, err := s.MusicGenres(ctx)
	if err != nil {
		return fmt.Errorf("failed to load genres: %w", err)
	}
	for _, g := range genres {
		if g.ID == id {
			return nil
		}
	}
	return fmt.Errorf("%w: unknown genre %d", domain.ErrInvalidInput, id)
}

// SetTrackGenre: anyone while empty; the adder within 30 days (ADR 0006).
func (s *ContentService) SetTrackGenre(ctx context.Context, contentID, genreID, userID int) (*domain.Content, error) {
	if err := s.validateGenre(ctx, genreID); err != nil {
		return nil, err
	}
	return s.genres.SetContentGenre(ctx, contentID, genreID, userID, domain.GenreChangeWindowDays)
}

func (s *ContentService) TrackLinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	if s.audio == nil {
		return nil, errAudioTracksOff
	}
	return s.audio.LinksByContentIDs(ctx, ids)
}

// MarkTrackLinkUnavailable records an embed error 101/150 for one link (ticket 03).
func (s *ContentService) MarkTrackLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error) {
	if s.audio == nil {
		return nil, errAudioTracksOff
	}
	return s.audio.MarkLinkUnavailable(ctx, linkID)
}

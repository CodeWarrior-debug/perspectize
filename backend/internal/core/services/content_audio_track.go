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

// createFromYouTubeLink — bridge until Task 9 folds the YouTube Music flow in.
func (s *ContentService) createFromYouTubeLink(ctx context.Context, in portservices.CreateAudioTrackInput, link musiclinks.Link) (*portservices.CreateAudioTrackResult, error) {
	c, err := s.CreateAudioTrackFromYouTube(ctx, link.CanonicalURL, in.UserID)
	existed := errors.Is(err, domain.ErrAlreadyExists) && c != nil
	if err != nil && !existed {
		return nil, err
	}
	if _, err := s.audio.AddLink(ctx, toTrackLink(c.ID, link)); err != nil {
		slog.Warn("failed to record YouTube Music track link", "contentID", c.ID, "error", err)
	}
	return &portservices.CreateAudioTrackResult{Content: c, AlreadyExisted: existed}, nil
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

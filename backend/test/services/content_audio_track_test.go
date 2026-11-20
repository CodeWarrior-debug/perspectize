package services_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeAudioRepo is an in-memory AudioTrackRepository over fakeMusicRepo's rows.
type fakeAudioRepo struct {
	content *fakeMusicRepo
	links   []domain.TrackLink
	calls   map[string]int
}

func newFakeAudioRepo(content *fakeMusicRepo) *fakeAudioRepo {
	return &fakeAudioRepo{content: content, calls: map[string]int{}}
}

func (r *fakeAudioRepo) CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
	r.calls["CreateWithLink"]++
	if existing, err := r.content.GetByURL(ctx, *c.URL); err == nil {
		return existing, true, nil
	}
	created := r.content.add(c)
	link.ContentID, link.ID = created.ID, len(r.links)+1
	r.links = append(r.links, link)
	return created, false, nil
}

func (r *fakeAudioRepo) AddLink(_ context.Context, link domain.TrackLink) (bool, error) {
	r.calls["AddLink"]++
	for _, l := range r.links {
		if l.Provider == link.Provider && l.ProviderTrackID == link.ProviderTrackID {
			return false, nil
		}
	}
	link.ID = len(r.links) + 1
	r.links = append(r.links, link)
	return true, nil
}

func (r *fakeAudioRepo) GetByLink(_ context.Context, p domain.TrackProvider, id string) (*domain.Content, error) {
	r.calls["GetByLink"]++
	for _, l := range r.links {
		if l.Provider == p && l.ProviderTrackID == id {
			return r.content.rows[l.ContentID], nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeAudioRepo) GetByMusicBrainzID(_ context.Context, mbid string) (*domain.Content, error) {
	r.calls["GetByMusicBrainzID"]++
	for _, c := range r.content.rows {
		if c.ContentType == domain.ContentTypeAudioTrack && domain.ReadMusic(c.Response).MusicBrainzID == mbid {
			return c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeAudioRepo) FindSameSongCandidates(_ context.Context, title, artist string, limit int) ([]*domain.Content, error) {
	r.calls["FindSameSongCandidates"]++
	var out []*domain.Content
	for _, c := range r.content.rows {
		m := domain.ReadMusic(c.Response)
		if c.ContentType == domain.ContentTypeAudioTrack && strings.EqualFold(c.Name, title) &&
			(artist == "" || strings.EqualFold(m.Artist, artist)) && !domain.IsUnofficialUpload(m) {
			out = append(out, c)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (r *fakeAudioRepo) ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error) {
	r.calls["ContentByURLs"]++
	out := map[string]*domain.Content{}
	for _, u := range urls {
		if c, err := r.content.GetByURL(ctx, u); err == nil {
			out[u] = c
		}
	}
	return out, nil
}

func (r *fakeAudioRepo) LinksByContentIDs(_ context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	r.calls["LinksByContentIDs"]++
	out := map[int][]domain.TrackLink{}
	for _, l := range r.links {
		if slices.Contains(ids, l.ContentID) {
			out[l.ContentID] = append(out[l.ContentID], l)
		}
	}
	return out, nil
}

func (r *fakeAudioRepo) MarkLinkUnavailable(_ context.Context, id int) (*domain.TrackLink, error) {
	for i := range r.links {
		if r.links[i].ID == id && r.links[i].Kind == domain.TrackLinkKindEmbed {
			return &r.links[i], nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeAudioRepo) linksFor(contentID int) []domain.TrackLink {
	var out []domain.TrackLink
	for _, l := range r.links {
		if l.ContentID == contentID {
			out = append(out, l)
		}
	}
	return out
}

type fakeGenres struct {
	list   []domain.MusicGenre
	locked map[int]bool
	set    map[int]int
}

func newFakeGenres() *fakeGenres {
	return &fakeGenres{
		list: []domain.MusicGenre{
			{ID: 21, Name: "Rock", AppleName: "Rock"},
			{ID: 14, Name: "Pop", AppleName: "Pop"},
			{ID: 18, Name: "Hip-Hop/Rap", AppleName: "Hip-Hop/Rap"},
		},
		locked: map[int]bool{},
		set:    map[int]int{},
	}
}

func (g *fakeGenres) List(context.Context) ([]domain.MusicGenre, error) {
	return slices.Clone(g.list), nil
}

func (g *fakeGenres) SetContentGenre(_ context.Context, contentID, genreID, _, windowDays int) (*domain.Content, error) {
	if windowDays != domain.GenreChangeWindowDays {
		return nil, errors.New("wrong window")
	}
	if g.locked[contentID] {
		return nil, domain.ErrGenreLocked
	}
	g.set[contentID] = genreID
	return &domain.Content{ID: contentID, GenreID: &genreID}, nil
}

// noYouTube fails the test if the YouTube Data API is called.
func noYouTube(t *testing.T) *mockYouTubeClient {
	return &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		t.Error("link-only adds must not call YouTube")
		return nil, errors.New("unexpected")
	}}
}

func audioService(t *testing.T, repo *fakeMusicRepo, audio *fakeAudioRepo, genres *fakeGenres) *services.ContentService {
	return services.NewContentService(repo, noYouTube(t), nil, services.WithAudioTracks(audio, genres), syncRunner())
}

const spotifyURL = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"

func TestCreateAudioTrack_SpotifyIsLinkOnly(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	genre := 14

	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: spotifyURL + "?si=abc", Title: "  Never Gonna Give You Up ", Artist: "Rick Astley", GenreID: &genre, UserID: 7,
	})
	require.NoError(t, err)
	require.NotNil(t, res.Content)
	assert.False(t, res.AlreadyExisted)
	assert.Empty(t, res.Candidates)
	c := res.Content
	assert.Equal(t, domain.ContentTypeAudioTrack, c.ContentType)
	assert.Equal(t, "Never Gonna Give You Up", c.Name)
	assert.Equal(t, spotifyURL, *c.URL, "content.url is the first pasted link, canonicalised (ADR 0005)")
	assert.Equal(t, 14, *c.GenreID)
	m := domain.ReadMusic(c.Response)
	assert.Equal(t, domain.ProviderSpotify, m.Provider)
	assert.Equal(t, "Rick Astley", m.Artist)

	links := audio.linksFor(c.ID)
	require.Len(t, links, 1)
	assert.Equal(t, domain.TrackLinkKindListen, links[0].Kind)
	assert.Equal(t, domain.TrackLinkSourcePasted, links[0].Source)
	assert.Equal(t, map[string]int{"GetByLink": 1, "FindSameSongCandidates": 1, "CreateWithLink": 1}, audio.calls)
}

func TestCreateAudioTrack_AppleUsesSlugTitleWhenBlank(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: "https://music.apple.com/us/song/bohemian-rhapsody/1440650711", UserID: 7,
	})
	require.NoError(t, err)
	assert.Equal(t, "Bohemian Rhapsody", res.Content.Name)
}

func TestCreateAudioTrack_LinkOnlyNeedsATitle(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: "https://music.amazon.com/tracks/B07D5J5QX3", UserID: 7,
	})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Empty(t, repo.rows)
}

// Review Focus 1.
func TestCreateAudioTrack_RepasteWithTrackingParamsReturnsExisting(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	first, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", UserID: 7})
	require.NoError(t, err)

	for _, again := range []string{spotifyURL + "?si=zzz", "https://open.spotify.com/intl-fr/track/4uLU6hMCjMI75M1A2tKUQC"} {
		res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: again, Title: "Different Title", UserID: 8})
		require.NoError(t, err, again)
		assert.True(t, res.AlreadyExisted, again)
		assert.Equal(t, first.Content.ID, res.Content.ID, again)
	}
	assert.Len(t, repo.rows, 1)
}

func TestCreateAudioTrack_SameSongCandidatesAskInsteadOfCreating(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	existing, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", Artist: "Queen", UserID: 7})
	require.NoError(t, err)

	apple := "https://music.apple.com/us/song/song/1440650711"
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: apple, Title: "song", Artist: "QUEEN", UserID: 8})
	require.NoError(t, err)
	assert.Nil(t, res.Content, "nothing is created until the user answers (ADR 0005)")
	require.Len(t, res.Candidates, 1)
	assert.Equal(t, existing.Content.ID, res.Candidates[0].ID)
	assert.Len(t, repo.rows, 1)

	// "Different song": create anyway.
	res, err = svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: apple, Title: "Song", Artist: "Queen", CreateNew: true, UserID: 8})
	require.NoError(t, err)
	require.NotNil(t, res.Content)
	assert.NotEqual(t, existing.Content.ID, res.Content.ID)
}

func TestCreateAudioTrack_SameAsAttachesTheLink(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	existing, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", UserID: 7})
	require.NoError(t, err)

	id := existing.Content.ID
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{
		URL: "https://music.amazon.com/tracks/B07D5J5QX3", SameAsContentID: &id, UserID: 8,
	})
	require.NoError(t, err)
	assert.True(t, res.AlreadyExisted)
	assert.Equal(t, id, res.Content.ID)
	assert.Len(t, audio.linksFor(id), 2)
	assert.Len(t, repo.rows, 1)
}

func TestCreateAudioTrack_SameAsMustBeATrack(t *testing.T) {
	repo := newFakeMusicRepo()
	video := repo.add(&domain.Content{Name: "Clip", ContentType: domain.ContentTypeYouTubeVideo})
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, SameAsContentID: &video.ID, UserID: 8})
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateAudioTrack_RejectsCollectionsAndUnknownGenres(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := audioService(t, repo, newFakeAudioRepo(repo), newFakeGenres())
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: "https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx", Title: "x", UserID: 7})
	assert.ErrorIs(t, err, domain.ErrNotATrack)

	bad := 999999
	_, err = svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "x", GenreID: &bad, UserID: 7})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Empty(t, repo.rows)
}

func TestCreateAudioTrack_NotConfigured(t *testing.T) {
	svc := services.NewContentService(newFakeMusicRepo(), noYouTube(t), nil)
	_, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "x"})
	assert.Error(t, err)
}

func TestSetTrackGenre_ValidatesAndUsesTheWindow(t *testing.T) {
	repo := newFakeMusicRepo()
	genres := newFakeGenres()
	svc := audioService(t, repo, newFakeAudioRepo(repo), genres)

	c, err := svc.SetTrackGenre(context.Background(), 5, 21, 7)
	require.NoError(t, err)
	assert.Equal(t, 21, *c.GenreID)

	_, err = svc.SetTrackGenre(context.Background(), 5, 424242, 7)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)

	genres.locked[6] = true
	_, err = svc.SetTrackGenre(context.Background(), 6, 21, 7)
	assert.ErrorIs(t, err, domain.ErrGenreLocked)
}

func TestTrackLinkMethodsPassThrough(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := audioService(t, repo, audio, newFakeGenres())
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: spotifyURL, Title: "Song", UserID: 7})
	require.NoError(t, err)

	links, err := svc.TrackLinksByContentIDs(context.Background(), []int{res.Content.ID, 999})
	require.NoError(t, err)
	assert.Len(t, links[res.Content.ID], 1)

	_, err = svc.MarkTrackLinkUnavailable(context.Background(), links[res.Content.ID][0].ID)
	assert.ErrorIs(t, err, domain.ErrNotFound, "a LISTEN link cannot be marked unavailable")

	got, err := svc.MusicGenres(context.Background())
	require.NoError(t, err)
	assert.Len(t, got, 3)
}

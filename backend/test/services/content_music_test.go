package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeMusicRepo is an in-memory ContentRepository for the music flows.
type fakeMusicRepo struct {
	mockContentRepository
	rows    map[int]*domain.Content
	nextID  int
	upserts []bool // refreshOnConflict per GetOrCreateByURL call
}

func newFakeMusicRepo() *fakeMusicRepo {
	return &fakeMusicRepo{rows: map[int]*domain.Content{}, nextID: 1}
}

func (r *fakeMusicRepo) add(c *domain.Content) *domain.Content {
	c.ID = r.nextID
	r.nextID++
	r.rows[c.ID] = c
	return c
}

func (r *fakeMusicRepo) GetByID(_ context.Context, id int) (*domain.Content, error) {
	if c, ok := r.rows[id]; ok {
		return c, nil
	}
	return nil, domain.ErrNotFound
}

func (r *fakeMusicRepo) GetByURL(_ context.Context, url string) (*domain.Content, error) {
	for _, c := range r.rows {
		if c.URL != nil && *c.URL == url {
			return c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeMusicRepo) GetOrCreateByURL(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
	r.upserts = append(r.upserts, refresh)
	if existing, err := r.GetByURL(ctx, *c.URL); err == nil {
		return existing, true, nil
	}
	return r.add(c), false, nil
}

func (r *fakeMusicRepo) GetByISRC(_ context.Context, isrc string) (*domain.Content, error) {
	for _, c := range r.rows {
		var m struct {
			ISRC string `json:"isrc"`
		}
		_ = json.Unmarshal(c.Response, &m)
		if c.ContentType == domain.ContentTypeYouTubeMusic && m.ISRC == isrc {
			return c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *fakeMusicRepo) SetResponseKey(_ context.Context, id int, key string, value json.RawMessage) error {
	c, ok := r.rows[id]
	if !ok {
		return domain.ErrNotFound
	}
	m := map[string]json.RawMessage{}
	if len(c.Response) > 0 {
		_ = json.Unmarshal(c.Response, &m)
	}
	m[key] = value
	c.Response, _ = json.Marshal(m)
	return nil
}

func (r *fakeMusicRepo) field(t *testing.T, id int, key string, out any) {
	t.Helper()
	m := map[string]json.RawMessage{}
	require.NoError(t, json.Unmarshal(r.rows[id].Response, &m))
	raw, ok := m[key]
	require.True(t, ok, "response has no %q", key)
	require.NoError(t, json.Unmarshal(raw, out))
}

type fakeYTMusic struct {
	track *portservices.YTMusicTrack
	err   error
}

func (f *fakeYTMusic) GetTrack(context.Context, string) (*portservices.YTMusicTrack, error) {
	return f.track, f.err
}

type fakeMB struct {
	rec   *portservices.Recording
	err   error
	calls int
}

func (f *fakeMB) FindRecording(context.Context, string, string, int) (*portservices.Recording, error) {
	f.calls++
	return f.rec, f.err
}

type fakeLyrics struct {
	match *portservices.LyricsMatch
	err   error
	calls int
}

func (f *fakeLyrics) Check(context.Context, string, string, int) (*portservices.LyricsMatch, error) {
	f.calls++
	return f.match, f.err
}

const (
	audioID = "AUDIOAUDIO1"
	videoID = "VIDEOVIDEO1"
)

func ytMeta(id string) *mockYouTubeClient {
	return &mockYouTubeClient{getVideoMetadataFn: func(_ context.Context, got string) (*portservices.VideoMetadata, error) {
		return &portservices.VideoMetadata{
			Title: "Bohemian Rhapsody (Remastered 2011)", Duration: 355, ChannelName: "Queen - Topic",
			Response: json.RawMessage(`{"items":[{"snippet":{"title":"Bohemian Rhapsody (Remastered 2011)","channelTitle":"Queen - Topic"}}]}`),
		}, nil
	}}
}

func fullTrack() *fakeYTMusic {
	return &fakeYTMusic{track: &portservices.YTMusicTrack{
		Title: "Bohemian Rhapsody", Artists: []string{"Queen"}, Album: "A Night at the Opera", DurationSec: 355, VideoType: "audio",
		Counterparts: []portservices.YTMusicCounterpart{{VideoID: videoID, Title: "Bohemian Rhapsody (Official Video)", VideoType: "official_video"}},
	}}
}

func isrcMatch() *fakeMB {
	return &fakeMB{rec: &portservices.Recording{ISRC: "GBUM71029604", ReleaseDate: "1975-10-31", Genre: "rock", MBID: "mbid-1", CoverImageURL: "https://coverartarchive.org/release/r1/front-250"}}
}

func syncRunner() services.ContentServiceOption { return services.WithAsync(func(f func()) { f() }) }

const musicURL = "https://music.youtube.com/watch?v=" + audioID

func TestCreateFromYouTubeMusic_FullEnrichment(t *testing.T) {
	repo := newFakeMusicRepo()
	lyr := &fakeLyrics{match: &portservices.LyricsMatch{Available: true, LRCLibID: 36978827, HasSynced: true}}
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(fullTrack(), isrcMatch(), lyr), syncRunner())

	c, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeYouTubeMusic, c.ContentType)
	assert.Equal(t, musicURL, *c.URL)
	assert.Equal(t, "Bohemian Rhapsody", c.Name, "YouTube Music's clean title wins over the video title")
	assert.Equal(t, []bool{false}, repo.upserts, "music upserts must not refresh (it would wipe relatedMedia and lyrics)")

	var isrc, artist, album string
	repo.field(t, c.ID, "isrc", &isrc)
	repo.field(t, c.ID, "artist", &artist)
	repo.field(t, c.ID, "album", &album)
	assert.Equal(t, "GBUM71029604", isrc)
	assert.Equal(t, "Queen", artist)
	assert.Equal(t, "A Night at the Opera", album)

	var items []json.RawMessage
	repo.field(t, c.ID, "items", &items)
	assert.Len(t, items, 1, "the YouTube Data API payload is kept for existing columns")

	var refs []domain.RelatedMedia
	repo.field(t, c.ID, "relatedMedia", &refs)
	require.Len(t, refs, 1)
	assert.Equal(t, videoID, refs[0].VideoID)
	assert.Equal(t, domain.RelatedMediaKindOfficialVideo, refs[0].Kind)
	assert.Nil(t, refs[0].ContentID, "related videos are not made into content rows")
	assert.Len(t, repo.rows, 1)

	var lyrics domain.LyricsAvailability
	repo.field(t, c.ID, "lyrics", &lyrics)
	assert.True(t, lyrics.Available)
	require.NotNil(t, lyrics.LRCLibID)
	assert.Equal(t, 36978827, *lyrics.LRCLibID)
}

func TestCreateFromYouTubeMusic_NoMusicBrainzMatch(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(fullTrack(), &fakeMB{err: domain.ErrNotFound}, nil), syncRunner())

	c, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	require.NoError(t, err)
	m := map[string]json.RawMessage{}
	require.NoError(t, json.Unmarshal(c.Response, &m))
	assert.NotContains(t, m, "isrc")
	assert.Contains(t, m, "artist")
	assert.NotContains(t, m, "enrichmentPending")
}

func TestCreateFromYouTubeMusic_YTMusicDown(t *testing.T) {
	repo := newFakeMusicRepo()
	mb := isrcMatch()
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(&fakeYTMusic{err: errors.New("403")}, mb, nil), syncRunner())

	c, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	require.NoError(t, err, "unofficial enrichment failing must not block the add")
	var pending bool
	var artist string
	repo.field(t, c.ID, "enrichmentPending", &pending)
	repo.field(t, c.ID, "artist", &artist)
	assert.True(t, pending)
	assert.Equal(t, "Queen", artist, "falls back to the channel name without \" - Topic\"")
	assert.Zero(t, mb.calls, "MusicBrainz needs YouTube Music's artist list, so it is skipped")
	assert.Equal(t, "Bohemian Rhapsody (Remastered 2011)", c.Name)
}

func TestCreateFromYouTubeMusic_DataAPIFailureIsFatal(t *testing.T) {
	yt := &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		return nil, errors.New("quota")
	}}
	svc := services.NewContentService(newFakeMusicRepo(), yt, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner())
	_, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	assert.Error(t, err)
}

func TestCreateFromYouTubeMusic_DuplicateURL(t *testing.T) {
	repo := newFakeMusicRepo()
	u := musicURL
	existing := repo.add(&domain.Content{URL: &u, ContentType: domain.ContentTypeYouTubeMusic})
	svc := services.NewContentService(repo, ytMeta(audioID), syncRunner())

	c, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL+"&list=RDAMVM"+audioID, 7)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, existing.ID, c.ID)
}

func TestCreateFromYouTubeMusic_DuplicateISRCAddsRelatedMedia(t *testing.T) {
	repo := newFakeMusicRepo()
	u := "https://music.youtube.com/watch?v=OTHEROTHER1"
	existing := repo.add(&domain.Content{URL: &u, ContentType: domain.ContentTypeYouTubeMusic, Response: json.RawMessage(`{"isrc":"GBUM71029604","relatedMedia":[]}`)})
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(fullTrack(), isrcMatch(), nil), syncRunner())

	c, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, existing.ID, c.ID)
	assert.Len(t, repo.rows, 1, "no second row for the same recording")

	var refs []domain.RelatedMedia
	repo.field(t, existing.ID, "relatedMedia", &refs)
	require.Len(t, refs, 1)
	assert.Equal(t, audioID, refs[0].VideoID)
	assert.Equal(t, "duplicate-isrc", refs[0].AddedFrom)
}

func TestCreateFromYouTubeMusic_LinksExistingVideoRow(t *testing.T) {
	repo := newFakeMusicRepo()
	vu := "https://www.youtube.com/watch?v=" + videoID
	video := repo.add(&domain.Content{URL: &vu, ContentType: domain.ContentTypeYouTube})
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner())

	c, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	require.NoError(t, err)
	var refs []domain.RelatedMedia
	repo.field(t, c.ID, "relatedMedia", &refs)
	require.Len(t, refs, 1)
	require.NotNil(t, refs[0].ContentID)
	assert.Equal(t, video.ID, *refs[0].ContentID)
}

func TestCreateFromYouTubeMusic_RejectsNonTracks(t *testing.T) {
	svc := services.NewContentService(newFakeMusicRepo(), ytMeta(audioID))
	_, err := svc.CreateFromYouTubeMusic(context.Background(), "https://music.youtube.com/playlist?list=OLAK5uy_x", 7)
	assert.ErrorIs(t, err, domain.ErrNotATrack)
	_, err = svc.CreateFromYouTubeMusic(context.Background(), "https://www.youtube.com/watch?v="+audioID, 7)
	assert.ErrorIs(t, err, domain.ErrInvalidURL)
	_, err = svc.CreateFromYouTubeMusic(context.Background(), "https://example.com", 7)
	assert.ErrorIs(t, err, domain.ErrInvalidURL)
}

func TestPromoteRelatedMedia(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner())
	track, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	require.NoError(t, err)

	// CreateFromYouTube (reused for promotion) derives the ID via the client.
	yt := ytMeta(videoID)
	yt.extractVideoIDFn = func(string) (string, error) { return videoID, nil }
	svc = services.NewContentService(repo, yt, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner())

	video, err := svc.PromoteRelatedMedia(context.Background(), track.ID, videoID, 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeYouTube, video.ContentType)

	var refs []domain.RelatedMedia
	repo.field(t, track.ID, "relatedMedia", &refs)
	require.NotNil(t, refs[0].ContentID)
	assert.Equal(t, video.ID, *refs[0].ContentID)
	var back int
	repo.field(t, video.ID, "relatedTo", &back)
	assert.Equal(t, track.ID, back)

	// Promoting again finds the existing row instead of failing.
	again, err := svc.PromoteRelatedMedia(context.Background(), track.ID, videoID, 7)
	require.NoError(t, err)
	assert.Equal(t, video.ID, again.ID)

	_, err = svc.PromoteRelatedMedia(context.Background(), track.ID, "NOTRELATED1", 7)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestMarkRelatedMediaUnavailable(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner())
	track, err := svc.CreateFromYouTubeMusic(context.Background(), musicURL, 7)
	require.NoError(t, err)

	require.NoError(t, svc.MarkRelatedMediaUnavailable(context.Background(), track.ID, videoID))
	var refs []domain.RelatedMedia
	repo.field(t, track.ID, "relatedMedia", &refs)
	assert.True(t, refs[0].Unavailable)
	assert.ErrorIs(t, svc.MarkRelatedMediaUnavailable(context.Background(), track.ID, "NOTRELATED1"), domain.ErrNotFound)
}

func TestCheckLyrics(t *testing.T) {
	now := time.Now().UTC()
	stored := func(l domain.LyricsAvailability) json.RawMessage {
		b, _ := json.Marshal(map[string]any{"artists": []string{"Queen"}, "lyrics": l})
		return b
	}
	length := 355
	tests := []struct {
		name      string
		response  json.RawMessage
		force     bool
		wantCalls int
	}{
		{"never checked", json.RawMessage(`{"artists":["Queen"]}`), false, 1},
		{"found is never rechecked", stored(domain.LyricsAvailability{Available: true, CheckedAt: now.AddDate(-1, 0, 0)}), false, 0},
		{"recent miss is trusted", stored(domain.LyricsAvailability{Available: false, CheckedAt: now.AddDate(0, 0, -1)}), false, 0},
		{"old miss is rechecked", stored(domain.LyricsAvailability{Available: false, CheckedAt: now.AddDate(0, 0, -31)}), false, 1},
		{"force always checks", stored(domain.LyricsAvailability{Available: true, CheckedAt: now}), true, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newFakeMusicRepo()
			u := musicURL
			c := repo.add(&domain.Content{Name: "Bohemian Rhapsody", URL: &u, ContentType: domain.ContentTypeYouTubeMusic, Length: &length, Response: tt.response})
			lyr := &fakeLyrics{match: &portservices.LyricsMatch{Available: false}}
			svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(nil, nil, lyr))

			_, err := svc.CheckLyrics(context.Background(), c.ID, tt.force)
			require.NoError(t, err)
			assert.Equal(t, tt.wantCalls, lyr.calls)
		})
	}
}

func TestCheckLyrics_OnlyMusic(t *testing.T) {
	repo := newFakeMusicRepo()
	c := repo.add(&domain.Content{ContentType: domain.ContentTypeYouTube})
	svc := services.NewContentService(repo, ytMeta(audioID), services.WithMusicEnrichment(nil, nil, &fakeLyrics{}))
	_, err := svc.CheckLyrics(context.Background(), c.ID, true)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

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
		if c.ContentType == domain.ContentTypeAudioTrack && domain.ReadMusic(c.Response).ISRC == isrc {
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

// createYT adds a YouTube Music link the way the resolver does, mapping
// AlreadyExisted back to ErrAlreadyExists so the older assertions still read.
func createYT(svc *services.ContentService, url string, userID int) (*domain.Content, error) {
	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: url, UserID: userID})
	if err != nil {
		return nil, err
	}
	if res.AlreadyExisted {
		return res.Content, domain.ErrAlreadyExists
	}
	return res.Content, nil
}

func TestCreateAudioTrackFromYouTube_FullEnrichment(t *testing.T) {
	repo := newFakeMusicRepo()
	lyr := &fakeLyrics{match: &portservices.LyricsMatch{Available: true, LRCLibID: 36978827, HasSynced: true}}
	audio := newFakeAudioRepo(repo)
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), isrcMatch(), lyr), syncRunner(), services.WithAudioTracks(audio, newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeAudioTrack, c.ContentType)
	assert.Equal(t, musicURL, *c.URL)
	assert.Equal(t, "Bohemian Rhapsody", c.Name, "YouTube Music's clean title wins over the video title")
	assert.Equal(t, 1, audio.calls["CreateWithLink"], "content and its first link are one statement")
	assert.Equal(t, 1, audio.calls["ContentByURLs"], "related videos are looked up in one batch")
	require.Len(t, audio.linksFor(c.ID), 1)
	assert.Equal(t, domain.TrackLinkKindEmbed, audio.linksFor(c.ID)[0].Kind)

	music := domain.ReadMusic(repo.rows[c.ID].Response)
	assert.Equal(t, "GBUM71029604", music.ISRC)
	assert.Equal(t, "Queen", music.Artist)
	assert.Equal(t, "A Night at the Opera", music.Album)

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

func TestCreateAudioTrackFromYouTube_NoMusicBrainzMatch(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), &fakeMB{err: domain.ErrNotFound}, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)
	m := map[string]json.RawMessage{}
	require.NoError(t, json.Unmarshal(c.Response, &m))
	assert.Empty(t, domain.ReadMusic(c.Response).ISRC)
	assert.NotEmpty(t, domain.ReadMusic(c.Response).Artist)
	assert.False(t, domain.ReadMusic(c.Response).EnrichmentPending)
}

func TestCreateAudioTrackFromYouTube_YTMusicDown(t *testing.T) {
	repo := newFakeMusicRepo()
	mb := isrcMatch()
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(&fakeYTMusic{err: errors.New("403")}, mb, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err, "unofficial enrichment failing must not block the add")
	music := domain.ReadMusic(c.Response)
	assert.True(t, music.EnrichmentPending)
	assert.Equal(t, "Queen", music.Artist, "falls back to the channel name without \" - Topic\"")
	assert.Zero(t, mb.calls, "MusicBrainz needs YouTube Music's artist list, so it is skipped")
	assert.Equal(t, "Bohemian Rhapsody (Remastered 2011)", c.Name)
}

func TestCreateAudioTrackFromYouTube_DataAPIFailureIsFatal(t *testing.T) {
	yt := &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		return nil, errors.New("quota")
	}}
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, yt, nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))
	_, err := createYT(svc, musicURL, 7)
	assert.Error(t, err)
}

func TestCreateAudioTrackFromYouTube_DuplicateURL(t *testing.T) {
	repo := newFakeMusicRepo()
	u := musicURL
	existing := repo.add(&domain.Content{URL: &u, ContentType: domain.ContentTypeAudioTrack})
	svc := services.NewContentService(repo, ytMeta(audioID), nil, syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	c, err := createYT(svc, musicURL+"&list=RDAMVM"+audioID, 7)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, existing.ID, c.ID)
}

func TestCreateAudioTrackFromYouTube_DuplicateISRCAddsLink(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), isrcMatch(), nil), syncRunner(), services.WithAudioTracks(audio, newFakeGenres()))
	first, err := createYT(svc, "https://music.youtube.com/watch?v=OTHEROTHER1", 7)
	require.NoError(t, err)
	// Make the first row carry the ISRC the second paste will resolve to.
	repo.rows[first.ID].Response = json.RawMessage(`{"music":{"provider":"youtube","isrc":"GBUM71029604"},"relatedMedia":[]}`)

	c, err := createYT(svc, musicURL, 7)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, first.ID, c.ID)
	assert.Len(t, repo.rows, 1, "no second row for the same recording")

	links := audio.linksFor(first.ID)
	require.Len(t, links, 2, "the pasted YouTube Music link joins the existing track (ADR 0005)")
	assert.Equal(t, domain.ProviderYouTube, links[1].Provider)
}

func TestCreateAudioTrackFromYouTube_LinksExistingVideoRow(t *testing.T) {
	repo := newFakeMusicRepo()
	vu := "https://www.youtube.com/watch?v=" + videoID
	video := repo.add(&domain.Content{URL: &vu, ContentType: domain.ContentTypeYouTubeVideo})
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)
	var refs []domain.RelatedMedia
	repo.field(t, c.ID, "relatedMedia", &refs)
	require.Len(t, refs, 1)
	require.NotNil(t, refs[0].ContentID)
	assert.Equal(t, video.ID, *refs[0].ContentID)
}

func TestCreateAudioTrackFromYouTube_RejectsNonTracks(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))
	_, err := createYT(svc, "https://music.youtube.com/playlist?list=OLAK5uy_x", 7)
	assert.ErrorIs(t, err, domain.ErrNotATrack)
	_, err = createYT(svc, "https://www.youtube.com/watch?v="+audioID, 7)
	assert.ErrorIs(t, err, domain.ErrInvalidURL)
	_, err = createYT(svc, "https://example.com", 7)
	assert.ErrorIs(t, err, domain.ErrInvalidURL)
}

func TestPromoteRelatedMedia(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))
	track, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)

	// CreateFromYouTube (reused for promotion) derives the ID via the client.
	yt := ytMeta(videoID)
	yt.extractVideoIDFn = func(string) (string, error) { return videoID, nil }
	svc = services.NewContentService(repo, yt, nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	video, err := svc.PromoteRelatedMedia(context.Background(), track.ID, videoID, 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeYouTubeVideo, video.ContentType)

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
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(), services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))
	track, err := createYT(svc, musicURL, 7)
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
			c := repo.add(&domain.Content{Name: "Bohemian Rhapsody", URL: &u, ContentType: domain.ContentTypeAudioTrack, Length: &length, Response: tt.response})
			lyr := &fakeLyrics{match: &portservices.LyricsMatch{Available: false}}
			svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(nil, nil, lyr))

			_, err := svc.CheckLyrics(context.Background(), c.ID, tt.force)
			require.NoError(t, err)
			assert.Equal(t, tt.wantCalls, lyr.calls)
		})
	}
}

func TestCheckLyrics_OnlyMusic(t *testing.T) {
	repo := newFakeMusicRepo()
	c := repo.add(&domain.Content{ContentType: domain.ContentTypeYouTubeVideo})
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(nil, nil, &fakeLyrics{}))
	_, err := svc.CheckLyrics(context.Background(), c.ID, true)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestCreateAudioTrackFromYouTube_WritesMusicObject(t *testing.T) {
	repo := newFakeMusicRepo()
	svc := services.NewContentService(repo, ytMeta(audioID), nil,
		services.WithMusicEnrichment(fullTrack(), isrcMatch(), &fakeLyrics{match: &portservices.LyricsMatch{}}), syncRunner(),
		services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	got, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)

	var top map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(got.Response, &top))
	assert.NotContains(t, top, "artist", "music keys are no longer top-level")
	assert.Contains(t, top, "relatedMedia")
	m := domain.ReadMusic(got.Response)
	assert.Equal(t, domain.ProviderYouTube, m.Provider)
	assert.NotEmpty(t, m.Artist)
	assert.Equal(t, "GBUM71029604", m.ISRC)
}

func TestCreateAudioTrack_YouTube_RefusesAgeRestricted(t *testing.T) {
	repo := newFakeMusicRepo()
	yt := &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		return &portservices.VideoMetadata{Title: "Song", Duration: 200, AgeRestricted: true, Response: json.RawMessage(`{"items":[]}`)}, nil
	}}
	svc := services.NewContentService(repo, yt, nil, services.WithMusicEnrichment(fullTrack(), nil, nil), syncRunner(),
		services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))
	_, err := createYT(svc, musicURL, 7)
	assert.ErrorIs(t, err, domain.ErrContentNotAllowed)
	assert.Empty(t, repo.rows)
}

func TestCreateAudioTrack_YouTube_StoresExplicitAndSuggestsGenreWithoutApplying(t *testing.T) {
	repo := newFakeMusicRepo()
	track := fullTrack()
	track.track.Explicit = true
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(track, isrcMatch(), nil), syncRunner(),
		services.WithAudioTracks(newFakeAudioRepo(repo), newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err)
	m := domain.ReadMusic(c.Response)
	assert.True(t, m.Explicit)
	require.NotNil(t, m.SuggestedGenreID, "MusicBrainz genre 'rock' matches Rock (21)")
	assert.Equal(t, 21, *m.SuggestedGenreID)
	assert.Nil(t, c.GenreID, "suggest, never apply (ADR 0006)")
}

func TestCreateAudioTrack_YouTube_DedupesByMusicBrainzID(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	existing := repo.add(&domain.Content{Name: "Bohemian Rhapsody", ContentType: domain.ContentTypeAudioTrack,
		Response: json.RawMessage(`{"music":{"provider":"spotify","musicbrainzId":"mbid-1"}}`)})
	mb := &fakeMB{rec: &portservices.Recording{MBID: "mbid-1", Genre: "rock"}} // no ISRC
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(fullTrack(), mb, nil), syncRunner(),
		services.WithAudioTracks(audio, newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, existing.ID, c.ID)
	require.Len(t, audio.linksFor(existing.ID), 1)
	assert.Equal(t, audioID, audio.linksFor(existing.ID)[0].ProviderTrackID)
	assert.Len(t, repo.rows, 1)
}

func TestCreateAudioTrack_YouTube_UnofficialUploadIsNeverMerged(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	repo.add(&domain.Content{Name: "Bohemian Rhapsody", ContentType: domain.ContentTypeAudioTrack,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Queen","isrc":"GBUM71029604"}}`)})
	upload := fullTrack()
	upload.track.VideoType = "other"
	svc := services.NewContentService(repo, ytMeta(audioID), nil, services.WithMusicEnrichment(upload, isrcMatch(), nil), syncRunner(),
		services.WithAudioTracks(audio, newFakeGenres()))

	c, err := createYT(svc, musicURL, 7)
	require.NoError(t, err, "same ISRC and same title, but an unofficial upload is its own track (ADR 0005)")
	assert.True(t, domain.IsUnofficialUpload(domain.ReadMusic(c.Response)))
	assert.Len(t, repo.rows, 2)
	assert.Zero(t, audio.calls["FindSameSongCandidates"], "no same-song prompt for uploads")
}

func TestCreateAudioTrack_YouTube_OffersSameSongCandidates(t *testing.T) {
	repo := newFakeMusicRepo()
	audio := newFakeAudioRepo(repo)
	linkOnly := repo.add(&domain.Content{Name: "Bohemian Rhapsody", ContentType: domain.ContentTypeAudioTrack,
		Response: json.RawMessage(`{"music":{"provider":"spotify","artist":"Queen"}}`)})
	svc := services.NewContentService(repo, ytMeta(audioID), nil,
		services.WithMusicEnrichment(fullTrack(), &fakeMB{err: domain.ErrNotFound}, nil), syncRunner(),
		services.WithAudioTracks(audio, newFakeGenres()))

	res, err := svc.CreateAudioTrack(context.Background(), portservices.CreateAudioTrackInput{URL: musicURL, UserID: 7})
	require.NoError(t, err)
	assert.Nil(t, res.Content)
	require.Len(t, res.Candidates, 1)
	assert.Equal(t, linkOnly.ID, res.Candidates[0].ID)
}

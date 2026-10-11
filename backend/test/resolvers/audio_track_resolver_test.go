package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

func audioServer(t *testing.T, repo *mockContentRepository, audio *mockAudioTrackRepository, genres *mockMusicGenreRepository) func(string) graphqlResponse {
	server := setupTestServerWithRepos(repo, musicYT(), &mockPerspectiveRepository{}, &mockUserRepository{}, services.WithAudioTracks(audio, genres))
	t.Cleanup(server.Close)
	return func(q string) graphqlResponse { return executeGraphQL(t, server, q) }
}

func TestCreateAudioTrack_SpotifyLinkOnly(t *testing.T) {
	audio := &mockAudioTrackRepository{createWithLinkFn: func(_ context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
		assert.Equal(t, domain.ProviderSpotify, link.Provider)
		assert.Equal(t, 21, *c.GenreID)
		c.ID = 40
		return c, false, nil
	}}
	run := audioServer(t, &mockContentRepository{}, audio, newMockGenres())

	res := run(`mutation { createAudioTrack(input: { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "Song", artist: "Queen", genreId: 21 }) {
		content { id name contentType genreId audioTrack } alreadyExisted sameSongCandidates { id } } }`)
	require.Empty(t, res.Errors)
	var data struct {
		Create struct {
			Content struct {
				ID          string         `json:"id"`
				Name        string         `json:"name"`
				ContentType string         `json:"contentType"`
				GenreID     string         `json:"genreId"`
				AudioTrack  map[string]any `json:"audioTrack"`
			} `json:"content"`
			AlreadyExisted bool             `json:"alreadyExisted"`
			Candidates     []map[string]any `json:"sameSongCandidates"`
		} `json:"createAudioTrack"`
	}
	require.NoError(t, json.Unmarshal(res.Data, &data))
	assert.Equal(t, "40", data.Create.Content.ID)
	assert.Equal(t, "AUDIO_TRACK", data.Create.Content.ContentType)
	assert.Equal(t, "21", data.Create.Content.GenreID)
	assert.Equal(t, "Queen", data.Create.Content.AudioTrack["artist"])
	assert.Empty(t, data.Create.Candidates)
}

func TestCreateAudioTrack_ReturnsCandidatesWithoutContent(t *testing.T) {
	audio := &mockAudioTrackRepository{findSameSongFn: func(context.Context, string, string, int) ([]*domain.Content, error) {
		return []*domain.Content{{ID: 3, Name: "Song", ContentType: domain.ContentTypeAudioTrack}}, nil
	}}
	run := audioServer(t, &mockContentRepository{}, audio, newMockGenres())
	res := run(`mutation { createAudioTrack(input: { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "Song" }) {
		content { id } alreadyExisted sameSongCandidates { id name } } }`)
	require.Empty(t, res.Errors)
	assert.JSONEq(t, `{"createAudioTrack":{"content":null,"alreadyExisted":false,"sameSongCandidates":[{"id":"3","name":"Song"}]}}`, string(res.Data))
}

func TestCreateAudioTrack_ErrorMessages(t *testing.T) {
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, newMockGenres())
	cases := map[string]string{
		`{ url: "https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx", title: "x" }`:             "paste a song link, not an album, playlist, or artist",
		`{ url: "https://soundcloud.com/a/b", title: "x" }`:                                        "unsupported music link",
		`{ url: "https://music.amazon.com/tracks/B07D5J5QX3" }`:                                    "a title is required",
		`{ url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "x", genreId: 5 }`: "unknown genre",
	}
	for input, want := range cases {
		res := run(`mutation { createAudioTrack(input: ` + input + `) { alreadyExisted } }`)
		require.NotEmpty(t, res.Errors, input)
		assert.Contains(t, res.Errors[0].Message, want, input)
	}
}

// Review Focus 2.
func TestSetTrackGenre_LockedMessage(t *testing.T) {
	genres := newMockGenres()
	genres.setFn = func(context.Context, int, int, int, int) (*domain.Content, error) { return nil, domain.ErrGenreLocked }
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, genres)
	res := run(`mutation { setTrackGenre(contentId: 5, genreId: 21) { id } }`)
	require.NotEmpty(t, res.Errors)
	assert.Equal(t, "genre can only be changed by the person who added this track, within 30 days of adding it", res.Errors[0].Message)
}

func TestSetTrackGenre_ReturnsGenre(t *testing.T) {
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, newMockGenres())
	res := run(`mutation { setTrackGenre(contentId: 5, genreId: 1188) { id genreId genre { id name parentId } } }`)
	require.Empty(t, res.Errors)
	assert.JSONEq(t, `{"setTrackGenre":{"id":"5","genreId":"1188","genre":{"id":"1188","name":"Polka","parentId":"19"}}}`, string(res.Data))
}

func TestMusicGenres_ListsTheTree(t *testing.T) {
	run := audioServer(t, &mockContentRepository{}, &mockAudioTrackRepository{}, newMockGenres())
	res := run(`{ musicGenres { id name parentId } }`)
	require.Empty(t, res.Errors)
	var data struct {
		MusicGenres []struct {
			ID       string  `json:"id"`
			Name     string  `json:"name"`
			ParentID *string `json:"parentId"`
		} `json:"musicGenres"`
	}
	require.NoError(t, json.Unmarshal(res.Data, &data)) // decoded: Go's encoder escapes "&" as \u0026 on the wire
	require.Len(t, data.MusicGenres, 3)
	assert.Equal(t, "19", data.MusicGenres[1].ID)
	assert.Equal(t, "Regional & Cultural", data.MusicGenres[1].Name)
	assert.Nil(t, data.MusicGenres[1].ParentID)
}

func TestContentTrackLinks_OnlyForTracks(t *testing.T) {
	u := "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
	repo := &mockContentRepository{getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
		if id == 1 {
			return &domain.Content{ID: 1, Name: "Song", URL: &u, ContentType: domain.ContentTypeAudioTrack}, nil
		}
		return &domain.Content{ID: 2, Name: "Clip", ContentType: domain.ContentTypeYouTubeVideo}, nil
	}}
	audio := &mockAudioTrackRepository{linksByContentIDsFn: func(_ context.Context, ids []int) (map[int][]domain.TrackLink, error) {
		assert.Equal(t, []int{1}, ids, "non-track rows never reach the links query")
		return map[int][]domain.TrackLink{1: {{ID: 9, ContentID: 1, Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC", URL: u,
			Kind: domain.TrackLinkKindListen, Source: domain.TrackLinkSourcePasted}}}, nil
	}}
	run := audioServer(t, repo, audio, newMockGenres())
	res := run(`{ a: contentByID(id: 1) { trackLinks { id provider kind source unavailableAt } } b: contentByID(id: 2) { trackLinks { id } } }`)
	require.Empty(t, res.Errors)
	assert.JSONEq(t, `{"a":{"trackLinks":[{"id":"9","provider":"spotify","kind":"LISTEN","source":"PASTED","unavailableAt":null}]},"b":{"trackLinks":[]}}`, string(res.Data))
	assert.Equal(t, 1, audio.linksCalls)
}

func TestMarkTrackLinkUnavailable(t *testing.T) {
	audio := &mockAudioTrackRepository{markLinkUnavailableFn: func(_ context.Context, id int) (*domain.TrackLink, error) {
		return &domain.TrackLink{ID: id, Provider: domain.ProviderYouTube, Kind: domain.TrackLinkKindEmbed, Source: domain.TrackLinkSourcePasted}, nil
	}}
	run := audioServer(t, &mockContentRepository{}, audio, newMockGenres())
	res := run(`mutation { markTrackLinkUnavailable(linkId: 9) { id kind unavailableAt } }`)
	require.Empty(t, res.Errors)
	assert.Contains(t, string(res.Data), `"id":"9"`)
}

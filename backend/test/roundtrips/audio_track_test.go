package roundtrips

import (
	"fmt"
	"testing"
	"time"
)

const createAudioTrackMutation = `mutation($input: CreateAudioTrackInput!) {
  createAudioTrack(input: $input) { content { id name } alreadyExisted sameSongCandidates { id } }
}`

type createAudioTrackResult struct {
	Content *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"content"`
	AlreadyExisted bool `json:"alreadyExisted"`
}

func TestCreateAudioTrackLinkOnly(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("audio")
	h.warm(token)
	h.gql(token, `{ musicGenres { id } }`, nil) // warm the genre cache

	trackID := fmt.Sprintf("%022d", time.Now().UnixNano())[:22]
	vars := map[string]any{"input": map[string]any{
		"url": "https://open.spotify.com/track/" + trackID, "title": "RT Song " + trackID, "artist": "RT Artist", "genreId": 21,
	}}

	// GetByLink, GetByURL, same-song candidates, one CTE (content + first link)
	data := h.roundTrips(4, token, createAudioTrackMutation, vars)
	created := decode[createAudioTrackResult](t, data, "createAudioTrack")
	if created.Content == nil || created.AlreadyExisted {
		t.Fatalf("first add should create a row: %+v", created)
	}
	h.trackContent(created.Content.ID)

	// GetByLink finds it
	data = h.roundTrips(1, token, createAudioTrackMutation, vars)
	if again := decode[createAudioTrackResult](t, data, "createAudioTrack"); !again.AlreadyExisted {
		t.Fatalf("repeat paste should return the existing row: %+v", again)
	}

	// One owner/window-scoped UPDATE ... RETURNING (the adder, inside 30 days)
	h.roundTrips(1, token, `mutation($id: IntID!) { setTrackGenre(contentId: $id, genreId: 14) { id genreId } }`,
		map[string]any{"id": created.Content.ID})

	// Served from the genre cache
	h.roundTrips(0, token, `{ musicGenres { id name parentId } }`, nil)

	// SELECT content, one batched track_links query; genre comes from the cache
	h.roundTrips(2, token, `query($id: ID!) { contentByID(id: $id) { id genre { name } trackLinks { provider url kind } } }`,
		map[string]any{"id": created.Content.ID})
}

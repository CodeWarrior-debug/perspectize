package roundtrips

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestCreateClaim(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("claim")
	parentID := h.content(userID, "claim-parent")
	h.warm(token)

	// SELECT parent, INSERT
	data := h.roundTrips(2, token, `mutation($input: CreateClaimInput!) { createClaim(input: $input) { id name } }`, map[string]any{
		"input": map[string]any{"text": "the sky is blue", "userID": userID, "parentContentID": parentID},
	})
	c := decode[struct {
		ID string `json:"id"`
	}](t, data, "createClaim")
	h.trackContent(c.ID)
}

const createFromYouTubeMutation = `mutation($input: CreateContentFromYouTubeInput!) {
  createContentFromYouTube(input: $input) { content { id name } alreadyExisted }
}`

type createContentResult struct {
	Content struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"content"`
	AlreadyExisted bool `json:"alreadyExisted"`
}

func TestCreateContentFromYouTube(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("yt")
	h.warm(token)
	url := fmt.Sprintf("https://www.youtube.com/watch?v=rt%09d", time.Now().UnixNano()%1_000_000_000)
	vars := map[string]any{"input": map[string]any{"url": url, "userId": userID}}

	// SELECT by URL (skips the YouTube call for known videos), INSERT ... ON CONFLICT RETURNING
	data := h.roundTrips(2, token, createFromYouTubeMutation, vars)
	created := decode[createContentResult](t, data, "createContentFromYouTube")
	h.trackContent(created.Content.ID)
	if created.AlreadyExisted {
		t.Fatal("first create reported alreadyExisted")
	}

	// SELECT by URL finds it
	data = h.roundTrips(1, token, createFromYouTubeMutation, vars)
	again := decode[createContentResult](t, data, "createContentFromYouTube")
	if !again.AlreadyExisted || again.Content.ID != created.Content.ID {
		t.Fatalf("second create should return the existing row: %+v", again)
	}

	// SELECT (needs the URL to call YouTube), UPDATE ... RETURNING
	h.roundTrips(2, token, `mutation($id: IntID!) { updateContentSourceData(contentId: $id) { id name } }`,
		map[string]any{"id": created.Content.ID})
}

// A DO UPDATE refresh (the concurrent-create race in CreateFromYouTube) must
// report the row as pre-existing. Before RETURNING, RowsAffected was 1 for
// both an insert and a refresh, so this always said "created".
func TestGetOrCreateByURLReportsRefreshAsExisting(t *testing.T) {
	h := newHarness(t)
	userID, _ := h.user("upsert")
	url := fmt.Sprintf("https://example.test/upsert/%d", time.Now().UnixNano())
	c := &domain.Content{Name: "u", URL: &url, ContentType: domain.ContentTypeYouTube, AddedByUserID: userID}

	first, existed, err := h.contentRepo.GetOrCreateByURL(context.Background(), c, true)
	require.NoError(t, err)
	h.contentIDs = append(h.contentIDs, first.ID)
	require.False(t, existed)

	h.counter.Reset()
	second, existed, err := h.contentRepo.GetOrCreateByURL(context.Background(), c, true)
	require.NoError(t, err)
	require.True(t, existed)
	require.Equal(t, first.ID, second.ID)
	require.Len(t, h.counter.Statements(), 1)
}

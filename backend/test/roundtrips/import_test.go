package roundtrips

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// staticLister resolves any channel ref and lists 30 videos in one batch.
// Ids are valid 11-character YouTube ids ("r" + 7 hex + 3 digits), unique per
// run: CreateFromYouTube normalizes the URL from the id, so an invalid id
// would be stored under a different URL and never match its staged row.
type staticLister struct{}

func (staticLister) Resolve(_ context.Context, ref string) (*portservices.ResolvedImportSource, error) {
	return &portservices.ResolvedImportSource{ID: "UCroundtrip", Title: "Channel " + ref, URL: "https://www.youtube.com/" + ref}, nil
}

func (staticLister) List(_ context.Context, _ portservices.ResolvedImportSource, _ *domain.ImportPersonRole, emit portservices.ImportBatchFunc) error {
	salt := time.Now().UnixNano()
	batch := make([]*domain.ImportItemWithDetails, 30)
	for i := range batch {
		id := fmt.Sprintf("r%07x%03d", salt&0xFFFFFFF, i)
		views := int64(1000 + i)
		summary := "Summary"
		batch[i] = &domain.ImportItemWithDetails{
			Item: domain.ImportItem{
				ExternalID: id, DestinationType: domain.ContentTypeYouTubeVideo,
				CanonicalURL: "https://www.youtube.com/watch?v=" + id, Kind: domain.ImportItemKindVideo,
				Title: fmt.Sprintf("Video %02d", i), Summary: &summary, ViewCount: &views, Position: i, StatsFetchedAt: time.Now().UTC(),
			},
			Details: domain.ImportItemDetails{Description: "Full description", Tags: []string{"t"}},
		}
	}
	return emit(batch)
}

const createImportJobMutation = `mutation($input: CreateImportJobInput!) {
  createImportJob(input: $input) { id name sources { id title status destinationType } }
}`

const importJobQuery = `query($id: ID!) {
  importJob(id: $id) {
    id name
    sources { id title status itemCount fetchedAt destinationType }
    items { id title destinationType kind viewCount likeCount inLibrary contentId importStatus summary }
  }
}`

const importItemsMutation = `mutation($input: ImportItemsInput!) {
  importItems(input: $input) { queued alreadyInLibrary alreadyQueued notFound }
}`

type rtImportJob struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Sources []struct {
		ID              string  `json:"id"`
		Title           string  `json:"title"`
		Status          string  `json:"status"`
		ItemCount       int     `json:"itemCount"`
		FetchedAt       *string `json:"fetchedAt"`
		DestinationType string  `json:"destinationType"`
	} `json:"sources"`
	Items []struct {
		ID              string   `json:"id"`
		Title           string   `json:"title"`
		DestinationType string   `json:"destinationType"`
		Kind            string   `json:"kind"`
		ViewCount       *float64 `json:"viewCount"`
		LikeCount       *float64 `json:"likeCount"`
		InLibrary       bool     `json:"inLibrary"`
		ContentID       *string  `json:"contentId"`
		ImportStatus    *string  `json:"importStatus"`
		Summary         *string  `json:"summary"`
	} `json:"items"`
}

// adminUser creates a user and promotes it before its first request (the
// auth middleware caches users, so the role must be set before it is read).
func adminUser(t *testing.T, h *harness, name string) (int, string) {
	t.Helper()
	id, token := h.user(name)
	require.NoError(t, h.db.Exec("UPDATE users SET role = 'admin' WHERE id = ?", id).Error)
	return id, token
}

func createRoundTripImport(t *testing.T, h *harness, token string) rtImportJob {
	t.Helper()
	data := h.gql(token, createImportJobMutation, map[string]any{"input": map[string]any{
		"name": "Round trip", "sources": []map[string]any{{"sourceType": "YOUTUBE_CHANNEL", "ref": "@rt"}},
	}})
	job := decode[rtImportJob](t, data, "createImportJob")
	h.runBackground() // list the source
	return job
}

// TestCreateImportJobRoundTrips pins createImportJob: the job INSERT and one
// multi-row sources INSERT. Listing runs in the background and isn't counted.
func TestCreateImportJobRoundTrips(t *testing.T) {
	h := newHarness(t)
	_, token := adminUser(t, h, "imp-c")
	h.warm(token)

	data := h.roundTrips(2, token, createImportJobMutation, map[string]any{"input": map[string]any{
		"name": "Peterson", "sources": []map[string]any{{"sourceType": "YOUTUBE_CHANNEL", "ref": "@JordanBPeterson"}},
	}})
	job := decode[rtImportJob](t, data, "createImportJob")
	require.Len(t, job.Sources, 1)
	assert.Equal(t, "LISTING", job.Sources[0].Status)
	assert.Equal(t, "YOUTUBE_VIDEO", job.Sources[0].DestinationType)
	assert.Equal(t, "Channel @JordanBPeterson", job.Sources[0].Title)
	require.Len(t, h.background, 1, "listing was started in the background")
}

const createRequestMutation = `mutation($input: CreateImportJobInput!) {
  createImportJob(input: $input) { id requestStatus sources { status } }
}`

const reviewImportJobMutation = `mutation($input: ReviewImportJobInput!) {
  reviewImportJob(input: $input) { id requestStatus reviewNote reviewedAt sources { status } }
}`

const importJobsQuery = `{ importJobs { id name requestStatus requestedBy { username } sources { id status } } }`

type rtRequest struct {
	ID            string  `json:"id"`
	RequestStatus string  `json:"requestStatus"`
	ReviewNote    *string `json:"reviewNote"`
	ReviewedAt    *string `json:"reviewedAt"`
	Sources       []struct {
		Status string `json:"status"`
	} `json:"sources"`
}

// TestImportRequestRoundTrips pins a non-admin's request (count their open
// requests, insert the job, insert its sources: 3 statements, nothing listed)
// and an admin approving it (load the job and sources, review the job, start
// its sources: 4), after which listing runs in the background.
func TestImportRequestRoundTrips(t *testing.T) {
	h := newHarness(t)
	_, adminToken := adminUser(t, h, "imp-ra")
	_, token := h.user("imp-ru")
	h.warm(token)

	data := h.roundTrips(3, token, createRequestMutation, map[string]any{"input": map[string]any{
		"name": "Gaither", "sources": []map[string]any{{"sourceType": "YOUTUBE_CHANNEL", "ref": "@GaitherMusic"}},
	}})
	req := decode[rtRequest](t, data, "createImportJob")
	assert.Equal(t, "REQUESTED", req.RequestStatus)
	assert.Equal(t, "WAITING", req.Sources[0].Status)
	assert.Empty(t, h.background, "a request lists nothing until approved")

	msg := h.gqlError(token, reviewImportJobMutation, map[string]any{"input": map[string]any{"jobId": req.ID, "approve": true}})
	assert.Contains(t, msg, "only an admin may review")

	h.warm(adminToken)
	data = h.roundTrips(4, adminToken, reviewImportJobMutation, map[string]any{"input": map[string]any{"jobId": req.ID, "approve": true}})
	approved := decode[rtRequest](t, data, "reviewImportJob")
	assert.Equal(t, "APPROVED", approved.RequestStatus)
	assert.NotNil(t, approved.ReviewedAt)
	assert.Equal(t, "LISTING", approved.Sources[0].Status)
	require.Len(t, h.background, 1, "approval started listing")
	h.runBackground()

	jobs := h.gql(token, importJobQuery, map[string]any{"id": req.ID})
	assert.Equal(t, "READY", decode[rtImportJob](t, jobs, "importJob").Sources[0].Status)
}

// TestImportJobsRoundTrips pins the import list: jobs, all their sources, and
// one batched lookup of every requester, whatever the number of jobs.
func TestImportJobsRoundTrips(t *testing.T) {
	h := newHarness(t)
	_, adminToken := adminUser(t, h, "imp-la")
	_, token := h.user("imp-lu")
	createRoundTripImport(t, h, adminToken)
	h.gql(token, createRequestMutation, map[string]any{"input": map[string]any{
		"name": "Request", "sources": []map[string]any{{"sourceType": "YOUTUBE_CHANNEL", "ref": "@r"}},
	}})
	h.warm(token)

	data := h.roundTrips(3, token, importJobsQuery, nil)
	type listed struct {
		Name          string `json:"name"`
		RequestStatus string `json:"requestStatus"`
		RequestedBy   *struct {
			Username string `json:"username"`
		} `json:"requestedBy"`
	}
	var mine []listed
	for _, j := range decode[[]listed](t, data, "importJobs") {
		if j.Name == "Round trip" || j.Name == "Request" {
			mine = append(mine, j)
		}
	}
	require.Len(t, mine, 2)
	for _, j := range mine {
		require.NotNil(t, j.RequestedBy, j.Name)
		assert.NotEmpty(t, j.RequestedBy.Username)
	}
}

// TestImportJobRoundTrips pins one sheet load: the job, its sources and every
// row (with library status) is three queries, whatever the number of rows.
func TestImportJobRoundTrips(t *testing.T) {
	h := newHarness(t)
	_, token := adminUser(t, h, "imp-s")
	job := createRoundTripImport(t, h, token)
	h.warm(token)

	data := h.roundTrips(3, token, importJobQuery, map[string]any{"id": job.ID})
	got := decode[rtImportJob](t, data, "importJob")
	require.Len(t, got.Items, 30)
	assert.Equal(t, "READY", got.Sources[0].Status)
	assert.Equal(t, 30, got.Sources[0].ItemCount)
	assert.NotNil(t, got.Sources[0].FetchedAt)
	assert.Equal(t, "Video 00", got.Items[0].Title)
	assert.Equal(t, "YOUTUBE_VIDEO", got.Items[0].DestinationType)
	assert.Nil(t, got.Items[0].LikeCount)
	assert.False(t, got.Items[0].InLibrary)
}

// TestImportItemsRoundTrips pins importItems on the request (read the picked
// rows, queue them: two statements), then checks the background import.
func TestImportItemsRoundTrips(t *testing.T) {
	h := newHarness(t)
	_, adminToken := adminUser(t, h, "imp-ia")
	job := createRoundTripImport(t, h, adminToken)
	_, token := h.user("imp-iu")
	sheet := decode[rtImportJob](t, h.gql(token, importJobQuery, map[string]any{"id": job.ID}), "importJob")
	h.warm(token)

	ids := []string{sheet.Items[0].ID, sheet.Items[1].ID, sheet.Items[2].ID}
	data := h.roundTrips(2, token, importItemsMutation, map[string]any{"input": map[string]any{"jobId": job.ID, "itemIds": ids}})
	type result struct {
		Queued, AlreadyInLibrary, AlreadyQueued, NotFound int
	}
	assert.Equal(t, result{Queued: 3}, decode[result](t, data, "importItems"))

	h.runBackground() // the worker pool imports through the fixture YouTube client
	after := decode[rtImportJob](t, h.gql(token, importJobQuery, map[string]any{"id": job.ID}), "importJob")
	for _, it := range after.Items[:3] {
		require.NotNil(t, it.ImportStatus, it.Title)
		assert.Equal(t, "IMPORTED", *it.ImportStatus, it.Title)
		assert.True(t, it.InLibrary, it.Title)
		require.NotNil(t, it.ContentID)
		h.trackContent(*it.ContentID)
	}
	assert.Nil(t, after.Items[3].ImportStatus)

	again := decode[result](t, h.gql(token, importItemsMutation, map[string]any{"input": map[string]any{"jobId": job.ID, "itemIds": ids}}), "importItems")
	assert.Equal(t, result{AlreadyInLibrary: 3}, again)
}

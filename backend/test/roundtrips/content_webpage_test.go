package roundtrips

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// stubWebPages stands in for the SSRF-safe fetch client: no network, a page
// whose final URL is the one requested.
type stubWebPages struct{}

func (stubWebPages) Fetch(_ context.Context, rawURL string) (domain.WebPageMeta, error) {
	return domain.WebPageMeta{
		SchemaVersion: domain.WebPageSchemaVersion,
		FinalURL:      rawURL,
		Domain:        "stub.test",
		Fetch:         domain.WebPageFetch{Status: domain.FetchStatusOK, At: time.Now()},
	}, nil
}

const createFromWebPageMutation = `mutation($input: CreateContentFromWebPageInput!) {
  createContentFromWebPage(input: $input) {
    content { id name url contentType }
    alreadyExisted
  }
}`

const previewWebPageQuery = `query($url: String!) {
  previewWebPage(url: $url) { finalUrl domain title alreadyExistsContentId }
}`

func TestCreateContentFromWebPage(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("webpage")
	h.warm(token)
	// A unique host per run, so the dedupe row is this test's own.
	url := fmt.Sprintf("https://webpage-rt-%d.test/post", time.Now().UnixNano())
	vars := map[string]any{"input": map[string]any{"url": url, "webPageRoles": []string{"BLOG_POST"}}}

	type createResult struct {
		Content struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			URL         string `json:"url"`
			ContentType string `json:"contentType"`
		} `json:"content"`
		AlreadyExisted bool `json:"alreadyExisted"`
	}

	// New URL: one dedupe lookup, then one INSERT ... ON CONFLICT ... RETURNING.
	data := h.roundTrips(2, token, createFromWebPageMutation, vars)
	created := decode[createResult](t, data, "createContentFromWebPage")
	h.trackContent(created.Content.ID)
	if created.Content.ContentType != "WEB_PAGE" || created.AlreadyExisted {
		t.Fatalf("new add should be a fresh WEB_PAGE row: %+v", created)
	}

	// Duplicate add: a single SELECT by canonical URL, no fetch, no insert.
	data = h.roundTrips(1, token, createFromWebPageMutation, vars)
	again := decode[createResult](t, data, "createContentFromWebPage")
	if again.Content.ID != created.Content.ID || !again.AlreadyExisted {
		t.Fatalf("duplicate add should return the existing row: %+v vs %+v", again, created)
	}
}

func TestPreviewWebPage(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("wp-preview")
	h.warm(token)
	url := fmt.Sprintf("https://webpage-preview-rt-%d.test/post", time.Now().UnixNano())
	vars := map[string]any{"url": url}

	type previewResult struct {
		FinalURL               string  `json:"finalUrl"`
		Domain                 string  `json:"domain"`
		AlreadyExistsContentID *string `json:"alreadyExistsContentId"`
	}

	// Nothing saved yet: one lookup, no write, and no existing ID.
	data := h.roundTrips(1, token, previewWebPageQuery, vars)
	before := decode[previewResult](t, data, "previewWebPage")
	if before.AlreadyExistsContentID != nil {
		t.Fatalf("an unsaved page must not report an existing row: %+v", before)
	}

	// Save it, then the preview reports the saved row.
	created := h.roundTrips(2, token, createFromWebPageMutation, map[string]any{"input": map[string]any{"url": url}})
	type createResult struct {
		Content struct {
			ID string `json:"id"`
		} `json:"content"`
	}
	row := decode[createResult](t, created, "createContentFromWebPage")
	h.trackContent(row.Content.ID)

	data = h.roundTrips(1, token, previewWebPageQuery, vars)
	after := decode[previewResult](t, data, "previewWebPage")
	if after.AlreadyExistsContentID == nil || *after.AlreadyExistsContentID != row.Content.ID {
		t.Fatalf("a saved page should report its row id %q: %+v", row.Content.ID, after)
	}
}

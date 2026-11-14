package openlibrary

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

func TestClient_FetchWork_EastOfEden(t *testing.T) {
	var gotPath string
	fixture := serveFixture(t, "work_east_of_eden.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		fixture(w, r)
	})

	work, err := c.FetchWork(context.Background(), "OL23166W")
	require.NoError(t, err)
	assert.Equal(t, "/works/OL23166W.json", gotPath)

	assert.True(t, strings.HasPrefix(work.Description, "Steinbeck considered East of Eden"))
	assert.NotContains(t, work.Description, "\r")
	assert.NotContains(t, work.Description, "Contains:")
	assert.True(t, strings.HasSuffix(work.Description, "([source](http://www.steinbeck.org/about-john/his-works/))"),
		"description should end at the source line, got tail %q", work.Description[max(0, len(work.Description)-80):])

	require.Len(t, work.RelatedWorks, 6, "2 'Contains' + 4 'Also contained in' links")
	assert.Equal(t, services.BookRelatedWork{Title: "East of Eden 1/2", URL: "https://openlibrary.org/works/OL17811975W"}, work.RelatedWorks[0])
	assert.Equal(t, services.BookRelatedWork{Title: "Reader's Digest Condensed Books: Spring 1953 Selections", URL: "https://openlibrary.org/works/OL15158232W"}, work.RelatedWorks[5])
}

func TestClient_FetchWork_PlainStringDescriptionVerbatim(t *testing.T) {
	raw := readFixture(t, "work_atomic_habits.json")
	var fx struct {
		Description string `json:"description"`
	}
	require.NoError(t, json.Unmarshal(raw, &fx))

	c := newTestClient(t, serveFixture(t, "work_atomic_habits.json"))
	work, err := c.FetchWork(context.Background(), "OL17930368W")
	require.NoError(t, err)
	assert.Equal(t, fx.Description, work.Description, "plain-string description is returned verbatim")
	require.NotNil(t, work.RelatedWorks, "RelatedWorks is never nil")
	assert.Empty(t, work.RelatedWorks)
}

func TestClient_FetchWork_InvalidIDMakesNoRequest(t *testing.T) {
	for _, id := range []string{"", "OL1W/../x", "OL1M", "ol1w", "OL23166W?x=1"} {
		t.Run(id, func(t *testing.T) {
			hit := false
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				hit = true
				w.WriteHeader(http.StatusOK)
			})
			_, err := c.FetchWork(context.Background(), id)
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.False(t, hit, "no request may be made for an invalid id")
		})
	}
}

func TestClient_FetchWork_NotFound(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	_, err := c.FetchWork(context.Background(), "OL1W")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestClient_FetchWork_UpstreamErrorSanitized(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	})
	_, err := c.FetchWork(context.Background(), "OL1W")
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrOpenLibraryAPI)
	assert.NotContains(t, err.Error(), "http")
	assert.NotContains(t, err.Error(), "/works/")
	assert.NotContains(t, err.Error(), "boom")
}

func TestClient_ResolveEdition_ReturnsWorkKey(t *testing.T) {
	var gotPath string
	fixture := serveFixture(t, "isbn_east_of_eden.json")
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		fixture(w, r)
	})

	workKey, err := c.ResolveEdition(context.Background(), "OL22640535M")
	require.NoError(t, err)
	assert.Equal(t, "/books/OL22640535M.json", gotPath)
	assert.Equal(t, "OL23166W", workKey)
}

func TestClient_ResolveEdition_NoWorksIsUpstreamError(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"key":"/books/OL1M"}`))
	})
	_, err := c.ResolveEdition(context.Background(), "OL1M")
	assert.ErrorIs(t, err, ErrOpenLibraryAPI)
}

func TestClient_ResolveEdition_WorkIDRejected(t *testing.T) {
	hit := false
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		hit = true
	})
	_, err := c.ResolveEdition(context.Background(), "OL23166W")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.False(t, hit)
}

func TestClient_ResolveEdition_NotFound(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	_, err := c.ResolveEdition(context.Background(), "OL1M")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

// TestParseWorkRecord_DescriptionShapes: every description shape yields clean
// \n text or no description, never an error.
func TestParseWorkRecord_DescriptionShapes(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{"object with value", `{"description":{"type":"/type/text","value":"a"}}`, "a"},
		{"plain string", `{"description":"a"}`, "a"},
		{"object with CRLF normalised", `{"description":{"type":"/type/text","value":"a\r\nb"}}`, "a\nb"},
		{"plain string with CRLF normalised", `{"description":"a\r\nb"}`, "a\nb"},
		{"empty string", `{"description":""}`, ""},
		{"absent", `{"title":"x"}`, ""},
		{"null", `{"description":null}`, ""},
		{"object without value", `{"description":{"type":"/type/text"}}`, ""},
		{"unexpected number", `{"description":42}`, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			work, err := parseWorkRecord([]byte(tt.body))
			require.NoError(t, err)
			assert.Equal(t, tt.want, work.Description)
			require.NotNil(t, work.RelatedWorks)
			assert.Empty(t, work.RelatedWorks)
		})
	}
}

func TestParseWorkRecord_InvalidJSONIsUpstreamError(t *testing.T) {
	_, err := parseWorkRecord([]byte(`<html>`))
	assert.ErrorIs(t, err, ErrOpenLibraryAPI)
}

func TestSplitRelatedWorks(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		wantDesc    string
		wantRelated []services.BookRelatedWork
	}{
		{
			name:     "no rule keeps whole text",
			text:     "Just a description.",
			wantDesc: "Just a description.",
		},
		{
			name:     "rule followed by an ordinary paragraph keeps the full text",
			text:     "Intro.\n\n---\n\nAn ordinary paragraph after a rule.",
			wantDesc: "Intro.\n\n---\n\nAn ordinary paragraph after a rule.",
		},
		{
			name:     "empty description",
			text:     "",
			wantDesc: "",
		},
		{
			name:     "relative work link becomes canonical",
			text:     "Desc.\n\n---\n\nContains:\n\n- [X](/works/OL1W/X)",
			wantDesc: "Desc.",
			wantRelated: []services.BookRelatedWork{
				{Title: "X", URL: "https://openlibrary.org/works/OL1W"},
			},
		},
		{
			name:     "non-work link in the tail is dropped",
			text:     "Desc.\n\n---\n\nAlso contained in:\n\n- [Ext](https://example.com)\n- [Work](https://openlibrary.org/works/OL2W/Work)",
			wantDesc: "Desc.",
			wantRelated: []services.BookRelatedWork{
				{Title: "Work", URL: "https://openlibrary.org/works/OL2W"},
			},
		},
		{
			name:     "duplicate URLs collapse to one",
			text:     "Desc.\n\n---\n\nContains:\n\n- [A](https://openlibrary.org/works/OL3W)\n- [A again](https://openlibrary.org/works/OL3W/A)",
			wantDesc: "Desc.",
			wantRelated: []services.BookRelatedWork{
				{Title: "A", URL: "https://openlibrary.org/works/OL3W"},
			},
		},
		{
			name:     "CRLF rule is recognised",
			text:     "Desc.\r\n\r\n---\r\n\r\nContains:\r\n\r\n- [A](https://openlibrary.org/works/OL4W)",
			wantDesc: "Desc.",
			wantRelated: []services.BookRelatedWork{
				{Title: "A", URL: "https://openlibrary.org/works/OL4W"},
			},
		},
		{
			name:     "rule heading match is case-insensitive",
			text:     "Desc.\n\n---\n\nalso CONTAINED IN:\n\n- [A](https://openlibrary.org/works/OL5W)",
			wantDesc: "Desc.",
			wantRelated: []services.BookRelatedWork{
				{Title: "A", URL: "https://openlibrary.org/works/OL5W"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			desc, related := splitRelatedWorks(tt.text)
			assert.Equal(t, tt.wantDesc, desc)
			require.NotNil(t, related, "related is never nil")
			if tt.wantRelated == nil {
				assert.Empty(t, related)
			} else {
				assert.Equal(t, tt.wantRelated, related)
			}
		})
	}
}

package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestParseBookInput_Accepts(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		wantKind bookInputKind
		wantID   string
	}{
		{"canonical work url", "https://openlibrary.org/works/OL23166W", bookInputWorkID, "OL23166W"},
		{"http, www, slug and query", "http://www.openlibrary.org/works/OL23166W/East_of_Eden?x=1", bookInputWorkID, "OL23166W"},
		{"scheme-less lowercase id", "openlibrary.org/works/ol23166w", bookInputWorkID, "OL23166W"},
		{"fragment", "https://openlibrary.org/works/OL23166W#reviews", bookInputWorkID, "OL23166W"},
		{"surrounding whitespace", "  https://openlibrary.org/works/OL23166W  ", bookInputWorkID, "OL23166W"},
		{"edition url", "https://openlibrary.org/books/OL22640535M", bookInputEditionID, "OL22640535M"},
		{"edition url with slug", "https://openlibrary.org/books/OL22640535M/East_of_Eden", bookInputEditionID, "OL22640535M"},
		{"hyphenated isbn-13", "978-0-434-74002-4", bookInputISBN, "9780434740024"},
		{"spaced isbn-10", "0 434 74002 0", bookInputISBN, "0434740020"},
		{"isbn-10 with trailing x", "043474002x", bookInputISBN, "043474002X"},
		{"plain isbn-13", "9780434740024", bookInputISBN, "9780434740024"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kind, id, err := parseBookInput(tt.raw)
			require.NoError(t, err)
			assert.Equal(t, tt.wantKind, kind)
			assert.Equal(t, tt.wantID, id)
		})
	}
}

func TestParseBookInput_Rejects(t *testing.T) {
	tests := []struct {
		name string
		raw  string
	}{
		{"author url", "https://openlibrary.org/authors/OL26320A"},
		{"other host", "https://example.com/works/OL23166W"},
		{"host as a subdomain prefix", "https://openlibrary.org.evil.com/works/OL1W"},
		{"bare work id", "OL23166W"},
		{"empty", ""},
		{"whitespace only", "   "},
		{"path traversal without a url", "OL1W/../x"},
		{"work path with an edition id", "https://openlibrary.org/works/OL1M"},
		{"edition path with a work id", "https://openlibrary.org/books/OL1W"},
		{"id with extra characters", "https://openlibrary.org/works/OL1Wx"},
		{"12-digit number", "978043474002"},
		{"14-digit number", "97804347400241"},
		{"isbn with a letter", "97804347400X4"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := parseBookInput(tt.raw)
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}

func TestNormalizeISBN(t *testing.T) {
	assert.Equal(t, "9780434740024", normalizeISBN("978-0-434-74002-4"))
	assert.Equal(t, "0434740020", normalizeISBN("0 434 74002 0"))
	assert.Equal(t, "043474002X", normalizeISBN("043474002x"))
	assert.Equal(t, "", normalizeISBN(""))
}

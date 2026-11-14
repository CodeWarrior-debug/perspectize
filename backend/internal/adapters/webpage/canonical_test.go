package webpage

import (
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCanonicalize(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"uppercase host lowercased, path case kept", "HTTPS://Example.COM/Path/Case", "https://example.com/Path/Case"},
		{"www dropped", "https://www.example.com/a", "https://example.com/a"},
		{"fragment dropped", "https://example.com/a#section-2", "https://example.com/a"},
		{"tracking params dropped, others kept in original order", "https://example.com/a?utm_source=x&id=5&fbclid=y&b=2&gclid=z&utm_medium=m", "https://example.com/a?id=5&b=2"},
		{"only tracking params leaves no question mark", "https://example.com/a?utm_source=x", "https://example.com/a"},
		{"default https port dropped", "https://example.com:443/a", "https://example.com/a"},
		{"default http port dropped", "http://example.com:80/", "http://example.com/"},
		{"non-default port kept", "https://example.com:8443/a", "https://example.com:8443/a"},
		{"trailing slash dropped", "https://example.com/a/", "https://example.com/a"},
		{"root slash kept", "https://example.com/", "https://example.com/"},
		{"bare host gets root path", "https://example.com", "https://example.com/"},
		{"root with a query keeps the query", "https://example.com/?p=12", "https://example.com/?p=12"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Canonicalize(tt.in)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestCanonicalize_RejectsNonWebURLs(t *testing.T) {
	for _, in := range []string{
		"ftp://example.com/x",
		"example.com/x",
		"//example.com/x",
		"mailto:someone@example.com",
		"https:///no-host",
	} {
		t.Run(in, func(t *testing.T) {
			_, err := Canonicalize(in)
			require.Error(t, err)
			assert.True(t, errors.Is(err, domain.ErrInvalidInput), "want ErrInvalidInput, got %v", err)
		})
	}
}

func TestPreferDeclaredCanonical(t *testing.T) {
	t.Run("same registrable domain: declared is used", func(t *testing.T) {
		got := PreferDeclaredCanonical("https://blog.example.com/post?ref=x", "https://example.com/post")
		assert.Equal(t, "https://example.com/post", got)
	})
	t.Run("different registrable domain: declared is ignored", func(t *testing.T) {
		got := PreferDeclaredCanonical("https://example.com/a", "https://evil.test/a")
		assert.Equal(t, "https://example.com/a", got)
	})
	t.Run("empty declared: fetched is kept", func(t *testing.T) {
		assert.Equal(t, "https://example.com/a", PreferDeclaredCanonical("https://example.com/a", ""))
	})
	t.Run("unparseable declared: fetched is kept", func(t *testing.T) {
		assert.Equal(t, "https://example.com/a", PreferDeclaredCanonical("https://example.com/a", "ftp://example.com/b"))
	})
	t.Run("IP host has no registrable domain: fetched is kept", func(t *testing.T) {
		assert.Equal(t, "http://127.0.0.1/x", PreferDeclaredCanonical("http://127.0.0.1/x", "http://127.0.0.1/y"))
	})
}

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

// PreferDeclaredCanonical's key rule: a declared canonical is used only when its
// host (www. dropped, lowercased) equals the host of the page that was actually
// read, and it is http(s) on the default port. A registrable-domain match is not
// enough: a sibling subdomain could otherwise claim another user's URL.
func TestFetchURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"www, trailing slash and tracking query kept", "https://www.example.com/a/?utm_source=x", "https://www.example.com/a/?utm_source=x"},
		{"fragment removed", "https://example.com/a#top", "https://example.com/a"},
		{"userinfo removed", "https://user:pw@example.com/a", "https://example.com/a"},
		{"scheme folded to lowercase", "HTTPS://example.com/a", "https://example.com/a"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := FetchURL(tt.in)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}

	for _, in := range []string{"ftp://example.com/x", "//example.com/x", "https:///no-host"} {
		t.Run("rejects "+in, func(t *testing.T) {
			_, err := FetchURL(in)
			assert.True(t, errors.Is(err, domain.ErrInvalidInput), "want ErrInvalidInput, got %v", err)
		})
	}
}

func TestPreferDeclaredCanonical(t *testing.T) {
	const requested = "https://example.com/a"
	tests := []struct {
		name     string
		final    string
		declared string
		want     string
	}{
		{
			name:     "same host: declared is used",
			final:    "https://example.com/a?ref=x",
			declared: "https://example.com/post",
			want:     "https://example.com/post",
		},
		{
			name:     "www on the declared side only: same host, declared is used",
			final:    "https://example.com/a",
			declared: "https://www.example.com/post/",
			want:     "https://example.com/post",
		},
		{
			name:     "same registrable domain, different host: ignored",
			final:    "https://blog.example.com/a",
			declared: "https://example.com/post",
			want:     requested,
		},
		{
			name:     "sibling subdomain on a shared platform: ignored",
			final:    "https://attacker.substack.com/a",
			declared: "https://bob.substack.com/post",
			want:     requested,
		},
		{
			name:     "cross-domain declared: ignored",
			final:    "https://example.com/a",
			declared: "https://evil.test/a",
			want:     requested,
		},
		{
			name:     "open redirect: the page read is on another host, so its declared URL is ignored",
			final:    "https://evil.test/landing",
			declared: "https://example.com/post",
			want:     requested,
		},
		{
			name:     "non-default port: ignored",
			final:    "https://example.com/a",
			declared: "https://example.com:8443/post",
			want:     requested,
		},
		{
			name:     "default http port is not a non-default port: used",
			final:    "http://example.com/a",
			declared: "http://example.com:80/post",
			want:     "http://example.com/post",
		},
		{
			name:     "non-http scheme: ignored",
			final:    "https://example.com/a",
			declared: "ftp://example.com/post",
			want:     requested,
		},
		{
			name:     "empty declared: requested is kept",
			final:    "https://example.com/a",
			declared: "",
			want:     requested,
		},
		{
			name:     "IP host, same address: declared is used",
			final:    "http://127.0.0.1/y",
			declared: "http://127.0.0.1/x",
			want:     "http://127.0.0.1/x",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, PreferDeclaredCanonical(requested, tt.final, tt.declared))
		})
	}
}

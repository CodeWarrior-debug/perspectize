// Package webpage fetches and reads the metadata of a pasted webpage: the URL
// canonicaliser, the SSRF-safe HTTP client and the <head> parser.
package webpage

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// isTrackingParam reports whether a query key is campaign or click-tracking noise
// that is dropped from the dedupe key.
func isTrackingParam(key string) bool {
	k := strings.ToLower(key)
	return strings.HasPrefix(k, "utm_") || k == "fbclid" || k == "gclid"
}

// parseWebURL parses a pasted link and enforces what both the fetch and the dedupe
// key need: an http or https scheme and a host. Userinfo is left in place for the
// caller to remove.
func parseWebURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("%w: not a valid URL", domain.ErrInvalidInput)
	}
	if scheme := strings.ToLower(u.Scheme); scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("%w: only http and https links can be saved", domain.ErrInvalidInput)
	}
	if u.Hostname() == "" {
		return nil, fmt.Errorf("%w: the link has no host", domain.ErrInvalidInput)
	}
	return u, nil
}

// FetchURL returns the URL to request for a pasted link. It is the link as the
// user wrote it (host, www., trailing slash and query kept), so a site that
// serves only one form of its URLs still reads, with the userinfo and fragment
// removed: userinfo would become an Authorization header, and a fragment is
// never sent. The scheme and host rules are those of Canonicalize.
func FetchURL(raw string) (string, error) {
	u, err := parseWebURL(raw)
	if err != nil {
		return "", err
	}
	u.User = nil
	u.Fragment = ""
	u.RawFragment = ""
	return u.String(), nil
}

// Canonicalize returns the dedupe key for a webpage URL: lowercase scheme and
// host, www. dropped, fragment and userinfo dropped, tracking parameters
// (utm_*, fbclid, gclid) dropped, default port dropped, trailing slash dropped
// except on the root. The remaining query parameters keep their original order
// and encoding. Only http and https URLs are accepted.
func Canonicalize(raw string) (string, error) {
	u, err := parseWebURL(raw)
	if err != nil {
		return "", err
	}
	scheme := strings.ToLower(u.Scheme)
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")

	hostPort := host
	if strings.Contains(host, ":") { // IPv6 literal
		hostPort = "[" + host + "]"
	}
	if port := u.Port(); port != "" && !isDefaultPort(scheme, port) {
		hostPort += ":" + port
	}

	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	if len(path) > 1 {
		path = strings.TrimRight(path, "/")
		if path == "" {
			path = "/"
		}
	}

	var kept []string
	for _, pair := range strings.Split(u.RawQuery, "&") {
		if pair == "" {
			continue
		}
		key, _, _ := strings.Cut(pair, "=")
		if decoded, err := url.QueryUnescape(key); err == nil {
			key = decoded
		}
		if isTrackingParam(key) {
			continue
		}
		kept = append(kept, pair)
	}

	out := scheme + "://" + hostPort + path
	if len(kept) > 0 {
		out += "?" + strings.Join(kept, "&")
	}
	return out, nil
}

func isDefaultPort(scheme, port string) bool {
	return (scheme == "http" && port == "80") || (scheme == "https" && port == "443")
}

// PreferDeclaredCanonical returns the page's declared <link rel=canonical> as the
// dedupe key only when it names the host of the page actually read (finalURL):
// same host after www. is dropped and case is folded, http or https, default
// port. Anything else returns requested. The check is per host, not per
// registrable domain, so a sibling subdomain (attacker.example.com declaring
// bob.example.com) cannot claim another user's URL. Judging the final host also
// stops an open redirect from borrowing the requested host's declaration.
func PreferDeclaredCanonical(requested, finalURL, declared string) string {
	if declared == "" {
		return requested
	}
	declaredCanonical, err := Canonicalize(declared)
	if err != nil {
		return requested
	}
	// Canonicalize keeps only non-default ports, so any port left is refused.
	if u, err := url.Parse(declaredCanonical); err != nil || u.Port() != "" {
		return requested
	}
	if hostOf(declaredCanonical) == "" || hostOf(declaredCanonical) != hostOf(finalURL) {
		return requested
	}
	return declaredCanonical
}

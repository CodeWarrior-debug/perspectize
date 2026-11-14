// Package webpage fetches and reads the metadata of a pasted webpage: the URL
// canonicaliser, the SSRF-safe HTTP client and the <head> parser.
package webpage

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"golang.org/x/net/publicsuffix"
)

// isTrackingParam reports whether a query key is campaign or click-tracking noise
// that is dropped from the dedupe key.
func isTrackingParam(key string) bool {
	k := strings.ToLower(key)
	return strings.HasPrefix(k, "utm_") || k == "fbclid" || k == "gclid"
}

// Canonicalize returns the dedupe key for a webpage URL: lowercase scheme and
// host, www. dropped, fragment and userinfo dropped, tracking parameters
// (utm_*, fbclid, gclid) dropped, default port dropped, trailing slash dropped
// except on the root. The remaining query parameters keep their original order
// and encoding. Only http and https URLs are accepted.
func Canonicalize(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("%w: not a valid URL", domain.ErrInvalidInput)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("%w: only http and https links can be saved", domain.ErrInvalidInput)
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	if host == "" {
		return "", fmt.Errorf("%w: the link has no host", domain.ErrInvalidInput)
	}

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

// PreferDeclaredCanonical returns the page's declared <link rel=canonical> only
// when it is on the same registrable domain as the fetched URL. Otherwise (a
// cross-domain declaration, an unparseable one, or a host with no registrable
// domain such as an IP address) it returns fetched.
func PreferDeclaredCanonical(fetched, declared string) string {
	if declared == "" {
		return fetched
	}
	declaredCanonical, err := Canonicalize(declared)
	if err != nil {
		return fetched
	}
	fetchedHost, ok := registrableDomain(fetched)
	if !ok {
		return fetched
	}
	declaredHost, ok := registrableDomain(declaredCanonical)
	if !ok || declaredHost != fetchedHost {
		return fetched
	}
	return declaredCanonical
}

// registrableDomain returns the eTLD+1 of a URL's host, or false when there is none.
func registrableDomain(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	site, err := publicsuffix.EffectiveTLDPlusOne(u.Hostname())
	if err != nil {
		return "", false
	}
	return site, true
}

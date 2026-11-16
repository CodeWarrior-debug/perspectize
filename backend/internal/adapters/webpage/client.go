package webpage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

const (
	// maxBodyBytes caps how much of a page is read. Metadata lives in <head>.
	maxBodyBytes = 512 << 10
	// maxRedirects is the number of redirects followed; the next one fails the fetch.
	maxRedirects   = 3
	defaultTimeout = 5 * time.Second
	userAgent      = "PerspectizeBot/1.0 (+https://github.com/CodeWarrior-debug/perspectize)"
)

// ErrBlockedAddress means the SSRF check refused an address (a non-public IP, or
// a port other than 80 and 443). Errors carrying it also wrap domain.ErrInvalidInput.
// It is not the same as FetchStatusBlocked, which is an HTTP 4xx answer.
var ErrBlockedAddress = errors.New("webpage address is not public")

var errTooManyRedirects = errors.New("too many redirects")

var (
	cgnatPrefix     = netip.MustParsePrefix("100.64.0.0/10")
	thisNetPrefix   = netip.MustParsePrefix("0.0.0.0/8")
	siteLocalPrefix = netip.MustParsePrefix("fec0::/10")
	// NAT64 translates to any IPv4 address, private ones included.
	nat64WellKnownPrefix = netip.MustParsePrefix("64:ff9b::/96")
	nat64LocalPrefix     = netip.MustParsePrefix("64:ff9b:1::/48")
	// 6to4 embeds an IPv4 address; the whole 2002::/16 is refused rather than parsed.
	sixToFourPrefix = netip.MustParsePrefix("2002::/16")
	// Benchmarking (RFC 2544), IETF protocol assignments, and reserved space.
	benchmarkPrefix = netip.MustParsePrefix("198.18.0.0/15")
	ietfPrefix      = netip.MustParsePrefix("192.0.0.0/24")
	reservedPrefix  = netip.MustParsePrefix("240.0.0.0/4") // includes 255.255.255.255
)

// Options configures the client. The zero value is production-ready.
type Options struct {
	// Timeout bounds the whole fetch. Zero means 5 seconds.
	Timeout time.Duration
	// Lookup resolves a host name. Nil uses the system resolver. Tests inject a fake.
	Lookup func(ctx context.Context, host string) ([]netip.Addr, error)
	// Now stamps Fetch.At. Nil uses the wall clock.
	Now func() time.Time

	// allowAddr is the one exact address:port that may be dialed even though it is
	// loopback or on another port. Only in-package tests set it (for an httptest
	// server). It is never read from configuration.
	allowAddr netip.AddrPort
}

// Client reads a webpage's metadata with SSRF protection on every connection.
type Client struct {
	http      *http.Client
	dial      func(ctx context.Context, network, addr string) (net.Conn, error)
	lookup    func(ctx context.Context, host string) ([]netip.Addr, error)
	now       func() time.Time
	allowAddr netip.AddrPort
}

// NewClient builds a client whose transport checks every dialed address.
func NewClient(opts Options) *Client {
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	lookup := opts.Lookup
	if lookup == nil {
		lookup = func(ctx context.Context, host string) ([]netip.Addr, error) {
			return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		}
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}

	c := &Client{lookup: lookup, now: now, allowAddr: opts.allowAddr}
	dialer := &net.Dialer{Timeout: timeout}
	c.dial = dialer.DialContext
	c.http = &http.Client{
		Timeout: timeout,
		Jar:     nil, // no cookies
		Transport: &http.Transport{
			Proxy:               nil, // an env proxy would be dialed without the IP check
			DialContext:         c.dialPublic,
			TLSHandshakeTimeout: timeout,
			DisableKeepAlives:   true,
		},
		CheckRedirect: checkRedirect,
	}
	return c
}

// dialPublic is the transport's dialer. It runs for every connection, so
// redirects and DNS answers are checked too, not only the first hostname. It
// checks every resolved address before connecting to any of them, then dials
// the checked ip:port literal, so a DNS answer cannot change between check and dial.
func (c *Client) dialPublic(ctx context.Context, network, addr string) (net.Conn, error) {
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	port, err := strconv.ParseUint(portStr, 10, 16)
	if err != nil {
		return nil, blockedError()
	}

	ips, err := c.resolve(ctx, host)
	if err != nil {
		return nil, err
	}

	targets := make([]netip.AddrPort, 0, len(ips))
	for _, ip := range ips {
		target := netip.AddrPortFrom(ip.Unmap(), uint16(port))
		if !c.allowed(target) {
			return nil, blockedError()
		}
		targets = append(targets, target)
	}

	var lastErr error
	for _, target := range targets {
		conn, err := c.dial(ctx, "tcp", target.String())
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no address for host %q", host)
	}
	return nil, lastErr
}

func (c *Client) resolve(ctx context.Context, host string) ([]netip.Addr, error) {
	if ip, err := netip.ParseAddr(host); err == nil {
		return []netip.Addr{ip}, nil
	}
	ips, err := c.lookup(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("resolve host: %w", err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("no address for host %q", host)
	}
	return ips, nil
}

// allowed reports whether a connection to target may be made.
func (c *Client) allowed(target netip.AddrPort) bool {
	if c.allowAddr.IsValid() && target == c.allowAddr {
		return true
	}
	if p := target.Port(); p != 80 && p != 443 {
		return false
	}
	return isPublicAddr(target.Addr())
}

// blockedError wraps ErrBlockedAddress so callers can match either sentinel.
func blockedError() error {
	return fmt.Errorf("%w: %w", domain.ErrInvalidInput, ErrBlockedAddress)
}

// isPublicAddr reports whether an address is one a public page can be on. An
// IPv4-mapped IPv6 address is judged by its IPv4 form.
func isPublicAddr(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() {
		return false
	}
	if ip.IsUnspecified() || ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() {
		return false
	}
	for _, blocked := range []netip.Prefix{
		cgnatPrefix, thisNetPrefix, siteLocalPrefix,
		nat64WellKnownPrefix, nat64LocalPrefix, sixToFourPrefix,
		benchmarkPrefix, ietfPrefix, reservedPrefix,
	} {
		if blocked.Contains(ip) {
			return false
		}
	}
	return true
}

// checkRedirect allows maxRedirects redirects. The next one fails the fetch
// with a non-blocked error, so it reports as FetchStatusError.
func checkRedirect(req *http.Request, via []*http.Request) error {
	if len(via) > maxRedirects {
		return errTooManyRedirects
	}
	if s := req.URL.Scheme; s != "http" && s != "https" {
		return fmt.Errorf("redirect to unsupported scheme %q", s)
	}
	return nil
}

// Fetch reads a page once. The result always carries Fetch.Status. The error is
// set only for invalid input or an address the SSRF check refused.
func (c *Client) Fetch(ctx context.Context, rawURL string) (domain.WebPageMeta, error) {
	fetchedAt := c.now()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return domain.WebPageMeta{}, fmt.Errorf("%w: not a valid URL", domain.ErrInvalidInput)
	}
	if s := req.URL.Scheme; s != "http" && s != "https" {
		return domain.WebPageMeta{}, fmt.Errorf("%w: only http and https links can be read", domain.ErrInvalidInput)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")

	resp, err := c.http.Do(req)
	if err != nil {
		if errors.Is(err, ErrBlockedAddress) {
			return domain.WebPageMeta{}, err
		}
		return failedAt(rawURL, fetchedAt, transportStatus(err), nil), nil
	}
	defer resp.Body.Close()

	finalURL := resp.Request.URL.String()
	code := resp.StatusCode
	switch {
	case code >= 400 && code < 500:
		return failedAt(finalURL, fetchedAt, domain.FetchStatusBlocked, &code), nil
	case code < 200 || code >= 300:
		return failedAt(finalURL, fetchedAt, domain.FetchStatusError, &code), nil
	}

	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if mediaType != "text/html" && mediaType != "application/xhtml+xml" {
		return failedAt(finalURL, fetchedAt, domain.FetchStatusNotHTML, &code), nil
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return failedAt(finalURL, fetchedAt, transportStatus(err), &code), nil
	}
	if len(data) > maxBodyBytes && !hasHeadEnd(data[:maxBodyBytes]) {
		return failedAt(finalURL, fetchedAt, domain.FetchStatusTooLarge, &code), nil
	}

	meta := parseHeadAt(bytes.NewReader(data), resp.Request.URL, fetchedAt)
	meta.SchemaVersion = domain.WebPageSchemaVersion
	meta.FinalURL = finalURL
	meta.Domain = hostOf(finalURL)
	meta.Fetch = domain.WebPageFetch{Status: domain.FetchStatusOK, HTTPStatus: &code, At: fetchedAt}
	return meta, nil
}

// hasHeadEnd reports whether the bytes contain </head>, ignoring ASCII case.
func hasHeadEnd(data []byte) bool {
	return bytes.Contains(bytes.ToLower(data), []byte("</head>"))
}

// transportStatus classifies a request error that is not an SSRF block.
func transportStatus(err error) domain.FetchStatus {
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
		return domain.FetchStatusTimeout
	}
	return domain.FetchStatusError
}

// failedAt returns metadata for a fetch that got no usable page. finalURL is the
// last URL reached, or the requested one when no response arrived.
func failedAt(finalURL string, at time.Time, status domain.FetchStatus, code *int) domain.WebPageMeta {
	return domain.WebPageMeta{
		SchemaVersion: domain.WebPageSchemaVersion,
		FinalURL:      finalURL,
		Domain:        hostOf(finalURL),
		Fetch:         domain.WebPageFetch{Status: status, HTTPStatus: code, At: at},
	}
}

// hostOf returns the lowercase host of a URL without a leading www., or "" if it does not parse.
func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
}

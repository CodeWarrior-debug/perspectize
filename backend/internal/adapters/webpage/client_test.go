package webpage

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeDNS resolves only the hosts it knows; anything else fails the lookup.
func fakeDNS(records map[string][]string) func(context.Context, string) ([]netip.Addr, error) {
	return func(_ context.Context, host string) ([]netip.Addr, error) {
		raw, ok := records[host]
		if !ok {
			return nil, fmt.Errorf("no such host %q", host)
		}
		out := make([]netip.Addr, 0, len(raw))
		for _, s := range raw {
			out = append(out, netip.MustParseAddr(s))
		}
		return out, nil
	}
}

// countDials wraps the client's TCP dial so a test can assert how many
// connections were actually attempted.
func countDials(c *Client) *atomic.Int64 {
	var n atomic.Int64
	inner := c.dial
	c.dial = func(ctx context.Context, network, addr string) (net.Conn, error) {
		n.Add(1)
		return inner(ctx, network, addr)
	}
	return &n
}

// hostPort returns the 127.0.0.1 port an httptest server listens on.
func hostPort(t *testing.T, srv *httptest.Server) (string, netip.AddrPort) {
	t.Helper()
	u := strings.TrimPrefix(srv.URL, "http://")
	_, portStr, err := net.SplitHostPort(u)
	require.NoError(t, err)
	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)
	return u, netip.AddrPortFrom(netip.MustParseAddr("127.0.0.1"), uint16(port))
}

func TestClient_BlocksNonPublicAddressesWithoutConnecting(t *testing.T) {
	for _, ip := range []string{
		"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1",
		"0.0.0.0", "224.0.0.1", "::ffff:127.0.0.1", "fe80::1", "172.16.5.5", "192.168.1.1",
	} {
		t.Run(ip, func(t *testing.T) {
			c := NewClient(Options{Lookup: fakeDNS(map[string][]string{"blocked.test": {ip}})})
			dials := countDials(c)

			_, err := c.Fetch(context.Background(), "http://blocked.test/")
			require.Error(t, err)
			assert.ErrorIs(t, err, ErrBlockedAddress)
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Equal(t, int64(0), dials.Load(), "no connection may be attempted to a blocked address")
		})
	}
}

func TestClient_BlocksWhenAnyResolvedAddressIsNonPublic(t *testing.T) {
	c := NewClient(Options{Lookup: fakeDNS(map[string][]string{"mixed.test": {"203.0.113.10", "10.0.0.1"}})})
	dials := countDials(c)

	_, err := c.Fetch(context.Background(), "http://mixed.test/")
	assert.ErrorIs(t, err, ErrBlockedAddress)
	assert.Equal(t, int64(0), dials.Load())
}

func TestClient_BlocksPortsOtherThan80And443(t *testing.T) {
	c := NewClient(Options{})
	dials := countDials(c)

	_, err := c.Fetch(context.Background(), "http://127.0.0.1:8080/")
	assert.ErrorIs(t, err, ErrBlockedAddress)
	assert.Equal(t, int64(0), dials.Load())
}

func TestClient_RedirectToLoopbackIsBlockedPerDial(t *testing.T) {
	// The public-looking host resolves to the test server's exact address, which
	// is the only loopback address the test seam allows. The redirect target is
	// 127.0.0.1 on port 80, a different address, so it must be refused at dial time.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://127.0.0.1/", http.StatusFound)
	}))
	defer srv.Close()
	_, allowed := hostPort(t, srv)

	c := NewClient(Options{
		Lookup:    fakeDNS(map[string][]string{"public.test": {"127.0.0.1"}}),
		allowAddr: allowed,
	})
	dials := countDials(c)

	_, err := c.Fetch(context.Background(), "http://public.test:"+strconv.Itoa(int(allowed.Port()))+"/start")
	assert.ErrorIs(t, err, ErrBlockedAddress)
	assert.Equal(t, int64(1), dials.Load(), "only the first hop may connect; the redirect target is refused before dialing")
}

func TestClient_FourthRedirectIsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n, _ := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/r/"))
		http.Redirect(w, r, fmt.Sprintf("/r/%d", n+1), http.StatusFound)
	}))
	defer srv.Close()
	base, allowed := hostPort(t, srv)

	c := NewClient(Options{allowAddr: allowed})
	meta, err := c.Fetch(context.Background(), "http://"+base+"/r/0")
	require.NoError(t, err, "a failed redirect chain is a fetch status, not a Go error")
	assert.Equal(t, domain.FetchStatusError, meta.Fetch.Status)
}

func TestClient_ThreeRedirectsStillFollowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n, _ := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/r/"))
		if n < 3 {
			http.Redirect(w, r, fmt.Sprintf("/r/%d", n+1), http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>done</title></head></html>"))
	}))
	defer srv.Close()
	base, allowed := hostPort(t, srv)

	c := NewClient(Options{allowAddr: allowed})
	meta, err := c.Fetch(context.Background(), "http://"+base+"/r/0")
	require.NoError(t, err)
	assert.Equal(t, domain.FetchStatusOK, meta.Fetch.Status)
	assert.Equal(t, "http://"+base+"/r/3", meta.FinalURL)
}

func TestClient_SlowServerIsTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(6 * time.Second):
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	base, allowed := hostPort(t, srv)

	c := NewClient(Options{Timeout: 100 * time.Millisecond, allowAddr: allowed})
	meta, err := c.Fetch(context.Background(), "http://"+base+"/slow")
	require.NoError(t, err)
	assert.Equal(t, domain.FetchStatusTimeout, meta.Fetch.Status)
	assert.Nil(t, meta.Fetch.HTTPStatus, "no response arrived, so there is no HTTP status")
}

func TestClient_OversizedHeadWithoutHeadEndIsTooLarge(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html><head><title>x</title>"))
		pad := []byte(strings.Repeat("<!-- padding padding padding padding padding -->", 64))
		for i := 0; i < 2*1024*1024/len(pad); i++ { // about 2 MiB, no </head>
			if _, err := w.Write(pad); err != nil {
				return
			}
		}
	}))
	defer srv.Close()
	base, allowed := hostPort(t, srv)

	c := NewClient(Options{allowAddr: allowed})
	meta, err := c.Fetch(context.Background(), "http://"+base+"/big")
	require.NoError(t, err)
	assert.Equal(t, domain.FetchStatusTooLarge, meta.Fetch.Status)
}

func TestClient_NonHTMLIsNotHTML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = w.Write([]byte("%PDF-1.4"))
	}))
	defer srv.Close()
	base, allowed := hostPort(t, srv)

	meta, err := NewClient(Options{allowAddr: allowed}).Fetch(context.Background(), "http://"+base+"/paper.pdf")
	require.NoError(t, err)
	assert.Equal(t, domain.FetchStatusNotHTML, meta.Fetch.Status)
}

func TestClient_StatusMapping(t *testing.T) {
	cases := map[int]domain.FetchStatus{
		http.StatusForbidden:           domain.FetchStatusBlocked,
		http.StatusNotFound:            domain.FetchStatusBlocked,
		http.StatusInternalServerError: domain.FetchStatusError,
		http.StatusServiceUnavailable:  domain.FetchStatusError,
	}
	for code, want := range cases {
		t.Run(strconv.Itoa(code), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/html")
				w.WriteHeader(code)
			}))
			defer srv.Close()
			base, allowed := hostPort(t, srv)

			meta, err := NewClient(Options{allowAddr: allowed}).Fetch(context.Background(), "http://"+base+"/")
			require.NoError(t, err, "an HTTP error is a fetch status, never a Go error")
			assert.Equal(t, want, meta.Fetch.Status)
			require.NotNil(t, meta.Fetch.HTTPStatus)
			assert.Equal(t, code, *meta.Fetch.HTTPStatus)
		})
	}
}

func TestClient_HappyPathSendsUserAgentAndFetchTime(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.UserAgent(), "PerspectizeBot/1.0") {
			http.Error(w, "bad user agent", http.StatusTeapot)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>Hi</title></head><body>x</body></html>"))
	}))
	defer srv.Close()
	base, allowed := hostPort(t, srv)

	fixed := time.Date(2026, 11, 14, 8, 0, 0, 0, time.UTC)
	c := NewClient(Options{Now: func() time.Time { return fixed }, allowAddr: allowed})

	meta, err := c.Fetch(context.Background(), "http://"+base+"/")
	require.NoError(t, err)
	assert.Equal(t, domain.FetchStatusOK, meta.Fetch.Status)
	require.NotNil(t, meta.Fetch.HTTPStatus)
	assert.Equal(t, 200, *meta.Fetch.HTTPStatus)
	assert.Equal(t, fixed, meta.Fetch.At)
	assert.Equal(t, "http://"+base+"/", meta.FinalURL)
	assert.Equal(t, domain.WebPageSchemaVersion, meta.SchemaVersion)
}

func TestClient_NeverUsesProxyFromEnvironment(t *testing.T) {
	c := NewClient(Options{})
	tr, ok := c.http.Transport.(*http.Transport)
	require.True(t, ok)
	assert.Nil(t, tr.Proxy, "an env proxy would dial the proxy and skip the IP check")
	assert.Nil(t, c.http.Jar, "no cookies")
}

func TestIsPublicAddr(t *testing.T) {
	public := []string{"93.184.216.34", "203.0.113.10", "2606:4700:4700::1111"}
	nonPublic := []string{
		"127.0.0.1", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.169.254",
		"100.64.0.1", "100.127.255.255", "0.0.0.0", "224.0.0.251", "::1", "::", "fd12::1",
		"fe80::1", "fec0::1", "ff02::1", "::ffff:10.0.0.1",
		// NAT64 (well-known and local-use) can reach private IPv4 behind a gateway.
		"64:ff9b::808:808", "64:ff9b::a00:1", "64:ff9b:1::1",
		// 6to4 embeds an IPv4 address in 2002::/16; blocked whole.
		"2002::1", "2002:c000:204::1",
		// Benchmarking, IETF protocol assignments, reserved, and broadcast.
		"198.18.0.1", "198.19.255.255", "192.0.0.8", "240.0.0.1", "255.255.255.255",
	}
	for _, s := range public {
		assert.True(t, isPublicAddr(netip.MustParseAddr(s)), "%s should be public", s)
	}
	for _, s := range nonPublic {
		assert.False(t, isPublicAddr(netip.MustParseAddr(s)), "%s should not be public", s)
	}
}

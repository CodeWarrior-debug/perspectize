//go:build perf

package perf

// Import capacity harness (.docs/CAPACITY_TESTING.md): ramps the row-import cap,
// then the source-listing cap, against a LOCAL throwaway Postgres, and prints a
// markdown table plus the resource envelope. It fails only on hard errors (no
// connection, missing migrations, a Neon DSN, a bad knob, a dead probe), never
// on a number.
//
// What runs: the real ImportService, ContentService and GORM repositories. Only
// the YouTube client and the import source lister are stubs. They sleep a latency
// and return deterministic data, so no third-party API is ever called.
// Rows are staged through the real listing path (CreateImportJob), then imported
// through ImportItems. A ListContent probe (the query dataloader_perf_test.go
// uses) runs throughout, at a fixed rate, after an idle baseline.
//
// Run (DATABASE_URL must be a throwaway local database with the migrations
// applied by hand; never the shared Neon database, never make migrate-up):
//
//	cd backend
//	DATABASE_URL='postgres://perf:perf@localhost:5432/perf_import?sslmode=disable' \
//	  go test -tags perf ./internal/perf/ -run TestImportCapacityPerf -v -count=1 -timeout 3h
//
// The default settings take well over go test's 10 minute default timeout. The
// same code builds into a binary for a container started with --cpus/--memory:
// go test -c -tags perf -o import-capacity.test ./internal/perf/
//
// Knobs (environment; a bad value fails the test and names the knob):
//
//	PERF_STUB_LATENCY    mean per stub API call, Go duration (default 150ms); each call is spread +/-50%
//	PERF_ITEMS_PER_STEP  rows imported per run, 1 to 5000 (default 500)
//	PERF_MAX_CONC        top of the 1, 2, 4, 8, ... ramp (default 64)
//	PERF_PROBE_RATE      probe requests per second (default 5)
//	PERF_IDLE_BASELINE   how long the idle probe baseline runs, Go duration (default 10s)
//	PERF_CPU_LIMIT       CPU limit in cores, to evaluate the envelope (optional)
//	PERF_MEM_LIMIT_MB    memory limit in MiB, to evaluate the envelope (optional)
//
// PERF_CPU_LIMIT and PERF_MEM_LIMIT_MB are inputs given at run time only. Never
// write the figures of a deployed environment into the repository.
//
// Stub latency: PERF_STUB_LATENCY is the mean, and every call's own latency is
// spread uniformly over +/-50% of it by jitteredLatency, from a hash of a stable
// key (no random state, no clock). A constant sleep would keep workers that start
// together in step, so all c of them would reach the DB pool at the same instant
// every cycle, a burst real APIs do not produce, and any pool-wait check would
// then fail for the harness's sake. Caveats that remain: the c workers' first
// lookups still start together (as c row imports do in production); a call's
// spread is independent of every other call's, whereas real latency is also
// correlated (a slow minute slows every call at once), so a real bad minute is
// harsher than this; and the keys carry a per-process salt, so the exact pattern
// differs between processes while its mean and spread do not.
//
// Per step: one warm-up run (discarded), then measuredRuns runs, median
// reported (errors and pool waits are summed, so one bad run fails the step).
// A ramp doubles the cap until a step fails a check, then runs exactly one more
// step to confirm it (CAPACITY_TESTING.md, Procedure step 3), then re-runs at
// half of max. The max is the last step that passed before the first failure;
// the confirm step only decides whether the output calls that failure confirmed
// or UNCONFIRMED (it may be noise: re-run or bisect before trusting max).
// The sandbox cannot enforce CPU or memory limits, so the harness measures CPU
// seconds and RSS per item and extrapolates; it does not enforce a limit.

import (
	"bytes"
	"cmp"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	dlmw "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/limiter"
)

const (
	listBatchSize     = 50 // the real listers emit at most 50 candidates per batch
	listCallsPerBatch = 2  // the YouTube lister makes 2 API calls per 50 videos
	measuredRuns      = 3
	residentContent   = 100 // content rows present before the baseline, so the probe returns full pages
	samplePeriod      = 25 * time.Millisecond
)

// ---- knobs ------------------------------------------------------------------

type knobs struct {
	stubLatency  time.Duration
	itemsPerStep int
	maxConc      int
	probeRate    float64
	idleBaseline time.Duration
	cpuLimit     float64 // cores; 0 = not given
	memLimitMB   float64 // MiB; 0 = not given
}

func parseKnobs(getenv func(string) string) (k knobs, err error) {
	k = knobs{stubLatency: 150 * time.Millisecond, itemsPerStep: 500, maxConc: 64, probeRate: 5, idleBaseline: 10 * time.Second}
	if k.stubLatency, err = knobDuration(getenv, "PERF_STUB_LATENCY", k.stubLatency, 0, time.Minute); err != nil {
		return k, err
	}
	if k.itemsPerStep, err = knobInt(getenv, "PERF_ITEMS_PER_STEP", k.itemsPerStep, 1, domain.MaxAdminImportItemsPerRequest); err != nil {
		return k, err
	}
	if k.maxConc, err = knobInt(getenv, "PERF_MAX_CONC", k.maxConc, 1, 512); err != nil {
		return k, err
	}
	if k.probeRate, err = knobFloat(getenv, "PERF_PROBE_RATE", k.probeRate, 0.1, 100); err != nil {
		return k, err
	}
	if k.idleBaseline, err = knobDuration(getenv, "PERF_IDLE_BASELINE", k.idleBaseline, time.Second, 10*time.Minute); err != nil {
		return k, err
	}
	if k.cpuLimit, err = knobFloat(getenv, "PERF_CPU_LIMIT", 0, 0.001, 1024); err != nil {
		return k, err
	}
	k.memLimitMB, err = knobFloat(getenv, "PERF_MEM_LIMIT_MB", 0, 1, 1<<20)
	return k, err
}

func knobInt(getenv func(string) string, name string, def, lo, hi int) (int, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return def, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < lo || v > hi {
		return 0, fmt.Errorf("%s=%q: want a whole number from %d to %d", name, raw, lo, hi)
	}
	return v, nil
}

// knobFloat's def is returned when the variable is unset or empty.
func knobFloat(getenv func(string) string, name string, def, lo, hi float64) (float64, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return def, nil
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || !(v >= lo && v <= hi) { // written so NaN fails too
		return 0, fmt.Errorf("%s=%q: want a number from %g to %g", name, raw, lo, hi)
	}
	return v, nil
}

func knobDuration(getenv func(string) string, name string, def, lo, hi time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return def, nil
	}
	v, err := time.ParseDuration(raw)
	if err != nil || v < lo || v > hi {
		return 0, fmt.Errorf("%s=%q: want a Go duration such as 150ms from %s to %s", name, raw, lo, hi)
	}
	return v, nil
}

// ---- small statistics and /proc readers --------------------------------------

// nearestRank is the p-th percentile (whole percent, 1 to 100) by nearest rank.
func nearestRank(samples []time.Duration, p int) time.Duration {
	if len(samples) == 0 {
		return 0
	}
	sorted := slices.Sorted(slices.Values(samples))
	rank := (p*len(sorted) + 99) / 100
	return sorted[min(max(rank, 1), len(sorted))-1]
}

// medianOf is the middle value (the upper middle for an even count).
func medianOf[T cmp.Ordered](v []T) T {
	var zero T
	if len(v) == 0 {
		return zero
	}
	return slices.Sorted(slices.Values(v))[len(v)/2]
}

// procKB reads a "Key:   123 kB" line from the text of a /proc file, in bytes
// (0 when the key is absent).
func procKB(text, key string) uint64 {
	for _, line := range strings.Split(text, "\n") {
		rest, ok := strings.CutPrefix(line, key+":")
		if !ok {
			continue
		}
		if f := strings.Fields(rest); len(f) > 0 {
			if kb, err := strconv.ParseUint(f[0], 10, 64); err == nil {
				return kb << 10
			}
		}
		return 0
	}
	return 0
}

func readProcKB(path, key string) uint64 {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	return procKB(string(b), key)
}

// cpuTimes is the whole machine's CPU time from the first line of /proc/stat.
type cpuTimes struct{ busy, total uint64 }

// parseProcStat sums user, nice, system, idle, iowait, irq, softirq and steal
// (guest time is already inside user); idle and iowait count as not busy.
func parseProcStat(text string) (cpuTimes, bool) {
	line, _, _ := strings.Cut(text, "\n")
	f := strings.Fields(line)
	if len(f) < 5 || f[0] != "cpu" {
		return cpuTimes{}, false
	}
	var t cpuTimes
	for i, s := range f[1:min(len(f), 9)] {
		v, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			return cpuTimes{}, false
		}
		t.total += v
		if i != 3 && i != 4 { // idle, iowait
			t.busy += v
		}
	}
	return t, true
}

func readMachineCPU() (cpuTimes, bool) {
	b, err := os.ReadFile("/proc/stat")
	if err != nil {
		return cpuTimes{}, false
	}
	return parseProcStat(string(b))
}

// machineCPUSeconds is the CPU-seconds the whole machine spent busy between two
// readings: the busy fraction of all CPUs, times the CPUs, times the wall time.
func machineCPUSeconds(before, after cpuTimes, elapsed time.Duration) float64 {
	dt := after.total - before.total
	if dt == 0 {
		return 0
	}
	return float64(after.busy-before.busy) / float64(dt) * float64(runtime.NumCPU()) * elapsed.Seconds()
}

func processCPU() time.Duration {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return 0
	}
	tv := func(t syscall.Timeval) time.Duration {
		return time.Duration(t.Sec)*time.Second + time.Duration(t.Usec)*time.Microsecond
	}
	return tv(ru.Utime) + tv(ru.Stime)
}

// ---- stubs -------------------------------------------------------------------

func sleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// jitteredLatency spreads one stub call's latency around mean: it returns a value
// uniform over [mean/2, mean/2+mean), that is [0.5*mean, 1.5*mean), whose average
// is mean. The value is a pure function of key (FNV-1a, then a bit-mixing
// finalizer), so there is no random state and no clock: the same call gets the
// same latency every time. The finalizer is there because FNV-1a mixes poorly at
// both ends (its lowest bits are close to a parity of the key's bytes, and its
// highest barely move when only the last characters differ, which is what
// sequential ids do); a mean that is a power of two would read the weak low bits
// and bunch the latencies (TestJitteredLatency covers one). A mean of 0 or less
// gives 0.
func jitteredLatency(mean time.Duration, key string) time.Duration {
	if mean <= 0 {
		return 0
	}
	h := fnv.New64a()
	_, _ = h.Write([]byte(key))
	x := h.Sum64()
	x ^= x >> 33
	x *= 0xff51afd7ed558ccd
	x ^= x >> 33
	x *= 0xc4ceb9fe1a85ec53
	x ^= x >> 33
	return mean/2 + time.Duration((x>>1)%uint64(mean))
}

var (
	stubDescription = strings.Repeat("A description line of the length a real video has. ", 36)
	stubTags        = []string{"perf", "capacity", "import", "stub", "video", "sample", "tag", "ramp", "limit", "probe"}
)

// stubYouTube sleeps a per-call latency (mean, spread by the video id) and returns
// a deterministic, realistically sized response in the same trimmed shape the
// real client stores.
type stubYouTube struct{ mean time.Duration }

func (stubYouTube) ExtractVideoID(url string) (string, error) { return youtube.ExtractVideoID(url) }

func (s stubYouTube) GetVideoMetadata(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
	if err := sleepCtx(ctx, jitteredLatency(s.mean, videoID)); err != nil {
		return nil, err
	}
	var item youtube.YouTubeAPIItem
	item.Snippet.Title, item.Snippet.Description = "Perf video "+videoID, stubDescription
	item.Snippet.ChannelTitle, item.Snippet.PublishedAt, item.Snippet.Tags = "Perf channel", "2026-01-02T03:04:05Z", stubTags
	item.ContentDetails.Duration = "PT12M34S"
	item.Statistics.ViewCount, item.Statistics.LikeCount, item.Statistics.CommentCount = "123456", "7890", "321"
	body, err := json.Marshal(youtube.YouTubeAPIResponse{Items: []youtube.YouTubeAPIItem{item}})
	if err != nil {
		return nil, err
	}
	return &portservices.VideoMetadata{Title: item.Snippet.Title, Description: item.Snippet.Description,
		Duration: 754, ChannelName: item.Snippet.ChannelTitle, Response: body}, nil
}

// listRef encodes how many items a stub source lists into its reference.
func listRef(count int, tag string) string { return fmt.Sprintf("perf-%d-%s", count, tag) }

func refCount(ref string) (int, bool) {
	parts := strings.Split(ref, "-")
	if len(parts) < 2 || parts[0] != "perf" {
		return 0, false
	}
	n, err := strconv.Atoi(parts[1])
	return n, err == nil && n > 0
}

// stubLister lists a source of the size its reference names, in batches of
// listBatchSize, sleeping listCallsPerBatch API calls before each batch (each
// call's latency is the mean spread by the source, batch and call number). It
// records how long each source's List call took (the stub API calls plus any
// back-pressure from staging, excluding the wait for a listing slot).
type stubLister struct {
	mean time.Duration
	salt uint16
	seq  *atomic.Int64
	mu   sync.Mutex
	took []time.Duration
}

func (l *stubLister) Resolve(_ context.Context, ref string) (*portservices.ResolvedImportSource, error) {
	if _, ok := refCount(ref); !ok {
		return nil, fmt.Errorf("%w: perf reference %q", domain.ErrInvalidInput, ref)
	}
	// No latency here: resolving happens once in CreateImportJob, outside the
	// listing slot, and a sleep would only add serial setup time to a step.
	return &portservices.ResolvedImportSource{ID: ref, Title: "Perf source " + ref, URL: "https://www.youtube.com/channel/" + ref}, nil
}

func (l *stubLister) List(ctx context.Context, src portservices.ResolvedImportSource, _ *domain.ImportPersonRole, emit portservices.ImportBatchFunc) error {
	start := time.Now()
	defer func() {
		l.mu.Lock()
		l.took = append(l.took, time.Since(start))
		l.mu.Unlock()
	}()
	total, _ := refCount(src.ID)
	for pos := 0; pos < total; pos += listBatchSize {
		for call := range listCallsPerBatch {
			key := fmt.Sprintf("%s/%d/%d", src.ID, pos/listBatchSize, call)
			if err := sleepCtx(ctx, jitteredLatency(l.mean, key)); err != nil {
				return err
			}
		}
		batch := make([]*domain.ImportItemWithDetails, min(listBatchSize, total-pos))
		for i := range batch {
			batch[i] = l.item(pos + i)
		}
		if err := emit(batch); err != nil {
			return err
		}
	}
	return nil
}

func (l *stubLister) item(pos int) *domain.ImportItemWithDetails {
	id := fmt.Sprintf("%04x%07x", l.salt, l.seq.Add(1)) // 11 characters, unique per process
	summary := "First line of the description."
	published := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Add(-time.Duration(pos) * time.Hour)
	duration, views, likes, comments := 600+pos%3000, int64(1000+pos), int64(100+pos), int64(10)
	return &domain.ImportItemWithDetails{
		Item: domain.ImportItem{
			ExternalID: id, DestinationType: domain.ContentTypeYouTubeVideo,
			CanonicalURL: youtube.NormalizeYouTubeURL(id), Title: "Perf video " + id, Position: pos,
			StatsFetchedAt: time.Now().UTC(),
			Facts: domain.ImportFacts{Kind: domain.ImportItemKindVideo, Summary: &summary, PublishedAt: &published,
				DurationSeconds: &duration, ViewCount: &views, LikeCount: &likes, CommentCount: &comments},
		},
		Details: domain.ImportItemDetails{Description: stubDescription, Tags: stubTags,
			Chapters: []domain.ImportChapter{{StartSeconds: 0, Title: "Intro"}, {StartSeconds: 120, Title: "Main point"}, {StartSeconds: 600, Title: "Wrap up"}}},
	}
}

func (l *stubLister) durations() []time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	return slices.Clone(l.took)
}

// timedCreator times ImportService's calls into ContentService: the per-item
// figure is the time inside CreateFromYouTube (stub API call, dedupe lookup and
// insert), excluding the wait for a row slot. Any error counts, including "already
// exists", because every harness row is new.
type timedCreator struct {
	inner *services.ContentService
	mu    sync.Mutex
	took  []time.Duration
	first string
}

func (c *timedCreator) CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error) {
	start := time.Now()
	content, err := c.inner.CreateFromYouTube(ctx, url, userID)
	c.mu.Lock()
	c.took = append(c.took, time.Since(start))
	if err != nil && c.first == "" {
		c.first = err.Error()
	}
	c.mu.Unlock()
	return content, err
}

func (c *timedCreator) CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error) {
	return c.inner.CreateFromMovie(ctx, rawURL, userID)
}

func (c *timedCreator) CreateFromWebPage(ctx context.Context, in portservices.CreateWebPageInput, userID int) (*domain.Content, error) {
	return c.inner.CreateFromWebPage(ctx, in, userID)
}

func (c *timedCreator) CreateFromWebsite(ctx context.Context, rawURL string, userID int) (*domain.Content, error) {
	return c.inner.CreateFromWebsite(ctx, rawURL, userID)
}

// ---- probe and sampler ---------------------------------------------------------

var probeBody, _ = json.Marshal(map[string]any{"query": listContentQuery, "variables": map[string]any{"first": 50}})

// probeOnce runs the ListContent query in process and returns how long it took.
func probeOnce(h http.Handler) (time.Duration, error) {
	req := httptest.NewRequest(http.MethodPost, "/query", bytes.NewReader(probeBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	start := time.Now()
	h.ServeHTTP(rec, req)
	took := time.Since(start)
	if rec.Code != http.StatusOK {
		return took, fmt.Errorf("probe: HTTP %d", rec.Code)
	}
	var out struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		return took, fmt.Errorf("probe: unreadable response: %w", err)
	}
	if len(out.Errors) > 0 {
		return took, fmt.Errorf("probe: %s", out.Errors[0].Message)
	}
	return took, nil
}

// probe issues one request per tick without waiting for the last to finish, so
// a slow server does not slow the probe down (a fixed rate, not a fixed loop).
type probe struct {
	h        http.Handler
	cancel   context.CancelFunc
	done     chan struct{}
	inflight sync.WaitGroup
	mu       sync.Mutex
	samples  []time.Duration
	errs     int
	first    string
}

func startProbe(h http.Handler, rate float64) *probe {
	ctx, cancel := context.WithCancel(context.Background())
	p := &probe{h: h, cancel: cancel, done: make(chan struct{})}
	go func() {
		defer close(p.done)
		p.fire()
		tick := time.NewTicker(time.Duration(float64(time.Second) / rate))
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				p.fire()
			}
		}
	}()
	return p
}

func (p *probe) fire() {
	p.inflight.Add(1)
	go func() {
		defer p.inflight.Done()
		took, err := probeOnce(p.h)
		p.mu.Lock()
		defer p.mu.Unlock()
		if err != nil {
			if p.errs++; p.first == "" {
				p.first = err.Error()
			}
			return
		}
		p.samples = append(p.samples, took)
	}()
}

func (p *probe) stop() (samples []time.Duration, errs int, first string) {
	p.cancel()
	<-p.done
	p.inflight.Wait()
	return p.samples, p.errs, p.first
}

type peaks struct {
	rss        uint64
	goroutines int
	poolInUse  int
}

// sampler records the peak RSS, goroutine count and busy pool connections.
type sampler struct {
	db    *sql.DB
	stopC chan struct{}
	done  chan struct{}
	p     peaks
}

func startSampler(db *sql.DB) *sampler {
	s := &sampler{db: db, stopC: make(chan struct{}), done: make(chan struct{})}
	s.take()
	go func() {
		defer close(s.done)
		tick := time.NewTicker(samplePeriod)
		defer tick.Stop()
		for {
			select {
			case <-s.stopC:
				return
			case <-tick.C:
				s.take()
			}
		}
	}()
	return s
}

func (s *sampler) take() {
	s.p.rss = max(s.p.rss, readProcKB("/proc/self/status", "VmRSS"))
	s.p.goroutines = max(s.p.goroutines, runtime.NumGoroutine())
	s.p.poolInUse = max(s.p.poolInUse, s.db.Stats().InUse)
}

func (s *sampler) stop() peaks {
	close(s.stopC)
	<-s.done
	s.take()
	return s.p
}

// ---- measurements ----------------------------------------------------------------

// runMetrics is what one run of a step measured.
type runMetrics struct {
	items        int
	elapsed      time.Duration
	itemLat      []time.Duration
	cpuSec       float64 // this process, net of its idle (probe-only) CPU
	machCPUSec   float64 // whole machine busy, net of its idle
	machCPUPct   float64
	machOK       bool
	peaks        peaks
	heapInuse    uint64
	poolWaits    int64
	poolWaitTime time.Duration
	probe        []time.Duration
	probeErrs    int
	probeFirst   string
	errors       int
	firstError   string
}

// stepExtras are the per-step figures that have no column in stepTableHeader.
type stepExtras struct {
	machOK         bool
	machCPUPct     float64
	machCPUPerItem float64
	heapMiB        float64
	probeSamples   int
	probeFirst     string
	poolWait       time.Duration
}

const extrasHeader = "| Concurrency | Machine CPU (% of all cores) | Machine CPU s/item | Heap in use (MiB) | Probe samples | Pool wait (ms) |\n| --- | --- | --- | --- | --- | --- |"

func (x stepExtras) row(c int) string {
	if !x.machOK {
		return fmt.Sprintf("| %d | n/a | n/a | %.1f | %d | %.1f |", c, x.heapMiB, x.probeSamples, ms(x.poolWait))
	}
	return fmt.Sprintf("| %d | %.0f | %.4f | %.1f | %d | %.1f |", c, x.machCPUPct, x.machCPUPerItem, x.heapMiB, x.probeSamples, ms(x.poolWait))
}

// summarize reduces a step's measured runs to one table row: the median of each
// figure, but the sum of error and pool-wait counts so one bad run is not hidden.
func summarize(c int, runs []runMetrics) (stepResult, stepExtras) {
	var ips, cpi, mpi, mpct []float64
	var p50, p95 []time.Duration
	var rss, heap []uint64
	var gor, pool []int
	var probeAll []time.Duration
	s, x := stepResult{Concurrency: c}, stepExtras{machOK: true}
	for _, r := range runs {
		n := float64(r.items)
		ips = append(ips, n/r.elapsed.Seconds())
		cpi = append(cpi, r.cpuSec/n)
		mpi, mpct = append(mpi, r.machCPUSec/n), append(mpct, r.machCPUPct)
		p50, p95 = append(p50, nearestRank(r.itemLat, 50)), append(p95, nearestRank(r.itemLat, 95))
		rss, heap = append(rss, r.peaks.rss), append(heap, r.heapInuse)
		gor, pool = append(gor, r.peaks.goroutines), append(pool, r.peaks.poolInUse)
		probeAll = append(probeAll, r.probe...)
		s.PoolWaitDelta += r.poolWaits
		s.ProbeErrors += r.probeErrs
		s.Errors += r.errors
		x.poolWait += r.poolWaitTime
		x.machOK = x.machOK && r.machOK
		if s.FirstError == "" {
			s.FirstError = r.firstError
		}
		if x.probeFirst == "" {
			x.probeFirst = r.probeFirst
		}
	}
	s.ItemsPerSec, s.CPUSecPerItem = medianOf(ips), medianOf(cpi)
	s.ItemP50, s.ItemP95 = medianOf(p50), medianOf(p95)
	s.PeakRSSBytes, s.Goroutines, s.PoolInUse = medianOf(rss), medianOf(gor), medianOf(pool)
	s.ProbeP95 = nearestRank(probeAll, 95)
	x.machCPUPct, x.machCPUPerItem = medianOf(mpct), medianOf(mpi)
	x.heapMiB, x.probeSamples = float64(medianOf(heap))/(1<<20), len(probeAll)
	return s, x
}

// ---- harness -------------------------------------------------------------------

type idleRates struct{ procCPU, machCPU float64 } // CPU-seconds per second with only the probe running

type harness struct {
	t             *testing.T
	k             knobs
	db            *gorm.DB
	sqlDB         *sql.DB
	jobs          *postgres.GormImportJobRepository
	content       *services.ContentService
	probeHandler  http.Handler
	admin         *domain.AuthenticatedUser
	seq           atomic.Int64 // video ids and source tags
	salt          uint16
	probeBaseline time.Duration
	baselineN     int
	idle          idleRates
	idleRSS       uint64
}

func newHarness(t *testing.T, dsn string, k knobs) *harness {
	t.Helper()
	db, err := database.ConnectGORM(dsn, database.PoolConfigFromEnv()) // the exact string refuseIfNeon accepted
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	// GORM's default logger prints every "record not found" (each import row does a
	// URL lookup that is meant to miss), which would bury the report.
	db.Logger = logger.Default.LogMode(logger.Silent)
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.PingContext(context.Background()); err != nil {
		t.Fatalf("cannot reach the database: %v", err)
	}
	var ready bool
	const readyQuery = `SELECT to_regclass('public.import_job_items') IS NOT NULL
		AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'content' AND column_name = 'import_job_id')
		AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'import_jobs' AND column_name = 'description')`
	if err := db.Raw(readyQuery).Scan(&ready).Error; err != nil || !ready {
		t.Fatalf("the import tables are missing or out of date in this database (err %v): apply backend/migrations/*.up.sql to the throwaway database by hand, in order; never make migrate-up", err)
	}

	username := fmt.Sprintf("perf-imp-%08x", uint32(time.Now().UnixNano()))
	var adminID int
	if err := db.Raw("INSERT INTO users (username, role) VALUES (?, 'admin') RETURNING id", username).Scan(&adminID).Error; err != nil {
		t.Fatalf("create the harness user: %v", err)
	}
	t.Cleanup(func() { // runs before the pool closes; scoped to the user this run created
		for _, q := range []string{"DELETE FROM content WHERE added_by_user_id = ?", "DELETE FROM import_jobs WHERE user_id = ?", "DELETE FROM users WHERE id = ?"} {
			if err := db.Exec(q, adminID).Error; err != nil {
				t.Logf("cleanup left rows behind in the throwaway database: %v", err)
			}
		}
	})

	contentRepo := postgres.NewGormContentRepository(db)
	contentService := services.NewContentService(contentRepo, stubYouTube{mean: k.stubLatency}, nil)
	h := &harness{t: t, k: k, db: db, sqlDB: sqlDB, jobs: postgres.NewGormImportJobRepository(db), content: contentService,
		admin: &domain.AuthenticatedUser{ID: adminID, Username: username, Role: domain.UserRoleAdmin},
		salt:  uint16(time.Now().UnixNano())}
	h.probeHandler = newProbeHandler(db, contentRepo, contentService)
	return h
}

// newProbeHandler wires the resolver chain as dataloader_perf_test.go does.
func newProbeHandler(db *gorm.DB, contentRepo *postgres.GormContentRepository, contentService *services.ContentService) http.Handler {
	userRepo := postgres.NewGormUserRepository(db)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)
	categoryService := services.NewCategoryService(postgres.NewGormCategoryRepository(db), contentRepo, nil)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo, nil, nil, nil)
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil, nil)
	srv := handler.New(generated.NewExecutableSchema(generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth: passthroughDirective,
			Owner: func(ctx context.Context, _ any, next graphql.Resolver, _ string) (any, error) {
				return next(ctx)
			},
		},
	}))
	srv.AddTransport(transport.POST{})
	return dlmw.Middleware(dlmw.Services{Category: categoryService, Perspective: perspectiveService})(srv)
}

func (h *harness) tag() string { return strconv.FormatInt(h.seq.Add(1), 16) }

// seedContent adds the resident rows through the real create path.
func (h *harness) seedContent(n int) {
	var wg sync.WaitGroup
	var firstErr atomic.Value
	sem := make(chan struct{}, 16)
	for range n {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			url := youtube.NormalizeYouTubeURL(fmt.Sprintf("%04x%07x", h.salt, h.seq.Add(1)))
			if _, err := h.content.CreateFromYouTube(context.Background(), url, h.admin.ID); err != nil {
				firstErr.CompareAndSwap(nil, err.Error())
			}
		}()
	}
	wg.Wait()
	if msg := firstErr.Load(); msg != nil {
		h.t.Fatalf("seeding resident content failed: %v", msg)
	}
}

// measureIdle runs the probe alone: the baseline p95, the idle RSS, and the CPU
// the probe itself costs (subtracted from every step, so CPU per item is the
// import's own).
func (h *harness) measureIdle() {
	for range 3 { // connections and prepared statements are warm before the baseline
		if _, err := probeOnce(h.probeHandler); err != nil {
			h.t.Fatalf("the probe query failed at idle: %v", err)
		}
	}
	debug.FreeOSMemory()
	cpuBefore := processCPU()
	machBefore, machOK := readMachineCPU()
	smp, pr := startSampler(h.sqlDB), startProbe(h.probeHandler, h.k.probeRate)
	start := time.Now()
	time.Sleep(h.k.idleBaseline)
	elapsed := time.Since(start)
	cpuAfter := processCPU()
	machAfter, machOK2 := readMachineCPU()
	samples, errs, first := pr.stop()
	p := smp.stop()
	if errs > 0 || len(samples) == 0 {
		h.t.Fatalf("the probe failed %d time(s) over %d samples at idle, first error %q", errs, len(samples), first)
	}
	h.probeBaseline, h.baselineN, h.idleRSS = nearestRank(samples, 95), len(samples), p.rss
	if h.probeBaseline <= 0 {
		h.t.Fatalf("idle probe baseline was <=0, probe is not measuring anything")
	}
	h.idle.procCPU = (cpuAfter - cpuBefore).Seconds() / elapsed.Seconds()
	if machOK && machOK2 {
		h.idle.machCPU = machineCPUSeconds(machBefore, machAfter, elapsed) / elapsed.Seconds()
	}
}

// measure runs work under the probe and the sampler and reads the counters.
// The caller fills in the item-specific fields.
func (h *harness) measure(items int, work func()) runMetrics {
	debug.FreeOSMemory() // so a step's peak RSS is its own, not an earlier step's leftovers
	poolBefore, cpuBefore := h.sqlDB.Stats(), processCPU()
	machBefore, machOK := readMachineCPU()
	smp, pr := startSampler(h.sqlDB), startProbe(h.probeHandler, h.k.probeRate)
	start := time.Now()
	work()
	elapsed := time.Since(start)
	cpuAfter := processCPU()
	machAfter, machOK2 := readMachineCPU()
	poolAfter := h.sqlDB.Stats()
	samples, errs, first := pr.stop()
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	m := runMetrics{items: items, elapsed: elapsed, peaks: smp.stop(), heapInuse: mem.HeapInuse,
		poolWaits: poolAfter.WaitCount - poolBefore.WaitCount, poolWaitTime: poolAfter.WaitDuration - poolBefore.WaitDuration,
		probe: samples, probeErrs: errs, probeFirst: first,
		cpuSec: max(0, (cpuAfter-cpuBefore).Seconds()-h.idle.procCPU*elapsed.Seconds())}
	if machOK && machOK2 {
		raw := machineCPUSeconds(machBefore, machAfter, elapsed)
		m.machOK, m.machCPUPct = true, raw/(float64(runtime.NumCPU())*elapsed.Seconds())*100
		m.machCPUSec = max(0, raw-h.idle.machCPU*elapsed.Seconds())
	}
	return m
}

// newImportService builds a real ImportService with the given caps. wait blocks
// until every background job it started (listing, row imports) has finished.
func (h *harness) newImportService(rowCap, listingCap int) (*services.ImportService, *timedCreator, *stubLister, func()) {
	var wg sync.WaitGroup
	lister := &stubLister{mean: h.k.stubLatency, salt: h.salt, seq: &h.seq}
	creator := &timedCreator{inner: h.content}
	svc := services.NewImportService(h.jobs,
		map[domain.ImportSourceType]portservices.ImportSourceLister{domain.ImportSourceYouTubeChannel: lister},
		creator,
		services.WithImportRowLimiter(limiter.New("import_rows", rowCap)),
		services.WithImportListingLimiter(limiter.New("import_listings", listingCap)),
		services.WithImportSpawn(func(f func()) {
			wg.Add(1)
			go func() { defer wg.Done(); f() }()
		}))
	return svc, creator, lister, wg.Wait
}

// purge removes what a run imported, so the content table stays the size the
// idle baseline saw (the probe reads it). The resident rows have no import id.
func (h *harness) purge() {
	for _, q := range []string{"DELETE FROM content WHERE added_by_user_id = ? AND import_job_id IS NOT NULL", "DELETE FROM import_jobs WHERE user_id = ?"} {
		if err := h.db.Exec(q, h.admin.ID).Error; err != nil {
			h.t.Fatalf("remove a run's rows: %v", err)
		}
	}
}

// rowRun stages n rows through the listing path, then times ImportItems until
// every row has an outcome, with the row cap at c.
func (h *harness) rowRun(c, n int) runMetrics {
	ctx := context.Background()
	svc, creator, _, wait := h.newImportService(c, 1)
	job, err := svc.CreateImportJob(ctx, h.admin, domain.CreateImportJobInput{Name: "perf rows " + h.tag(),
		Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: listRef(n, h.tag())}}})
	if err != nil {
		h.t.Fatalf("staging rows: create import: %v", err)
	}
	wait()
	staged, err := h.jobs.ListItems(ctx, job.ID)
	if err != nil || len(staged) != n {
		h.t.Fatalf("staging rows: got %d staged rows (err %v), want %d", len(staged), err, n)
	}
	ids := make([]int, n)
	for i, it := range staged {
		ids[i] = it.ID
	}

	var importErr error
	m := h.measure(n, func() {
		_, importErr = svc.ImportItems(ctx, h.admin, job.ID, ids)
		wait()
	})
	creator.mu.Lock()
	m.itemLat, m.firstError = slices.Clone(creator.took), creator.first
	creator.mu.Unlock()
	after, err := h.jobs.ListItems(ctx, job.ID)
	if err != nil {
		h.t.Fatalf("read back the imported rows: %v", err)
	}
	imported := 0
	for _, it := range after {
		if it.ImportStatus != nil && *it.ImportStatus == domain.ImportItemStatusImported {
			imported++
		}
	}
	m.errors = n - imported
	switch {
	case importErr != nil:
		m.firstError = importErr.Error()
	case m.errors > 0 && m.firstError == "":
		m.firstError = fmt.Sprintf("%d of %d rows did not end IMPORTED", m.errors, n)
	}
	h.purge()
	return m
}

// listingRun lists sources stub sources of batches batches each, all offered at
// once, with the listing cap at c. A job holds at most MaxImportSourcesPerJob.
func (h *harness) listingRun(c, sources, batches int) runMetrics {
	ctx := context.Background()
	perSource := batches * listBatchSize
	svc, _, lister, wait := h.newImportService(4, c)
	var jobIDs []int
	var firstErr string
	created := 0
	m := h.measure(sources*perSource, func() {
		for left := sources; left > 0; left -= domain.MaxImportSourcesPerJob {
			in := make([]domain.CreateImportSourceInput, min(left, domain.MaxImportSourcesPerJob))
			for i := range in {
				in[i] = domain.CreateImportSourceInput{SourceType: domain.ImportSourceYouTubeChannel, Ref: listRef(perSource, h.tag())}
			}
			job, err := svc.CreateImportJob(ctx, h.admin, domain.CreateImportJobInput{Name: "perf listing " + h.tag(), Sources: in})
			if err != nil {
				if firstErr == "" {
					firstErr = err.Error()
				}
				continue
			}
			jobIDs, created = append(jobIDs, job.ID), created+len(in)
		}
		wait()
	})
	m.itemLat, m.errors, m.firstError = lister.durations(), sources-created, firstErr
	for _, id := range jobIDs {
		job, err := h.jobs.GetJob(ctx, id)
		if err != nil {
			h.t.Fatalf("read back a listing job: %v", err)
		}
		for _, src := range job.Sources {
			if src.Status != domain.ImportSourceStatusReady || src.ItemCount != perSource {
				if m.errors++; m.firstError == "" {
					m.firstError = fmt.Sprintf("source ended %s with %d of %d rows", src.Status, src.ItemCount, perSource)
					if src.StatusDetail != nil {
						m.firstError += ": " + *src.StatusDetail
					}
				}
			}
		}
	}
	h.purge()
	return m
}

// ---- ramp ----------------------------------------------------------------------

type rampResult struct {
	name          string
	unit          string // what "in flight" counts at this cap
	steps         []stepResult
	extras        []stepExtras
	max           int
	failed        []string // checks that tripped at the first failing step (the one after max)
	firstFail     int      // concurrency of the first failing step, 0 when none failed
	status        rampStatus
	confirmFailed []string // checks that tripped at the confirm step, when it failed
	half          int
	halfStep      stepResult
	halfExtras    stepExtras
	reran         bool
}

func (r *rampResult) at(c int) (stepResult, stepExtras, bool) {
	for i, s := range r.steps {
		if s.Concurrency == c {
			return s, r.extras[i], true
		}
	}
	return stepResult{}, stepExtras{}, false
}

// step runs one warm-up (discarded) and measuredRuns runs, and logs one line.
func (h *harness) step(label string, c int, run func() runMetrics) (stepResult, stepExtras) {
	run()
	runs := make([]runMetrics, measuredRuns)
	for i := range runs {
		runs[i] = run()
	}
	s, x := summarize(c, runs)
	machine := "machine n/a"
	if x.machOK {
		machine = fmt.Sprintf("machine %.0f%% of %d cores, %.4f s/item", x.machCPUPct, runtime.NumCPU(), x.machCPUPerItem)
	}
	first := ""
	if s.FirstError != "" {
		first = ", first error: " + s.FirstError
	}
	if x.probeFirst != "" {
		first += ", first probe error: " + x.probeFirst
	}
	h.t.Logf("%s c=%d: %.1f items/s, item p50/p95 %.0f/%.0f ms, cpu %.4f s/item, %s, peak RSS %.0f MiB, goroutines %d, pool in use %d (waited %d, %.0f ms), probe p95 %.1f ms (%d samples, %d errors), errors %d%s",
		label, c, s.ItemsPerSec, ms(s.ItemP50), ms(s.ItemP95), s.CPUSecPerItem, machine, float64(s.PeakRSSBytes)/(1<<20),
		s.Goroutines, s.PoolInUse, s.PoolWaitDelta, ms(x.poolWait), ms(s.ProbeP95), x.probeSamples, s.ProbeErrors, s.Errors, first)
	if x.probeSamples < 20 {
		h.t.Logf("%s c=%d: probe p95 is over only %d samples (noisy); raise PERF_ITEMS_PER_STEP or PERF_PROBE_RATE", label, c, x.probeSamples)
	}
	return s, x
}

// ramp doubles the cap from 1 to PERF_MAX_CONC until a step fails a check, runs
// exactly one more step to confirm it (rampStatusAfter decides; the confirm step
// does not move the max), then re-runs at half of max.
func (h *harness) ramp(name, unit string, run func(c int) runMetrics) *rampResult {
	r := &rampResult{name: name, unit: unit}
	for c := 1; c <= h.k.maxConc; c *= 2 {
		s, x := h.step(name, c, func() runMetrics { return run(c) })
		r.steps, r.extras = append(r.steps, s), append(r.extras, x)
		if rampStatusAfter(r.steps, h.probeBaseline, c*2 <= h.k.maxConc) != rampRunOn {
			break
		}
		if first := firstFailure(r.steps, h.probeBaseline); first == len(r.steps)-1 {
			h.t.Logf("%s c=%d failed (%s); running one more step to confirm", name, c,
				strings.Join(stepFailures(r.steps, first, h.probeBaseline), ", "))
		}
	}
	r.status = rampStatusAfter(r.steps, h.probeBaseline, false)
	r.max, r.failed = findMax(r.steps, h.probeBaseline)
	if first := firstFailure(r.steps, h.probeBaseline); first >= 0 {
		r.firstFail = r.steps[first].Concurrency
		if first+1 < len(r.steps) {
			r.confirmFailed = stepFailures(r.steps, first+1, h.probeBaseline)
		}
	}
	r.half = halfOf(r.max)
	if r.max == 0 {
		return r
	}
	if r.half == r.max {
		r.halfStep, r.halfExtras, _ = r.at(r.max)
		return r
	}
	r.halfStep, r.halfExtras = h.step(name+" half re-run", r.half, func() runMetrics { return run(r.half) })
	r.reran = true
	return r
}

// ---- report --------------------------------------------------------------------

func (h *harness) printHeader() {
	ram := readProcKB("/proc/meminfo", "MemTotal")
	var pg string
	_ = h.db.Raw("SHOW server_version").Scan(&pg).Error
	fmt.Printf("\n## Import capacity harness\n\n")
	fmt.Printf("- Machine: %d cores, %.1f GiB RAM, GOMAXPROCS %d, %s\n", runtime.NumCPU(), float64(ram)/(1<<30), runtime.GOMAXPROCS(0), runtime.Version())
	fmt.Printf("- Postgres %s (local, same machine), DB pool max open %d\n", pg, h.sqlDB.Stats().MaxOpenConnections)
	fmt.Printf("- Stub latency: mean %s, deterministic spread uniform +/-50%% per call (a listing batch of %d makes %d calls)\n", h.k.stubLatency, listBatchSize, listCallsPerBatch)
	fmt.Printf("- Per step: %d rows (listing: %d sources), 1 warm-up + %d measured runs, median reported\n", h.k.itemsPerStep, h.k.maxConc, measuredRuns)
	fmt.Printf("- Probe: ListContent first=50 at %g/s over %d resident content rows; idle baseline p95 %.1f ms over %d samples (%s)\n",
		h.k.probeRate, residentContent, ms(h.probeBaseline), h.baselineN, h.k.idleBaseline)
	fmt.Printf("- Idle RSS %.1f MiB; CPU limit %s; memory limit %s\n", float64(h.idleRSS)/(1<<20), limitText(h.k.cpuLimit, "cores"), limitText(h.k.memLimitMB, "MiB"))
	fmt.Printf("- Columns: items/s counts rows (listing: staged rows); item p50/p95 is the time inside CreateFromYouTube (listing: inside the stub's List call per source), both excluding the wait for a slot; CPU is this process only, net of the idle probe; goroutines and pool in use are peaks; probe p95 is over every probe sample of the measured runs.\n")
	if h.idleRSS == 0 {
		fmt.Printf("- RSS is unavailable here (no /proc), so the RSS columns read 0.\n")
	}
}

func limitText(v float64, unit string) string {
	if v == 0 {
		return "not given"
	}
	return fmt.Sprintf("%g %s", v, unit)
}

func (h *harness) printRamp(r *rampResult) {
	fmt.Printf("\n### %s\n\nConcurrency = %s in flight at once.\n\n%s\n", r.name, r.unit, stepTableHeader)
	for _, s := range r.steps {
		fmt.Println(s.markdownRow())
	}
	fmt.Printf("\n%s\n", extrasHeader)
	for i, x := range r.extras {
		fmt.Println(x.row(r.steps[i].Concurrency))
	}
	verdict := verdictLine(r.status, r.max, r.firstFail, h.k.maxConc, r.confirmFailed)
	switch {
	case r.max == 0:
		fmt.Printf("\nMax: 0. The first step failed (%s); fix that before reading any number.\n%s\n", strings.Join(r.failed, ", "), verdict)
		return
	case len(r.failed) > 0:
		fmt.Printf("\nMax: %d. The next step (%d) failed: %s.\n%s\n", r.max, r.firstFail, strings.Join(r.failed, ", "), verdict)
	default:
		fmt.Printf("\nMax: %d. %s\n", r.max, verdict)
	}
	fmt.Printf("Half (proposed default): %d.\n", r.half)
	atMax, _, _ := r.at(r.max)
	fmt.Printf("\nAt max (%d, from the ramp), then at half (%d, %s):\n\n%s\n%s\n%s\n", r.max, r.half,
		map[bool]string{true: "re-run", false: "same step"}[r.reran], stepTableHeader, atMax.markdownRow(), r.halfStep.markdownRow())
	fmt.Printf("\n%s\n%s\n", extrasHeader, r.halfExtras.row(r.half))
	h.printEnvelope(r, atMax)
}

// rssPerInFlight is the marginal RSS of one more item in flight, from the
// first and last steps of the ramp (the widest span measured).
func rssPerInFlight(r *rampResult) (float64, bool) {
	first, last := r.steps[0], r.steps[len(r.steps)-1]
	if last.Concurrency == first.Concurrency || last.PeakRSSBytes == 0 {
		return 0, false
	}
	return max(0, float64(last.PeakRSSBytes)-float64(first.PeakRSSBytes)) / float64(last.Concurrency-first.Concurrency), true
}

func (h *harness) printEnvelope(r *rampResult, atMax stepResult) {
	const mib = 1 << 20
	fmt.Printf("\nEnvelope for %s (process CPU only: Postgres runs on this machine here, remote when deployed):\n", r.name)
	for _, row := range []struct {
		label string
		s     stepResult
	}{{"max", atMax}, {"half", r.halfStep}} {
		switch {
		case row.s.CPUSecPerItem <= 0:
			fmt.Printf("- at %s (%d): CPU per item was 0, so no CPU bound.\n", row.label, row.s.Concurrency)
		case h.k.cpuLimit > 0:
			rate := h.k.cpuLimit / row.s.CPUSecPerItem
			bind := "the cap binds first"
			if rate < row.s.ItemsPerSec {
				bind = "the CPU limit would bind first"
			}
			fmt.Printf("- at %s (%d): sustainable items/s ≈ CPU limit ÷ CPU-seconds per item = %g ÷ %.4f = %.1f (this machine measured %.1f, so %s)\n",
				row.label, row.s.Concurrency, h.k.cpuLimit, row.s.CPUSecPerItem, rate, row.s.ItemsPerSec, bind)
		default:
			fmt.Printf("- at %s (%d): sustainable items/s ≈ CPU limit ÷ CPU-seconds per item = <CPU limit> ÷ %.4f (set PERF_CPU_LIMIT to evaluate)\n",
				row.label, row.s.Concurrency, row.s.CPUSecPerItem)
		}
	}
	per, ok := rssPerInFlight(r)
	if !ok {
		fmt.Printf("- peak memory ≈ idle RSS + cap × RSS per in-flight item: not computable (one step, or no RSS reading).\n")
		return
	}
	fmt.Printf("- RSS per in-flight item ≈ %.3f MiB (peak RSS went from %.1f to %.1f MiB between caps %d and %d; a fall counts as 0); idle RSS %.1f MiB\n",
		per/mib, float64(r.steps[0].PeakRSSBytes)/mib, float64(r.steps[len(r.steps)-1].PeakRSSBytes)/mib,
		r.steps[0].Concurrency, r.steps[len(r.steps)-1].Concurrency, float64(h.idleRSS)/mib)
	for _, row := range []struct {
		label string
		cap   int
	}{{"max", r.max}, {"half", r.half}} {
		est := (float64(h.idleRSS) + float64(row.cap)*per) / mib
		if h.k.memLimitMB > 0 {
			fmt.Printf("- at %s (%d): peak memory ≈ idle RSS + cap × RSS per in-flight item = %.1f MiB against a limit of %g MiB\n", row.label, row.cap, est, h.k.memLimitMB)
		} else {
			fmt.Printf("- at %s (%d): peak memory ≈ idle RSS + cap × RSS per in-flight item = %.1f MiB (set PERF_MEM_LIMIT_MB to compare)\n", row.label, row.cap, est)
		}
	}
	if h.k.memLimitMB > 0 && per > 0 {
		fmt.Printf("- the largest cap whose estimate fits the memory limit: %d\n", int((h.k.memLimitMB*mib-float64(h.idleRSS))/per))
	}
}

func TestImportCapacityPerf(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping the import capacity harness")
	}
	// This must stay the first thing done with dsn: it checks the exact string
	// newHarness hands the driver, before any connection and before any write.
	// A refusal is a failure, never a skip, and its message never contains the DSN.
	if err := refuseIfNeon(dsn); err != nil {
		t.Fatal(err)
	}
	k, err := parseKnobs(os.Getenv)
	if err != nil {
		t.Fatal(err)
	}

	h := newHarness(t, dsn, k)
	h.seedContent(residentContent)
	h.measureIdle()
	h.printHeader()

	rows := h.ramp("Row import ramp", "rows", func(c int) runMetrics { return h.rowRun(c, k.itemsPerStep) })
	h.printRamp(rows)

	batches := max(1, (k.itemsPerStep+k.maxConc*listBatchSize-1)/(k.maxConc*listBatchSize))
	listing := h.ramp("Listing ramp", "sources", func(c int) runMetrics { return h.listingRun(c, k.maxConc, batches) })
	h.printRamp(listing)
}

// ---- tests of the harness's own helpers -------------------------------------------

func TestPerfKnobs(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

	got, err := parseKnobs(env(nil))
	if err != nil {
		t.Fatalf("defaults: %v", err)
	}
	want := knobs{stubLatency: 150 * time.Millisecond, itemsPerStep: 500, maxConc: 64, probeRate: 5, idleBaseline: 10 * time.Second}
	if got != want {
		t.Errorf("defaults = %+v, want %+v", got, want)
	}

	got, err = parseKnobs(env(map[string]string{"PERF_STUB_LATENCY": "20ms", "PERF_ITEMS_PER_STEP": "40", "PERF_MAX_CONC": "4",
		"PERF_PROBE_RATE": "2.5", "PERF_IDLE_BASELINE": "2s", "PERF_CPU_LIMIT": "1.5", "PERF_MEM_LIMIT_MB": "512"}))
	if err != nil {
		t.Fatalf("set knobs: %v", err)
	}
	want = knobs{stubLatency: 20 * time.Millisecond, itemsPerStep: 40, maxConc: 4, probeRate: 2.5, idleBaseline: 2 * time.Second, cpuLimit: 1.5, memLimitMB: 512}
	if got != want {
		t.Errorf("set knobs = %+v, want %+v", got, want)
	}

	for _, bad := range []struct{ name, value string }{
		{"PERF_STUB_LATENCY", "150"}, {"PERF_STUB_LATENCY", "-1ms"}, {"PERF_ITEMS_PER_STEP", "0"}, {"PERF_ITEMS_PER_STEP", "5001"},
		{"PERF_ITEMS_PER_STEP", "lots"}, {"PERF_MAX_CONC", "0"}, {"PERF_MAX_CONC", "1.5"}, {"PERF_PROBE_RATE", "0"},
		{"PERF_PROBE_RATE", "NaN"}, {"PERF_IDLE_BASELINE", "0s"}, {"PERF_IDLE_BASELINE", "soon"}, {"PERF_CPU_LIMIT", "0"},
		{"PERF_CPU_LIMIT", "-1"}, {"PERF_MEM_LIMIT_MB", "0"}, {"PERF_MEM_LIMIT_MB", "a lot"},
	} {
		_, err := parseKnobs(env(map[string]string{bad.name: bad.value}))
		if err == nil || !strings.Contains(err.Error(), bad.name) {
			t.Errorf("%s=%q: error %v, want one naming the knob", bad.name, bad.value, err)
		}
	}
}

func TestPerfHelpers(t *testing.T) {
	d := func(vs ...int) (out []time.Duration) {
		for _, v := range vs {
			out = append(out, time.Duration(v)*time.Millisecond)
		}
		return out
	}
	if got := nearestRank(d(5, 1, 4, 2, 3), 50); got != 3*time.Millisecond {
		t.Errorf("p50 of 1..5 = %s, want 3ms", got)
	}
	if got := nearestRank(d(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20), 95); got != 19*time.Millisecond {
		t.Errorf("p95 of 1..20 = %s, want 19ms", got)
	}
	if got := nearestRank(d(7), 95); got != 7*time.Millisecond {
		t.Errorf("p95 of one sample = %s, want 7ms", got)
	}
	if nearestRank(nil, 95) != 0 || medianOf[int](nil) != 0 {
		t.Error("empty input should give 0")
	}
	if got := medianOf([]float64{9, 1, 5}); got != 5 {
		t.Errorf("median = %v, want 5", got)
	}

	if got := procKB("Name:\tx\nVmRSS:\t   2048 kB\nVmHWM:\t 4096 kB\n", "VmRSS"); got != 2<<20 {
		t.Errorf("VmRSS = %d, want %d", got, 2<<20)
	}
	if got := procKB("Name:\tx\n", "VmRSS"); got != 0 {
		t.Errorf("missing key = %d, want 0", got)
	}

	cpu, ok := parseProcStat("cpu  100 10 50 800 20 5 5 10 0 0\ncpu0 1 2 3 4 5 6 7 8 9 10\n")
	if !ok || cpu.total != 1000 || cpu.busy != 180 {
		t.Errorf("parseProcStat = %+v, %v; want total 1000, busy 180", cpu, ok)
	}
	if _, ok := parseProcStat("intr 1 2 3"); ok {
		t.Error("parseProcStat accepted a line that is not the cpu line")
	}

	if n, ok := refCount(listRef(500, "ab")); !ok || n != 500 {
		t.Errorf("refCount = %d, %v, want 500, true", n, ok)
	}
	if _, ok := refCount("channel-5"); ok {
		t.Error("refCount accepted a reference the stub did not make")
	}
}

func TestJitteredLatency(t *testing.T) {
	const n = 20000
	// The two key shapes the stubs use: sequential video ids, and source/batch/call.
	keyShapes := map[string]func(i int) string{
		"video id":          func(i int) string { return fmt.Sprintf("%04x%07x", 0xab12, i) },
		"source/batch/call": func(i int) string { return fmt.Sprintf("perf-500-%x/%d/%d", i/6, i/2%3, i%2) },
	}
	samples := func(mean time.Duration, key func(int) string) []time.Duration {
		out := make([]time.Duration, n)
		for i := range out {
			out[i] = jitteredLatency(mean, key(i))
		}
		return out
	}

	t.Run("same key, same value", func(t *testing.T) {
		for _, key := range []string{"", "abc", "0ab12000001", "perf-500-1/0/1"} {
			want := jitteredLatency(150*time.Millisecond, key)
			for range 3 {
				if got := jitteredLatency(150*time.Millisecond, key); got != want {
					t.Fatalf("key %q gave %s, then %s", key, want, got)
				}
			}
		}
	})

	for shape, key := range keyShapes {
		for _, mean := range []time.Duration{150 * time.Millisecond, 20 * time.Millisecond, 7*time.Millisecond + 3, 1 << 27} {
			t.Run(fmt.Sprintf("%s, mean %s", shape, mean), func(t *testing.T) {
				got := samples(mean, key)
				lo, hi := mean/2, mean/2+mean // [0.5*mean, 1.5*mean)
				var sum time.Duration
				bins := make([]int, 10)
				distinct := map[time.Duration]struct{}{}
				for _, d := range got {
					if d < lo || d >= hi {
						t.Fatalf("latency %s outside [%s, %s)", d, lo, hi)
					}
					sum += d
					bins[int(float64(d-lo)/float64(hi-lo)*10)]++
					distinct[d] = struct{}{}
				}
				if avg := sum / n; avg < mean*98/100 || avg > mean*102/100 {
					t.Errorf("mean of %d latencies = %s, want %s within 2%%", n, avg, mean)
				}
				// A uniform spread puts about 10% in each tenth of the range; a hash
				// that ignores the last characters of a key would pile them into one.
				for i, count := range bins {
					if count < n*7/100 || count > n*13/100 {
						t.Errorf("tenth %d of the range holds %d of %d latencies, want about %d", i, count, n, n/10)
					}
				}
				if len(distinct) < n*9/10 {
					t.Errorf("only %d distinct latencies over %d keys, want a real spread", len(distinct), n)
				}
			})
		}
	}

	t.Run("different keys give different values almost always", func(t *testing.T) {
		got := samples(150*time.Millisecond, keyShapes["video id"])
		same := 0
		for i := 1; i < len(got); i++ {
			if got[i] == got[i-1] {
				same++
			}
		}
		if same > n/100 {
			t.Errorf("%d of %d neighbouring keys got the same latency", same, n-1)
		}
	})

	t.Run("a mean of zero or less gives zero", func(t *testing.T) {
		for _, mean := range []time.Duration{0, -time.Millisecond} {
			if got := jitteredLatency(mean, "any key"); got != 0 {
				t.Errorf("mean %s gave %s, want 0", mean, got)
			}
		}
	})
}

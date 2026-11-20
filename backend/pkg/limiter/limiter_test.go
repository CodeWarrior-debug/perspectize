package limiter

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/metric/noop"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// storeMax raises *dst to v when v is larger, so concurrent goroutines can
// record the peak value they observed.
func storeMax(dst *atomic.Int64, v int64) {
	for {
		cur := dst.Load()
		if v <= cur || dst.CompareAndSwap(cur, v) {
			return
		}
	}
}

// waitForWaiting blocks until the limiter reports exactly n queued waiters,
// then pauses briefly so the waiter has parked on the semaphore (the counter
// moves a few instructions before the goroutine blocks).
func waitForWaiting(t *testing.T, l *Limiter, n int) {
	t.Helper()
	require.Eventually(t, func() bool { return l.Stats().Waiting == n },
		2*time.Second, time.Millisecond, "expected %d waiters", n)
	time.Sleep(10 * time.Millisecond)
}

type acquireResult struct {
	release func()
	err     error
}

// acquireAsync runs Acquire in a goroutine and delivers its outcome on the
// returned channel.
func acquireAsync(ctx context.Context, l *Limiter) <-chan acquireResult {
	out := make(chan acquireResult, 1)
	go func() {
		release, err := l.Acquire(ctx)
		out <- acquireResult{release: release, err: err}
	}()
	return out
}

func receiveResult(t *testing.T, ch <-chan acquireResult) acquireResult {
	t.Helper()
	select {
	case res := <-ch:
		return res
	case <-time.After(2 * time.Second):
		require.FailNow(t, "timed out waiting for Acquire to return")
		return acquireResult{}
	}
}

func TestAcquire_NeverExceedsCapacity(t *testing.T) {
	const (
		capacity = 3
		workers  = 50
	)
	l := New("test", capacity)

	var (
		inside        atomic.Int64
		peakInside    atomic.Int64
		peakInFlight  atomic.Int64
		completed     atomic.Int64
		wg            sync.WaitGroup
		acquireFailed atomic.Int64
	)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			release, err := l.Acquire(context.Background())
			if err != nil {
				acquireFailed.Add(1)
				return
			}
			storeMax(&peakInside, inside.Add(1))
			storeMax(&peakInFlight, int64(l.Stats().InFlight))
			time.Sleep(2 * time.Millisecond)
			inside.Add(-1)
			release()
			completed.Add(1)
		}()
	}
	wg.Wait()

	assert.Zero(t, acquireFailed.Load(), "no Acquire should fail with a background context")
	assert.Equal(t, int64(workers), completed.Load(), "every worker should complete")
	assert.LessOrEqual(t, peakInside.Load(), int64(capacity), "concurrent holders must not exceed capacity")
	assert.LessOrEqual(t, peakInFlight.Load(), int64(capacity), "Stats().InFlight must not exceed capacity")
	assert.Equal(t, int64(capacity), peakInside.Load(), "the limiter should let capacity holders run at once")
	assert.Equal(t, Stats{}, l.Stats(), "everything is released at the end")
}

func TestAcquire_CancelledContextFailsEvenWhenSlotFree(t *testing.T) {
	l := New("test", 1)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// select picks randomly among ready cases, so repeat enough times that an
	// implementation skipping the up-front ctx.Err() check would be caught.
	for i := 0; i < 100; i++ {
		release, err := l.Acquire(ctx)
		if release != nil {
			release()
		}
		require.ErrorIs(t, err, context.Canceled, "attempt %d", i)
		assert.Nil(t, release, "no release func on failure")
		assert.Equal(t, Stats{}, l.Stats(), "attempt %d", i)
	}
}

func TestAcquire_CancelWhileWaitingLeaksNoSlot(t *testing.T) {
	l := New("test", 1)

	holderRelease, err := l.Acquire(context.Background())
	require.NoError(t, err)
	require.Equal(t, Stats{InFlight: 1}, l.Stats())

	ctx, cancel := context.WithCancel(context.Background())
	waiter := acquireAsync(ctx, l)
	waitForWaiting(t, l, 1)
	assert.Equal(t, Stats{InFlight: 1, Waiting: 1}, l.Stats())

	cancel()
	res := receiveResult(t, waiter)
	require.ErrorIs(t, res.err, context.Canceled)
	assert.Nil(t, res.release)
	assert.Equal(t, Stats{InFlight: 1}, l.Stats(), "cancelled waiter leaves the queue")

	holderRelease()

	// A leaked slot would make this block until the deadline and fail.
	freshCtx, freshCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer freshCancel()
	freshRelease, err := l.Acquire(freshCtx)
	require.NoError(t, err, "slot freed by the holder must be available")
	assert.Equal(t, Stats{InFlight: 1}, l.Stats())
	freshRelease()
	assert.Equal(t, Stats{}, l.Stats())
}

func TestRelease_IsIdempotent(t *testing.T) {
	l := New("test", 1)

	releaseA, err := l.Acquire(context.Background())
	require.NoError(t, err)
	releaseA()
	assert.Equal(t, Stats{}, l.Stats())

	releaseB, err := l.Acquire(context.Background())
	require.NoError(t, err)

	// A second call must not give back B's slot.
	releaseA()
	assert.Equal(t, Stats{InFlight: 1}, l.Stats(), "double release must not free a second slot")

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	releaseC, err := l.Acquire(ctx)
	if releaseC != nil {
		releaseC()
	}
	require.ErrorIs(t, err, context.DeadlineExceeded, "a third caller must still block at capacity 1")

	// Released last, not deferred: with a broken limiter B's slot is already
	// gone and a deferred release would hang the failing test.
	releaseB()
	assert.Equal(t, Stats{}, l.Stats())
}

func TestAcquire_BlockedWaitersAreServedInOrder(t *testing.T) {
	const waiters = 5
	l := New("test", 1)

	holderRelease, err := l.Acquire(context.Background())
	require.NoError(t, err)

	// order is written while holding the slot, so it records the exact order
	// in which waiters were admitted.
	order := make(chan int, waiters)
	var wg sync.WaitGroup
	for i := 0; i < waiters; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			release, err := l.Acquire(context.Background())
			if err != nil {
				return
			}
			order <- id
			release()
		}(i)
		waitForWaiting(t, l, i+1)
	}

	holderRelease()
	wg.Wait()
	close(order)

	var got []int
	for id := range order {
		got = append(got, id)
	}
	assert.Equal(t, []int{0, 1, 2, 3, 4}, got, "waiters should be admitted in arrival order")
}

func TestNew_NonPositiveCapacityIsOne(t *testing.T) {
	assert.Equal(t, 1, New("x", 0).Capacity())
	assert.Equal(t, 1, New("x", -5).Capacity())
	assert.Equal(t, 7, New("x", 7).Capacity())
}

func TestNew_WithoutMeterNeedsNoTelemetry(t *testing.T) {
	assert.NotPanics(t, func() {
		l := New("no-meter", 2)
		release, err := l.Acquire(context.Background())
		require.NoError(t, err)
		assert.Equal(t, Stats{InFlight: 1}, l.Stats())
		release()
		assert.Equal(t, Stats{}, l.Stats())
	})
}

func findMetric(rm *metricdata.ResourceMetrics, name string) (metricdata.Metrics, bool) {
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name == name {
				return m, true
			}
		}
	}
	return metricdata.Metrics{}, false
}

// requireLimiterAttr asserts the attribute set holds only limiter=<name>.
func requireLimiterAttr(t *testing.T, attrs attribute.Set, name string) {
	t.Helper()
	assert.Equal(t, 1, attrs.Len(), "limiter must be the only attribute")
	v, ok := attrs.Value("limiter")
	require.True(t, ok, "limiter attribute should be present")
	assert.Equal(t, name, v.AsString())
}

// gaugeValue returns the single data point of an int64 gauge.
func gaugeValue(t *testing.T, rm *metricdata.ResourceMetrics, metricName, limiterName string) int64 {
	t.Helper()
	m, ok := findMetric(rm, metricName)
	require.True(t, ok, "%s should be present", metricName)
	gauge, ok := m.Data.(metricdata.Gauge[int64])
	require.True(t, ok, "%s should be an int64 gauge, got %T", metricName, m.Data)
	require.Len(t, gauge.DataPoints, 1)
	requireLimiterAttr(t, gauge.DataPoints[0].Attributes, limiterName)
	return gauge.DataPoints[0].Value
}

func waitHistogram(t *testing.T, rm *metricdata.ResourceMetrics, limiterName string) (metricdata.Metrics, metricdata.HistogramDataPoint[float64]) {
	t.Helper()
	m, ok := findMetric(rm, "limiter.wait_duration")
	require.True(t, ok, "limiter.wait_duration should be present")
	hist, ok := m.Data.(metricdata.Histogram[float64])
	require.True(t, ok, "limiter.wait_duration should be a float64 histogram, got %T", m.Data)
	require.Len(t, hist.DataPoints, 1)
	requireLimiterAttr(t, hist.DataPoints[0].Attributes, limiterName)
	return m, hist.DataPoints[0]
}

func TestMetrics_ReportInFlightWaitingAndWait(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")

	l := New("import", 1, WithMeter(meter))

	holderRelease, err := l.Acquire(context.Background())
	require.NoError(t, err)

	waiter := acquireAsync(context.Background(), l)
	waitForWaiting(t, l, 1)

	// One holder and one queued waiter: both gauges are 1, and only the
	// holder's (instant) acquire has been timed so far.
	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	assert.Equal(t, int64(1), gaugeValue(t, &rm, "limiter.in_flight", "import"))
	assert.Equal(t, int64(1), gaugeValue(t, &rm, "limiter.waiting", "import"))
	_, dp := waitHistogram(t, &rm, "import")
	assert.Equal(t, uint64(1), dp.Count, "one sample per successful Acquire so far")

	// The waiter has been queued for at least this long before it can get in.
	const heldFor = 20 * time.Millisecond
	time.Sleep(heldFor)
	holderRelease()

	res := receiveResult(t, waiter)
	require.NoError(t, res.err)
	res.release()

	var after metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &after))
	assert.Equal(t, int64(0), gaugeValue(t, &after, "limiter.in_flight", "import"))
	assert.Equal(t, int64(0), gaugeValue(t, &after, "limiter.waiting", "import"))

	m, dp := waitHistogram(t, &after, "import")
	assert.Equal(t, "s", m.Unit, "wait time is reported in seconds")
	assert.Equal(t, uint64(2), dp.Count, "one sample per successful Acquire, fast path included")
	assert.GreaterOrEqual(t, dp.Sum, heldFor.Seconds(), "the queued Acquire waited at least while the holder held the slot")
}

func TestMetrics_WaitHistogramUsesSecondsScaleBuckets(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	l := New("import", 1, WithMeter(mp.Meter("test")))

	release, err := l.Acquire(context.Background())
	require.NoError(t, err)
	release()

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	m, dp := waitHistogram(t, &rm, "import")

	// The SDK's default boundaries (0, 5, 10, 25, ...) are millisecond-scale,
	// so with a unit of seconds every wait under 5 s would share one bucket.
	// Pin seconds-scale boundaries, reaching a minute because imports queue.
	assert.Equal(t, "s", m.Unit)
	assert.Equal(t,
		[]float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 30, 60},
		dp.Bounds,
		"wait histogram needs explicit seconds-scale bucket boundaries")
}

func TestMetrics_FailedAcquireIsNotTimed(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	l := New("import", 1, WithMeter(mp.Meter("test")))

	holderRelease, err := l.Acquire(context.Background())
	require.NoError(t, err)
	defer holderRelease()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err = l.Acquire(ctx)
	require.ErrorIs(t, err, context.DeadlineExceeded)

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	_, dp := waitHistogram(t, &rm, "import")
	assert.Equal(t, uint64(1), dp.Count, "only the successful Acquire is a sample")
	assert.Equal(t, int64(0), gaugeValue(t, &rm, "limiter.waiting", "import"), "the timed-out waiter left the queue")
}

func TestMetrics_LimitersOnOneMeterAreToldApartByName(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	meter := mp.Meter("test")

	rows := New("rows", 2, WithMeter(meter))
	New("enrich", 1, WithMeter(meter))

	rowRelease, err := rows.Acquire(context.Background())
	require.NoError(t, err)
	defer rowRelease()

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))

	m, ok := findMetric(&rm, "limiter.in_flight")
	require.True(t, ok)
	gauge, ok := m.Data.(metricdata.Gauge[int64])
	require.True(t, ok)
	require.Len(t, gauge.DataPoints, 2, "one data point per limiter")

	byName := map[string]int64{}
	for _, dp := range gauge.DataPoints {
		v, ok := dp.Attributes.Value("limiter")
		require.True(t, ok)
		byName[v.AsString()] = dp.Value
	}
	assert.Equal(t, map[string]int64{"rows": 1, "enrich": 0}, byName)
}

// failingMeter rejects every instrument the limiter creates.
type failingMeter struct{ metric.Meter }

func (failingMeter) Int64ObservableGauge(string, ...metric.Int64ObservableGaugeOption) (metric.Int64ObservableGauge, error) {
	return nil, errors.New("gauge refused")
}

func (failingMeter) Float64Histogram(string, ...metric.Float64HistogramOption) (metric.Float64Histogram, error) {
	return nil, errors.New("histogram refused")
}

func TestWithMeter_InstrumentErrorsDoNotBreakLimiter(t *testing.T) {
	// slog.SetDefault is process-global, so this test must not run in parallel.
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	var l *Limiter
	require.NotPanics(t, func() {
		l = New("import", 2, WithMeter(failingMeter{Meter: noop.NewMeterProvider().Meter("test")}))
	})

	release, err := l.Acquire(context.Background())
	require.NoError(t, err, "a limiter must work without metrics")
	assert.Equal(t, Stats{InFlight: 1}, l.Stats())
	release()
	assert.Equal(t, Stats{}, l.Stats())

	assert.Contains(t, logs.String(), `"level":"WARN"`)
	assert.Contains(t, logs.String(), "gauge refused")
	assert.Contains(t, logs.String(), "histogram refused")
}

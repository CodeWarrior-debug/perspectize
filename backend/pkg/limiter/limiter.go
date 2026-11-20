// Package limiter provides a small context-aware concurrency limiter: at most
// capacity callers hold a slot at once, and everyone else waits their turn (in
// arrival order) or gives up when their context ends. It is meant to put a
// fixed, configurable ceiling on a kind of work, and it can report how busy
// that ceiling is as OpenTelemetry metrics.
package limiter

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const (
	metricInFlight     = "limiter.in_flight"
	metricWaiting      = "limiter.waiting"
	metricWaitDuration = "limiter.wait_duration"
)

// waitBuckets are the explicit histogram bucket boundaries (in seconds) for
// limiter.wait_duration. The SDK's defaults are millisecond-scale, which would
// put every wait under 5 s into one bucket. The range runs up to a minute
// because callers can queue for a long time behind slow work.
var waitBuckets = []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 30, 60}

// Stats is a point-in-time snapshot of a Limiter.
type Stats struct {
	// InFlight is the number of callers currently holding a slot.
	InFlight int
	// Waiting is the number of callers blocked in Acquire.
	Waiting int
}

// Limiter caps how many callers may hold a slot at once.
type Limiter struct {
	name     string
	capacity int
	slots    chan struct{}
	inFlight atomic.Int64
	waiting  atomic.Int64

	attrs    attribute.Set
	waitTime metric.Float64Histogram // nil unless WithMeter succeeded
}

// Option configures a Limiter in New.
type Option func(*Limiter)

// New returns a Limiter named name that admits at most capacity concurrent
// holders. A capacity below 1 is treated as 1. The name labels the limiter's
// metrics (attribute "limiter") and has no other effect.
func New(name string, capacity int, opts ...Option) *Limiter {
	if capacity < 1 {
		capacity = 1
	}
	l := &Limiter{
		name:     name,
		capacity: capacity,
		slots:    make(chan struct{}, capacity),
		attrs:    attribute.NewSet(attribute.String("limiter", name)),
	}
	for _, opt := range opts {
		opt(l)
	}
	return l
}

// WithMeter reports the limiter's state through m:
//   - limiter.in_flight: callers holding a slot (gauge)
//   - limiter.waiting: callers blocked in Acquire (gauge)
//   - limiter.wait_duration: seconds each successful Acquire spent waiting
//     for its slot, one sample per Acquire (histogram)
//
// All carry the single attribute limiter=<name>. A limiter must never fail to
// build over telemetry, so a metric that cannot be set up is logged and
// skipped.
func WithMeter(m metric.Meter) Option {
	return func(l *Limiter) {
		if err := l.observeGauges(m); err != nil {
			slog.Warn("limiter: gauges disabled", "limiter", l.name, "error", err)
		}

		hist, err := m.Float64Histogram(
			metricWaitDuration,
			metric.WithDescription("Time each successful Acquire spent waiting for a limiter slot."),
			metric.WithUnit("s"),
			metric.WithExplicitBucketBoundaries(waitBuckets...),
		)
		if err != nil {
			slog.Warn("limiter: wait histogram disabled", "limiter", l.name, "error", err)
			return
		}
		l.waitTime = hist
	}
}

// observeGauges creates the in-flight and waiting gauges and registers the
// callback that reports this limiter's numbers on them.
//
// The callback is registered on the meter rather than passed to the gauge at
// creation: limiters on one meter share same-named gauges, and the SDK drops
// a callback handed to a gauge it has already created, so only the first
// limiter would report. The registration lives as long as the limiter, which
// lives as long as the process, so it is never unregistered.
func (l *Limiter) observeGauges(m metric.Meter) error {
	inFlight, err := m.Int64ObservableGauge(
		metricInFlight,
		metric.WithDescription("Number of callers currently holding a limiter slot."),
	)
	if err != nil {
		return fmt.Errorf("creating %s: %w", metricInFlight, err)
	}
	waiting, err := m.Int64ObservableGauge(
		metricWaiting,
		metric.WithDescription("Number of callers blocked waiting for a limiter slot."),
	)
	if err != nil {
		return fmt.Errorf("creating %s: %w", metricWaiting, err)
	}

	attrs := metric.WithAttributeSet(l.attrs)
	_, err = m.RegisterCallback(func(_ context.Context, o metric.Observer) error {
		o.ObserveInt64(inFlight, l.inFlight.Load(), attrs)
		o.ObserveInt64(waiting, l.waiting.Load(), attrs)
		return nil
	}, inFlight, waiting)
	if err != nil {
		return fmt.Errorf("registering gauge callback: %w", err)
	}
	return nil
}

// Acquire waits for a free slot and returns a release function that gives it
// back. Release is safe to call more than once; only the first call counts.
//
// Acquire returns ctx's error, and no release function, if ctx is already done
// (even when a slot is free) or ends while waiting. Blocked callers are
// admitted in arrival order.
func (l *Limiter) Acquire(ctx context.Context) (release func(), err error) {
	// A select over a free slot and a done context picks at random, so check
	// the context first to make an already-cancelled caller fail every time.
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	start := time.Now()
	select {
	case l.slots <- struct{}{}:
		// Fast path: a slot was free, so this caller never counted as waiting.
	default:
		l.waiting.Add(1)
		select {
		case l.slots <- struct{}{}:
			l.waiting.Add(-1)
		case <-ctx.Done():
			l.waiting.Add(-1)
			return nil, ctx.Err()
		}
	}
	l.inFlight.Add(1)

	if l.waitTime != nil {
		l.waitTime.Record(ctx, time.Since(start).Seconds(), metric.WithAttributeSet(l.attrs))
	}

	var once sync.Once
	return func() {
		once.Do(func() {
			// Drop the count before freeing the slot, so the next holder's
			// increment can never push InFlight past capacity.
			l.inFlight.Add(-1)
			<-l.slots
		})
	}, nil
}

// Capacity returns the maximum number of concurrent holders.
func (l *Limiter) Capacity() int { return l.capacity }

// Stats returns a snapshot of how many callers hold or wait for a slot. The
// two numbers are read separately, so under load they are not an atomic pair.
func (l *Limiter) Stats() Stats {
	return Stats{
		InFlight: int(l.inFlight.Load()),
		Waiting:  int(l.waiting.Load()),
	}
}

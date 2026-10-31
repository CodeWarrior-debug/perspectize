package main

import (
	"context"
	"os"
	"strconv"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// importContentCreator is what the import workers call for each row.
type importContentCreator interface {
	CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error)
	CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error)
}

// maxDemoImportDelay caps DEMO_IMPORT_DELAY_MS so a typo can't stall a demo for minutes per row.
const maxDemoImportDelay = 5 * time.Second

// demoImportDelay reads DEMO_IMPORT_DELAY_MS: in demo mode, how long each
// imported row waits before it is created, standing in for the YouTube/TMDB
// round trip the offline demo clients skip. Unset, invalid or outside demo
// mode it is 0, so imports stay instant (and the demo tours fast).
func demoImportDelay(demoMode bool) time.Duration {
	if !demoMode {
		return 0
	}
	ms, err := strconv.Atoi(os.Getenv("DEMO_IMPORT_DELAY_MS"))
	if err != nil || ms <= 0 {
		return 0
	}
	return min(time.Duration(ms)*time.Millisecond, maxDemoImportDelay)
}

// slowImportCreator delays each import by a fixed time, so the live progress
// bar can be watched filling in demo mode. A cancelled context ends the wait.
type slowImportCreator struct {
	inner importContentCreator
	delay time.Duration
}

func (c slowImportCreator) wait(ctx context.Context) error {
	t := time.NewTimer(c.delay)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c slowImportCreator) CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error) {
	if err := c.wait(ctx); err != nil {
		return nil, err
	}
	return c.inner.CreateFromYouTube(ctx, url, userID)
}

func (c slowImportCreator) CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error) {
	if err := c.wait(ctx); err != nil {
		return nil, err
	}
	return c.inner.CreateFromMovie(ctx, rawURL, userID)
}

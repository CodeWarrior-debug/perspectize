package main

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDemoImportDelay(t *testing.T) {
	t.Setenv("DEMO_IMPORT_DELAY_MS", "250")
	assert.Equal(t, 250*time.Millisecond, demoImportDelay(true))
	assert.Zero(t, demoImportDelay(false), "never outside demo mode")
	t.Setenv("DEMO_IMPORT_DELAY_MS", "999999")
	assert.Equal(t, maxDemoImportDelay, demoImportDelay(true))
	for _, v := range []string{"", "abc", "-5", "0"} {
		t.Setenv("DEMO_IMPORT_DELAY_MS", v)
		assert.Zero(t, demoImportDelay(true), v)
	}
}

type countingCreator struct{ calls int }

func (c *countingCreator) CreateFromYouTube(context.Context, string, int) (*domain.Content, error) {
	c.calls++
	return &domain.Content{ID: 1}, nil
}

func (c *countingCreator) CreateFromMovie(context.Context, string, int) (*domain.Content, error) {
	c.calls++
	return &domain.Content{ID: 2}, nil
}

func TestSlowImportCreator(t *testing.T) {
	inner := &countingCreator{}
	slow := slowImportCreator{inner: inner, delay: 30 * time.Millisecond}
	start := time.Now()
	got, err := slow.CreateFromYouTube(context.Background(), "u", 1)
	require.NoError(t, err)
	assert.Equal(t, 1, got.ID)
	assert.GreaterOrEqual(t, time.Since(start), 30*time.Millisecond)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = slow.CreateFromMovie(ctx, "u", 1)
	assert.ErrorIs(t, err, context.Canceled, "a cancelled import stops waiting and creates nothing")
	assert.Equal(t, 1, inner.calls)
}

package auth

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// captureSlog swaps the default logger for one writing into a buffer.
// slog.SetDefault is process-global, so callers must not run in parallel.
func captureSlog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// When user.updated arrives for an unknown user the handler creates it. A
// failure of that fallback create is logged (but the webhook still acks 200);
// a success must not be logged as a failure.
func TestWebhook_UserUpdated_NotFound_CreateFallback(t *testing.T) {
	body := `{"type":"user.updated","data":{"id":"user_abc","username":"alice"}}`

	tests := []struct {
		name         string
		createErr    error
		wantErrorLog bool
	}{
		{"create fails: error is logged", errors.New("db down"), true},
		{"create succeeds: no error logged", nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureSlog(t)

			var created bool
			repo := &stubUserRepo{
				updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
					return domain.ErrNotFound
				},
				createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
					created = true
					assert.Equal(t, "user_abc", clerkID)
					if tt.createErr != nil {
						return nil, tt.createErr
					}
					return &domain.User{ID: 1, ClerkUserID: clerkID}, nil
				},
			}

			rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, body))

			require.True(t, created, "an unknown user on update must be created")
			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, tt.wantErrorLog, bytes.Contains(logs.Bytes(), []byte("failed to create user on update")),
				"logs: %s", logs.String())
		})
	}
}

package realtime

import (
	"context"
	"log/slog"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// PresenceConfig tunes the lifecycle timers. Zero value is not valid — use
// DefaultPresenceConfig(). Tests pass small durations.
type PresenceConfig struct {
	OfflineGrace      time.Duration // wait this long after the last disconnect before publishing OFFLINE
	HeartbeatInterval time.Duration // Touch the tracker this often while connected
}

// DefaultPresenceConfig returns the default presence tracking configuration.
func DefaultPresenceConfig() PresenceConfig {
	return PresenceConfig{OfflineGrace: 15 * time.Second, HeartbeatInterval: 20 * time.Second}
}

// presenceNotifier is the subset of *Hub this needs. *Hub satisfies it via
// PublishEphemeral.
type presenceNotifier interface {
	PublishEphemeral(ctx context.Context, env domain.EventEnvelope) error
}

// RunPresenceSession models one WebSocket connection's contribution to a user's
// presence. Call it in its own goroutine from the InitFunc, passing the
// per-connection context gqlgen cancels on socket close. It returns when ctx is
// done (after arranging the OFFLINE grace check).
//
//   - On entry: PresenceTracker.Connect(userID); if this is the user's first
//     connection, publish PRESENCE_CHANGED / ONLINE to each of the user's threads.
//   - While connected: every cfg.HeartbeatInterval, PresenceTracker.Touch(userID).
//   - On ctx.Done(): PresenceTracker.Disconnect(userID); if that was the last
//     connection, after cfg.OfflineGrace re-check PresenceTracker.RefCount(userID)
//     and, if it is still zero, publish PRESENCE_CHANGED / OFFLINE to the user's
//     threads. A reconnect during the grace window bumps the refcount so no
//     OFFLINE is published.
func RunPresenceSession(
	ctx context.Context,
	tracker *PresenceTracker,
	notifier presenceNotifier,
	threadRepo repositories.ThreadRepository,
	userID int,
	cfg PresenceConfig,
) {
	if tracker.Connect(userID) {
		publishPresence(ctx, notifier, threadRepo, userID, domain.PresenceOnline)
	}

	ticker := time.NewTicker(cfg.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			last := tracker.Disconnect(userID)
			if !last {
				return
			}
			// Detached grace check — use context.Background(), the connection
			// ctx is already dead. userID is captured by value.
			time.AfterFunc(cfg.OfflineGrace, func() {
				if tracker.RefCount(userID) > 0 {
					return
				}
				publishPresence(context.Background(), notifier, threadRepo, userID, domain.PresenceOffline)
			})
			return
		case <-ticker.C:
			tracker.Touch(userID)
		}
	}
}

// publishPresence fans a PRESENCE_CHANGED envelope into every thread the user is
// an active participant of. Best-effort: a lookup or publish failure is logged,
// not propagated.
func publishPresence(
	ctx context.Context,
	notifier presenceNotifier,
	threadRepo repositories.ThreadRepository,
	userID int,
	state domain.PresenceState,
) {
	threads, err := threadRepo.ListThreadsForUser(ctx, userID, 100, nil)
	if err != nil {
		slog.Warn("presence: could not list user threads", "user_id", userID, "error", err)
		return
	}
	for _, t := range threads {
		_ = notifier.PublishEphemeral(ctx, domain.EventEnvelope{
			Type:     "PRESENCE_CHANGED",
			ThreadID: t.ID,
			UserID:   userID,
			State:    string(state),
		})
	}
}

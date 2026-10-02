package services_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const limitsMaxBody = 8192

func TestSendMessage_BodySizeBoundary(t *testing.T) {
	threadRepo := &mockThreadRepo{
		getThreadFn: func(ctx context.Context, threadID int) (*domain.MessageThread, error) {
			return threadWithParticipants(7, 1, 2), nil
		},
	}
	svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

	t.Run("exactly the max bytes is accepted", func(t *testing.T) {
		got, err := svc.SendMessage(context.Background(), 1, portservices.SendMessageInput{
			ThreadID: 7, Body: strings.Repeat("a", limitsMaxBody), ClientNonce: "n1",
		})
		require.NoError(t, err)
		assert.Len(t, got.Body, limitsMaxBody)
	})

	t.Run("one byte over is rejected", func(t *testing.T) {
		_, err := svc.SendMessage(context.Background(), 1, portservices.SendMessageInput{
			ThreadID: 7, Body: strings.Repeat("a", limitsMaxBody+1), ClientNonce: "n1",
		})
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
	})
}

func TestEditMessage_BodySizeBoundary(t *testing.T) {
	msgRepo := &mockMessageRepo{
		getByIDFn: func(ctx context.Context, id int64) (*domain.Message, error) {
			return &domain.Message{ID: id, ThreadID: 7, SenderID: 1, Seq: 3, Body: "old"}, nil
		},
		updateBodyFn: func(ctx context.Context, id int64, body string, editedAt time.Time) (*domain.Message, error) {
			return &domain.Message{ID: id, Body: body}, nil
		},
	}
	svc := services.NewMessagingService(&mockThreadRepo{}, msgRepo, &mockPublisher{}, newLimiter(100))

	t.Run("exactly the max bytes is accepted", func(t *testing.T) {
		got, err := svc.EditMessage(context.Background(), 1, 10, strings.Repeat("a", limitsMaxBody))
		require.NoError(t, err)
		assert.Len(t, got.Body, limitsMaxBody)
	})

	t.Run("one byte over is rejected", func(t *testing.T) {
		_, err := svc.EditMessage(context.Background(), 1, 10, strings.Repeat("a", limitsMaxBody+1))
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
	})
}

func TestCreateThread_DirectLookupUsesTheOtherParticipant(t *testing.T) {
	// The participant set is built from a map, so iteration order is random;
	// repeat to exercise both orderings of the two ids.
	for i := 0; i < 50; i++ {
		var gotA, gotB int
		threadRepo := &mockThreadRepo{
			findDirectThreadFn: func(ctx context.Context, userA, userB int) (*domain.MessageThread, error) {
				gotA, gotB = userA, userB
				return &domain.MessageThread{ID: 500}, nil
			},
		}
		svc := services.NewMessagingService(threadRepo, &mockMessageRepo{}, &mockPublisher{}, newLimiter(100))

		_, err := svc.CreateThread(context.Background(), 1, []int{2}, nil)

		require.NoError(t, err)
		assert.Equal(t, 1, gotA, "first lookup arg is the actor")
		assert.Equal(t, 2, gotB, "second lookup arg is the other participant, never the actor")
	}
}

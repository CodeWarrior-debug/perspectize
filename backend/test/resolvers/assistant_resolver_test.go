package resolvers_test

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeAssistant streams scripted events, or returns an error from Ask.
type fakeAssistant struct {
	events   []domain.AssistantEvent
	err      error
	gotUser  int
	gotMsg   string
	gotPage  string
	holdOpen bool // keep the stream open until ctx is cancelled
}

var _ portservices.AssistantService = (*fakeAssistant)(nil)

func (f *fakeAssistant) Ask(ctx context.Context, userID int, message, page string) (<-chan domain.AssistantEvent, error) {
	f.gotUser, f.gotMsg, f.gotPage = userID, message, page
	if f.err != nil {
		return nil, f.err
	}
	ch := make(chan domain.AssistantEvent)
	go func() {
		defer close(ch)
		for _, e := range f.events {
			select {
			case ch <- e:
			case <-ctx.Done():
				return
			}
		}
		if f.holdOpen {
			<-ctx.Done()
		}
	}()
	return ch, nil
}

func assistantResolver(a portservices.AssistantService) *resolvers.Resolver {
	r := resolvers.NewResolver(nil, nil, nil, nil, nil, nil, nil)
	r.Assistant = a
	return r
}

func collect(t *testing.T, ch <-chan model.AssistantEvent) []model.AssistantEvent {
	t.Helper()
	var out []model.AssistantEvent
	timeout := time.After(2 * time.Second)
	for {
		select {
		case e, ok := <-ch:
			if !ok {
				return out
			}
			out = append(out, e)
		case <-timeout:
			t.Fatal("subscription did not complete")
		}
	}
}

func TestAssistantReply_MapsEventsToUnion(t *testing.T) {
	fake := &fakeAssistant{events: []domain.AssistantEvent{
		{Kind: domain.AssistantEventTool, ToolName: "read_guide"},
		{Kind: domain.AssistantEventText, Text: "Open **Compare** [compare.pick-two]."},
		{Kind: domain.AssistantEventDone, Stop: "end", Citations: []string{"compare.pick-two"}, InputTokens: 100, OutputTokens: 20},
	}}
	page := "compare"
	ch, err := assistantResolver(fake).Subscription().AssistantReply(authedCtx(3),
		model.AssistantAskInput{Message: "How do I compare?", Page: &page})
	require.NoError(t, err)
	got := collect(t, ch)

	assert.Equal(t, 3, fake.gotUser)
	assert.Equal(t, "How do I compare?", fake.gotMsg)
	assert.Equal(t, "compare", fake.gotPage)
	require.Len(t, got, 3)
	assert.Equal(t, &model.AssistantToolActivity{Name: "read_guide"}, got[0])
	assert.Equal(t, &model.AssistantTextDelta{Text: "Open **Compare** [compare.pick-two]."}, got[1])
	assert.Equal(t, &model.AssistantDone{Stop: "end", Citations: []string{"compare.pick-two"}, InputTokens: 100, OutputTokens: 20}, got[2])
}

func TestAssistantReply_ErrorEventAndNilCitations(t *testing.T) {
	fake := &fakeAssistant{events: []domain.AssistantEvent{
		{Kind: domain.AssistantEventError, Message: "try again"},
	}}
	ch, err := assistantResolver(fake).Subscription().AssistantReply(authedCtx(1), model.AssistantAskInput{Message: "q"})
	require.NoError(t, err)
	got := collect(t, ch)
	require.Len(t, got, 1)
	assert.Equal(t, &model.AssistantError{Message: "try again"}, got[0])
	assert.Equal(t, "", fake.gotPage, "nil page becomes empty")

	fake2 := &fakeAssistant{events: []domain.AssistantEvent{{Kind: domain.AssistantEventDone, Stop: "end"}}}
	ch2, err := assistantResolver(fake2).Subscription().AssistantReply(authedCtx(1), model.AssistantAskInput{Message: "q"})
	require.NoError(t, err)
	done := collect(t, ch2)[0].(*model.AssistantDone)
	assert.NotNil(t, done.Citations, "citations is a non-null list in the schema")
}

func TestAssistantReply_Unauthenticated(t *testing.T) {
	_, err := assistantResolver(&fakeAssistant{}).Subscription().AssistantReply(context.Background(), model.AssistantAskInput{Message: "q"})
	assert.ErrorIs(t, err, domain.ErrForbidden)
}

func TestAssistantReply_Disabled(t *testing.T) {
	_, err := assistantResolver(nil).Subscription().AssistantReply(authedCtx(1), model.AssistantAskInput{Message: "q"})
	assert.ErrorIs(t, err, domain.ErrAssistantDisabled)
}

func TestAssistantReply_ServiceErrorsPassThrough(t *testing.T) {
	_, err := assistantResolver(&fakeAssistant{err: domain.ErrAssistantBusy}).Subscription().
		AssistantReply(authedCtx(1), model.AssistantAskInput{Message: "q"})
	assert.ErrorIs(t, err, domain.ErrAssistantBusy)
}

func TestAssistantReply_CancelClosesStream(t *testing.T) {
	fake := &fakeAssistant{holdOpen: true}
	ctx, cancel := context.WithCancel(authedCtx(1))
	ch, err := assistantResolver(fake).Subscription().AssistantReply(ctx, model.AssistantAskInput{Message: "q"})
	require.NoError(t, err)
	cancel()
	collect(t, ch) // must close promptly
}

package roundtrips

import (
	"context"
	"fmt"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
)

// Field selections copied from frontend/src/lib/queries/messaging/index.ts so
// the counts reflect what the app actually requests.
const (
	userFields    = `id username`
	threadFields  = `id title lastMessageAt latestSeq myLastReadSeq unreadCount muted createdAt participants { user { ` + userFields + ` } role lastReadSeq joinedAt }`
	messageFields = `id threadId seq body editedAt deletedAt createdAt sender { ` + userFields + ` }`

	listThreadsQuery   = `query($first: Int) { messageThreads(first: $first) { ` + threadFields + ` } }`
	getThreadQuery     = `query($id: ID!) { messageThread(id: $id) { ` + threadFields + ` } }`
	listMessagesQuery  = `query($threadId: ID!, $first: Int) { threadMessages(threadId: $threadId, first: $first) { items { ` + messageFields + ` } pageInfo { hasNextPage } } }`
	createThreadMut    = `mutation($input: CreateMessageThreadInput!) { createMessageThread(input: $input) { ` + threadFields + ` } }`
	sendMessageMut     = `mutation($input: SendMessageInput!) { sendMessage(input: $input) { ` + messageFields + ` } }`
	markReadMut        = `mutation($threadId: ID!, $seq: IntID!) { markThreadRead(threadId: $threadId, seq: $seq) { ` + threadFields + ` } }`
	setTypingMut       = `mutation($threadId: ID!, $typing: Boolean!) { setTyping(threadId: $threadId, typing: $typing) }`
	muteThreadMut      = `mutation($threadId: ID!, $muted: Boolean!) { muteThread(threadId: $threadId, muted: $muted) { ` + threadFields + ` } }`
	addParticipantsMut = `mutation($threadId: ID!, $userIds: [ID!]!) { addThreadParticipants(threadId: $threadId, userIds: $userIds) { ` + threadFields + ` } }`
	leaveThreadMut     = `mutation($threadId: ID!) { leaveThread(threadId: $threadId) }`
	editMessageMut     = `mutation($messageId: ID!, $body: String!) { editMessage(messageId: $messageId, body: $body) { ` + messageFields + ` } }`
	deleteMessageMut   = `mutation($messageId: ID!) { deleteMessage(messageId: $messageId) { ` + messageFields + ` } }`
)

type threadResult struct {
	ID string `json:"id"`
}

type messageResult struct {
	ID  string `json:"id"`
	Seq string `json:"seq"` // IntID serializes as a string
}

func (h *harness) createThread(token string, participantIDs ...int) string {
	h.t.Helper()
	ids := make([]string, len(participantIDs))
	for i, id := range participantIDs {
		ids[i] = fmt.Sprint(id)
	}
	data := h.gql(token, createThreadMut, map[string]any{"input": map[string]any{"participantUserIds": ids}})
	return decode[threadResult](h.t, data, "createMessageThread").ID
}

func (h *harness) send(token, threadID string, n int) messageResult {
	h.t.Helper()
	data := h.gql(token, sendMessageMut, map[string]any{"input": map[string]any{
		"threadId": threadID, "body": fmt.Sprintf("message %d", n), "clientNonce": fmt.Sprintf("n-%s-%d", threadID, n),
	}})
	return decode[messageResult](h.t, data, "sendMessage")
}

// messagingFixture: alice has `threads` two-person threads — the first with
// bob, the rest each with a fresh user (a second 1:1 thread with the same
// person would just return the first) — and the first holds `messages`
// messages alternating between alice and bob.
type messagingFixture struct {
	h              *harness
	aliceID, bobID int
	carolID        int
	alice, bob     string
	threadIDs      []string
	lastMessage    messageResult
}

func newMessagingFixture(t *testing.T, threads, messages int) *messagingFixture {
	h := newHarness(t)
	f := &messagingFixture{h: h}
	f.aliceID, f.alice = h.user("alice")
	f.bobID, f.bob = h.user("bob")
	f.carolID, _ = h.user("carol")
	h.warm(f.alice)
	h.warm(f.bob)
	for i := 0; i < threads; i++ {
		other := f.bobID
		if i > 0 {
			other, _ = h.user(fmt.Sprintf("peer%d", i))
		}
		f.threadIDs = append(f.threadIDs, h.createThread(f.alice, other))
	}
	for i := 0; i < messages; i++ {
		tok := f.alice
		if i%2 == 1 {
			tok = f.bob
		}
		f.lastMessage = h.send(tok, f.threadIDs[0], i)
	}
	return f
}

func TestMessageThreadsList(t *testing.T) {
	f := newMessagingFixture(t, 5, 0)
	// threads JOIN participants, thread stats (all threads), users (all participants)
	f.h.roundTrips(3, f.alice, listThreadsQuery, map[string]any{"first": 50})
}

// The thread list must not grow with the number of threads (no N+1): 12
// threads cost the same 3 statements as 5.
func TestMessageThreadsListIsConstant(t *testing.T) {
	f := newMessagingFixture(t, 12, 0)
	f.h.roundTrips(3, f.alice, listThreadsQuery, map[string]any{"first": 50})
}

func TestMessageThreadGet(t *testing.T) {
	f := newMessagingFixture(t, 1, 0)
	// thread JOIN participants (also the participation check), stats, users
	f.h.roundTrips(3, f.alice, getThreadQuery, map[string]any{"id": f.threadIDs[0]})
}

func TestThreadMessagesList(t *testing.T) {
	f := newMessagingFixture(t, 1, 10)
	// thread JOIN participants (participation check), messages, users (all senders)
	f.h.roundTrips(3, f.alice, listMessagesQuery, map[string]any{"threadId": f.threadIDs[0], "first": 50})
}

// Nor the message list with the number of messages: 30 cost the same as 10.
func TestThreadMessagesListIsConstant(t *testing.T) {
	f := newMessagingFixture(t, 1, 30)
	f.h.roundTrips(3, f.alice, listMessagesQuery, map[string]any{"threadId": f.threadIDs[0], "first": 50})
}

func TestCreateMessageThread(t *testing.T) {
	f := newMessagingFixture(t, 0, 0)
	f.h.roundTrips(8, f.alice, createThreadMut, map[string]any{"input": map[string]any{
		"participantUserIds": []string{fmt.Sprint(f.bobID)},
	}})
}

func TestSendMessage(t *testing.T) {
	f := newMessagingFixture(t, 1, 0)
	f.h.roundTrips(4, f.alice, sendMessageMut, map[string]any{"input": map[string]any{
		"threadId": f.threadIDs[0], "body": "hi", "clientNonce": "rt-send",
	}})
}

func TestMarkThreadRead(t *testing.T) {
	f := newMessagingFixture(t, 1, 2)
	f.h.roundTrips(7, f.alice, markReadMut, map[string]any{"threadId": f.threadIDs[0], "seq": f.lastMessage.Seq})
}

func TestSetTyping(t *testing.T) {
	f := newMessagingFixture(t, 1, 0)
	// participation check, pg_notify
	f.h.roundTrips(2, f.alice, setTypingMut, map[string]any{"threadId": f.threadIDs[0], "typing": true})
}

func TestMuteThread(t *testing.T) {
	f := newMessagingFixture(t, 1, 0)
	// participation check (the thread returned), UPDATE, stats, users
	f.h.roundTrips(4, f.alice, muteThreadMut, map[string]any{"threadId": f.threadIDs[0], "muted": true})
}

func TestAddThreadParticipants(t *testing.T) {
	f := newMessagingFixture(t, 1, 0)
	f.h.roundTrips(7, f.alice, addParticipantsMut, map[string]any{"threadId": f.threadIDs[0], "userIds": []string{fmt.Sprint(f.carolID)}})
}

func TestLeaveThread(t *testing.T) {
	f := newMessagingFixture(t, 1, 0)
	// participation check, UPDATE, pg_notify
	f.h.roundTrips(3, f.bob, leaveThreadMut, map[string]any{"threadId": f.threadIDs[0]})
}

func TestEditMessage(t *testing.T) {
	f := newMessagingFixture(t, 1, 1)
	f.h.roundTrips(5, f.alice, editMessageMut, map[string]any{"messageId": f.lastMessage.ID, "body": "edited"})
}

func TestDeleteMessage(t *testing.T) {
	f := newMessagingFixture(t, 1, 1)
	f.h.roundTrips(5, f.alice, deleteMessageMut, map[string]any{"messageId": f.lastMessage.ID})
}

// The batched stats must equal what the per-thread MaxSeq / CountSince
// queries they replaced would have returned.
func TestThreadStatsMatchPerThreadQueries(t *testing.T) {
	f := newMessagingFixture(t, 3, 5)
	h := f.h
	data := h.gql(f.alice, listThreadsQuery, map[string]any{"first": 50})
	threads := decode[[]struct {
		ID            string `json:"id"`
		LatestSeq     string `json:"latestSeq"`
		MyLastReadSeq string `json:"myLastReadSeq"`
		UnreadCount   int    `json:"unreadCount"`
	}](t, data, "messageThreads")
	require.Len(t, threads, 3)

	msgRepo := postgres.NewGormMessageRepository(h.db)
	for _, th := range threads {
		id, _ := strconv.Atoi(th.ID)
		lastRead, _ := strconv.ParseInt(th.MyLastReadSeq, 10, 64)
		wantLatest, err := msgRepo.MaxSeq(context.Background(), id)
		require.NoError(t, err)
		wantUnread, err := msgRepo.CountSince(context.Background(), id, lastRead)
		require.NoError(t, err)
		require.Equal(t, fmt.Sprint(wantLatest), th.LatestSeq, "thread %d latestSeq", id)
		require.Equal(t, wantUnread, th.UnreadCount, "thread %d unreadCount", id)
	}
}

package messaging_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"

	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

func subVars(threadID int, since any) map[string]any {
	return map[string]any{"t": fmt.Sprint(threadID), "since": since}
}

// TestE2E_TwoUsersChat: B subscribes, A sends, B receives MessagePosted seq 1;
// then the reverse direction yields seq 2.
func TestE2E_TwoUsersChat(t *testing.T) {
	srv := newServer(t)
	a := mkUser(t, srv, "chat_a")
	b := mkUser(t, srv, "chat_b")
	thread := mustCreateThread(t, srv, a, []int{b})

	subB := dialWS(t, srv.url, b)
	subB.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv, subB, "1", thread)

	mustSendMessage(t, srv, a, thread, "hello from a", "n-a-1")

	ev := nextThreadEvent(t, subB, "1")
	require.Equal(t, "MessagePosted", ev.ThreadEvents.Typename)
	require.NotNil(t, ev.ThreadEvents.Message)
	require.Equal(t, "hello from a", ev.ThreadEvents.Message.Body)
	require.Equal(t, "1", ev.ThreadEvents.Message.Seq)
	require.Equal(t, fmt.Sprint(a), ev.ThreadEvents.Message.Sender.ID)

	// reverse direction
	subA := dialWS(t, srv.url, a)
	subA.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv, subA, "1", thread)

	mustSendMessage(t, srv, b, thread, "hi back", "n-b-1")

	ev2 := nextThreadEvent(t, subA, "1")
	require.Equal(t, "MessagePosted", ev2.ThreadEvents.Typename)
	require.Equal(t, "hi back", ev2.ThreadEvents.Message.Body)
	require.Equal(t, "2", ev2.ThreadEvents.Message.Seq)
}

// TestE2E_ReconnectReplaysMissed: B gets seq 1 live, disconnects, misses seq 2
// and 3, then re-subscribes with sinceSeq:1 and replays exactly 2 then 3,
// followed by a live seq 4.
func TestE2E_ReconnectReplaysMissed(t *testing.T) {
	srv := newServer(t)
	a := mkUser(t, srv, "rc_a")
	b := mkUser(t, srv, "rc_b")
	thread := mustCreateThread(t, srv, a, []int{b})

	subB := dialWS(t, srv.url, b)
	subB.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv, subB, "1", thread)

	mustSendMessage(t, srv, a, thread, "m1", "rc-1")
	ev := nextThreadEvent(t, subB, "1")
	require.Equal(t, "1", ev.ThreadEvents.Message.Seq)

	// B drops off.
	_ = subB.conn.Close(websocket.StatusNormalClosure, "reconnect")

	mustSendMessage(t, srv, a, thread, "m2", "rc-2")
	mustSendMessage(t, srv, a, thread, "m3", "rc-3")

	subB2 := dialWS(t, srv.url, b)
	subB2.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, 1))

	r2 := nextThreadEvent(t, subB2, "1")
	require.Equal(t, "MessagePosted", r2.ThreadEvents.Typename)
	require.Equal(t, "2", r2.ThreadEvents.Message.Seq)
	require.Equal(t, "m2", r2.ThreadEvents.Message.Body)

	r3 := nextThreadEvent(t, subB2, "1")
	require.Equal(t, "3", r3.ThreadEvents.Message.Seq)
	require.Equal(t, "m3", r3.ThreadEvents.Message.Body)

	// Ensure the live hub loop is active before sending seq 4.
	waitSubscribed(t, srv, subB2, "1", thread)
	mustSendMessage(t, srv, a, thread, "m4", "rc-4")

	r4 := nextThreadEvent(t, subB2, "1")
	require.Equal(t, "4", r4.ThreadEvents.Message.Seq)
	require.Equal(t, "m4", r4.ThreadEvents.Message.Body)
}

// TestE2E_ReadReceiptPropagates: A subscribes; B marks the thread read at seq 2;
// A receives ReadReceiptChanged{userId:B, lastReadSeq:2}.
func TestE2E_ReadReceiptPropagates(t *testing.T) {
	srv := newServer(t)
	a := mkUser(t, srv, "rr_a")
	b := mkUser(t, srv, "rr_b")
	thread := mustCreateThread(t, srv, a, []int{b})

	mustSendMessage(t, srv, a, thread, "one", "rr-1")
	mustSendMessage(t, srv, a, thread, "two", "rr-2")

	subA := dialWS(t, srv.url, a)
	subA.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv, subA, "1", thread)

	_, err := srv.messaging.MarkRead(context.Background(), b, thread, 2)
	require.NoError(t, err)

	ev := nextThreadEvent(t, subA, "1")
	require.Equal(t, "ReadReceiptChanged", ev.ThreadEvents.Typename)
	require.Equal(t, fmt.Sprint(b), ev.ThreadEvents.UserID)
	require.Equal(t, "2", ev.ThreadEvents.LastReadSeq)
}

// TestE2E_CrossInstanceFanout: two independent server instances (each its own
// Hub + Listener) against the same Postgres. A subscribes on srv1, B on srv2;
// A sends via srv1; B receives it on srv2 — proving LISTEN/NOTIFY crossed
// processes.
func TestE2E_CrossInstanceFanout(t *testing.T) {
	srv1 := newServer(t)
	srv2 := newServer(t)
	require.NotSame(t, srv1.hub, srv2.hub)

	a := mkUser(t, srv1, "ci_a")
	b := mkUser(t, srv1, "ci_b")
	thread := mustCreateThread(t, srv1, a, []int{b})

	subA := dialWS(t, srv1.url, a)
	subA.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv1, subA, "1", thread)

	subB := dialWS(t, srv2.url, b)
	subB.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv2, subB, "1", thread)

	mustSendMessage(t, srv1, a, thread, "cross-instance", "ci-1")

	ev := nextThreadEvent(t, subB, "1")
	require.Equal(t, "MessagePosted", ev.ThreadEvents.Typename)
	require.Equal(t, "cross-instance", ev.ThreadEvents.Message.Body)
	require.Equal(t, "1", ev.ThreadEvents.Message.Seq)

	// Ephemerals must cross processes too: A marks read on srv1, and B — whose
	// subscription lives on srv2's hub — sees the receipt. Only a real pg_notify
	// round trip can deliver this.
	_, err := srv1.messaging.MarkRead(context.Background(), a, thread, 1)
	require.NoError(t, err)

	rr := nextThreadEvent(t, subB, "1")
	require.Equal(t, "ReadReceiptChanged", rr.ThreadEvents.Typename)
	require.Equal(t, fmt.Sprint(a), rr.ThreadEvents.UserID)
	require.Equal(t, "1", rr.ThreadEvents.LastReadSeq)
}

// TestE2E_LeaveEndsSubscription: B is subscribed to a thread and leaves it. The
// hub must close B's stream (the client sees `complete`), and a later message
// from A must not reach B.
func TestE2E_LeaveEndsSubscription(t *testing.T) {
	srv := newServer(t)
	a := mkUser(t, srv, "lv_a")
	b := mkUser(t, srv, "lv_b")
	c := mkUser(t, srv, "lv_c")
	// Three participants so the thread still has two members after B leaves.
	thread := mustCreateThread(t, srv, a, []int{b, c})

	subB := dialWS(t, srv.url, b)
	subB.Subscribe(context.Background(), "1", threadEventsQuery, subVars(thread, nil))
	waitSubscribed(t, srv, subB, "1", thread)

	require.NoError(t, srv.messaging.LeaveThread(context.Background(), b, thread))

	// The stream ends: read frames until the transport reports the operation
	// complete (a trailing ParticipantChanged / StreamReset may precede it).
	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	var endErr error
	for {
		_, err := subB.Next(ctx, "1")
		if err != nil {
			endErr = err
			break
		}
	}
	require.Error(t, endErr, "departed participant's stream must end")
	require.Contains(t, endErr.Error(), "complete", "stream ended with a complete frame, got: %v", endErr)

	// And nothing sent afterwards reaches B.
	mustSendMessage(t, srv, a, thread, "after b left", "lv-1")
	quiet, quietCancel := context.WithTimeout(context.Background(), time.Second)
	defer quietCancel()
	_, err := subB.Next(quiet, "1")
	require.Error(t, err, "no further events may be delivered to a departed participant")
}

// TestE2E_IdempotentSend: a repeated clientNonce returns the original message
// (seq and body), and the thread ends up with exactly one message.
func TestE2E_IdempotentSend(t *testing.T) {
	srv := newServer(t)
	a := mkUser(t, srv, "id_a")
	b := mkUser(t, srv, "id_b")
	thread := mustCreateThread(t, srv, a, []int{b})

	ctx := context.Background()
	first, err := srv.messaging.SendMessage(ctx, a, portservices.SendMessageInput{
		ThreadID: thread, Body: "first", ClientNonce: "dup",
	})
	require.NoError(t, err)
	require.EqualValues(t, 1, first.Seq)

	dupe, err := srv.messaging.SendMessage(ctx, a, portservices.SendMessageInput{
		ThreadID: thread, Body: "second", ClientNonce: "dup",
	})
	require.NoError(t, err)
	require.EqualValues(t, 1, dupe.Seq, "duplicate nonce must return original seq")
	require.Equal(t, "first", dupe.Body, "duplicate nonce must return original body")

	hist, err := srv.messaging.GetHistory(ctx, a, thread, 50, nil)
	require.NoError(t, err)
	require.Len(t, hist, 1, "exactly one message persisted")
}

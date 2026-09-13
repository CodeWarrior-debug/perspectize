package messaging_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"
)

// wsClient is a minimal hand-rolled graphql-transport-ws client, just enough to
// drive gqlgen's WebSocket subscription transport from a test:
//
//	connection_init {payload:{testUserId:N}}  ->  wait connection_ack
//	subscribe {id, payload:{query, variables}}
//	<- next {id, payload:{data}}   (surfaced by Next)
//	<- error / complete            (surfaced as errors by Next)
//	<- ping                        (answered with pong, transparently)
//
// It is deliberately single-goroutine: tests call Subscribe/Next sequentially,
// so there is never a concurrent Read or Write on the underlying conn.
type wsClient struct {
	t    *testing.T
	conn *websocket.Conn
}

// dialWS opens a graphql-transport-ws connection to baseURL's /graphql endpoint,
// authenticates as userID via the test-only InitFunc bypass, and waits for the
// connection_ack. The connection is closed via t.Cleanup.
func dialWS(t *testing.T, baseURL string, userID int) *wsClient {
	t.Helper()

	wsURL := strings.Replace(baseURL, "http://", "ws://", 1) + "/graphql"
	dialCtx, cancel := context.WithTimeout(context.Background(), 5*testTimeout)
	defer cancel()

	conn, _, err := websocket.Dial(dialCtx, wsURL, &websocket.DialOptions{
		Subprotocols: []string{"graphql-transport-ws"},
	})
	require.NoError(t, err, "ws dial")
	conn.SetReadLimit(4 << 20)

	c := &wsClient{t: t, conn: conn}
	t.Cleanup(func() { _ = conn.Close(websocket.StatusNormalClosure, "test over") })

	c.writeJSON(dialCtx, map[string]any{
		"type":    "connection_init",
		"payload": map[string]any{"testUserId": userID},
	})

	var ack struct {
		Type string `json:"type"`
	}
	_, raw := c.readFrame(dialCtx)
	require.NoError(t, json.Unmarshal(raw, &ack))
	require.Equalf(t, "connection_ack", ack.Type, "expected connection_ack, got %s", string(raw))

	return c
}

// Subscribe sends a subscribe frame for the given operation id.
func (c *wsClient) Subscribe(ctx context.Context, id, query string, vars map[string]any) {
	c.t.Helper()
	c.writeJSON(ctx, map[string]any{
		"id":   id,
		"type": "subscribe",
		"payload": map[string]any{
			"query":     query,
			"variables": vars,
		},
	})
}

// Next reads frames until it sees a "next" for the given id and returns its
// payload.data. "ping" is answered and skipped; "error" and "complete" for the
// id are surfaced as errors. A canceled/expired ctx surfaces as an error.
func (c *wsClient) Next(ctx context.Context, id string) (json.RawMessage, error) {
	for {
		mt, raw, err := c.conn.Read(ctx)
		if err != nil {
			return nil, fmt.Errorf("ws read: %w", err)
		}
		_ = mt

		var f struct {
			ID      string          `json:"id"`
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(raw, &f); err != nil {
			return nil, fmt.Errorf("ws frame decode: %w (%s)", err, string(raw))
		}

		switch f.Type {
		case "ping":
			c.writeJSON(ctx, map[string]any{"type": "pong"})
		case "pong":
			// ignore
		case "next":
			if f.ID != id {
				continue
			}
			var p struct {
				Data   json.RawMessage `json:"data"`
				Errors json.RawMessage `json:"errors"`
			}
			if err := json.Unmarshal(f.Payload, &p); err != nil {
				return nil, fmt.Errorf("ws next payload decode: %w", err)
			}
			if len(p.Errors) > 0 && string(p.Errors) != "null" {
				return nil, fmt.Errorf("subscription errors: %s", string(p.Errors))
			}
			return p.Data, nil
		case "error":
			if f.ID != id {
				continue
			}
			return nil, fmt.Errorf("subscription error: %s", string(f.Payload))
		case "complete":
			if f.ID != id {
				continue
			}
			return nil, fmt.Errorf("subscription complete for id %s", id)
		default:
			// connection_ack duplicates or unknown control frames: ignore.
		}
	}
}

func (c *wsClient) writeJSON(ctx context.Context, v any) {
	c.t.Helper()
	b, err := json.Marshal(v)
	require.NoError(c.t, err)
	require.NoError(c.t, c.conn.Write(ctx, websocket.MessageText, b))
}

func (c *wsClient) readFrame(ctx context.Context) (websocket.MessageType, []byte) {
	c.t.Helper()
	mt, b, err := c.conn.Read(ctx)
	require.NoError(c.t, err)
	return mt, b
}

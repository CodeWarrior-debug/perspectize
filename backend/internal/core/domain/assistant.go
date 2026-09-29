package domain

import "errors"

// AssistantEventKind identifies one event on an assistant reply stream.
type AssistantEventKind string

const (
	AssistantEventText  AssistantEventKind = "TEXT"  // Text holds the next chunk of the answer
	AssistantEventTool  AssistantEventKind = "TOOL"  // ToolName is being run (e.g. read_guide)
	AssistantEventDone  AssistantEventKind = "DONE"  // final event: Stop, Citations, token counts
	AssistantEventError AssistantEventKind = "ERROR" // final event: Message is user-safe
)

// AssistantEvent is one event streamed while the assistant (Jeeves) answers.
// A stream always ends with exactly one DONE or ERROR event.
type AssistantEvent struct {
	Kind         AssistantEventKind
	Text         string
	ToolName     string
	Stop         string
	Citations    []string // guide entry IDs cited in the answer, e.g. "compare.pick-two"
	InputTokens  int
	OutputTokens int
	Message      string
}

// AssistantMaxMessageBytes caps one user message. It keeps requests cheap and
// stays far below gqlgen's 1 MB WebSocket frame limit (an oversized frame
// closes the shared socket, taking messaging subscriptions down with it).
const AssistantMaxMessageBytes = 4096

var (
	// ErrAssistantDisabled means the assistant isn't configured on this server.
	ErrAssistantDisabled = errors.New("assistant is not enabled")
	// ErrAssistantBusy means the user already has a reply in progress.
	ErrAssistantBusy = errors.New("assistant is already answering for this user")
)

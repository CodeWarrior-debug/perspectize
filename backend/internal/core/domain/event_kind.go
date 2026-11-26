package domain

// EventKind names one thread event on the pg_notify wire. It is a struct rather
// than a string so that an unknown kind cannot be written as a literal: the
// only kinds that exist are the package-level values below. The JSON form is
// the plain name, so the wire format is unchanged.
type EventKind struct{ name string }

// The kinds the hub routes. MESSAGE_POSTED is emitted by the message insert
// trigger (migrations/000021), not by Go.
var (
	KindMessagePosted      = EventKind{"MESSAGE_POSTED"}
	KindMessageEdited      = EventKind{"MESSAGE_EDITED"}
	KindMessageDeleted     = EventKind{"MESSAGE_DELETED"}
	KindReadReceiptChanged = EventKind{"READ_RECEIPT_CHANGED"}
	KindTypingChanged      = EventKind{"TYPING_CHANGED"}
	KindParticipantChanged = EventKind{"PARTICIPANT_CHANGED"}
	KindPresenceChanged    = EventKind{"PRESENCE_CHANGED"}
	KindStreamReset        = EventKind{"STREAM_RESET"}
)

var allEventKinds = []EventKind{
	KindMessagePosted,
	KindMessageEdited,
	KindMessageDeleted,
	KindReadReceiptChanged,
	KindTypingChanged,
	KindParticipantChanged,
	KindPresenceChanged,
	KindStreamReset,
}

// AllEventKinds returns every declared kind. The hub's routing test iterates it.
func AllEventKinds() []EventKind {
	return append([]EventKind(nil), allEventKinds...)
}

// Known reports whether k is one of the declared kinds. The zero value is not.
func (k EventKind) Known() bool {
	for _, known := range allEventKinds {
		if k == known {
			return true
		}
	}
	return false
}

// String returns the wire name, including for kinds this build does not know.
func (k EventKind) String() string { return k.name }

// MarshalText encodes the wire name, so the kind is a JSON string.
func (k EventKind) MarshalText() ([]byte, error) { return []byte(k.name), nil }

// UnmarshalText keeps any inbound name, known or not. An unknown kind decodes
// and is then dropped by the hub with a log line, instead of failing the
// listener's decode.
func (k *EventKind) UnmarshalText(text []byte) error {
	k.name = string(text)
	return nil
}

// ParticipantChange is the change carried by a PARTICIPANT_CHANGED event.
type ParticipantChange string

const (
	ParticipantAdded   ParticipantChange = "ADDED"
	ParticipantRemoved ParticipantChange = "REMOVED"
)

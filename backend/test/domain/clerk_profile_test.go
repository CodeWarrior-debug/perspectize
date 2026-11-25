package domain_test

import (
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClerkProfile_PrimaryEmailPrefersPrimaryID(t *testing.T) {
	p := domain.ClerkProfile{
		PrimaryEmailID: "e2",
		Emails: []domain.ClerkEmail{
			{ID: "e1", Address: "a@x.com"},
			{ID: "e2", Address: "b@x.com"},
		},
	}
	assert.Equal(t, "b@x.com", p.PrimaryEmail())
}

func TestClerkProfile_PrimaryEmailFallsBackToFirst(t *testing.T) {
	p := domain.ClerkProfile{
		PrimaryEmailID: "missing",
		Emails:         []domain.ClerkEmail{{ID: "e1", Address: "a@x.com"}},
	}
	assert.Equal(t, "a@x.com", p.PrimaryEmail())
	assert.Equal(t, "", domain.ClerkProfile{}.PrimaryEmail())
}

func TestClerkProfile_LocalUsernameOrder(t *testing.T) {
	withName := domain.ClerkProfile{ClerkID: "user_abc", Username: "jamesj", Emails: []domain.ClerkEmail{{ID: "e1", Address: "james@x.com"}}, PrimaryEmailID: "e1"}
	assert.Equal(t, "jamesj", withName.LocalUsername())

	emailOnly := domain.ClerkProfile{ClerkID: "user_abc", Emails: []domain.ClerkEmail{{ID: "e1", Address: "james@x.com"}}, PrimaryEmailID: "e1"}
	assert.Equal(t, "james", emailOnly.LocalUsername())

	idOnly := domain.ClerkProfile{ClerkID: "user_abc"}
	assert.Equal(t, "user_abc", idOnly.LocalUsername())
}

func TestClerkProfile_LocalUsernameTruncatesTo24Runes(t *testing.T) {
	long := domain.ClerkProfile{ClerkID: "user_abc", Username: "abcdefghijklmnopqrstuvwxyz0123456789"}
	assert.Equal(t, "abcdefghijklmnopqrstuvwx", long.LocalUsername())

	// Multi-byte characters are cut by rune, never mid-character.
	multi := domain.ClerkProfile{ClerkID: "user_abc", Username: strings.Repeat("é", 27)}
	assert.Equal(t, strings.Repeat("é", 24), multi.LocalUsername())
}

func TestClerkProfile_DisambiguatedUsernameFitsAndIsStable(t *testing.T) {
	p := domain.ClerkProfile{ClerkID: "user_2abcdefghijklmnop", Username: "james"}
	got := p.DisambiguatedUsername()
	require.LessOrEqual(t, len([]rune(got)), 24)
	assert.Equal(t, "james-klmnop", got)
	assert.Equal(t, got, p.DisambiguatedUsername())
}

func TestClerkProfile_DisambiguatedUsernameTruncatesBase(t *testing.T) {
	p := domain.ClerkProfile{ClerkID: "user_2abcdefghijklmnop", Username: "abcdefghijklmnopqrstuvwxyz"}
	got := p.DisambiguatedUsername()
	assert.Equal(t, 24, len([]rune(got)))
	assert.Equal(t, "abcdefghijklmnopq-klmnop", got)
}

func TestClerkProfile_LocalUsernameEmailWithoutAtFallsBackToClerkID(t *testing.T) {
	p := domain.ClerkProfile{ClerkID: "user_abc", PrimaryEmailID: "e1", Emails: []domain.ClerkEmail{{ID: "e1", Address: "no-at-sign"}}}
	assert.Equal(t, "user_abc", p.LocalUsername())
}

func TestClerkProfile_UsernameConflictSentinelsWrapAlreadyExists(t *testing.T) {
	for _, err := range []error{domain.ErrUsernameTaken, domain.ErrEmailTaken, domain.ErrClerkIDTaken} {
		assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	}
}

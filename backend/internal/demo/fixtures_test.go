package demo

import (
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// The seeder trusts these fixtures; catch inconsistencies here rather than as
// a half-seeded demo database.
func TestFixturesAreConsistent(t *testing.T) {
	seenKeys := map[string]bool{}
	for _, p := range Personas {
		if !ValidPersonaKey(p.Key) {
			t.Errorf("persona key %q is not a valid token key", p.Key)
		}
		if seenKeys[p.Key] {
			t.Errorf("duplicate persona key %q", p.Key)
		}
		seenKeys[p.Key] = true
		if len(p.Username) > 24 {
			t.Errorf("persona %q username %q exceeds users.username varchar(24)", p.Key, p.Username)
		}
	}
	seeded := map[string]bool{}
	for _, v := range Videos {
		if v.AddedBy != "" {
			if !seenKeys[v.AddedBy] {
				t.Errorf("video %s added by unknown persona %q", v.ID, v.AddedBy)
			}
			seeded[v.ID] = true
		}
	}
	for _, sp := range Perspectives {
		if !seenKeys[sp.Persona] || !seeded[sp.VideoID] {
			t.Errorf("perspective %s/%s references an unknown persona or unseeded video", sp.Persona, sp.VideoID)
		}
		for _, r := range []int{sp.Quality, sp.Agreement, sp.Importance, sp.Confidence} {
			if r < domain.RatingMin || r > domain.RatingMax {
				t.Errorf("perspective %s/%s rating %d out of range", sp.Persona, sp.VideoID, r)
			}
		}
		for _, f := range sp.Feelings {
			if !domain.ValidateFeelingEntry(f) {
				t.Errorf("perspective %s/%s has invalid feeling %+v", sp.Persona, sp.VideoID, f)
			}
		}
	}
	for _, m := range Messages {
		if !seenKeys[m.From] {
			t.Errorf("message from unknown persona %q", m.From)
		}
	}
	for _, c := range Claims {
		if !seenKeys[c.Persona] {
			t.Errorf("claim %q owned by unknown persona %q", c.Text, c.Persona)
		}
		effective, err := time.Parse("2006-01-02", c.EffectiveDate)
		if err != nil {
			t.Errorf("claim %q effective date %q: %v", c.Text, c.EffectiveDate, err)
		}
		if c.EvaluateBy != "" {
			evaluate, err := time.Parse("2006-01-02", c.EvaluateBy)
			switch {
			case err != nil:
				t.Errorf("claim %q evaluate-by date %q: %v", c.Text, c.EvaluateBy, err)
			case err == nil && c.EffectiveDate != "" && effective.After(evaluate):
				t.Errorf("claim %q evaluate-by %s is before effective %s", c.Text, c.EvaluateBy, c.EffectiveDate)
			}
		}
		if n := len(strings.Fields(c.Text)); n < 2 {
			t.Errorf("claim %q has %d words, want at least 2", c.Text, n)
		}
		if n := utf8.RuneCountInString(c.Text); n > domain.ClaimMaxLength {
			t.Errorf("claim %q is %d characters, max %d", c.Text, n, domain.ClaimMaxLength)
		}
	}
}

func TestClerkIDHelpers(t *testing.T) {
	if got := ClerkIDFor("alice"); got != "demo_alice" || !IsDemoClerkID(got) {
		t.Fatalf("ClerkIDFor/IsDemoClerkID mismatch: %q", got)
	}
	if IsDemoClerkID("user_2abc") {
		t.Fatal("real Clerk IDs must not be treated as demo IDs")
	}
}

package domain

import "strings"

// maxUsernameRunes matches users.username (varchar(24)) and the admin-create
// validation in UserService.
const maxUsernameRunes = 24

// disambiguatedBaseRunes leaves room for "-" and the Clerk ID suffix within
// maxUsernameRunes.
const disambiguatedBaseRunes = 17

// disambiguatedSuffixRunes is how many trailing Clerk ID characters make a
// username unique again after a collision.
const disambiguatedSuffixRunes = 6

// ClerkEmail is one email address on a Clerk user. Verified is true only when
// Clerk reports the address as verified; a missing or any other status is false.
type ClerkEmail struct {
	ID       string
	Address  string
	Verified bool
}

// ClerkProfile is the identity provider's view of a user, mapped from either
// the Clerk API or a user.* webhook payload. Adapters build it; the rules for
// deriving local profile fields live here, once.
type ClerkProfile struct {
	ClerkID        string
	Username       string
	PrimaryEmailID string
	Emails         []ClerkEmail
}

// primaryEmail returns the entry whose ID is PrimaryEmailID, falling back to the
// first entry. ok is false when the user has no addresses.
func (p ClerkProfile) primaryEmail() (ClerkEmail, bool) {
	for _, e := range p.Emails {
		if e.ID == p.PrimaryEmailID {
			return e, true
		}
	}
	if len(p.Emails) > 0 {
		return p.Emails[0], true
	}
	return ClerkEmail{}, false
}

// PrimaryEmail returns the address whose ID is PrimaryEmailID, falling back to
// the first address, or "" when the user has none.
func (p ClerkProfile) PrimaryEmail() string {
	e, _ := p.primaryEmail()
	return e.Address
}

// PrimaryEmailVerified reports whether the address PrimaryEmail returns is
// verified in Clerk. It is false when the user has no addresses.
func (p ClerkProfile) PrimaryEmailVerified() bool {
	e, _ := p.primaryEmail()
	return e.Verified
}

// LocalUsername returns the Clerk username, else the primary email's local
// part, else the Clerk ID, truncated to the username column's length.
func (p ClerkProfile) LocalUsername() string {
	base := p.Username
	if base == "" {
		base = emailLocalPart(p.PrimaryEmail())
	}
	if base == "" {
		base = p.ClerkID
	}
	return firstRunes(base, maxUsernameRunes)
}

// DisambiguatedUsername is the retry name after LocalUsername collides with an
// existing user: the base name plus the tail of the Clerk ID. It is stable for
// a given Clerk user, so a retried create always derives the same name.
func (p ClerkProfile) DisambiguatedUsername() string {
	base := firstRunes(p.LocalUsername(), disambiguatedBaseRunes)
	return base + "-" + lastRunes(p.ClerkID, disambiguatedSuffixRunes)
}

func emailLocalPart(email string) string {
	if i := strings.IndexByte(email, '@'); i >= 0 {
		return email[:i]
	}
	return ""
}

func firstRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func lastRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[len(r)-n:])
}

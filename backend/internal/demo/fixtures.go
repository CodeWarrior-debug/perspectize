// Package demo holds the canned data behind demo mode: the personas that can
// sign in without Clerk, the YouTube metadata served by the offline fixture
// client, and the perspectives/messages `cmd/seed-demo` writes.
//
// It is data only — no I/O — so the seeder, the fixture YouTube client and the
// tests all read one source of truth. Demo mode is refused in production (see
// config.LoadDemo), so nothing here is reachable from a production build's
// request path.
package demo

import (
	"regexp"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ClerkIDPrefix marks a users.clerk_user_id as a demo identity. Real Clerk IDs
// start with "user_", so the namespaces can never collide.
const ClerkIDPrefix = "demo_"

// TokenPrefix is the bearer-token prefix the demo verifier accepts:
// "Authorization: Bearer demo.<persona key>".
const TokenPrefix = "demo."

var personaKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

// ValidPersonaKey reports whether key is a syntactically valid persona key.
func ValidPersonaKey(key string) bool { return personaKeyRe.MatchString(key) }

// ClerkIDFor returns the clerk_user_id stored for a persona key.
func ClerkIDFor(key string) string { return ClerkIDPrefix + key }

// IsDemoClerkID reports whether a clerk_user_id belongs to a demo persona.
func IsDemoClerkID(clerkID string) bool { return strings.HasPrefix(clerkID, ClerkIDPrefix) }

// Persona is a seeded demo user.
type Persona struct {
	Key      string // stable handle used in tokens, URLs (?demo_as=) and tours
	Username string // <= 24 chars (users.username)
	Email    string
	Role     domain.UserRole
	Blurb    string // one-liner shown in the persona picker
	// FreshOnboarding leaves the first-run checklist coach active so tours can
	// walk through it; every other persona has it completed.
	FreshOnboarding bool
}

// Personas is the fixed demo cast. Order is the persona-picker order.
var Personas = []Persona{
	{Key: "alice", Username: "alice_demo", Email: "alice@demo.perspectize.local", Role: domain.UserRoleDefault,
		Blurb: "Prolific reviewer — lots of perspectives, public and private"},
	{Key: "ben", Username: "ben_demo", Email: "ben@demo.perspectize.local", Role: domain.UserRoleDefault,
		Blurb: "Disagrees with Alice on most things — great for Compare"},
	{Key: "carmen", Username: "carmen_admin", Email: "carmen@demo.perspectize.local", Role: domain.UserRoleAdmin,
		Blurb: "Admin — sees admin-only controls"},
	{Key: "newbie", Username: "newbie_demo", Email: "newbie@demo.perspectize.local", Role: domain.UserRoleDefault,
		Blurb: "Brand-new account — empty library, onboarding coach active", FreshOnboarding: true},
}

// PersonaByKey returns the persona with key, if any.
func PersonaByKey(key string) (Persona, bool) {
	for _, p := range Personas {
		if p.Key == key {
			return p, true
		}
	}
	return Persona{}, false
}

// Video is canned YouTube metadata served by the fixture client and seeded as
// content. Titles/stats are illustrative, not live.
type Video struct {
	ID           string
	Title        string
	Description  string
	ChannelTitle string
	PublishedAt  string
	DurationISO  string // ISO-8601, as the YouTube API returns it
	Seconds      int
	Tags         []string
	Views        string
	Likes        string
	Comments     string
	AddedBy      string // persona key; "" = not pre-seeded (available to "add" in tours)
}

// Videos are the fixture catalogue. Entries with AddedBy == "" are left out of
// the seed so the "add a video" flow has a known-good URL to add offline.
var Videos = []Video{
	{ID: "aircAruvnKk", Title: "But what is a neural network? | Deep learning chapter 1", ChannelTitle: "3Blue1Brown",
		Description: "What are the neurons, why are there layers, and what is the math underlying it?",
		PublishedAt: "2017-10-05T16:00:00Z", DurationISO: "PT18M40S", Seconds: 1120,
		Tags: []string{"neural networks", "machine learning", "math"}, Views: "19000000", Likes: "480000", Comments: "12000", AddedBy: "alice"},
	{ID: "zjkBMFhNj_g", Title: "[1hr Talk] Intro to Large Language Models", ChannelTitle: "Andrej Karpathy",
		Description: "A general-audience introduction to Large Language Models.",
		PublishedAt: "2023-11-23T00:00:00Z", DurationISO: "PT59M48S", Seconds: 3588,
		Tags: []string{"llm", "ai"}, Views: "3000000", Likes: "90000", Comments: "3000", AddedBy: "alice"},
	{ID: "iG9CE55wbtY", Title: "Do schools kill creativity? | Sir Ken Robinson | TED", ChannelTitle: "TED",
		Description: "Sir Ken Robinson makes an entertaining and profoundly moving case for creating an education system that nurtures creativity.",
		PublishedAt: "2007-01-06T00:00:00Z", DurationISO: "PT20M4S", Seconds: 1204,
		Tags: []string{"education", "creativity", "ted"}, Views: "25000000", Likes: "400000", Comments: "20000", AddedBy: "ben"},
	{ID: "rfscVS0vtbw", Title: "Learn Python - Full Course for Beginners [Tutorial]", ChannelTitle: "freeCodeCamp.org",
		Description: "This course will give you a full introduction into all of the core concepts in Python.",
		PublishedAt: "2018-07-11T00:00:00Z", DurationISO: "PT4H26M52S", Seconds: 16012,
		Tags: []string{"python", "programming", "tutorial"}, Views: "45000000", Likes: "1000000", Comments: "50000", AddedBy: "ben"},
	{ID: "kCc8FmEb1nY", Title: "Let's build GPT: from scratch, in code, spelled out.", ChannelTitle: "Andrej Karpathy",
		Description: "We build a Generatively Pretrained Transformer (GPT), following the paper \"Attention is All You Need\".",
		PublishedAt: "2023-01-17T00:00:00Z", DurationISO: "PT1H56M20S", Seconds: 6980,
		Tags: []string{"gpt", "transformer", "pytorch"}, Views: "5000000", Likes: "120000", Comments: "5000", AddedBy: "carmen"},
	// Not pre-seeded: the tours add this one through the UI.
	{ID: "jNQXAC9IVRw", Title: "Me at the zoo", ChannelTitle: "jawed",
		Description: "The first video on YouTube.",
		PublishedAt: "2005-04-24T03:31:52Z", DurationISO: "PT19S", Seconds: 19,
		Tags: []string{"zoo", "history"}, Views: "300000000", Likes: "17000000", Comments: "10000000"},
}

// VideoByID returns the fixture for a YouTube video ID, if any.
func VideoByID(id string) (Video, bool) {
	for _, v := range Videos {
		if v.ID == id {
			return v, true
		}
	}
	return Video{}, false
}

// WatchURL is the canonical URL the content service stores for a video ID.
func WatchURL(id string) string { return "https://www.youtube.com/watch?v=" + id }

// SeedPerspective is one pre-written perspective. Ratings are 0-10000.
type SeedPerspective struct {
	Persona    string
	VideoID    string
	Quality    int
	Agreement  int
	Importance int
	Confidence int
	Privacy    domain.Privacy
	Like       string
	Review     string
	Labels     []string
	Feelings   []domain.FeelingEntry
}

// Perspectives are deliberately split so Compare has real disagreement to show
// and privacy filtering has a private row to hide.
var Perspectives = []SeedPerspective{
	{Persona: "alice", VideoID: "aircAruvnKk", Quality: 9500, Agreement: 9000, Importance: 8000, Confidence: 8500,
		Privacy: domain.PrivacyPublic, Like: "The animations make backprop click.",
		Review:   "Best visual intro to neural nets I've seen. Chapter 1 is all intuition, no hand-waving.",
		Labels:   []string{"must-watch", "math"},
		Feelings: []domain.FeelingEntry{{Emoji: "🤩", Label: "Starstruck", Intensity: 8000}}},
	{Persona: "ben", VideoID: "aircAruvnKk", Quality: 7000, Agreement: 5000, Importance: 6000, Confidence: 6000,
		Privacy: domain.PrivacyPublic, Like: "Gorgeous visuals.",
		Review:   "Beautiful, but it skips the practical side. You won't train anything after this.",
		Labels:   []string{"theory"},
		Feelings: []domain.FeelingEntry{{Emoji: "🤔", Label: "Curious", Intensity: 6000}}},
	{Persona: "alice", VideoID: "zjkBMFhNj_g", Quality: 9000, Agreement: 8000, Importance: 9500, Confidence: 7500,
		Privacy: domain.PrivacyPublic, Review: "The 'LLM OS' framing is the most useful mental model in the talk.",
		Labels: []string{"ai", "must-watch"}},
	{Persona: "alice", VideoID: "iG9CE55wbtY", Quality: 6000, Agreement: 3000, Importance: 5000, Confidence: 4000,
		Privacy: domain.PrivacyPrivate, Review: "Private note: charming talk, but the evidence is thin. Revisit before sharing.",
		Labels: []string{"education"}},
	{Persona: "ben", VideoID: "iG9CE55wbtY", Quality: 9000, Agreement: 9500, Importance: 9000, Confidence: 8000,
		Privacy: domain.PrivacyPublic, Like: "Still the most-watched TED talk for a reason.",
		Review:   "Changed how I think about school. Funny and sharp.",
		Labels:   []string{"education", "classic"},
		Feelings: []domain.FeelingEntry{{Emoji: "😆", Label: "Amused", Intensity: 7000}, {Emoji: "✨", Label: "Delighted", Intensity: 9000}}},
	{Persona: "ben", VideoID: "rfscVS0vtbw", Quality: 8000, Agreement: 7000, Importance: 7000, Confidence: 9000,
		Privacy: domain.PrivacyPublic, Review: "Long, but a solid zero-to-functional Python course.", Labels: []string{"programming"}},
	{Persona: "carmen", VideoID: "kCc8FmEb1nY", Quality: 10000, Agreement: 9000, Importance: 9000, Confidence: 9500,
		Privacy: domain.PrivacyPublic, Review: "The single best way to understand a transformer: build one.",
		Labels: []string{"ai", "code-along"}},
	{Persona: "alice", VideoID: "kCc8FmEb1nY", Quality: 8500, Agreement: 8500, Importance: 8500, Confidence: 6000,
		Privacy: domain.PrivacyPublic, Review: "Watched in three sittings. Worth every minute.", Labels: []string{"ai"}},
}

// SeedMessage is one message in the seeded Alice/Ben direct thread.
type SeedMessage struct {
	From string // persona key
	Body string
}

// ThreadTitle names the seeded direct thread between alice and ben.
const ThreadTitle = "Neural nets debate"

// Messages is the seeded alice↔ben conversation (oldest first).
var Messages = []SeedMessage{
	{From: "alice", Body: "Did you see my take on the 3Blue1Brown video?"},
	{From: "ben", Body: "I did — you rated it way higher than me 😄"},
	{From: "alice", Body: "Open Compare on it, our ratings diverge on agreement the most."},
	{From: "ben", Body: "Fair. I'll rewatch chapter 2 and update mine."},
}

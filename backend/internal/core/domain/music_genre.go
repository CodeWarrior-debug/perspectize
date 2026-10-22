package domain

import "strings"

// MusicGenre is one node of the seeded Apple genre tree (ADR 0006, Option C).
type MusicGenre struct {
	ID        int
	Name      string // display name ("Regional & Cultural" for Apple's Worldwide)
	AppleName string // Apple's name, used to match provider genre strings
	ParentID  *int
}

// GenreChangeWindowDays is how long the adder may change a set genre.
const GenreChangeWindowDays = 30

// genreAliases maps common provider spellings onto Apple names (both normalised).
var genreAliases = map[string]string{
	"hip hop":                "hip-hop/rap",
	"hip-hop":                "hip-hop/rap",
	"hiphop":                 "hip-hop/rap",
	"rap":                    "hip-hop/rap",
	"r&b":                    "r&b/soul",
	"rnb":                    "r&b/soul",
	"rhythm and blues":       "r&b/soul",
	"soul":                   "r&b/soul",
	"edm":                    "dance",
	"electronic dance music": "dance",
	"singer-songwriter":      "singer/songwriter",
	"progressive rock":       "prog-rock/art rock",
	"kpop":                   "k-pop",
	"jpop":                   "j-pop",
	"world":                  "worldwide",
	"world music":            "worldwide",
}

func normGenre(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}

// MatchGenre finds the genre a provider string names, by display or Apple name
// after aliasing. The shallowest match wins, then the lowest id. Nil when
// nothing matches: no match means no genre (ADR 0006).
func MatchGenre(name string, genres []MusicGenre) *MusicGenre {
	key := normGenre(name)
	if key == "" {
		return nil
	}
	if alias, ok := genreAliases[key]; ok {
		key = alias
	}
	byID := make(map[int]MusicGenre, len(genres))
	for _, g := range genres {
		byID[g.ID] = g
	}
	depth := func(g MusicGenre) int {
		d := 0
		for p := g.ParentID; p != nil && d < 10; d++ {
			parent, ok := byID[*p]
			if !ok {
				break
			}
			p = parent.ParentID
		}
		return d
	}
	var best *MusicGenre
	bestDepth := 0
	for i := range genres {
		g := genres[i]
		if normGenre(g.Name) != key && normGenre(g.AppleName) != key {
			continue
		}
		d := depth(g)
		if best == nil || d < bestDepth || (d == bestDepth && g.ID < best.ID) {
			best, bestDepth = &genres[i], d
		}
	}
	return best
}

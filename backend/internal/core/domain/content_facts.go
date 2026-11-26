package domain

// ContentFact names one fact about a content row that the list can sort, filter
// or search on. Where the fact lives in a row's response JSONB is defined here,
// once per content type, so the repository reads every fact the same way.
type ContentFact string

const (
	// ContentFactPublishedAt is the date the source published the row. A YouTube
	// video keeps it in its snippet; a web page keeps it at the top level.
	ContentFactPublishedAt ContentFact = "publishedAt"
	// ContentFactSiteName is the site a web page was saved from.
	ContentFactSiteName ContentFact = "siteName"
	// ContentFactAuthor is the author a web page was saved with.
	ContentFactAuthor ContentFact = "author"
)

// ContentFactPath is the key path to a fact inside a row's response JSONB. An
// element that is a non-negative integer indexes an array.
type ContentFactPath []string

// contentFactPaths lists, per fact, the path for each content type that carries
// it. A type missing from a fact's map has no such fact: its rows never match a
// filter on it and sort as absent.
var contentFactPaths = map[ContentFact]map[ContentType]ContentFactPath{
	ContentFactPublishedAt: {
		ContentTypeYouTubeVideo: {"items", "0", "snippet", "publishedAt"},
		ContentTypeWebPage:      {"publishedAt"},
	},
	ContentFactSiteName: {
		ContentTypeWebPage: {"siteName"},
	},
	ContentFactAuthor: {
		ContentTypeWebPage: {"author"},
	},
}

// ContentFactPaths returns the path to fact for each content type that has it.
// The map is a copy; callers may not change the definition.
func ContentFactPaths(fact ContentFact) map[ContentType]ContentFactPath {
	src := contentFactPaths[fact]
	out := make(map[ContentType]ContentFactPath, len(src))
	for typ, path := range src {
		out[typ] = append(ContentFactPath(nil), path...)
	}
	return out
}

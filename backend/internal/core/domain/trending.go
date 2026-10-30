package domain

// TrendingWindow is the time window for TMDB trending lists. The values are
// bound directly to the GraphQL TrendingWindow enum (gqlgen.yml); the adapter
// lowercases them only when it builds the TMDB path.
type TrendingWindow string

const (
	TrendingWindowDay  TrendingWindow = "DAY"
	TrendingWindowWeek TrendingWindow = "WEEK"
)

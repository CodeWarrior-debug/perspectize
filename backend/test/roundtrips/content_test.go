package roundtrips

import (
	"context"
	_ "embed"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestCreateClaim(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("claim")
	parentID := h.content(userID, "claim-parent")
	h.warm(token)

	// SELECT parent, INSERT
	data := h.roundTrips(2, token, `mutation($input: CreateClaimInput!) { createClaim(input: $input) { id name } }`, map[string]any{
		"input": map[string]any{"text": "the sky is blue", "userID": userID, "parentContentID": parentID},
	})
	c := decode[struct {
		ID string `json:"id"`
	}](t, data, "createClaim")
	h.trackContent(c.ID)
}

const createFromYouTubeMutation = `mutation($input: CreateContentFromYouTubeInput!) {
  createContentFromYouTube(input: $input) { content { id name } alreadyExisted }
}`

type createContentResult struct {
	Content struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"content"`
	AlreadyExisted bool `json:"alreadyExisted"`
}

func TestCreateContentFromYouTube(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("yt")
	h.warm(token)
	url := fmt.Sprintf("https://www.youtube.com/watch?v=rt%09d", time.Now().UnixNano()%1_000_000_000)
	vars := map[string]any{"input": map[string]any{"url": url, "userId": userID}}

	// SELECT by URL (skips the YouTube call for known videos), INSERT ... ON CONFLICT RETURNING
	data := h.roundTrips(2, token, createFromYouTubeMutation, vars)
	created := decode[createContentResult](t, data, "createContentFromYouTube")
	h.trackContent(created.Content.ID)
	if created.AlreadyExisted {
		t.Fatal("first create reported alreadyExisted")
	}

	// SELECT by URL finds it
	data = h.roundTrips(1, token, createFromYouTubeMutation, vars)
	again := decode[createContentResult](t, data, "createContentFromYouTube")
	if !again.AlreadyExisted || again.Content.ID != created.Content.ID {
		t.Fatalf("second create should return the existing row: %+v", again)
	}

	// SELECT (needs the URL to call YouTube), UPDATE ... RETURNING
	h.roundTrips(2, token, `mutation($id: IntID!) { updateContentSourceData(contentId: $id) { id name } }`,
		map[string]any{"id": created.Content.ID})
}

// A DO UPDATE refresh (the concurrent-create race in CreateFromYouTube) must
// report the row as pre-existing. Before RETURNING, RowsAffected was 1 for
// both an insert and a refresh, so this always said "created".
func TestGetOrCreateByURLReportsRefreshAsExisting(t *testing.T) {
	h := newHarness(t)
	userID, _ := h.user("upsert")
	url := fmt.Sprintf("https://example.test/upsert/%d", time.Now().UnixNano())
	c := &domain.Content{Name: "u", URL: &url, ContentType: domain.ContentTypeYouTubeVideo, AddedByUserID: userID}

	first, existed, err := h.contentRepo.GetOrCreateByURL(context.Background(), c, true)
	require.NoError(t, err)
	h.contentIDs = append(h.contentIDs, first.ID)
	require.False(t, existed)

	h.counter.Reset()
	second, existed, err := h.contentRepo.GetOrCreateByURL(context.Background(), c, true)
	require.NoError(t, err)
	require.True(t, existed)
	require.Equal(t, first.ID, second.ID)
	require.Len(t, h.counter.Statements(), 1)
}

const setPrimaryCategoryMut = `mutation($input: SetPrimaryCategoryInput!) {
  setPrimaryCategory(input: $input) { id primaryCategory { id wikidataQid label } }
}`

func TestSetPrimaryCategory(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("cat")
	contentID := h.content(userID, "cat")
	h.warm(token)
	qid := fmt.Sprintf("Q%d", time.Now().UnixNano()%1_000_000_000)
	t.Cleanup(func() { _ = h.db.Exec("DELETE FROM categories WHERE wikidata_qid = ?", qid).Error })

	// category upsert RETURNING (primes the category cache), content UPDATE RETURNING
	data := h.roundTrips(2, token, setPrimaryCategoryMut, map[string]any{"input": map[string]any{
		"contentId": contentID, "qid": qid, "label": "Physics",
	}})
	got := decode[struct {
		PrimaryCategory struct {
			WikidataQid string `json:"wikidataQid"`
			Label       string `json:"label"`
		} `json:"primaryCategory"`
	}](t, data, "setPrimaryCategory")
	require.Equal(t, qid, got.PrimaryCategory.WikidataQid)
	require.Equal(t, "Physics", got.PrimaryCategory.Label)
}

// Upsert refreshes wikipedia_url (it used to be left out of DO UPDATE, so a
// URL was never updated), but a blank one — a failed or empty Wikidata
// lookup — keeps what's stored.
func TestCategoryUpsertWikipediaURL(t *testing.T) {
	h := newHarness(t)
	repo := postgres.NewGormCategoryRepository(h.db)
	ctx := context.Background()
	qid := fmt.Sprintf("Q%d", time.Now().UnixNano()%1_000_000_000)
	t.Cleanup(func() { _ = h.db.Exec("DELETE FROM categories WHERE wikidata_qid = ?", qid).Error })

	upsert := func(url string) string {
		t.Helper()
		c, err := repo.Upsert(ctx, &domain.Category{WikidataQID: qid, Label: "X", WikipediaURL: url})
		require.NoError(t, err)
		return c.WikipediaURL
	}
	require.Equal(t, "", upsert(""))
	require.Equal(t, "https://en.wikipedia.org/wiki/A", upsert("https://en.wikipedia.org/wiki/A"))
	require.Equal(t, "https://en.wikipedia.org/wiki/A", upsert(""), "blank lookup keeps the stored URL")
	require.Equal(t, "https://en.wikipedia.org/wiki/B", upsert("https://en.wikipedia.org/wiki/B"), "a new URL replaces it")
}

// listContentQuery is frontend/src/lib/queries/content/index.ts LIST_CONTENT,
// copied verbatim (keep in sync) — the home page grid's query.
//
//go:embed list_content_query.graphql
var listContentQuery string

func TestListContentGrid(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("grid")
	for i := 0; i < 5; i++ {
		h.content(userID, fmt.Sprintf("grid%d", i))
	}
	h.warm(token)

	// page + filtered total in one statement (count is a scalar subquery)
	h.roundTrips(1, token, listContentQuery, map[string]any{"first": 100, "includeTotalCount": true})
}

// The folded-in count must stay the filtered total across pages: it ignores
// the cursor, and an empty page past the end still reports it.
func TestListContentTotalCountAcrossPages(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("pages")
	tag := fmt.Sprintf("pg%d", time.Now().UnixNano())
	for i := 0; i < 5; i++ {
		h.content(userID, fmt.Sprintf("%s-%d", tag, i))
	}
	h.warm(token)

	type page struct {
		Items    []struct{ ID string } `json:"items"`
		PageInfo struct {
			HasNextPage bool    `json:"hasNextPage"`
			EndCursor   *string `json:"endCursor"`
		} `json:"pageInfo"`
		TotalCount int `json:"totalCount"`
	}
	filter := map[string]any{"search": tag}
	var after any
	seen := 0
	for {
		data := h.gql(token, listContentQuery, map[string]any{"first": 2, "after": after, "filter": filter, "includeTotalCount": true})
		p := decode[page](t, data, "content")
		require.Equal(t, 5, p.TotalCount, "total is the filtered count on every page")
		seen += len(p.Items)
		if !p.PageInfo.HasNextPage {
			break
		}
		after = *p.PageInfo.EndCursor
	}
	require.Equal(t, 5, seen)
}

// With categories, the first grid load reads them once (one batched query);
// after that they come from the in-process cache.
func TestListContentGridCategoriesCached(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("gridcat")
	qid := fmt.Sprintf("Q%d", time.Now().UnixNano()%1_000_000_000)
	var catID int
	require.NoError(t, h.db.Raw(`INSERT INTO categories (wikidata_qid, label) VALUES (?, 'Cat') RETURNING id`, qid).Scan(&catID).Error)
	t.Cleanup(func() { _ = h.db.Exec("DELETE FROM categories WHERE id = ?", catID).Error })
	for i := 0; i < 3; i++ {
		id := h.content(userID, fmt.Sprintf("gridcat%d", i))
		require.NoError(t, h.db.Exec(`UPDATE content SET primary_category_id = ? WHERE id = ?`, catID, id).Error)
	}
	h.warm(token)
	vars := map[string]any{"first": 100, "includeTotalCount": true}

	h.roundTrips(2, token, listContentQuery, vars) // page+count, categories (cold)
	h.roundTrips(1, token, listContentQuery, vars) // page+count (categories cached)

	// A relabel through setPrimaryCategory writes through to the cache.
	h.gql(token, setPrimaryCategoryMut, map[string]any{"input": map[string]any{
		"contentId": h.contentIDs[0], "qid": qid, "label": "Renamed",
	}})
	data := h.roundTrips(1, token, listContentQuery, vars)
	grid := decode[struct {
		Items []struct {
			PrimaryCategory *struct {
				Label string `json:"label"`
			} `json:"primaryCategory"`
		} `json:"items"`
	}](t, data, "content")
	labels := 0
	for _, it := range grid.Items {
		if it.PrimaryCategory != nil && it.PrimaryCategory.Label == "Renamed" {
			labels++
		}
	}
	require.GreaterOrEqual(t, labels, 3, "cached category reflects this instance's own write")
}

// frontend GET_CONTENT_AGGREGATES (details modal)
const contentAggregatesQuery = `query($id: ID!) { contentByID(id: $id) { id perspectiveCount averageRating qualityRatingCount } }`

func TestContentAggregates(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("agg")
	contentID := h.content(userID, "agg")
	h.warm(token)
	createPerspective(h, token, contentID)

	// aggregate loader only (no content row fetch)
	data := h.roundTrips(1, token, contentAggregatesQuery, map[string]any{"id": contentID})
	got := decode[struct {
		PerspectiveCount int `json:"perspectiveCount"`
	}](t, data, "contentByID")
	require.Equal(t, 1, got.PerspectiveCount)
}

// An aggregates-only query for an unknown id still errors "content not found"
// (the aggregate query doubles as the existence check), and content that
// exists but has no perspectives is still one round trip with null aggregates.
func TestContentAggregatesUnknownID(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("aggmiss")
	emptyID := h.content(userID, "aggmiss")
	h.warm(token)

	msg := h.gqlError(token, contentAggregatesQuery, map[string]any{"id": "999999999"})
	require.Contains(t, msg, "content not found")

	h.roundTrips(1, token, contentAggregatesQuery, map[string]any{"id": emptyID})
}

// Asking for row fields as well still reads the row (and still errors for an
// unknown id).
func TestContentByIDWithRowFields(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("byid")
	contentID := h.content(userID, "byid")
	h.warm(token)

	h.roundTrips(2, token, `query($id: ID!) { contentByID(id: $id) { id name perspectiveCount } }`, map[string]any{"id": contentID})
	msg := h.gqlError(token, `query { contentByID(id: "999999999") { id name } }`, nil)
	require.Contains(t, msg, "content not found")
}

const createFromMovieMutation = `mutation($input: CreateContentFromMovieInput!) {
  createContentFromMovie(input: $input) { id name contentType movie }
}`

// UNVERIFIED-AGAINST-DB: counts derived from ContentService.CreateFromMovie
// (run with RT_MEASURE=1 against a database to print the statements).
//   - new movie: GetByURL (SELECT, not found) + GetOrCreateByURL (INSERT ... ON CONFLICT
//     RETURNING) = 2. The TMDB call is the offline fixture client: no SQL.
//   - duplicate: GetByURL finds the row and returns before any metadata fetch = 1.
func TestCreateContentFromMovie(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("movie")
	h.warm(token)
	url := fmt.Sprintf("https://www.themoviedb.org/movie/%d", 100_000_000+time.Now().UnixNano()%800_000_000)
	vars := map[string]any{"input": map[string]any{"url": url}}

	type movieResult struct {
		ID          string         `json:"id"`
		Name        string         `json:"name"`
		ContentType string         `json:"contentType"`
		Movie       map[string]any `json:"movie"`
	}

	data := h.roundTrips(2, token, createFromMovieMutation, vars)
	created := decode[movieResult](t, data, "createContentFromMovie")
	h.trackContent(created.ID)
	if created.ContentType != "MOVIE" || created.Movie == nil {
		t.Fatalf("created row should be a MOVIE with the movie payload: %+v", created)
	}

	// Duplicate add: a single SELECT by canonical URL, no insert, no TMDB fetch.
	data = h.roundTrips(1, token, createFromMovieMutation, vars)
	again := decode[movieResult](t, data, "createContentFromMovie")
	if again.ID != created.ID {
		t.Fatalf("duplicate add should return the existing row: %+v vs %+v", again, created)
	}
}
